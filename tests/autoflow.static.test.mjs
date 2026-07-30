import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../a.js', import.meta.url), 'utf8');

test('top-level installation is guarded and replaces stale instances', () => {
  assert.match(source, /if \(window\.top !== window\) return;/);
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

test('narrow phones launch compact with a reduced editor footprint', () => {
  assert.ok(source.includes("const narrowScreen = window.matchMedia?.('(max-width: 620px)').matches ?? false"));
  assert.ok(source.includes('setBrowserHidden(state.legacy.browserHidden || narrowScreen)'));
  assert.ok(source.includes('setCompact(state.legacy.compact || narrowScreen)'));
  assert.ok(source.includes('width:min(390px,calc(100dvw - 18px))'));
  assert.ok(source.includes('height:min(560px,66dvh)'));
  assert.ok(source.includes('button{min-height:40px}'));
  assert.ok(source.includes('.paletteGrid{grid-template-columns:repeat(2,minmax(0,1fr))'));
});


test('professional UX exposes truthful runtime and accessible recovery state', () => {
  assert.ok(source.includes('const APP_VERSION = 39'));
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
});
