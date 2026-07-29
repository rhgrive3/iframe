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
test('lightweight mode avoids full-document MutationObserver', () => {
  assert.match(source, /if \(lightweightMode\) return;/);
  assert.doesNotMatch(source, /characterData: true/);
  assert.match(source, /attributeFilter: \['class', 'style'\]/);
});
test('logs update incrementally and remain bounded', () => {
  assert.match(source, /const MAX_LOGS = 100/);
  assert.match(source, /ui\.logList\.append\(createLogRow\(log\)\)/);
  assert.match(source, /DocumentFragment/);
});
test('running block UI is updated without rebuilding editor', () => {
  const body = source.slice(source.indexOf('function setRunningBlock'), source.indexOf('function updateBlockProgress'));
  assert.doesNotMatch(body, /renderWorkflowEditor/);
  assert.match(body, /blockCard\.running/);
});
