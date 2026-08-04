// 実ブラウザでグラブルの周回を再現して、
//   1) フルオートの待機がアビリティ・召喚ではなく攻撃で終わること
//   2) 長時間回してもdocument・ノード・監視・ヒープが伸びないこと（iOSで落ちる原因）
//   3) 定期メモリ解放が実際に走ること
// を確かめる。Chromium(Playwright)が無い環境では丸ごとスキップする。
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadPlaywright, startFixtureServer, openPanel, sampleMemory, stopWorkflow
} from './helpers/granblue-longrun.mjs';

const playwright = loadPlaywright();
const skip = playwright ? false : 'playwright is not installed in this environment';

const BLOCK_CONFIG = {
  timeoutSec: 25,
  battleEndRoute: '#raid_multi/next',
  battleEndExpectedScreen: 'battle'
};

async function withPanel(query, run) {
  const server = await startFixtureServer();
  let session = null;
  try {
    session = await openPanel(playwright, server.origin, {
      battleUrl: `${server.origin}/game.html${query}#raid_multi/1`
    });
    await run(session, server);
  } finally {
    await session?.browser.close().catch(() => {});
    await server.close();
  }
}

function startLoop(page, config) {
  return page.evaluate(blockConfig => {
    const api = window.__AUTO_TEST__;
    const workflow = api.state.workflows.workflows.find(item => item.id === api.state.selectedWorkflowId)
      || api.state.workflows.workflows[0];
    api.state.selectedWorkflowId = workflow.id;
    workflow.blocks = [
      api.createBlock('gbfEnsureFullAuto', { config: blockConfig }),
      api.createBlock('gbfWaitAutoAttack', { config: blockConfig })
    ];
    workflow.loopInfinite = true;
    api.startWorkflow();
  }, config);
}

test('the full-auto wait ends on the attack, never on an ability or summon', { skip }, async () => {
  await withPanel('?turns=9999&abilityMs=260&attackMs=320&resolveMs=260', async ({ page }) => {
    // 待機ブロックをそのまま連続で呼び、返ってきた時刻をゲーム側の進行と突き合わせる。
    const report = await page.evaluate(async config => {
      const api = window.__AUTO_TEST__;
      const controller = new AbortController();
      const context = { signal: controller.signal, recentRaidIds: new Set() };
      await api.ensureFullAuto(config, context);
      const completions = [];
      for (let index = 0; index < 6; index++) {
        const result = await api.waitForAutoAttack(config, context);
        completions.push({ at: Date.now(), evidence: result?.evidence || '' });
      }
      controller.abort();
      return { completions, events: api.iframe.contentWindow.__simEvents.slice() };
    }, BLOCK_CONFIG);

    assert.equal(report.completions.length, 6);
    for (const completion of report.completions) {
      const previous = report.events.filter(event => event.at <= completion.at).at(-1);
      assert.ok(previous, '待機完了より前にゲーム側の進行が記録されているはず');
      // 直前の出来事が攻撃（またはその解決）でなければ、アビリティ・召喚で抜けている。
      assert.ok(
        previous.type === 'attack' || previous.type === 'resolved',
        `待機がアビリティ/召喚で終了した: ${previous.type} → ${JSON.stringify(completion)}`
      );
    }
    // 攻撃回数より多く返っていない＝1回の待機で1回の攻撃。
    const attacks = report.events.filter(event => event.type === 'attack').length;
    assert.ok(attacks >= 6, `攻撃が6回以上起きているはず: ${attacks}`);
    assert.ok(attacks <= 12, `1回の待機で攻撃を取りこぼしすぎている: ${attacks}`);
  });
});

test('a long battle loop does not grow documents, nodes, listeners or heap', { skip }, async () => {
  await withPanel('?turns=9999&abilityMs=120&attackMs=140&resolveMs=120', async ({ page, client }) => {
    await startLoop(page, BLOCK_CONFIG);
    await page.waitForFunction(() => (window.__AUTO_TEST__.state.running?.cycle ?? 0) >= 5, null, { timeout: 90_000, polling: 200 });
    const first = await sampleMemory(client);
    await page.waitForFunction(() => (window.__AUTO_TEST__.state.running?.cycle ?? 0) >= 40, null, { timeout: 180_000, polling: 200 });
    const last = await sampleMemory(client);
    await stopWorkflow(page);

    assert.ok(last.documents <= first.documents + 1, `documentが増えている: ${first.documents} → ${last.documents}`);
    assert.ok(last.nodes <= first.nodes + 200, `ノードが増えている: ${first.nodes} → ${last.nodes}`);
    assert.ok(last.listeners <= first.listeners + 30, `リスナーが増えている: ${first.listeners} → ${last.listeners}`);
    assert.ok(last.heapMb <= first.heapMb + 4, `ヒープが増えている: ${first.heapMb}MB → ${last.heapMb}MB`);
  });
});

test('repeated battles release memory periodically and keep the panel flat', { skip }, async () => {
  await withPanel('?turns=2', async ({ page, client, browser }, server) => {
    const visited = [];
    page.on('framenavigated', frame => {
      if (frame !== page.mainFrame()) visited.push(frame.url().replace(server.origin, ''));
    });
    await startLoop(page, { ...BLOCK_CONFIG, memoryReliefEveryBattles: 2, memoryReliefSettleSec: 0.4 });
    await page.waitForFunction(() => (window.__AUTO_TEST__.state.running?.completedBattles ?? 0) >= 1, null, { timeout: 90_000, polling: 200 });
    const first = await sampleMemory(client);
    await page.waitForFunction(() => (window.__AUTO_TEST__.state.running?.completedBattles ?? 0) >= 6, null, { timeout: 240_000, polling: 200 });
    const last = await sampleMemory(client);
    const battles = await page.evaluate(() => window.__AUTO_TEST__.state.running?.completedBattles ?? 0);
    await stopWorkflow(page);
    assert.ok(browser.isConnected(), 'ブラウザが落ちずに周回できているはず');

    // ブロックに渡すコンテキストが浅いコピーだった頃は、この数がいつまでも0のままで
    // 定期メモリ解放（MyPage経由の完全再読込）が一度も走らなかった。
    assert.ok(battles >= 6, `周回数が数えられていない: ${battles}`);
    const relieved = visited.filter(url => url.includes('#mypage')).length;
    assert.ok(relieved >= 2, `定期メモリ解放が走っていない: ${JSON.stringify(visited)}`);

    assert.ok(last.documents <= first.documents + 1, `documentが増えている: ${first.documents} → ${last.documents}`);
    assert.ok(last.nodes <= first.nodes + 200, `ノードが増えている: ${first.nodes} → ${last.nodes}`);
    assert.ok(last.heapMb <= first.heapMb + 4, `ヒープが増えている: ${first.heapMb}MB → ${last.heapMb}MB`);
  });
});
