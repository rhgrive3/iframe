import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../a.js', import.meta.url), 'utf8');

test('distribution script parses', () => assert.doesNotThrow(() => new vm.Script(source)));
test('native touch lifecycle is enforced', () => {
  assert.match(source, /typeof win\.Touch !== 'function'/);
  assert.match(source, /typeof win\.TouchEvent !== 'function'/);
  assert.match(source, /dispatchSyntheticTouch\(win, dispatchTarget, 'touchstart'/);
  assert.match(source, /dispatchSyntheticTouch\(win, dispatchTarget, 'touchend'/);
  assert.match(source, /dispatchSyntheticTouch\(win, dispatchTarget, 'touchcancel'/);
  assert.match(source, /TOUCH_EVENT_CANCELED/);
  assert.doesNotMatch(source, /function makeTouchList\(/);
});
test('Box-Muller timing parameters match the requested model', () => {
  assert.match(source, /TOUCH_HOLD_LATENCY_MS = Object\.freeze\(\{ mean: 95, stdDev: 15, min: 50, max: 180 \}\)/);
  assert.match(source, /TOUCH_VISIBLE_LATENCY_MS = Object\.freeze\(\{ mean: 125, stdDev: 20, min: 70, max: 250 \}\)/);
  assert.match(source, /const z0 = Math\.sqrt\(-2 \* Math\.log\(u1\)\) \* Math\.cos\(2 \* Math\.PI \* u2\)/);
  assert.match(source, /\(z0 \* stdDevValue\) \+ meanValue/);
  assert.match(source, /abortableDelay\(sampleClampedNormalMs\(TOUCH_VISIBLE_LATENCY_MS\), signal\)/);
  assert.match(source, /abortableDelay\(sampleClampedNormalMs\(TOUCH_HOLD_LATENCY_MS\), signal\)/);
  assert.doesNotMatch(source, /TOUCH_(?:VISIBLE_WAIT|HOLD)_(?:MIN|MAX)_MS/);
});
test('full-auto waits for stable visible battle controls', () => {
  assert.match(source, /attack\.start\.classList\.contains\('display-on'\)/);
  assert.match(source, /computedVisible\(attack\.start\)/);
  assert.match(source, /!attack\.dummyVisible/);
  assert.match(source, /!attack\.cancelVisible/);
  assert.match(source, /!attack\.actorAttacking/);
  assert.match(source, /stableMs: DEFAULT_STABLE_MS/);
});
