import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../a.js', import.meta.url), 'utf8');

test('distribution script parses', () => {
  assert.doesNotThrow(() => new vm.Script(source));
});

test('tap path uses touchstart and touchend without jQuery tap', () => {
  assert.match(source, /dispatchSyntheticTouch\(win, dispatchTarget, 'touchstart'/);
  assert.match(source, /dispatchSyntheticTouch\(win, dispatchTarget, 'touchend'/);
  assert.doesNotMatch(source, /\.trigger\(['"]tap['"]\)/);
});

test('start point, hold, visible delay, and end drift are randomized', () => {
  assert.match(source, /TOUCH_VISIBLE_WAIT_MIN_MS = 98/);
  assert.match(source, /TOUCH_VISIBLE_WAIT_MAX_MS = 150/);
  assert.match(source, /TOUCH_HOLD_MIN_MS = 65/);
  assert.match(source, /TOUCH_HOLD_MAX_MS = 115/);
  assert.match(source, /TOUCH_END_MAX_DRIFT_PX = 5/);
  assert.match(source, /fractions = \{ x: Math\.random\(\), y: Math\.random\(\) \}/);
  assert.match(source, /Math\.sqrt\(Math\.random\(\)\)/);
});

test('offscreen targets use randomized animated scrolling', () => {
  assert.match(source, /function scrollableAncestors\(/);
  assert.match(source, /async function animatePhysicalScroll\(/);
  assert.match(source, /SCROLL_SPEED_MIN_PX_PER_SEC = 900/);
  assert.match(source, /SCROLL_SPEED_MAX_PX_PER_SEC = 1800/);
  assert.match(source, /await ensureTargetPointVisible\(target, fractions/);
});

test('an interrupted touch is cancelled cleanly', () => {
  assert.match(source, /dispatchSyntheticTouch\(win, dispatchTarget, 'touchcancel'/);
});
