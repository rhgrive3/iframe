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

const childRuntime = source.slice(
  source.indexOf('function installBattlePerformanceChildRuntime'),
  source.indexOf('const APP_VERSION')
);

test('every child prototype patch registers an undo and destroy unwinds all of them', () => {
  assert.match(childRuntime, /const patchRestorers = \[\]/);
  assert.match(childRuntime, /function restoreAllPatches\(\)/);
  // image src accessor, Element.setAttribute, render methods and LoadQueue methods
  assert.ok((childRuntime.match(/addPatchRestorer\(/g) || []).length >= 5);
  const destroy = childRuntime.slice(childRuntime.indexOf('const destroy = () =>'), childRuntime.indexOf('const onPageHide'));
  assert.match(destroy, /restoreAllPatches\(\)/);
  assert.match(destroy, /restoreSoundRuntime\(\)/);
});

test('image source patches are marker guarded so re-injection cannot stack wrappers', () => {
  const patch = childRuntime.slice(childRuntime.indexOf('function patchImageSources'), childRuntime.indexOf('function patchNow'));
  assert.match(patch, /const IMAGE_MARKER|imagePrototype\[IMAGE_MARKER\]/);
  assert.match(patch, /if \(imagePrototype && !imagePrototype\[IMAGE_MARKER\]\)/);
  assert.match(patch, /if \(elementPrototype && !elementPrototype\[IMAGE_MARKER\]\)/);
  assert.match(patch, /Object\.defineProperty\(imagePrototype, 'src', descriptor\)/);
  assert.match(patch, /elementPrototype\.setAttribute = originalSetAttribute/);
});

test('sound patches are marked on the module itself, not on a runtime-local WeakSet', () => {
  assert.match(childRuntime, /const SOUND_MARKER = /);
  assert.match(childRuntime, /sound\[SOUND_MARKER\]/);
  assert.doesNotMatch(childRuntime, /patchedSoundObjects/);
});

test('back-forward cache suspends the child runtime instead of destroying it', () => {
  assert.match(childRuntime, /const suspend = \(\) =>/);
  assert.match(childRuntime, /const resume = \(\) =>/);
  assert.match(childRuntime, /const onPageHide = event => \(event\?\.persisted \? suspend\(\) : destroy\(\)\)/);
  assert.match(childRuntime, /const onPageShow = event => \{ if \(event\?\.persisted\) resume\(\); \}/);
  assert.match(childRuntime, /installed\.resume\?\.\(\)/);
});

test('the runtime handle is published before any prototype is patched', () => {
  const publish = childRuntime.indexOf('window[BATTLE_PERFORMANCE_RUNTIME_KEY] = {');
  const firstPatchCall = childRuntime.indexOf('\n    patchImageSources();');
  assert.ok(publish > 0 && firstPatchCall > 0);
  assert.ok(publish < firstPatchCall, 'a throwing patcher must not leave a patched realm without a runtime key');
});

test('nextAnimationFrame always settles so the run-lifetime signal never accumulates listeners', () => {
  const body = source.slice(source.indexOf('function nextAnimationFrame'), source.indexOf('function quadraticBezierScalar'));
  assert.match(body, /ANIMATION_FRAME_FALLBACK_MS/);
  assert.match(body, /fallbackId = win\.setTimeout\(/);
  assert.match(body, /signal\?\.removeEventListener\('abort', onAbort\)/);
  assert.match(body, /const release = \(\) => \{/);
});

test('parent runtime state has a dedicated reset that spares user data', () => {
  const body = source.slice(source.indexOf('function resetParentRuntimeState'), source.indexOf('function blankFrame'));
  assert.match(body, /clearPendingAutoAttack\(/);
  assert.match(body, /state\.telemetryTimers\.clear\(\)/);
  assert.match(body, /state\.blockProgress\.clear\(\)/);
  assert.match(body, /performance\.clearResourceTimings\?\.\(\)/);
  // must not touch persisted workflow or legacy data
  assert.doesNotMatch(body, /state\.workflows|state\.legacy|workflowUndo|workflowRedo|localStorage/);
  assert.match(source, /resetParentRuntimeState\(\{ reason: 'メモリ解放のため/);
  assert.match(source, /resetParentRuntimeState\(\{ reason: `\$\{context\.completedBattles\}戦ごとの軽量化/);
});

test('diagnostics exposes the module-local collections the leak probe cannot reach', () => {
  const body = source.slice(source.indexOf('function diagnostics()'), source.indexOf('window.__AUTO_TEST__ = {'));
  assert.match(body, /frameLifecycleSubscribers: frameLifecycleSubscribers\.size/);
  assert.match(body, /cleanup: cleanup\.size/);
  assert.match(body, /resourceTimingEntries/);
  assert.match(source, /window\.__AUTO_TEST__ = \{[\s\S]*?\n    diagnostics,/);
});
