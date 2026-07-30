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
