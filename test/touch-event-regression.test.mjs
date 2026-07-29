import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../a.js', import.meta.url), 'utf8');
test('script parses', () => assert.doesNotThrow(() => new vm.Script(source)));
test('visible wait matches the requested normal distribution', () => {
  assert.match(source, /TOUCH_VISIBLE_LATENCY_MS = Object\.freeze\(\{ mean: 130, stdDev: 20, min: 80, max: 250 \}\)/);
  assert.match(source, /abortableDelay\(sampleClampedNormalMs\(TOUCH_VISIBLE_LATENCY_MS\), signal\)/);
});
test('start point is a clamped center-biased 2D Gaussian sample', () => {
  assert.match(source, /TOUCH_START_STDDEV_RATIO_MIN = 0\.12/);
  assert.match(source, /TOUCH_START_STDDEV_RATIO_MAX = 0\.15/);
  assert.match(source, /x: clamp\(0\.5 \+ \(sampleStandardNormal\(random\) \* stdDevRatio\), 0, 1\)/);
  assert.match(source, /y: clamp\(0\.5 \+ \(sampleStandardNormal\(random\) \* stdDevRatio\), 0, 1\)/);
  assert.doesNotMatch(source, /fractions = \{ x: Math\.random\(\), y: Math\.random\(\) \}/);
});
test('movement emits touchmove before touchend', () => {
  const move = source.indexOf("dispatchSyntheticTouch(win, dispatchTarget, 'touchmove'");
  const end = source.indexOf("dispatchSyntheticTouch(win, dispatchTarget, 'touchend'");
  assert.ok(move >= 0 && end > move);
  assert.match(source, /movement > Number\.EPSILON/);
  assert.doesNotMatch(source, /TOUCH_END_MAX_DRIFT_PX/);
});
test('optional physical attributes are not independently resampled', () => {
  const start = source.indexOf('function createSyntheticTouch');
  const end = source.indexOf('function dispatchSyntheticTouch', start);
  assert.doesNotMatch(source.slice(start, end), /radiusX|radiusY|rotationAngle|force/);
});
test('TouchEvent lists remain coherent', () => {
  assert.match(source, /const activeTouches = active \? \[touch\] : \[\]/);
  assert.match(source, /touches: activeTouches/);
  assert.match(source, /targetTouches: activeTouches/);
  assert.match(source, /changedTouches: \[touch\]/);
  assert.match(source, /'touchcancel', cancelTouch, false/);
});
