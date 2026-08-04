import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../a.js', import.meta.url), 'utf8');

test('distribution parses', () => assert.doesNotThrow(() => new vm.Script(source)));
test('coarse pointers disable expensive visual effects', () => {
  assert.match(source, /backdrop-filter:none/);
  assert.match(source, /const lightweightMode =/);
});
test('lightweight mode avoids unscoped observers while allowing explicit battle observation', () => {
  const body = source.slice(source.indexOf('function monitorFrame'), source.indexOf('async function waitForFrameReady'));
  assert.match(body, /observeOnLightweight = false/);
  assert.match(body, /if \(lightweightMode && !observeOnLightweight\)/);
  assert.match(body, /characterData: observeCharacterData/);
  assert.match(body, /attributeFilter: \['class', 'style'\]/);
});
test('error logs update incrementally and remain bounded', () => {
  assert.match(source, /const MAX_LOGS = 20/);
  assert.match(source, /if \(level !== 'error'\) return;/);
  assert.match(source, /ui\.logList\.append\(createLogRow\(log\)\)/);
  assert.match(source, /createDocumentFragment\(\)/);
  assert.match(source, /while \(ui\.logList\.children\.length > MAX_LOGS\)/);
});
test('running block UI is updated without rebuilding editor', () => {
  const body = source.slice(source.indexOf('function setRunningBlock'), source.indexOf('function updateBlockProgress'));
  assert.doesNotMatch(body, /renderWorkflowEditor/);
  assert.match(body, /state\.runningCard = card/);
  assert.match(body, /card\?\.classList\.add\('running'\)/);
});

test('battle media hooks exist only while the active route is a battle', () => {
  const body = source.slice(source.indexOf('function patchNow'), source.indexOf('function stopPoll'));
  assert.ok(body.indexOf('if (isBattleRuntime())') < body.indexOf('patchImageSources()'));
  assert.match(body, /restoreLoadQueue\(\)/);
  assert.match(body, /restoreImageSources\(\)/);
});

test('mobile battle waits use runtime polling without animation observers', () => {
  const body = source.slice(source.indexOf('function armPendingAutoAttack'), source.indexOf('async function recoverKnownPopup'));
  assert.equal((body.match(/observeOnLightweight: false/g) || []).length, 1);
  assert.equal((body.match(/observeCharacterData: false/g) || []).length, 1);
  assert.equal((body.match(/intervalMs: ATTACK_WAIT_POLL_MS/g) || []).length, 1);
  assert.doesNotMatch(body, /observeOnLightweight: true/);
  assert.doesNotMatch(body, /observeCharacterData: true/);
  const snapshot = source.slice(source.indexOf('function attackSnapshot'), source.indexOf('function isAttackInProgress'));
  assert.match(snapshot, /const useDomFallback = !runtime\.available/);
  // 毎回の判定で盤面を舐めない。盤面スキャンは待機延長の判断だけに使う。
  assert.doesNotMatch(snapshot, /battleProgressSignature/);
  const progress = source.slice(source.indexOf('function battleProgressSignature'), source.indexOf('function turnCountValue'));
  assert.match(progress, /performance\.now\(\) - cached\.at < BATTLE_ACTIVITY_CACHE_MS/);
  // 攻撃リクエストは監視で受け取り、毎回 getEntriesByType の配列を作らない
  const requests = source.slice(source.indexOf('function latestAttackRequestAt'), source.indexOf('function attackSnapshot'));
  assert.match(requests, /new win\.PerformanceObserver\(list => recordAttackRequests\(list\.getEntries\(\)\)\)/);
  assert.match(requests, /if \(attackRequestTracker\.doc !== doc\)/);
});
