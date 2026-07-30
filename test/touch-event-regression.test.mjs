import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../a.js', import.meta.url), 'utf8');

test('script parses', () => assert.doesNotThrow(() => new vm.Script(source)));

test('all internally sampled interaction delays use rejection-sampled truncated normals', () => {
  assert.match(source, /function sampleTruncatedNormal\(/);
  assert.match(source, /TRUNCATED_NORMAL_MAX_ATTEMPTS = 10_000/);
  assert.match(source, /if \(sample >= minValue && sample <= maxValue\) return sample/);
  assert.match(source, /sampleTruncatedNormalMs\(TOUCH_VISIBLE_LATENCY_MS\)/);
  assert.match(source, /sampleTruncatedNormalMs\(TOUCH_HOLD_LATENCY_MS\)/);
  assert.match(source, /sampleTruncatedNormalMs\(TOUCH_SCROLL_SETTLE_LATENCY_MS\)/);
  assert.doesNotMatch(source, /sampleClampedNormalMs/);
});

test('tap start is a session-consistent offset 2D truncated normal without edge clamping', () => {
  assert.match(source, /const TOUCH_SESSION = Object\.freeze/);
  assert.match(source, /rightOffsetX: sampleTruncatedNormal\(TOUCH_SESSION_OFFSET_X_RATIO\)/);
  assert.match(source, /verticalOffsetY: sampleTruncatedNormal\(TOUCH_SESSION_OFFSET_Y_RATIO\)/);
  assert.match(source, /mean: 0\.5 \+ TOUCH_SESSION\.rightOffsetX/);
  assert.match(source, /mean: 0\.5 \+ TOUCH_SESSION\.verticalOffsetY/);
  assert.doesNotMatch(source, /x: clamp\(0\.5/);
  assert.doesNotMatch(source, /y: clamp\(0\.5/);
});

test('optional Touch physical attributes are omitted', () => {
  const start = source.indexOf('function createSyntheticTouch');
  const end = source.indexOf('function dispatchSyntheticTouch', start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(source.slice(start, end), /radiusX|radiusY|rotationAngle|force/);
});

test('tap move count follows duration and distance and uses a noisy quadratic trajectory', () => {
  assert.match(source, /function determineTouchMoveCount\(durationMs, distancePx/);
  assert.match(source, /if \(distancePx < 1\) return 1/);
  assert.match(source, /if \(durationMs >= 100\)/);
  assert.match(source, /TOUCH_MOVE_MAX_COUNT \+ 1/);
  assert.match(source, /function quadraticBezier\(/);
  assert.match(source, /TOUCH_TRAJECTORY_NOISE_CORRELATION/);
  assert.match(source, /await waitForGestureProgress/);
  const move = source.indexOf("dispatchSyntheticTouch(win, dispatchTarget, 'touchmove'");
  const end = source.indexOf("dispatchSyntheticTouch(win, dispatchTarget, 'touchend'");
  assert.ok(move >= 0 && end > move);
});

test('hybrid scroll dispatches touchmove and updates scroll position in the same animation frame', () => {
  const start = source.indexOf('async function animatePhysicalScroll');
  const end = source.indexOf('function pointForTarget', start);
  const block = source.slice(start, end);
  assert.match(block, /dispatchSyntheticTouch\(win, dispatchTarget, 'touchstart'/);
  assert.match(block, /const now = await nextAnimationFrame\(win, signal\)/);
  const move = block.indexOf("dispatchSyntheticTouch(win, dispatchTarget, 'touchmove'");
  const scroll = block.indexOf('setScrollPosition(', move);
  assert.ok(move >= 0 && scroll > move);
  assert.match(block, /integrateScrollVelocity/);
  assert.match(block, /Math\.exp\(-5 \* progress\)/);
  assert.match(block, /dispatchSyntheticTouch\(win, dispatchTarget, 'touchend'/);
});

test('TouchEvent lists remain coherent and cancellation cleanup is retained', () => {
  assert.match(source, /const activeTouches = active \? \[touch\] : \[\]/);
  assert.match(source, /touches: activeTouches/);
  assert.match(source, /targetTouches: activeTouches/);
  assert.match(source, /changedTouches: \[touch\]/);
  assert.match(source, /'touchcancel'/);
});

test('preventDefault is treated as normal touch-handler feedback, not a gesture failure', () => {
  const start = source.indexOf('function dispatchSyntheticTouch');
  const end = source.indexOf('function scrollableAncestors', start);
  const block = source.slice(start, end);
  assert.match(block, /target\.dispatchEvent\(event\)/);
  assert.doesNotMatch(block, /event\.defaultPrevented/);
  assert.doesNotMatch(block, /TOUCH_EVENT_CANCELED/);
  assert.doesNotMatch(source, /allowCanceled/);
});
