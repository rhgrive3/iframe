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

const stripLineComments = text => text.replace(/^[ \t]*\/\/.*$/gm, '');

const childRuntime = source.slice(
  source.indexOf('function installBattlePerformanceRuntime'),
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
  const publish = childRuntime.indexOf('win[BATTLE_PERFORMANCE_RUNTIME_KEY] = {');
  const firstPatchCall = childRuntime.indexOf('\n    applyPatches();');
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

test('the battle runtime is installed by direct same-origin access, never by compiling source', () => {
  // Measured on an iPad: with the old win.Function() bootstrap the framed document kept
  // native prototypes and no runtime key, because a Content-Security-Policy without
  // 'unsafe-eval' rejects the Function constructor and the failure was swallowed. Driving
  // the same-origin frame directly has no compilation step for a CSP to reject.
  const bootstrap = source.slice(
    source.indexOf('function bootstrapBattlePerformanceFrameRuntime'),
    source.indexOf('function reportBattlePerformanceFailure')
  );
  assert.doesNotMatch(bootstrap, /win\.Function\(/);
  assert.doesNotMatch(bootstrap, /\.toString\(\)/);
  assert.match(bootstrap, /installBattlePerformanceRuntime\(win\)/);
  // and it must never fail silently again
  assert.match(bootstrap, /state\.battlePerformanceFailure = /);
  assert.match(bootstrap, /reportBattlePerformanceFailure\(\)/);
  const report = source.slice(
    source.indexOf('function reportBattlePerformanceFailure'),
    source.indexOf('function syncBattlePerformanceFrame')
  );
  assert.match(report, /appendLog\(`バトル軽量化ランタイムを注入できませんでした/);
  assert.match(report, /'error'/);
});

test('the runtime takes its realm as a parameter so both entry points share one code path', () => {
  assert.match(source, /function installBattlePerformanceRuntime\(win\) \{/);
  assert.match(source, /const doc = win\.document;/);
  assert.match(source, /const loc = win\.location;/);
  assert.match(source, /if \(window\.top !== window\) \{\n    installBattlePerformanceRuntime\(window\);/);
  assert.match(source, /function readBattlePerformanceStrongSetting\(win = window\)/);
  // no realm-bound global may leak back into the runtime body (comments excluded)
  const body = stripLineComments(source.slice(
    source.indexOf('function installBattlePerformanceRuntime'),
    source.indexOf('if (window.top !== window) {')
  ));
  assert.doesNotMatch(body, /(?<![.\w$])window\b/);
  assert.doesNotMatch(body, /(?<![.\w$])document\b/);
  assert.doesNotMatch(body, /(?<![.\w$])location\b/);
});

test('battle detection is resolved on the poll, never inside the hot paths', () => {
  // These predicates run on every drawImage, every img.src and every setAttribute. Doing a
  // document.querySelector per call cost 1140ms per 20k drawImage calls on a 2500 element
  // document and froze the game outright; the cached flag brings that to 56ms.
  const body = stripLineComments(source.slice(
    source.indexOf('function installBattlePerformanceRuntime'),
    source.indexOf('if (window.top !== window) {')
  ));
  assert.match(body, /let battleRuntimeActive = false;/);
  assert.match(body, /function refreshBattleRuntimeFlag\(\)/);
  const hotPaths = body.slice(body.indexOf('const shouldReplaceAsset'), body.indexOf('function ensureStyle'));
  assert.doesNotMatch(hotPaths, /isBattleRuntime\(\)/);
  assert.doesNotMatch(hotPaths, /querySelector/);
  assert.match(hotPaths, /if \(!battleRuntimeActive/);
  // the per-canvas ancestor walk must be cached too
  assert.match(hotPaths, /battleCanvasCache/);
  assert.match(hotPaths, /generation === battleFlagGeneration/);
  // the poll is the only place the flag is recomputed
  const patchNow = body.slice(body.indexOf('function patchNow'), body.indexOf('function applyPatches'));
  assert.match(patchNow, /refreshBattleRuntimeFlag\(\);/);
});

test('the tier that lies to the game loaders is opt-in and off by default', () => {
  assert.match(source, /function readBattlePerformanceStrongSetting\(win = window\)/);
  assert.match(source, /saved\?\.enabled === true && \(saved\?\.strong === true \|\| saved\?\.assets === true\)/);
  const body = stripLineComments(source.slice(
    source.indexOf('function installBattlePerformanceRuntime'),
    source.indexOf('if (window.top !== window) {')
  ));
  // asset rewriting and sound method replacement are both gated on the extra tier
  assert.match(body, /if \(!battleRuntimeActive \|\| !aggressiveEnabled\) return false;/);
  assert.match(body, /if \(!enabled \|\| !aggressiveEnabled \|\| !sound \|\| sound\[SOUND_MARKER\]\) return;/);
  assert.match(body, /if \(!enabled \|\| !aggressiveEnabled\) return;/);
  // draw suppression is a strong-tier behaviour too: an invisible battle is
  // indistinguishable from a broken one, so the safe tier must not touch rendering
  const apply = body.slice(body.indexOf('function applyPatches'), body.indexOf('function stopPoll'));
  assert.match(apply, /patchImageSources\(\);/);
  assert.match(apply, /patchRendering\(\);/);
  assert.match(body, /\$\{aggressiveEnabled \? STRONG_STYLE : ''\}/);
  assert.match(body, /canvas#canvas \{ visibility:hidden!important; \}/);
});

test('turning the switch off restores the untouched game', () => {
  const body = stripLineComments(source.slice(
    source.indexOf('function installBattlePerformanceRuntime'),
    source.indexOf('if (window.top !== window) {')
  ));
  const setEnabled = body.slice(body.indexOf('function setEnabled'), body.indexOf('const onMessage'));
  assert.match(setEnabled, /applyPatches\(\);/);
  assert.match(setEnabled, /restoreSoundRuntime\(\);/);
  // applyPatches unwinds everything first, and installs nothing while disabled
  const apply = body.slice(body.indexOf('function applyPatches'), body.indexOf('function stopPoll'));
  assert.match(apply, /restoreAllPatches\(\);/);
  assert.match(apply, /if \(!enabled \|\| !aggressiveEnabled\) return;/);
});

test('a battle that never becomes operable steps the feature down by itself', () => {
  const watchdog = source.slice(
    source.indexOf('function checkBattlePerformanceWatchdog'),
    source.indexOf('function syncBattlePerformanceFrame')
  );
  // only does work while the frame is actually sitting on a raid route
  assert.match(watchdog, /raid\(\?:\[_\/\]\|\$\)/);
  assert.match(watchdog, /pageBaseReady\(doc\)/);
  assert.match(watchdog, /SELECTORS\.fullAuto\}, \$\{SELECTORS\.attackStart\}/);
  assert.match(watchdog, /BATTLE_STALL_TIMEOUT_MS/);
  assert.match(watchdog, /stepDownBattlePerformance\(/);

  const stepDown = source.slice(
    source.indexOf('function stepDownBattlePerformance'),
    source.indexOf('function checkBattlePerformanceWatchdog')
  );
  // strong tier goes first, the safe tier only if the strong one was already off
  assert.match(stepDown, /if \(state\.battlePerformanceAssets\) \{/);
  assert.match(stepDown, /setBattlePerformanceEnabled\(true, \{ notify: false, assets: false \}\)/);
  // the safe tier is never clobbered: it cannot be what stalled the battle
  assert.doesNotMatch(stepDown, /setBattlePerformanceEnabled\(false/);
  assert.match(stepDown, /if \(state\.battlePerformanceSteppedDown\) return;/);
  assert.match(stepDown, /'error', 'バトル軽量化'/);

  // the watchdog timer must be registered for teardown
  assert.match(source, /const battleWatchdogTimer = setInterval\(/);
  assert.match(source, /addCleanup\(\(\) => clearInterval\(battleWatchdogTimer\)\)/);
});
