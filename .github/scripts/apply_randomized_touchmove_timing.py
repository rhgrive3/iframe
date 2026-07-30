from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


path = Path('a.js')
source = path.read_text()
source = replace_once(source, 'const APP_VERSION = 21;', 'const APP_VERSION = 22;', 'app version')
source = replace_once(source, '  const TOUCH_MOVE_MAX_COUNT = 4;\n', '', 'fixed move cap')
old_count = '''  function determineTouchMoveCount(durationMs, distancePx, random = Math.random) {
    if (distancePx < 1) return 1;
    if (durationMs >= 100) {
      return Math.floor(randomUniform(2, TOUCH_MOVE_MAX_COUNT + 1, random));
    }
    if (distancePx >= 8) {
      return Math.floor(randomUniform(2, 4, random));
    }
    if (durationMs >= 75 || distancePx >= 3) {
      return Math.floor(randomUniform(1, 3, random));
    }
    return 1;
  }
'''
new_count = '''  function determineTouchMoveCount(durationMs, distancePx, random = Math.random) {
    const duration = Math.max(1, finite(durationMs, 1));
    const distance = Math.max(0, finite(distancePx, 0));
    const meanIntervalMs = sampleTruncatedNormal({
      mean: 15.5,
      stdDev: 3.4,
      min: 7.5,
      max: 27
    }, random);
    const expectedCount = (duration / meanIntervalMs) + Math.min(4.5, distance / 2.4);
    const dynamicMaximum = Math.max(2, Math.floor(duration / 5.5));
    return Math.round(sampleTruncatedNormal({
      mean: Math.max(1, expectedCount),
      stdDev: Math.max(1.15, expectedCount * 0.34),
      min: 1,
      max: dynamicMaximum
    }, random));
  }

  function sampleTouchMoveProgresses(moveCount, random = Math.random) {
    const count = Math.max(1, Math.floor(finite(moveCount, 1)));
    const gapCount = count + 1;
    const gaps = [];
    let previousWeight = 1;
    for (let index = 0; index < gapCount; index++) {
      const independentWeight = Math.exp(sampleTruncatedNormal({
        mean: 0,
        stdDev: 0.52,
        min: -1.35,
        max: 1.35
      }, random));
      const correlatedWeight = (previousWeight * 0.38) + (independentWeight * 0.62);
      const edgeScale = index === 0 || index === gapCount - 1
        ? sampleTruncatedNormal({ mean: 1.08, stdDev: 0.16, min: 0.72, max: 1.48 }, random)
        : 1;
      const weight = Math.max(0.08, correlatedWeight * edgeScale);
      gaps.push(weight);
      previousWeight = weight;
    }
    const total = gaps.reduce((sum, gap) => sum + gap, 0);
    const progresses = [];
    let elapsed = 0;
    for (let index = 0; index < count; index++) {
      elapsed += gaps[index];
      progresses.push(elapsed / total);
    }
    return progresses;
  }
'''
source = replace_once(source, old_count, new_count, 'move count function')
old_loop = '''        const moveCount = determineTouchMoveCount(holdDuration, movement);
        const trajectory = createCorrelatedTrajectory(start, endPoint, start.rect);
        const startedAt = highResolutionNow(win);
        for (let moveIndex = 1; moveIndex <= moveCount; moveIndex++) {
          const moveProgress = moveIndex / (moveCount + 1);
          await waitForGestureProgress(win, startedAt, holdDuration, moveProgress, signal);
          const movePoint = sampleCorrelatedTrajectoryPoint(trajectory, moveProgress);
          activePoint = movePoint;
          const moveTouch = createSyntheticTouch(win, dispatchTarget, identifier, movePoint);
          dispatchSyntheticTouch(win, dispatchTarget, 'touchmove', moveTouch, true);
        }
'''
new_loop = '''        const moveCount = determineTouchMoveCount(holdDuration, movement);
        const moveProgresses = sampleTouchMoveProgresses(moveCount);
        const trajectory = createCorrelatedTrajectory(start, endPoint, start.rect);
        const startedAt = highResolutionNow(win);
        for (const moveProgress of moveProgresses) {
          await waitForGestureProgress(win, startedAt, holdDuration, moveProgress, signal);
          const movePoint = sampleCorrelatedTrajectoryPoint(trajectory, moveProgress);
          activePoint = movePoint;
          const moveTouch = createSyntheticTouch(win, dispatchTarget, identifier, movePoint);
          dispatchSyntheticTouch(win, dispatchTarget, 'touchmove', moveTouch, true);
        }
'''
source = replace_once(source, old_loop, new_loop, 'touchmove loop')
path.write_text(source)

test_path = Path('test/touch-event-regression.test.mjs')
test_source = test_path.read_text()
old_test = '''test('tap move count follows duration and distance and uses a noisy quadratic trajectory', () => {
  assert.match(source, /function determineTouchMoveCount\\(durationMs, distancePx/);
  assert.match(source, /if \\(distancePx < 1\\) return 1/);
  assert.match(source, /if \\(durationMs >= 100\\)/);
  assert.match(source, /TOUCH_MOVE_MAX_COUNT \\+ 1/);
  assert.match(source, /function quadraticBezier\\(/);
  assert.match(source, /TOUCH_TRAJECTORY_NOISE_CORRELATION/);
  assert.match(source, /await waitForGestureProgress/);
  const move = source.indexOf("dispatchSyntheticTouch(win, dispatchTarget, 'touchmove'");
  const end = source.indexOf("dispatchSyntheticTouch(win, dispatchTarget, 'touchend'");
  assert.ok(move >= 0 && end > move);
});
'''
new_test = '''test('tap move density is duration-driven without a fixed four-point ceiling', () => {
  assert.match(source, /function determineTouchMoveCount\\(durationMs, distancePx/);
  assert.match(source, /meanIntervalMs = sampleTruncatedNormal/);
  assert.match(source, /dynamicMaximum = Math\\.max\\(2, Math\\.floor\\(duration \\/ 5\\.5\\)\\)/);
  assert.match(source, /expectedCount = \\(duration \\/ meanIntervalMs\\)/);
  assert.doesNotMatch(source, /TOUCH_MOVE_MAX_COUNT/);
});

test('touchmove timestamps use randomized monotonic gaps instead of equal subdivisions', () => {
  assert.match(source, /function sampleTouchMoveProgresses\\(moveCount/);
  assert.match(source, /Math\\.exp\\(sampleTruncatedNormal/);
  assert.match(source, /correlatedWeight/);
  assert.match(source, /progresses\\.push\\(elapsed \\/ total\\)/);
  assert.match(source, /const moveProgresses = sampleTouchMoveProgresses\\(moveCount\\)/);
  assert.match(source, /for \\(const moveProgress of moveProgresses\\)/);
  assert.doesNotMatch(source, /moveIndex \\/ \\(moveCount \\+ 1\\)/);
  assert.match(source, /function quadraticBezier\\(/);
  assert.match(source, /TOUCH_TRAJECTORY_NOISE_CORRELATION/);
  assert.match(source, /await waitForGestureProgress/);
  const move = source.indexOf("dispatchSyntheticTouch(win, dispatchTarget, 'touchmove'");
  const end = source.indexOf("dispatchSyntheticTouch(win, dispatchTarget, 'touchend'");
  assert.ok(move >= 0 && end > move);
});
'''
test_source = replace_once(test_source, old_test, new_test, 'touchmove regression test')
test_path.write_text(test_source)
