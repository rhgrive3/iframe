import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../a.js', import.meta.url), 'utf8');

test('top-level installation is guarded and replaces stale instances', () => {
  assert.ok(source.includes('installBattlePerformanceRuntime(window);'));
  assert.ok(source.includes('if (window.top !== window) {'));
  assert.match(source, /const previous = window\[GLOBAL_KEY\]/);
  assert.match(source, /previous\?\.destroy/);
});

test('legacy state and workflow storage remain backward compatible', () => {
  assert.match(source, /state_v12/);
  assert.match(source, /LEGACY_STORAGE_KEYS = Array\.from\(\{ length: 11 \}/);
  assert.match(source, /state_v\$\{11 - index\}/);
  assert.match(source, /WORKFLOW_STORAGE_KEY/);
  assert.match(source, /WORKFLOW_AUTOSAVE_KEY/);
});

test('primary UI remains touch-sized and safe-area aware', () => {
  assert.match(source, /button\{min-height:44px/);
  assert.match(source, /#browserBar/);
  assert.match(source, /safe-area-inset-bottom/);
  assert.match(source, /100dvh/);
});

test('workflow execution retains bounded iteration and timeout guards', () => {
  assert.match(source, /MAX_REPEAT_COUNT = 10_000/);
  assert.match(source, /MAX_CONDITION_ITERATIONS = 10_000/);
  assert.match(source, /DEFAULT_FLOW_TIMEOUT_MS = 120_000/);
  assert.match(source, /runWorkflow/);
  assert.match(source, /stopWorkflow/);
});

test('Granblue screen and action selectors remain stable', () => {
  for (const selector of [
    '#prt-assist-search.prt-assist-contents.active',
    '#prt-search-list > .btn-multi-raid.lis-raid.search',
    '#cnt-quest.cnt-quest.supporter_raid',
    '.pop-deck.supporter_raid .prt-btn-deck > .btn-usual-ok.se-quest-start',
    '.cnt-raid-stage.multi',
    '.btn-auto',
    '.btn-attack-start'
  ]) assert.ok(source.includes(selector), `missing selector: ${selector}`);
});

test('known Granblue failure states retain explicit messages', () => {
  assert.match(source, /救援できるマルチバトルは最大3つまでです。/);
  assert.match(source, /未確認バトルを確認して下さい。/);
  assert.match(source, /参戦人数が上限に達しているため参戦できませんでした。/);
});

test('synthetic touch execution remains serialized and cancel-safe', () => {
  assert.match(source, /queueExclusive/);
  assert.match(source, /activeTapTargets/);
  assert.match(source, /function dispatchSyntheticTouch/);
  assert.match(source, /'touchcancel'/);
});

test('multiple assist slots cycle while single selection retains refresh behavior', () => {
  assert.ok(source.includes('assistSlots: [1]'));
  assert.ok(source.includes('function normalizeAssistSlots'));
  assert.ok(source.includes('selectedSlots.length > 1'));
  assert.ok(source.includes('await switchAssistSlot(slot, refreshConfig, context)'));
  assert.ok(source.includes('await refreshAssistList(refreshConfig, context, { waitForCompletion: false })'));
});

test('assist slot switching waits for the new list before rescanning', () => {
  const shared = source.slice(source.indexOf('async function runAssistListTransition'), source.indexOf('async function refreshAssistList'));
  assert.ok(shared.includes('const observationRoot = beforeList.parentElement || beforeList'));
  assert.ok(shared.includes('const observer = new MutationObserver'));
  assert.ok(shared.includes('observeRoots: []'));
  assert.ok(shared.includes('expectedSlot == null || activeAssistSlot(docNow) === expectedSlot'));
  assert.ok(shared.includes('reconstructed || changedSignature || loadingEnded || sawMutation'));
  const body = source.slice(source.indexOf('async function switchAssistSlot'), source.indexOf('function activeAssistSlot'));
  assert.ok(body.includes('const beforeList = currentDoc.querySelector(SELECTORS.assistList)'));
  assert.ok(body.includes('runAssistListTransition'));
  assert.ok(body.includes('expectedSlot: normalized'));
  const flow = source.slice(source.indexOf('async function assistSelectFullFlow'), source.indexOf('function evaluateWorkflowCondition'));
  assert.ok(flow.includes('if (slot === currentSlot)'));
});

test('multi-slot evaluation enters the first eligible row', () => {
  const body = source.slice(source.indexOf('async function assistSelectFullFlow'), source.indexOf('function evaluateWorkflowCondition'));
  assert.ok(body.includes('[...ranked].sort((a, b) => a.index - b.index)[0]'));
  assert.ok(body.includes('activeAssistSlot(doc)'));
});

test('max-assist recovery navigates directly to notification-backed unclaimed battles', () => {
  assert.ok(source.includes('.btn-unconfirmed-result.flow-unclaimed.attention'));
  const body = source.slice(source.indexOf('async function recoverKnownPopup'), source.indexOf('async function pressDeckConfirm'));
  assert.ok(body.includes("stateInfo.type === 'MAX_ASSIST_ERROR'"));
  assert.ok(body.includes('SELECTORS.unclaimedAttention'));
  assert.ok(body.includes("gameRouteUrl('#quest/assist/unclaimed/0/0')"));
  assert.ok(body.includes("expectedScreen: 'unclaimed'"));
  assert.ok(!body.includes('jqTapStrict(entry'));
  assert.ok(body.includes('confirmAllUnclaimed'));
});

test('failed observed actions are canceled and log DOM stays lightweight', () => {
  assert.ok(source.includes('async function runObservedAction'));
  assert.ok(source.includes("controller.abort(new DOMException(cancelMessage, 'AbortError'))"));
  const shared = source.slice(source.indexOf('async function runAssistListTransition'), source.indexOf('async function refreshAssistList'));
  assert.ok(shared.includes('runObservedAction'));
  const refresh = source.slice(source.indexOf('async function refreshAssistList'), source.indexOf('async function switchAssistSlot'));
  assert.ok(refresh.includes('runAssistListTransition'));
  const slot = source.slice(source.indexOf('async function switchAssistSlot'), source.indexOf('function activeAssistSlot'));
  assert.ok(slot.includes('runAssistListTransition'));
  assert.ok(source.includes('const MAX_LOGS = 20'));
  assert.ok(source.includes('state.logs.slice(-MAX_LOGS)'));
  assert.ok(source.includes('while (ui.logList.children.length > MAX_LOGS)'));
  assert.ok(!source.includes('MAX_RENDERED_LOGS'));
  assert.ok(source.includes('LOG_TIME_FORMATTER.format(new Date())'));
  assert.ok(source.includes('function scheduleLogScroll'));
});

test('runtime hot paths avoid redundant document scans', () => {
  const monitor = source.slice(source.indexOf('function monitorFrame'), source.indexOf('async function waitForFrameReady'));
  assert.ok(monitor.includes('if (lightweightMode && !observeOnLightweight)'));
  assert.ok(monitor.indexOf('if (lightweightMode && !observeOnLightweight)') < monitor.indexOf('typeof observeRoots'));
  const ready = source.slice(source.indexOf('async function waitForFrameReady'), source.indexOf('async function performFrameOperation'));
  assert.ok(ready.includes('const baseline = requireChange ? (before || captureFrameState()) : null'));
  const running = source.slice(source.indexOf('function blockCardById'), source.indexOf('async function runBlockList'));
  assert.ok(running.includes('state.runningCard'));
  assert.ok(running.includes('clearRunningBlockUi'));
  assert.ok(!running.includes("querySelectorAll('.blockCard.running')"));
  assert.ok(!running.includes("querySelectorAll('.progressBadge')"));
  const battleEnd = source.slice(source.indexOf('function detectBattleEndState'), source.indexOf('function safeBattleEndState'));
  assert.ok(battleEnd.includes("url.includes('result_multi/')"));
  assert.ok(!battleEnd.includes('detectScreenState(doc)'));
});

test('tap-backed state waits share immediate cancellation cleanup', () => {
  const ranges = [
    ['async function tapPopupOk', 'function parseAssistRow'],
    ['async function selectSupporterConditional', 'async function selectSupporterAuto'],
    ['async function selectSupporterAuto', 'async function returnToAssistFromUnclaimed'],
    ['async function returnToAssistFromUnclaimed', 'async function confirmAllUnclaimed'],
    ['async function confirmAllUnclaimed', 'function fullAutoState'],
    ['async function pressDeckConfirm', 'async function assistSelectFullFlow']
  ];
  for (const [startName, endName] of ranges) {
    const block = source.slice(source.indexOf(startName), source.indexOf(endName));
    assert.ok(block.includes('runObservedAction'), `${startName} must use runObservedAction`);
  }
  const unclaimed = source.slice(source.indexOf('async function confirmAllUnclaimed'), source.indexOf('function fullAutoState'));
  assert.ok(unclaimed.includes('const topRow = doc.querySelector(SELECTORS.unclaimedRows)'));
  assert.ok(!unclaimed.includes('querySelectorAll(SELECTORS.unclaimedRows)'));
});

test('game-route navigation tears down and recreates the iframe browsing context', () => {
  const helper = source.slice(source.indexOf('function stopRuntimeTelemetry'), source.indexOf('function computedVisible'));
  assert.ok(helper.includes('async function replaceFrame'));
  assert.ok(helper.includes('releaseFrameRuntime(previousFrame)'));
  assert.ok(helper.includes('await blankFrame(previousFrame)'));
  assert.ok(helper.includes("location.replace('about:blank')"));
  assert.ok(helper.includes('const nextFrame = previousFrame.cloneNode(false)'));
  assert.ok(helper.includes('previousFrame.replaceWith(nextFrame)'));
  assert.ok(helper.includes('iframe = nextFrame'));
  assert.ok(helper.includes('bindFrameLoad(nextFrame)'));
  const routeStart = source.lastIndexOf("case 'iframeRoute'");
  const route = source.slice(routeStart, source.indexOf("case 'iframeReady'", routeStart));
  assert.ok(route.includes('const before = captureFrameState()'));
  assert.ok(route.includes('await replaceFrame(gameRouteUrl(block.config.route))'));
  assert.ok(route.includes('await waitForFrameReady'));
  assert.ok(!route.includes('frameWindow().location.href'));
});

test('battle-end recovery explicitly releases Granblue graphics and telemetry before recycling', () => {
  const helper = source.slice(source.indexOf('function stopRuntimeTelemetry'), source.indexOf('function computedVisible'));
  for (const token of [
    'stopSessionReplayRecording',
    'stopSession',
    'Game?.router?.move',
    'content_close',
    'destroyImages',
    'Ticker?.removeAllEventListeners',
    'Sound?.reset',
    'WebAudioPlugin?.reset',
    'WEBGL_lose_context',
    'canvas.width = 0',
    "querySelectorAll?.('audio,video')"
  ]) assert.ok(helper.includes(token), `missing teardown token: ${token}`);

  const restart = source.slice(source.indexOf('async function restartWorkflowAfterBattleEnd'), source.indexOf('async function ensureFullAuto'));
  assert.ok(restart.includes('await replaceFrame(targetUrl)'));
  assert.ok(restart.includes('const before = captureFrameState()'));
  assert.ok(!restart.includes('frameWindow().location.href = targetUrl'));
});

test('lightweight execution keeps only error logs and removes continuous overlay compositing', () => {
  const logging = source.slice(source.indexOf('function appendLog'), source.indexOf('function renderLogs'));
  assert.ok(logging.includes("if (level !== 'error') return;"));
  assert.ok(source.includes("empty.textContent = 'エラーが発生するとここに記録されます。'"));
  assert.ok(source.includes('--panel:#12141b'));
  assert.ok(!source.includes('backdrop-filter:blur'));
  assert.ok(source.includes('box-shadow:none'));
  const monitor = source.slice(source.indexOf('function monitorFrame'), source.indexOf('async function waitForFrameReady'));
  assert.ok(monitor.includes('(lightweightMode ? 750 : 300)'));
  const transition = source.slice(source.indexOf('async function runAssistListTransition'), source.indexOf('async function refreshAssistList'));
  assert.ok(transition.includes('if (!lightweightMode)'));
  assert.ok(transition.includes('!sawMutation && listNow'));
  const runtimeUi = source.slice(source.indexOf('function setRunningBlock'), source.indexOf('async function runBlockList'));
  assert.equal((runtimeUi.match(/if \(lightweightMode\) return;/g) || []).length, 2);
  assert.ok(source.includes('function enterRuntimeCompactMode'));
  assert.ok(source.includes('leaveRuntimeCompactMode(restoreExpandedDock)'));
  assert.ok(source.includes("if (!lightweightMode) {\n      renderPalette();\n      renderWorkflowEditor();\n    }"));
});

test('narrow phones launch compact with viewport-independent resizable sizing', () => {
  assert.ok(source.includes('function isNarrowViewport()'));
  assert.ok(source.includes('window.screen?.width'));
  assert.ok(source.includes("dock.classList.toggle('narrowViewport', narrowScreen)"));
  assert.ok(source.includes("dock.classList.toggle('narrowViewport', isNarrowViewport())"));
  assert.ok(source.includes('setBrowserHidden(state.legacy.browserHidden || narrowScreen)'));
  assert.ok(source.includes('setCompact(state.legacy.compact || narrowScreen)'));
  assert.ok(source.includes('width:var(--dock-width,min(340px,86dvw))'));
  assert.ok(source.includes('height:var(--dock-height,min(480px,54dvh))'));
  assert.ok(source.includes('button{min-height:40px}'));
  assert.ok(source.includes('.paletteGrid{grid-template-columns:repeat(2,minmax(0,1fr))'));
});

test('assist HP threshold blocks use inclusive above and below comparisons', () => {
  assert.ok(source.includes("gbfAssistSelectBelow: { category: 'gbf'"));
  assert.ok(source.includes('maximumHp: 10'));
  const rank = source.slice(source.indexOf('function rankAssistRows'), source.indexOf('function findAssistRowByRaidId'));
  assert.ok(rank.includes("comparison === 'atMost'"));
  assert.ok(rank.includes('item.hp <= hpThreshold'));
  assert.ok(rank.includes('item.hp >= hpThreshold'));
  const flow = source.slice(source.indexOf('async function assistSelectFullFlow'), source.indexOf('function evaluateWorkflowCondition'));
  assert.ok(flow.includes("hpComparison === 'atMost' ? config.maximumHp : config.minimumHp"));
  const execute = source.slice(source.indexOf('async function executeWorkflowBlock'), source.indexOf('async function runWorkflow'));
  assert.ok(execute.includes("assistSelectFullFlow(block.config, blockContext, 'atMost')"));
});

test('assist flow uses reduced reaction latency only after a raid is selected', () => {
  assert.ok(source.includes('const TOUCH_FAST_VISIBLE_LATENCY_MS'));
  const tap = source.slice(source.indexOf('async function jqTapStrict'), source.indexOf('function randomUniform'));
  assert.ok(tap.includes('fast ? TOUCH_FAST_VISIBLE_LATENCY_MS : TOUCH_VISIBLE_LATENCY_MS'));
  const supporter = source.slice(source.indexOf('async function waitForSupporterRows'), source.indexOf('async function selectSupporterAuto'));
  assert.ok(supporter.includes('stableMs: config.fastTap ? 0 : 80'));
  assert.ok(supporter.includes('fast: Boolean(config.fastTap)'));
  const flow = source.slice(source.indexOf('async function assistSelectFullFlow'), source.indexOf('function evaluateWorkflowCondition'));
  assert.ok(flow.includes('tapCurrentAssistRow(selected, context, { fast: true })'));
  assert.ok(flow.includes('fastTap: true'));
});

test('MyPage and Safari relief blocks run immediately without battle-end waits', () => {
  assert.ok(!source.includes('waitForBattleEndBeforeCleanup'));
  assert.ok(!source.includes('battleTimeoutSec'));
  const myPage = source.slice(source.indexOf('async function navigateToGranblueMyPage'), source.indexOf('async function hardNavigateAfterRelief'));
  assert.ok(myPage.includes("clearPendingAutoAttack('MyPageへ移動するため攻撃監視を解除しました')"));
  assert.ok(!myPage.includes('detectBattleEndState'));
  const relief = source.slice(source.indexOf('async function releaseGranblueResources'), source.indexOf('async function reloadForBattleEndProbe'));
  assert.ok(relief.includes('await navigateToGranblueMyPage(config, context)'));
  assert.ok(!relief.includes('waitForBattleEnd'));
});

test('professional UX exposes truthful runtime and accessible recovery state', () => {
  assert.ok(source.includes('const APP_VERSION = 59'));
  assert.ok(source.includes('function syncRunControls()'));
  assert.ok(source.includes("compactRun.textContent = isRunning ? '■' : '▶'"));
  assert.ok(source.includes("compactRun.classList.toggle('is-stop', isRunning)"));
  assert.ok(source.includes("dock.setAttribute('aria-busy', String(isRunning))"));
  assert.ok(source.includes('role="tablist"'));
  assert.ok(source.includes('aria-selected="true"'));
  assert.ok(source.includes("button.setAttribute('aria-selected', String(active))"));
  assert.ok(source.includes('section.hidden = !active'));
  assert.ok(source.includes('id="workflowErrorRetry"'));
  assert.ok(source.includes("setAutosaveStatus('saving')"));
  assert.ok(source.includes("if (mode === 'replace' && workflow.blocks.length"));
  const blockList = source.slice(source.indexOf('function renderBlockList'), source.indexOf('function renderWorkflowEditor'));
  assert.equal((blockList.match(/lastElementChild\.disabled = Boolean\(state\.running\)/g) || []).length, 2);
});


test('Granblue runtime flags are authoritative for full auto, attacks, and battle end', () => {
  const runtime = source.slice(source.indexOf('function runtimeFlagEnabled'), source.indexOf('function battleObservationRoots'));
  assert.ok(runtime.includes('win.stage?.gGameStatus'));
  assert.ok(runtime.includes('runtimeFlagEnabled(status.auto_attack)'));
  assert.ok(runtime.includes('runtimeFlagEnabled(status.enable_auto_button)'));
  assert.ok(runtime.includes('Number(status.attacking) > 0'));
  assert.ok(runtime.includes('status.attackQueue?.attackButtonPushed'));
  assert.ok(runtime.includes('runtimeFlagEnabled(status.finish)'));
  assert.ok(runtime.includes('runtimeFlagEnabled(status.battle_end)'));
  assert.ok(runtime.includes('runtimeFlagEnabled(status.already_finish)'));
  const fullAuto = source.slice(source.indexOf('function fullAutoState'), source.indexOf('function battleObservationRoots'));
  assert.ok(fullAuto.includes('runtime.available ? runtime.autoAttack'));
  assert.ok(fullAuto.includes('runtime.available ? runtime.autoButtonEnabled : visible'));
  const attack = source.slice(source.indexOf('function attackSnapshot'), source.indexOf('function attackTransitionFromBaseline'));
  assert.ok(attack.includes('runtimeAttacking: runtime.attacking'));
  assert.ok(attack.includes('attackButtonPushed: runtime.attackButtonPushed'));
  const end = source.slice(source.indexOf('function detectBattleEndState'), source.indexOf('function safeBattleEndState'));
  assert.ok(end.includes('const runtime = battleRuntimeState(doc)'));
  assert.ok(end.includes('if (runtime.finished)'));
});

test('full auto waits for the game runtime to expose an actionable button', () => {
  const body = source.slice(source.indexOf('async function ensureFullAuto'), source.indexOf('function elementDisplayOn'));
  assert.ok(body.includes('if (observed.on) return observed;'));
  assert.ok(body.includes('!observed.exists || !observed.visible || !observed.enabled'));
  assert.ok(body.indexOf('if (observed.on) return observed;') < body.indexOf('!observed.exists || !observed.visible || !observed.enabled'));
});

test('battle ended is available as a workflow condition without HP inference', () => {
  assert.ok(source.includes("['gbfBattleEnded', '戦闘が終了した']"));
  assert.ok(source.includes("case 'gbfBattleEnded':"));
  assert.ok(source.includes('return Boolean(detectBattleEndState(doc));'));
  const conditionCase = source.slice(
    source.indexOf("case 'gbfBattleEnded':"),
    source.indexOf("case 'gbfBattle':")
  );
  assert.ok(!conditionCase.includes('enemy-hp'));
  assert.ok(!conditionCase.includes('txt-gauge-value'));
});


test('battle performance mode is persistent and independent from workflow execution', () => {
  assert.ok(source.includes("const BATTLE_PERFORMANCE_STORAGE_KEY = '__fullscreen_iframe_autoclicker_battle_performance_v1__'"));
  assert.ok(source.includes('function installBattlePerformanceRuntime(win)'));
  assert.ok(source.includes('if (window.top !== window) {'));
  assert.ok(source.includes('installBattlePerformanceRuntime(window);'));
  assert.ok(source.includes('id="tab-settings"'));
  assert.ok(source.includes('id="battlePerformanceToggle"'));
  assert.ok(source.includes("state.page = ['workflow', 'legacy', 'logs', 'settings']"));
  assert.ok(source.includes('setBattlePerformanceEnabled(ui.battlePerformanceToggle.checked)'));
  assert.ok(source.includes('syncBattlePerformanceFrame();'));
});

test('battle performance child runtime preserves logic while suppressing heavy media', () => {
  const child = source.slice(source.indexOf('function installBattlePerformanceRuntime'), source.indexOf('const APP_VERSION'));
  assert.ok(child.includes("['loadManifest', 'loadFile']"));
  assert.ok(child.includes('BATTLE_PERFORMANCE_TRANSPARENT_IMAGE'));
  assert.ok(child.includes("patchRenderMethod(constructor?.prototype, 'drawArrays')"));
  assert.ok(child.includes("patchRenderMethod(constructor?.prototype, 'drawElements')"));
  assert.ok(child.includes("patchRenderMethod(win.CanvasRenderingContext2D?.prototype, 'drawImage')"));
  assert.ok(child.includes("requireAmd(['model/sound', 'lib/sound']"));
  assert.ok(child.includes('setting.sound_flag = 0'));
  assert.ok(child.includes('animation-duration:.001s!important'));
  assert.ok(child.includes("canvas.id === 'canvas'"));
  assert.ok(!child.includes('Ticker.removeAllEventListeners'));
  assert.ok(!child.includes('Stage.update ='));
});


test('battle performance mode bootstraps into a same-origin iframe when only the controller was injected', () => {
  assert.ok(source.includes('function bootstrapBattlePerformanceFrameRuntime(win)'));
  // The runtime must never be shipped as source text again: win.Function() is blocked by a
  // Content-Security-Policy without 'unsafe-eval', which silently disabled the whole feature.
  assert.ok(!/=\s*win\.Function\(/.test(source));
  assert.ok(!source.includes('.toString()}'));
  assert.ok(source.includes('const runtime = installBattlePerformanceRuntime(win);'));
  assert.ok(source.includes('reportBattlePerformanceFailure()'));
  const sync = source.slice(source.indexOf('function syncBattlePerformanceFrame'), source.indexOf('function setBattlePerformanceEnabled'));
  assert.ok(sync.includes('bootstrapBattlePerformanceFrameRuntime(win);'));
  assert.ok(sync.indexOf('bootstrapBattlePerformanceFrameRuntime(win);') < sync.indexOf('postMessage'));
});


test('battle performance hooks are isolated and restore audio outside battle routes', () => {
  const child = source.slice(source.indexOf('function installBattlePerformanceRuntime'), source.indexOf('const APP_VERSION'));
  const patchNow = child.slice(child.indexOf('function patchNow'), child.indexOf('function setEnabled'));
  assert.ok(patchNow.includes('try { patchLoadQueue(); } catch {}'));
  assert.ok(patchNow.includes('try { patchRendering(); } catch {}'));
  assert.ok(patchNow.includes('refreshBattleRuntimeFlag();'));
  assert.ok(patchNow.includes('if (battleRuntimeActive)'));
  assert.ok(patchNow.includes('else {\n        restoreSoundRuntime();'));
  assert.ok(child.includes('try { prototype[name] = wrapped; } catch { return; }'));
  assert.ok(child.includes('pollTimer = win.setInterval'));
  assert.ok(child.includes('try { patchNow(); } catch {}'));
});


test('battle performance polling only runs while the persistent setting is enabled', () => {
  const child = source.slice(source.indexOf('function installBattlePerformanceRuntime'), source.indexOf('const APP_VERSION'));
  assert.ok(child.includes('function startPoll()'));
  assert.ok(child.includes('function stopPoll()'));
  assert.ok(child.includes('if (pollTimer != null) return;'));
  assert.ok(child.includes("win.addEventListener('pagehide', onPageHide)"));
  assert.ok(child.includes("win.addEventListener('pageshow', onPageShow)"));
  assert.ok(child.includes("win.removeEventListener('message', onMessage)"));
  assert.ok(child.includes('destroy'));
  const enabled = child.slice(child.indexOf('function setEnabled'), child.indexOf('const onMessage'));
  assert.ok(enabled.includes('startPoll();'));
  assert.ok(enabled.includes('stopPoll();'));
});

test('battle performance setting rolls back its UI state when persistence fails', () => {
  const setter = source.slice(source.indexOf('function setBattlePerformanceEnabled'), source.indexOf('function consumeDragEvent'));
  assert.ok(setter.includes('const previous = state.battlePerformanceEnabled;'));
  assert.ok(setter.includes('state.battlePerformanceEnabled = previous;'));
  assert.ok(setter.includes('state.battlePerformanceAssets = previousAssets;'));
  assert.ok(setter.includes('syncBattlePerformanceToggles();'));
});

test('battle performance fully suppresses battle canvas while preserving DOM attack controls', () => {
  const child = source.slice(source.indexOf('function installBattlePerformanceRuntime'), source.indexOf('const APP_VERSION'));
  const renderer = child.slice(child.indexOf('function patchRenderMethod'), child.indexOf('function patchRendering'));
  const assets = child.slice(child.indexOf('const shouldReplaceAsset'), child.indexOf('const rewriteAsset'));
  assert.ok(child.includes('canvas#canvas { visibility:hidden!important; }'));
  assert.ok(child.includes('.cnt-raid > .btn-auto,'));
  assert.ok(child.includes('.cnt-raid #cnt-raid-information .btn-attack-start'));
  assert.ok(renderer.includes('if (battleCanvas(this?.canvas)) return undefined;'));
  assert.ok(assets.includes('/\\/sp\\/cjs\\/'));
  assert.ok(!assets.includes('isBattleControlAsset'));
  assert.ok(!child.includes('BATTLE_CONTROL_ASSET_PATTERN'));
  assert.ok(!child.includes('WEBGL_TRACK_MARKER'));
  assert.ok(!child.includes('protectedBattleTextures'));
  assert.ok(!child.includes('patchWebGLTracking'));
  assert.ok(!child.includes('renderAllowed'));
});

test('iframe recycling destroys child runtimes and releases parent references immediately', () => {
  const child = source.slice(source.indexOf('function installBattlePerformanceRuntime'), source.indexOf('const APP_VERSION'));
  assert.ok(child.includes('let destroyed = false'));
  assert.ok(child.includes('const destroy = () =>'));
  assert.ok(child.includes("win.removeEventListener('storage', onStorage)"));
  assert.ok(child.includes('refresh: patchNow,\n      suspend,\n      resume,\n      destroy'));

  const lifecycle = source.slice(source.indexOf('const cleanup = new Set()'), source.indexOf('function computedVisible'));
  assert.ok(lifecycle.includes('const frameLifecycleSubscribers = new Set()'));
  assert.ok(lifecycle.includes('notifyFrameLifecycle(previousFrame, nextFrame)'));
  assert.ok(lifecycle.includes("replaceFrame(destination, { forceNewElement = true }"));
  assert.ok(lifecycle.includes("clearPendingAutoAttack('iframeを再構築するため攻撃監視を解除しました')"));
  assert.ok(lifecycle.includes('previousFrame = null'));
  assert.ok(lifecycle.includes('state.frameGeneration === loadedGeneration'));
  assert.ok(!lifecycle.includes('iframe === loadedFrame'));

  const monitor = source.slice(source.indexOf('function monitorFrame'), source.indexOf('async function waitForFrameReady'));
  assert.ok(monitor.includes('frameLifecycleSubscribers.add(onFrameLifecycle)'));
  assert.ok(monitor.includes('frameLifecycleSubscribers.delete(onFrameLifecycle)'));
  assert.ok(monitor.includes("listenedFrame?.removeEventListener('load', onFrameLoad)"));
});

test('standalone Safari relief also rebuilds the MyPage browsing context', () => {
  const relief = source.slice(source.indexOf('async function releaseGranblueResources'), source.indexOf('async function reloadForBattleEndProbe'));
  assert.ok(relief.includes("hardNavigateAfterRelief(gameRouteUrl('#mypage'), 'mypage', config, context)"));
});

