import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { buildRequest, formatIssueBody } from '../tools/repo-patch-request.mjs';

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

test('tap move density is duration-driven without a fixed four-point ceiling', () => {
  assert.match(source, /function determineTouchMoveCount\(durationMs, distancePx/);
  assert.match(source, /meanIntervalMs = sampleTruncatedNormal/);
  assert.match(source, /dynamicMaximum = Math\.max\(2, Math\.floor\(duration \/ 5\.5\)\)/);
  assert.match(source, /expectedCount = \(duration \/ meanIntervalMs\)/);
  assert.doesNotMatch(source, /TOUCH_MOVE_MAX_COUNT/);
});

test('touchmove timestamps use randomized monotonic gaps instead of equal subdivisions', () => {
  assert.match(source, /function sampleTouchMoveProgresses\(moveCount/);
  assert.match(source, /Math\.exp\(sampleTruncatedNormal/);
  assert.match(source, /correlatedWeight/);
  assert.match(source, /progresses\.push\(elapsed \/ total\)/);
  assert.match(source, /const moveProgresses = sampleTouchMoveProgresses\(moveCount\)/);
  assert.match(source, /for \(const moveProgress of moveProgresses\)/);
  assert.doesNotMatch(source, /moveIndex \/ \(moveCount \+ 1\)/);
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
test('auto attack wait resolves during continuously mutating animation', () => {
  assert.match(source, /stableMs: 0, description: 'フルオート攻撃開始待ち'/);
  assert.doesNotMatch(source, /stableMs: 40, description: 'フルオート攻撃開始待ち'/);
});

test('auto-attack establishes a ready baseline before watching for attack', () => {
  assert.match(source, /description: 'フルオート攻撃受付待ち'/);
  assert.match(source, /const attackReady = snapshot\.startVisible && !snapshot\.cancelVisible && !snapshot\.dummyVisible/);
  assert.match(source, /if \(armed\.alreadyAttacking\) return armed/);
  assert.match(source, /const baseline = armed\.snapshot/);
});

test('full-auto toggle waits for an observed attack transition instead of toggle time alone', () => {
  const ensureStart = source.indexOf('async function ensureFullAuto');
  const ensureEnd = source.indexOf('function elementDisplayOn', ensureStart);
  const ensureBlock = source.slice(ensureStart, ensureEnd);
  assert.ok(ensureBlock.indexOf('armPendingAutoAttack') < ensureBlock.indexOf('await jqTapStrict'));
  const waitStart = source.indexOf('async function waitForAutoAttack');
  const waitEnd = source.indexOf('async function recoverKnownPopup', waitStart);
  const waitBlock = source.slice(waitStart, waitEnd);
  assert.match(waitBlock, /await consumePendingAutoAttack\(timeoutMs\)/);
  assert.match(source, /description: 'フルオート押下後の攻撃開始待ち'/);
  assert.doesNotMatch(source, /lastFullAutoEnabledAt/);
});

test('workflow-level finite and infinite loop settings are normalized, rendered and executed', () => {
  assert.match(source, /id="workflowLoopCount"/);
  assert.match(source, /id="workflowLoopMode"/);
  assert.match(source, /loopCount: clamp\(int\(source\.loopCount, 1\), 1, MAX_WORKFLOW_LOOP_COUNT\)/);
  assert.match(source, /loopInfinite: Boolean\(source\.loopInfinite\)/);
  assert.match(source, /while \(!controller\.signal\.aborted && \(loopInfinite \|\| cycle < loopCount\)\)/);
});

test('visibility checks short-circuit definite hidden and display-on states', () => {
  const visibilityStart = source.indexOf('function computedVisible');
  const visibilityEnd = source.indexOf('function hiddenOrAbsent', visibilityStart);
  const visibilityBlock = source.slice(visibilityStart, visibilityEnd);
  assert.ok(visibilityStart >= 0 && visibilityEnd > visibilityStart);
  assert.ok(visibilityBlock.indexOf('const inlineStyle = element.style') < visibilityBlock.indexOf('getComputedStyle'));

  const displayStart = source.indexOf('function elementDisplayOn');
  const displayEnd = source.indexOf('function turnSignature', displayStart);
  const displayBlock = source.slice(displayStart, displayEnd);
  assert.ok(displayStart >= 0 && displayEnd > displayStart);
  assert.match(displayBlock, /classList\.contains\('display-on'\) \|\| computedVisible\(element\)/);
});

test('frame signatures reuse detected state and avoid serializing turn HTML', () => {
  assert.match(source, /function screenSignature\(doc = frameDocument\(\), stateInfo = null\)/);
  assert.match(source, /signature = screenSignature\(doc, stateInfo\)/);
  assert.match(source, /screenSignature\(doc, stateInfo\) !== baseline\.signature/);
  const turnStart = source.indexOf('function turnSignature');
  const turnEnd = source.indexOf('function attackSnapshot', turnStart);
  const turnBlock = source.slice(turnStart, turnEnd);
  assert.match(turnBlock, /Array\.from\(turn\.children/);
  assert.doesNotMatch(turnBlock, /innerHTML/);
});

test('assist refresh observes only the list region', () => {
  const start = source.indexOf('async function refreshAssistList');
  const end = source.indexOf('function visibleSupporterRows', start);
  const block = source.slice(start, end);
  assert.match(block, /const observationRoot = beforeList\.parentElement \|\| beforeList/);
  assert.match(block, /observer\.observe\(observationRoot/);
  assert.doesNotMatch(block, /observer\.observe\(currentDoc\.documentElement/);
});

test('repo patch request builder emits guarded exact replacements', () => {
  const request = buildRequest({
    head: 'a'.repeat(40),
    message: 'fix: sample',
    operation: { type: 'replace', replacements: [{ path: 'a.js', old: 'x', new: 'y', expected_count: 1 }] }
  });
  assert.equal(request.target_branch, 'main');
  assert.equal(request.validation, 'autoflow');
  assert.equal(request.expected_head_sha, 'a'.repeat(40));
});

test('repo patch issue body preserves markers and JSON payload', () => {
  const body = formatIssueBody(buildRequest({
    head: 'b'.repeat(40), message: 'fix: sample', operation: { type: 'unified_diff', patch: 'diff --git a/a b/a\\n' }
  }));
  assert.match(body, /repo-patch-request:v1/);
  assert.match(body, /expected_head_sha/);
});
