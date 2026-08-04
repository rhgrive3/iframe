// グラブルの周回をブラウザで実際に走らせて、長時間動かしたときの伸びを測るための土台。
// iOS Safariで落ちる/重くなるのは「解放されないdocumentが積み上がる」ことが原因なので、
// documentとノードとヒープの数をバトルごとに採取する。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const fixtureRoot = path.join(here, '..', 'fixtures', 'granblue-sim');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

export function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const specifier of [
    'playwright',
    '/opt/node22/lib/node_modules/playwright',
    '/usr/lib/node_modules/playwright',
    '/usr/local/lib/node_modules/playwright'
  ]) {
    try {
      return require(specifier);
    } catch {}
  }
  return null;
}

export async function startFixtureServer() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/rest/')) {
      response.writeHead(200, { 'content-type': CONTENT_TYPES['.json'], 'cache-control': 'no-store' });
      response.end('{}');
      return;
    }
    // AUTOFLOW_SCRIPT を指すと過去版のa.jsでも同じ計測ができる（退行の再現用）。
    const scriptPath = process.env.AUTOFLOW_SCRIPT || path.join(repoRoot, 'a.js');
    const name = url.pathname === '/' ? '/host.html' : url.pathname;
    const file = name === '/a.js' ? scriptPath : path.join(fixtureRoot, path.normalize(name).replace(/^([/\\])+/, ''));
    if (!file.startsWith(fixtureRoot) && file !== scriptPath) {
      response.writeHead(403).end('forbidden');
      return;
    }
    try {
      const body = await readFile(file);
      response.writeHead(200, {
        'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store'
      });
      response.end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise(resolve => server.close(resolve));
    }
  };
}

// 実機のiPhone相当（タッチのみ・狭い画面）で開く。パネルはこの条件で軽量モードに入る。
export async function openPanel(playwright, origin, { battleUrl }) {
  const browser = await playwright.chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--js-flags=--expose-gc', '--disable-dev-shm-usage']
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  await context.addInitScript(url => {
    try {
      localStorage.setItem('__fullscreen_iframe_autoclicker_state_v12__', JSON.stringify({
        version: 12,
        url,
        actions: [],
        compact: false,
        browserHidden: false
      }));
    } catch {}
  }, battleUrl);
  const page = await context.newPage();
  await page.goto(`${origin}/host.html`);
  await page.addScriptTag({ url: '/a.js' });
  await page.waitForFunction(() => Boolean(window.__AUTO_TEST__), null, { timeout: 15_000 });
  await page.evaluate(url => window.__AUTO_TEST__.replaceFrame(url), battleUrl);
  await page.waitForFunction(
    () => window.__AUTO_TEST__.iframe.contentDocument?.querySelector('.cnt-raid-stage'),
    null,
    { timeout: 15_000 }
  );
  const client = await context.newCDPSession(page);
  await client.send('Performance.enable');
  return { browser, context, page, client };
}

export async function sampleMemory(client) {
  await client.send('HeapProfiler.collectGarbage');
  const counters = await client.send('Memory.getDOMCounters');
  const { metrics } = await client.send('Performance.getMetrics');
  const metric = name => metrics.find(entry => entry.name === name)?.value ?? 0;
  return {
    documents: counters.documents,
    nodes: counters.nodes,
    listeners: counters.jsEventListeners,
    heapMb: Math.round(metric('JSHeapUsedSize') / 1048576 * 10) / 10
  };
}

// フルオートON→攻撃待ちだけの周回を、バトル終了ごとに次のバトルへ戻る設定で回す。
export async function runBattles(page, { battles, timeoutMs = 240_000, blockConfig = {} }) {
  await page.evaluate(config => {
    const api = window.__AUTO_TEST__;
    const workflow = api.state.workflows.workflows.find(item => item.id === api.state.selectedWorkflowId)
      || api.state.workflows.workflows[0];
    api.state.selectedWorkflowId = workflow.id;
    workflow.blocks = [
      api.createBlock('gbfEnsureFullAuto', { config }),
      api.createBlock('gbfWaitAutoAttack', { config })
    ];
    workflow.loopInfinite = true;
    api.startWorkflow();
  }, {
    timeoutSec: 20,
    battleEndRoute: '#raid_multi/next',
    battleEndExpectedScreen: 'battle',
    ...blockConfig
  });
  await page.waitForFunction(
    count => (window.__AUTO_TEST__.state.running?.completedBattles ?? 0) >= count,
    battles,
    { timeout: timeoutMs, polling: 250 }
  );
}

export async function stopWorkflow(page) {
  await page.evaluate(() => window.__AUTO_TEST__.stopWorkflow());
  await page.waitForFunction(() => !window.__AUTO_TEST__.state.running, null, { timeout: 20_000 });
}
