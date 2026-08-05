import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import './safari-performance-regression.test.mjs';
import './ui-drag-regression.test.mjs';
import './granblue-captured-simulation.test.mjs';
import './battle-performance-loader.test.mjs';

const source = readFileSync(new URL('../a.js', import.meta.url), 'utf8');

test('selected button workflow block captures and taps one unique iframe element safely', () => {
  assert.ok(source.includes("iframeTapElement: { category: 'frame', label: '指定ボタンを押す'"));
  assert.ok(source.includes('function startElementPicker(blockId)'));
  assert.ok(source.includes('function uniqueElementSelector(target'));
  assert.ok(source.includes('event.stopImmediatePropagation?.()'));
  assert.ok(source.includes("'TARGET_AMBIGUOUS'"));
  assert.ok(source.includes('await tapConfiguredElement(block.config, blockContext)'));
  assert.ok(source.includes("if (block.type === 'iframeTapElement')"));
});

test('CSS identifier fallback preserves leading hyphen-digit identifiers', () => {
  const helperStart = source.indexOf('function cssIdentifier');
  const helperEnd = source.indexOf('function cssAttributeValue', helperStart);
  const helperSource = source.slice(helperStart, helperEnd);
  const cssIdentifier = new Function(
    'window',
    'document',
    `${helperSource}; return cssIdentifier;`
  )({ CSS: null }, { defaultView: { CSS: null } });
  assert.equal(
    cssIdentifier('-1tab', { defaultView: { CSS: null } }),
    '\\2d \\31 tab'
  );
});

test('top-level installation is guarded and replaces stale instances', () => {
  assert.ok(source.includes('installBattlePerformanceChildRuntime();'));
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
    '.cnt-raid-stage',
    '.btn-auto',
    '.btn-attack-start'
  ]) assert.ok(source.includes(selector), `missing selector: ${selector}`);
  // シングルバトルも同じステージ要素なので、種別クラスで絞ってはいけない
  assert.ok(!source.includes('.cnt-raid-stage.multi'));
  assert.ok(source.includes("battleScreen: '.cnt-raid-stage',"));
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
  assert.ok(shared.includes('reconstructed || changedSignature || loadingEnded || sawMutation || slotSettled'));
  assert.ok(shared.includes('ASSIST_SLOT_SETTLE_MS'));
  const body = source.slice(source.indexOf('async function switchAssistSlot'), source.indexOf('function activeAssistSlot'));
  assert.ok(body.includes('const beforeList = currentDoc.querySelector(SELECTORS.assistList)'));
  assert.ok(body.includes('runAssistListTransition'));
  assert.ok(body.includes('expectedSlot: normalized'));
  const flow = source.slice(source.indexOf('async function assistSelectFullFlow'), source.indexOf('function evaluateWorkflowCondition'));
  assert.ok(flow.includes('if (slot === activeSlot)'));
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
  assert.ok(battleEnd.includes('isBattleResultUrl(url)'));
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

test('the unclaimed confirmation round trip reacts on a short poll instead of the default wait', () => {
  assert.ok(source.includes('const UNCLAIMED_POLL_MS = 60'));
  assert.ok(source.includes('const UNCLAIMED_STABLE_MS = 60'));
  assert.ok(source.includes('async function waitForFrameReady({ signal, timeoutMs = DEFAULT_TIMEOUT_MS, expectedScreen = \'auto\', before = null, requireChange = false, stableMs = DEFAULT_STABLE_MS, intervalMs = null }'));
  assert.ok(source.includes('}, { signal, timeoutMs, stableMs, intervalMs, description: \'ページ読込完了待ち\' });'));

  const unclaimed = source.slice(source.indexOf('async function confirmAllUnclaimed'), source.indexOf('function fullAutoState'));
  // 画面遷移待ち・タップ・一覧への復帰の3か所すべてを詰めないと1件あたりの待ちは縮まない。
  assert.equal((unclaimed.match(/intervalMs: UNCLAIMED_POLL_MS/g) || []).length, 3);
  assert.equal((unclaimed.match(/stableMs: UNCLAIMED_STABLE_MS/g) || []).length, 3);
  assert.ok(!unclaimed.includes('stableMs: DEFAULT_STABLE_MS'));
  assert.ok(unclaimed.includes('label: `未確認バトル ${href}`, fast: true'));

  const returnToAssist = source.slice(source.indexOf('async function returnToAssistFromUnclaimed'), source.indexOf('async function confirmAllUnclaimed'));
  assert.ok(returnToAssist.includes('intervalMs: UNCLAIMED_POLL_MS'));
  assert.ok(returnToAssist.includes("label: '救援一覧へ戻る', fast: true"));

  const recovery = source.slice(source.indexOf('async function recoverKnownPopup'), source.indexOf('async function pressDeckConfirm'));
  assert.ok(recovery.includes("expected: ['UNCLAIMED_LIST'],\n        intervalMs: UNCLAIMED_POLL_MS,\n        fast: true"));
  // 監視は増やさない。軽量モードでの重い全体監視を持ち込まないための歯止め。
  assert.ok(!unclaimed.includes('observeOnLightweight'));
});

test('game-route navigation drops the old document before reusing the iframe shell', () => {
  const helper = source.slice(source.indexOf('function stopRuntimeTelemetry'), source.indexOf('function computedVisible'));
  assert.ok(helper.includes('async function replaceFrame'));
  assert.ok(helper.includes("notifyFrameLifecycle(previousFrame, null, 'detach')"));
  assert.ok(helper.includes('releaseFrameParentReferences(previousFrame)'));
  assert.ok(helper.indexOf("notifyFrameLifecycle(previousFrame, null, 'detach')") < helper.indexOf('releaseFrameRuntime(previousFrame)'));
  assert.ok(helper.includes('const blanked = await blankFrame(previousFrame)'));
  assert.ok(helper.includes('const replaceElement = forceNewElement || !blanked'));
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
    'Ticker?.reset',
    'Tween?.removeAllTweens',
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

test('phone panels open large and are only ever clamped by the screen itself', () => {
  assert.ok(source.includes('function isAndroidPhone()'));
  assert.ok(source.includes('navigator.userAgentData?.mobile === true'));
  assert.ok(source.includes('/\\bAndroid\\b/i.test(userAgent)'));
  assert.ok(source.includes('function isNarrowViewport()'));
  assert.ok(source.includes('window.screen?.width'));
  assert.ok(source.includes("dock.classList.toggle('narrowViewport', narrowScreen)"));
  assert.ok(source.includes('narrowScreen = isNarrowViewport()'));
  assert.ok(source.includes('if (narrowScreen && !wasNarrow) normalizeNarrowDockSize()'));
  assert.ok(source.includes('normalizeNarrowDockSize();'));

  // The dock fills most of a phone screen by default and may be grown to all of it.
  assert.ok(source.includes('width:var(--dock-width,min(460px,calc(100dvw - 12px)))'));
  assert.ok(source.includes('height:var(--dock-height,min(800px,74dvh))'));
  assert.ok(source.includes('max-height:calc(100vh - 6px);max-height:calc(100dvh - 6px)'));
  assert.ok(!source.includes('max-height:54vh;max-height:54dvh'));

  // No Android-only shrink ray, and no screen-fraction ceiling above the saved size.
  assert.ok(!source.includes('androidCompact'));
  assert.ok(!/viewportWidth \* 0\.72/.test(source));
  const normalize = source.slice(source.indexOf('function normalizeNarrowDockSize'), source.indexOf('function syncDockDensity'));
  assert.ok(normalize.includes('const size = narrowDockMaxSize()'));
  assert.ok(normalize.includes('state.dockWidth = size.width'));
  assert.ok(normalize.includes('state.dockHeight = size.height'));
  const maxSize = source.slice(source.indexOf('function narrowDockMaxSize'), source.indexOf('function narrowDockDefaultSize'));
  assert.ok(maxSize.includes('box.width - DOCK_VIEWPORT_MARGIN'));
  assert.ok(maxSize.includes('box.height - DOCK_VIEWPORT_MARGIN'));
});

test('panel geometry survives a host page that redefines the pixel', () => {
  const box = source.slice(source.indexOf('function viewportBox'), source.indexOf('function dockRenderScale'));
  // Every viewport API is either right or too large, never too small, so take the smallest.
  assert.ok(box.includes('smallestPositive([viewport?.width, client?.clientWidth, window.innerWidth], 360)'));
  assert.ok(box.includes('smallestPositive([viewport?.height, client?.clientHeight, window.innerHeight], 640)'));
  // root is position:fixed inset:0, so it supplies the origin our left/top resolve from.
  assert.ok(box.includes("finite(frame?.left, 0) + finite(viewport?.offsetLeft, 0)"));

  // A transform on <html> means one of our CSS pixels is not one screen pixel.
  const scale = source.slice(source.indexOf('function dockRenderScale'), source.indexOf('function narrowDockMaxSize'));
  assert.ok(scale.includes('const local = dock.offsetWidth'));
  assert.ok(scale.includes('const ratio = rendered / local'));
  assert.ok(scale.includes('ratio > 0.05 && ratio < 20 ? ratio : 1'));

  // Sizes, offsets and the drag transform all convert through that scale.
  const position = source.slice(source.indexOf('function positionDock'), source.indexOf('function writeDockOffset'));
  assert.ok(position.includes('`${state.dockWidth / scale}px`'));
  assert.ok(position.includes('`${state.dockHeight / scale}px`'));
  assert.ok(position.includes('writeDockOffset(state.dockX, state.dockY, dockRenderScale(rect))'));
  const write = source.slice(source.indexOf('function writeDockOffset'), source.indexOf('function dockDragBounds'));
  assert.ok(write.includes('`${(screenX - originX) / scale}px`'));
  assert.ok(write.includes('`${(screenY - originY) / scale}px`'));
  assert.ok(source.includes('const x = (drag.x - drag.baseX) / drag.scale'));
  assert.ok(source.includes('drag.scale = dockRenderScale(rect)'));

  // And the rendered box is corrected against what was actually painted.
  assert.ok(position.includes('const overflowWidth = limit.width > 0 ? rect.width / limit.width : 1'));
  assert.ok(position.includes('state.dockWidth = Math.max(DOCK_MIN_WIDTH, state.dockWidth / Math.max(1, overflowWidth))'));
});

test('the settings page reports the measurements the layout was derived from', () => {
  assert.ok(source.includes('id="viewportReport"'));
  assert.ok(source.includes('id="resetDockLayout"'));
  const metrics = source.slice(source.indexOf('function dockMetrics'), source.indexOf('function renderViewportReport'));
  for (const key of ['usable', 'panel', 'density', 'fixedFrame', 'visual', 'layout', 'window', 'dpr']) {
    assert.ok(metrics.includes(`${key}:`), key);
  }
  assert.ok(source.includes("if (state.page === 'settings') renderViewportReport();"));
});

test('panel chrome is sized from the panel, not from the phone screen', () => {
  const density = source.slice(source.indexOf('function syncDockDensity'), source.indexOf('function dockFillsViewport'));
  assert.ok(density.includes('const rect = measured || dock.getBoundingClientRect()'));
  assert.ok(density.includes("const step = width < 300 ? 4 : width < 380 ? 3 : width < 480 ? 2 : width < 640 ? 1 : 0"));
  assert.ok(density.includes('DOCK_DENSITY_STEPS.forEach((name, index) => dock.classList.toggle(`d-${name}`, index > 0 && index <= step))'));
  assert.ok(source.includes("const DOCK_DENSITY_STEPS = Object.freeze(['lg', 'md', 'sm', 'xs', 'xxs'])"));
  assert.ok(density.includes("dock.classList.toggle('h-sm', height < 430)"));
  // Density resyncs are coalesced to one measurement per frame.
  assert.ok(source.includes('const densityObserver = new ResizeObserver(() => {'));
  assert.ok(source.includes('densityFrame = requestAnimationFrame(() => {'));
  assert.ok(source.includes('#dock.d-sm .paletteItems{grid-template-columns:1fr;gap:5px}'));
  assert.ok(source.includes('#dock.d-xxs .grid2,#dock.d-xxs .grid3{grid-template-columns:1fr}'));
  // Legible type, not the 5.5px the old Android override shipped.
  assert.ok(source.includes('#dock.d-sm{font-size:12.5px;--field-height:34px;--field-font:13px'));
  assert.ok(source.includes('#dock.d-xs{font-size:11.5px;--field-height:32px;--field-font:12.5px'));
  assert.ok(!source.includes('font-size:5.5px'));
  // Inputs shrink with the panel, and only WebKit pays the 16px anti-zoom tax.
  assert.ok(source.includes('min-height:var(--field-height)'));
  assert.ok(source.includes('font-size:var(--field-font)'));
  assert.ok(source.includes('#dock.ios{--field-font:16px}'));
  assert.ok(source.includes("dock.classList.toggle('ios', isIosLikeBrowser())"));
  // A checkbox sits beside its label instead of under it.
  assert.ok(source.includes('.field:has(input[type=checkbox]){flex-direction:row-reverse'));
});

test('the panel may hang off any edge and still be grabbed back', () => {
  const position = source.slice(source.indexOf('function positionDock'), source.indexOf('function installDockDrag'));
  assert.ok(position.includes('let { minX, maxX, minY, maxY } = dockDragBounds({ width, height })'));
  const bounds = source.slice(source.indexOf('function dockDragBounds'), source.indexOf('function installDockDrag'));
  assert.ok(bounds.includes('const minX = box.left + keepX - width'));
  assert.ok(bounds.includes('maxX: Math.max(minX, box.left + box.width - keepX)'));
  assert.ok(bounds.includes('maxY: Math.max(minY, box.top + box.height - keepY)'));
  // Growing the panel still pulls it fully back on-screen; only a drag may park it.
  assert.ok(position.includes('if (keepInView) {'));
  assert.ok(source.includes('positionDock({ keepInView: true })'));
  assert.ok(position.includes('syncDockDensity(rect)'));
  assert.ok(source.includes('const DOCK_KEEP_VISIBLE_X = 76'));
  assert.ok(source.includes('const DOCK_KEEP_VISIBLE_Y = 46'));

  // Resizing reaches the whole screen from wherever the panel sits.
  const resize = source.slice(source.indexOf('const resizeTo = (desiredWidth'), source.indexOf('const move = event =>', source.indexOf('const resizeTo = (desiredWidth')));
  assert.ok(resize.includes('Math.max(DOCK_MIN_WIDTH, box.width - DOCK_VIEWPORT_MARGIN / 2)'));
  assert.ok(resize.includes('Math.max(DOCK_MIN_HEIGHT, box.height - DOCK_VIEWPORT_MARGIN / 2)'));
  assert.ok(!resize.includes('Math.min(260, maxWidth)'));

  // One tap fills the screen, another puts the panel back where it was.
  assert.ok(source.includes('id="toggleMaximize"'));
  assert.ok(source.includes("byId('toggleMaximize').addEventListener('click', toggleDockMaximized)"));
  assert.ok(source.includes("byId('dockHeader').addEventListener('dblclick'"));
  const maximize = source.slice(source.indexOf('function toggleDockMaximized'), source.indexOf('function positionDock'));
  assert.ok(maximize.includes('if (dockRestoreBox) {'));
  assert.ok(maximize.includes('state.dockWidth = Math.max(DOCK_MIN_WIDTH, box.width - DOCK_VIEWPORT_MARGIN)'));

  // Panel geometry saved by the cramped phone layout is dropped once on upgrade.
  assert.ok(source.includes('const DOCK_LAYOUT_REVISION = 2'));
  assert.ok(source.includes('if (state.legacy.dockLayout < DOCK_LAYOUT_REVISION) {'));

  // The corner grips keep their own space so they cannot swallow a tap meant for 実行.
  assert.ok(source.includes('.resizeHandle{\n        position:absolute;z-index:20;bottom:0;width:32px'));
  assert.ok(source.includes('margin:0 -16px;padding:12px 34px calc(12px + env(safe-area-inset-bottom))'));
  assert.ok(source.includes('#dock.d-sm #runBar{margin:0 -10px;padding:9px 30px'));
});

test('the run bar carries only run and stop, with issues shown when they exist', () => {
  assert.ok(!source.includes('実行前チェック'));
  assert.ok(!source.includes('id="validationBar"'));
  assert.ok(!source.includes("id=\"validateWorkflow\""));
  assert.ok(source.includes('<button id="runWorkflow">▶ 実行</button>'));
  assert.ok(source.includes('<button id="workflowIssues" class="issuePill" type="button" hidden></button>'));
  const chip = source.slice(source.indexOf('function renderValidationChip'), source.indexOf('function scheduleValidationRefresh'));
  assert.ok(chip.includes('if (!errors.length && !warnings.length) {'));
  assert.ok(chip.includes('chip.hidden = true'));
  assert.ok(chip.includes('const label = errors.length ? `⚠ ${count}件の要修正` : `⚠ ${count}件の注意`'));
  const refresh = source.slice(source.indexOf('function scheduleValidationRefresh'), source.indexOf('function invalidateWorkflowValidation'));
  assert.ok(refresh.includes('state.validationIssues = validateWorkflowDefinition(currentWorkflow())'));
  assert.ok(refresh.includes('renderValidationChip()'));
  assert.ok(source.includes('scheduleValidationRefresh();'));
  // The chip is the only entry point left, and it still walks to the offending block.
  assert.ok(source.includes("ui.workflowIssues.addEventListener('click', () => {"));
  assert.ok(source.includes('focusWorkflowValidationIssue();'));
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

test('assist success handoff uses 50ms polling and dedicated rapid taps', () => {
  assert.ok(source.includes('const ASSIST_HANDOFF_POLL_MS = 50'));
  assert.ok(source.includes('const TOUCH_HANDOFF_VISIBLE_LATENCY_MS'));
  assert.ok(source.includes('const TOUCH_HANDOFF_HOLD_LATENCY_MS'));
  const tap = source.slice(source.indexOf('async function jqTapStrict'), source.indexOf('function randomUniform'));
  assert.ok(tap.includes('handoff = false'));
  assert.ok(tap.includes('TOUCH_HANDOFF_VISIBLE_LATENCY_MS'));
  assert.ok(tap.includes('TOUCH_HANDOFF_HOLD_LATENCY_MS'));
  const refresh = source.slice(source.indexOf('async function refreshAssistList'), source.indexOf('async function switchAssistSlot'));
  assert.ok(refresh.includes("jqTapStrict(refresh, { signal, label: '救援一覧更新', fast: true })"));
  const supporter = source.slice(source.indexOf('async function waitForSupporterRows'), source.indexOf('async function selectSupporterAuto'));
  assert.ok(supporter.includes('intervalMs: config.fastTap ? ASSIST_HANDOFF_POLL_MS : null'));
  assert.ok(supporter.includes('handoff: Boolean(config.fastTap)'));
  const deck = source.slice(source.indexOf('async function pressDeckConfirm'), source.indexOf('async function assistSelectFullFlow'));
  assert.ok(deck.includes('intervalMs: config.fastTap ? ASSIST_HANDOFF_POLL_MS : null'));
  assert.ok(deck.includes('handoff: Boolean(config.fastTap)'));
  assert.ok(deck.includes("if (next.type === 'BATTLE') return { battle: true };"));
  assert.ok(!deck.includes('await waitForFrameReady'));
  const flow = source.slice(source.indexOf('async function assistSelectFullFlow'), source.indexOf('function evaluateWorkflowCondition'));
  assert.ok(flow.includes('tapCurrentAssistRow(selected, context, { fast: true, handoff: true })'));
  const selectionWait = flow.slice(flow.indexOf('let next = await waitForGbfState'), flow.indexOf("if (next.type === 'UNKNOWN_ERROR')"));
  assert.ok(selectionWait.includes('intervalMs: ASSIST_HANDOFF_POLL_MS'));
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

test('battle result redirects recover from attack waits and explicit reload blocks', () => {
  const recovery = source.slice(
    source.indexOf('function recoverableBattleEndState'),
    source.indexOf('function visibleMyPageButton')
  );
  assert.ok(recovery.includes('state.expectedBattleRaidId'));
  assert.ok(recovery.includes('isBattleResultUrl(url)'));

  const attackWait = source.slice(source.indexOf('async function waitForAutoAttack'));
  assert.ok(attackWait.includes('rememberBattleRecoveryConfig(config)'));
  assert.ok(attackWait.includes('const existingEnd = recoverableBattleEndState()'));
  assert.ok(attackWait.includes('const navigatedEnd = recoverableBattleEndState()'));

  const reloadStart = source.lastIndexOf("case 'iframeReload':");
  const reload = source.slice(reloadStart, source.indexOf("case 'iframeBack':", reloadStart));
  assert.ok(reload.includes('context.battleRecoveryConfig'));
  assert.ok(reload.includes('recoverableBattleEndState()'));
  assert.ok(reload.includes('restartWorkflowAfterBattleEnd(recoveryConfig, context, battleEnd)'));

  const probe = source.slice(
    source.indexOf('async function reloadForBattleEndProbe'),
    source.indexOf('async function restartWorkflowAfterBattleEnd')
  );
  assert.ok(probe.includes('endState: recoverableBattleEndState()'));
});

test('assist selection excludes raid IDs already entered in the current workflow run', () => {
  assert.ok(source.includes('recentRaidIds: new Set()'));
  assert.ok(source.includes('const MAX_RECENT_RAID_IDS = 128'));
  const flow = source.slice(
    source.indexOf('async function assistSelectFullFlow'),
    source.indexOf('function evaluateWorkflowCondition')
  );
  assert.ok(flow.includes('.filter(item => !wasRecentRaidId(context, item.raidId))'));
  assert.ok(flow.includes('rememberRecentRaidId(context, selected.raidId)'));

  const lifecycle = source.slice(
    source.indexOf('function armBattleEndDetection'),
    source.indexOf('function battleEndDetectionMatches')
  );
  assert.ok(lifecycle.includes('rememberRecentRaidId(state.running, runtime.raidId)'));

  const restart = source.slice(
    source.indexOf('async function restartWorkflowAfterBattleEnd'),
    source.indexOf('async function ensureFullAuto')
  );
  assert.ok(restart.includes('rememberRecentRaidId(context, endState?.runtime?.raidId || state.expectedBattleRaidId)'));
});

test('professional UX exposes truthful runtime and accessible recovery state', () => {
  assert.ok(source.includes('const APP_VERSION = 70'));
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
  assert.ok(runtime.includes('stage = win.stage || null'));
  assert.ok(runtime.includes('status = stage?.gGameStatus || null'));
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
  assert.ok(attack.includes('const useDomFallback = !runtime.available'));
  assert.ok(attack.includes('attackRequestAt: latestAttackRequestAt(doc)'));
  assert.ok(attack.includes('turnCount: turnCountValue(doc)'));
  // 通常攻撃のリクエストだけを攻撃の証拠にする（アビリティ・召喚は別エンドポイント）
  assert.ok(source.includes('const ATTACK_REQUEST_PATTERN = /attack_result/i'));
  assert.ok(!/ATTACK_REQUEST_PATTERN = \/[^\n]*(ability|summon)/.test(source));
  const requests = source.slice(source.indexOf('function latestAttackRequestAt'), source.indexOf('function attackSnapshot'));
  assert.ok(requests.includes("win?.performance?.getEntriesByType?.('resource')"));
  assert.ok(requests.includes('ATTACK_REQUEST_PATTERN.test(entry?.name'));
  assert.ok(requests.includes('ATTACK_REQUEST_INITIATORS.includes(String(entry.initiatorType ?? \'\'))'));
  const end = source.slice(source.indexOf('function detectBattleEndState'), source.indexOf('function safeBattleEndState'));
  assert.ok(end.includes('armBattleEndDetection(doc, runtime)'));
  assert.ok(end.includes('battleEndDetectionMatches(runtime)'));
  assert.ok(end.includes('runtime.status === state.activeBattleStatus'));
});

test('full auto waits for the game runtime to expose an actionable button without redundant latency', () => {
  const body = source.slice(source.indexOf('async function ensureFullAuto'), source.indexOf('function elementDisplayOn'));
  assert.ok(body.includes('if (observed.on) return observed;'));
  assert.ok(body.includes('!observed.exists || !observed.visible || !observed.enabled'));
  assert.ok(body.indexOf('if (observed.on) return observed;') < body.indexOf('!observed.exists || !observed.visible || !observed.enabled'));
  const wait = body.slice(body.indexOf('const found = await monitorFrame'), body.indexOf('if (found.battleEnd)'));
  assert.ok(wait.includes('stableMs: 0'));
  assert.ok(wait.includes('observeCharacterData: false'));
  assert.ok(wait.includes('intervalMs: 80'));
  assert.ok(body.includes("jqTapStrict(found.button, { signal, label: 'フルオート', fast: true })"));
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
  assert.ok(source.includes('function installBattlePerformanceChildRuntime()'));
  assert.ok(source.includes('if (window.top !== window) {'));
  assert.ok(source.includes('installBattlePerformanceChildRuntime();'));
  assert.ok(source.includes('id="tab-settings"'));
  assert.ok(source.includes('id="battlePerformanceToggle"'));
  assert.ok(source.includes("state.page = ['workflow', 'legacy', 'logs', 'settings']"));
  assert.ok(source.includes('setBattlePerformanceEnabled(ui.battlePerformanceToggle.checked)'));
  assert.ok(source.includes('syncBattlePerformanceFrame();'));
});

test('battle performance preserves game ticks while suppressing only the stage render traversal', () => {
  const child = source.slice(source.indexOf('function installBattlePerformanceChildRuntime'), source.indexOf('const APP_VERSION'));
  assert.ok(child.includes("['loadManifest', 'loadFile']"));
  assert.ok(child.includes('BATTLE_PERFORMANCE_TRANSPARENT_IMAGE'));
  assert.ok(child.includes('function patchStageRendering()'));
  assert.ok(child.includes('function restoreStageRendering()'));
  assert.ok(child.includes("typeof stage.ra === 'function'"));
  assert.ok(child.includes("typeof stage.draw === 'function'"));
  assert.ok(child.includes("requireAmd(['model/sound', 'lib/sound']"));
  assert.ok(child.includes('setting.sound_flag = 0'));
  assert.ok(child.includes('animation-duration:.001s!important'));
  assert.ok(child.includes("canvas.id === 'canvas'"));
  assert.ok(!child.includes('drawArrays'));
  assert.ok(!child.includes('drawElements'));
  assert.ok(!child.includes('CanvasRenderingContext2D'));
  assert.ok(!child.includes('Ticker.removeAllEventListeners'));
  assert.ok(!child.includes('Stage.update ='));
  assert.ok(!child.includes('stage.update ='));
});


test('battle performance mode bootstraps into a same-origin iframe when only the controller was injected', () => {
  assert.ok(source.includes('function bootstrapBattlePerformanceFrameRuntime(win)'));
  assert.ok(source.includes('runtime?.version !== 2'));
  assert.ok(source.includes('try { runtime?.destroy?.(); } catch {}'));
  assert.ok(source.includes('const bootstrap = win.Function('));
  assert.ok(source.includes('readBattlePerformanceSetting.toString()'));
  assert.ok(source.includes('installBattlePerformanceChildRuntime.toString()'));
  const sync = source.slice(source.indexOf('function syncBattlePerformanceFrame'), source.indexOf('function setBattlePerformanceEnabled'));
  assert.ok(sync.includes('bootstrapBattlePerformanceFrameRuntime(win);'));
  assert.ok(sync.indexOf('bootstrapBattlePerformanceFrameRuntime(win);') < sync.indexOf('postMessage'));
});


test('battle performance hooks are isolated and restore audio outside battle routes', () => {
  const child = source.slice(source.indexOf('function installBattlePerformanceChildRuntime'), source.indexOf('const APP_VERSION'));
  const patchNow = child.slice(child.indexOf('function patchNow'), child.indexOf('function setEnabled'));
  assert.ok(patchNow.includes('try { patchLoadQueue(); } catch {}'));
  assert.ok(patchNow.includes('try { patchStageRendering(); } catch {}'));
  assert.ok(patchNow.includes('restoreStageRendering();'));
  assert.ok(patchNow.includes('if (isBattleRuntime())'));
  assert.ok(patchNow.includes('else {\n        restoreSoundRuntime();'));
  assert.ok(patchNow.includes('restoreLoadQueue();'));
  assert.ok(patchNow.includes('restoreImageSources();'));
  assert.ok(patchNow.indexOf('if (isBattleRuntime())') < patchNow.indexOf('try { patchImageSources(); } catch {}'));
  assert.ok(child.includes('stage[name] = wrapper'));
  assert.ok(child.includes('function restoreLoadQueue()'));
  assert.ok(child.includes('function restoreImageSources()'));
  assert.ok(child.includes('version: 2'));
  assert.ok(child.includes('pollTimer = window.setInterval'));
  assert.ok(child.includes('try { patchNow(); } catch {}'));
});


test('battle performance setup polling is bounded, route-aware, and disabled cleanly', () => {
  const child = source.slice(source.indexOf('function installBattlePerformanceChildRuntime'), source.indexOf('const APP_VERSION'));
  assert.ok(child.includes('function startPoll(durationMs = 30_000)'));
  assert.ok(child.includes('function stopPoll()'));
  assert.ok(child.includes('performance.now() >= pollDeadline'));
  assert.ok(child.includes('}, 250);'));
  assert.ok(!child.includes('}, 100);'));
  assert.ok(child.includes('window.addEventListener(\'hashchange\', onRouteChange)'));
  assert.ok(child.includes('window.removeEventListener(\'hashchange\', onRouteChange)'));
  assert.ok(child.includes('window.addEventListener(\'pagehide\', destroy, { once: true })'));
  assert.ok(child.includes('window.removeEventListener(\'message\', onMessage)'));
  const enabled = child.slice(child.indexOf('function setEnabled'), child.indexOf('const onMessage'));
  assert.ok(enabled.includes('startPoll();'));
  assert.ok(enabled.includes('stopPoll();'));
});

test('battle performance setting rolls back its UI state when persistence fails', () => {
  const setter = source.slice(source.indexOf('function setBattlePerformanceEnabled'), source.indexOf('function consumeDragEvent'));
  assert.ok(setter.includes('const previous = state.battlePerformanceEnabled;'));
  assert.ok(setter.includes('state.battlePerformanceEnabled = previous;'));
  assert.ok(setter.includes('ui.battlePerformanceToggle.checked = previous;'));
});

test('battle performance hides the canvas while preserving independent DOM attack controls', () => {
  const child = source.slice(source.indexOf('function installBattlePerformanceChildRuntime'), source.indexOf('const APP_VERSION'));
  const assets = child.slice(child.indexOf('const shouldReplaceAsset'), child.indexOf('const rewriteAsset'));
  assert.ok(child.includes('.cnt-raid-stage canvas#canvas { visibility:hidden!important; }'));
  assert.ok(child.includes('.cnt-raid > .btn-auto,'));
  assert.ok(child.includes('.cnt-raid #cnt-raid-information .btn-attack-start'));
  assert.ok(child.includes('stage[name] = wrapper'));
  assert.ok(assets.includes('/\\/sp\\/cjs\\/'));
  assert.ok(!child.includes('battleCanvas'));
  assert.ok(!child.includes('patchRenderMethod'));
  assert.ok(!child.includes('patchRendering'));
});

test('iframe recycling destroys child runtimes and releases parent references immediately', () => {
  const child = source.slice(source.indexOf('function installBattlePerformanceChildRuntime'), source.indexOf('const APP_VERSION'));
  assert.ok(child.includes('let destroyed = false'));
  assert.ok(child.includes('const destroy = () =>'));
  assert.ok(child.includes("window.removeEventListener('storage', onStorage)"));
  assert.ok(child.includes('refresh: patchNow,\n      destroy'));

  const lifecycle = source.slice(source.indexOf('const cleanup = new Set()'), source.indexOf('function computedVisible'));
  assert.ok(lifecycle.includes('const frameLifecycleSubscribers = new Set()'));
  assert.ok(lifecycle.includes("notifyFrameLifecycle(previousFrame, null, 'detach')"));
  assert.ok(lifecycle.includes("notifyFrameLifecycle(previousFrame, nextFrame, 'attach')"));
  assert.ok(lifecycle.includes("replaceFrame(destination, { forceNewElement = false }"));
  assert.ok(lifecycle.includes('releaseFrameParentReferences(previousFrame)'));
  assert.ok(lifecycle.includes("clearPendingAutoAttack('iframeを再構築するため攻撃監視を解除しました')"));
  assert.ok(lifecycle.includes('previousFrame = null'));
  assert.ok(lifecycle.includes('state.frameGeneration === loadedGeneration'));
  assert.ok(!lifecycle.includes('iframe === loadedFrame'));

  const monitor = source.slice(source.indexOf('function monitorFrame'), source.indexOf('async function waitForFrameReady'));
  assert.ok(monitor.includes('frameLifecycleSubscribers.add(onFrameLifecycle)'));
  assert.ok(monitor.includes('frameLifecycleSubscribers.delete(onFrameLifecycle)'));
  assert.ok(monitor.includes("listenedFrame?.removeEventListener('load', onFrameLoad)"));
  assert.ok(monitor.includes("if (phase === 'detach') return"));
});

test('standalone Safari relief also rebuilds the MyPage browsing context', () => {
  const relief = source.slice(source.indexOf('async function releaseGranblueResources'), source.indexOf('async function reloadForBattleEndProbe'));
  assert.ok(relief.includes("hardNavigateAfterRelief(gameRouteUrl('#mypage'), 'mypage', config, context)"));
});

test('full-auto startup cannot return to assist before the current battle is armed', () => {
  const ensure = source.slice(
    source.indexOf('async function ensureFullAuto'),
    source.indexOf('function elementDisplayOn')
  );
  const readyIndex = ensure.indexOf("await waitForFrameReady({\n        signal,\n        timeoutMs: config.timeoutSec * 1000,\n        expectedScreen: 'battle',\n        stableMs: 0\n      })");
  const monitorIndex = ensure.indexOf('const found = await monitorFrame');
  assert.ok(readyIndex >= 0);
  assert.ok(monitorIndex > readyIndex);
  assert.ok(!ensure.slice(0, readyIndex).includes('safeBattleEndState'));
  assert.ok(ensure.includes('armBattleEndDetection(doc, observed.runtime)'));
  assert.ok(ensure.indexOf('armBattleEndDetection(doc, observed.runtime)') < ensure.indexOf('const battleEnd = detectBattleEndState(doc)'));
});

test('every battle-end surface is gated by an armed live battle session', () => {
  const stateBlock = source.slice(source.indexOf('const state = {'), source.indexOf('const cleanup = new Set()'));
  const lifecycle = source.slice(
    source.indexOf('function resetBattleEndDetection'),
    source.indexOf('function fullAutoState')
  );
  const detector = source.slice(
    source.indexOf('function detectBattleEndState'),
    source.indexOf('function safeBattleEndState')
  );
  const assistTap = source.slice(
    source.indexOf('async function tapCurrentAssistRow'),
    source.indexOf('function assistListSignature')
  );
  assert.ok(stateBlock.includes('battleEndArmed: false'));
  assert.ok(stateBlock.includes('activeBattleDocument: null'));
  assert.ok(lifecycle.includes('function resetBattleEndDetection'));
  assert.ok(lifecycle.includes('function armBattleEndDetection'));
  assert.ok(lifecycle.includes('if (runtime?.expectedRaidId && !runtime.matchesExpectedBattle) return false'));
  assert.ok(lifecycle.includes('if (runtime.finished) return false'));
  assert.ok(lifecycle.includes('function battleEndDetectionMatches'));
  assert.ok(assistTap.includes('resetBattleEndDetection({ expectedRaidId: raidId })'));
  const gateIndex = detector.indexOf('if (!battleEndDetectionMatches(runtime)) return null;');
  assert.ok(gateIndex >= 0);
  assert.ok(gateIndex < detector.indexOf('isBattleResultUrl(url)'));
  assert.ok(gateIndex < detector.indexOf('runtime.finished'));
  assert.ok(gateIndex < detector.indexOf('const notice ='));
  assert.ok(gateIndex < detector.indexOf('const resultButton ='));
  assert.ok(detector.includes('computedVisible(notice)'));
  assert.ok(detector.includes('computedVisible(noticeContainer)'));
  assert.ok(detector.includes('computedVisible(resultButton)'));
  assert.ok(detector.includes('computedVisible(resultContainer)'));
  assert.ok(detector.includes('text.includes(expectedText)'));
  assert.ok(!detector.includes("if (!text || text.includes(BATTLE_END_MESSAGE))"));
});

test('workflow lifecycle releases the armed battle document reference', () => {
  const start = source.slice(source.indexOf('async function startWorkflow'), source.indexOf('function stopWorkflow'));
  assert.ok(start.includes('state.running = context;\n    resetBattleEndDetection();'));
  assert.ok(start.includes("clearPendingAutoAttack('ワークフローを終了しました');\n      resetBattleEndDetection();"));
  const restart = source.slice(
    source.indexOf('async function restartWorkflowAfterBattleEnd'),
    source.indexOf('async function ensureFullAuto')
  );
  assert.ok(restart.includes('resetBattleEndDetection();'));
});


test('host shutdown neutralizes top-level reload paths before Granblue cleanup', () => {
  const helper = source.slice(source.indexOf('function detachHostRuntimeEvents'), source.indexOf('function blankFrame'));
  assert.ok(helper.includes("jq(doc).off('ajaxStop ajaxError')"));
  assert.ok(helper.includes("jq(win).off('resize hashchange popstate error')"));
  assert.ok(helper.includes('win.onresize = null'));
  assert.ok(helper.includes('win.requirejs.onError = () => {}'));
  assert.ok(helper.includes('if (hostShell) detachHostRuntimeEvents(win, doc)'));
  assert.ok(helper.includes('win.Game.loading.loadStart = () => {}'));
  assert.ok(helper.includes('releaseWindowRuntime(window, document, { stopWindow: false, hostShell: true })'));
  const discard = helper.slice(helper.indexOf('function discardHostRuntimeShell'), helper.indexOf('function releaseHostRuntimeOnce'));
  assert.ok(!discard.includes("      '_',"));
});

test('initial install releases the parent runtime before loading the child game', () => {
  const install = source.slice(source.lastIndexOf('const initialUrl = normalizeInitialUrl()'));
  assert.ok(install.includes('releaseHostRuntimeOnce()'));
  assert.ok(install.indexOf('releaseHostRuntimeOnce()') < install.indexOf('iframe.src = initialUrl'));
});

test('parent-page restart handoff persists ownership and safe fallbacks', () => {
  const handoff = source.slice(source.indexOf('function createWorkflowExecutionState'), source.indexOf('async function runBlockList'));
  assert.ok(source.includes('const WORKFLOW_HANDOFF_SCHEMA_VERSION = 1'));
  assert.ok(source.includes('const WORKFLOW_HANDOFF_TTL_MS = 5 * 60_000'));
  assert.ok(handoff.includes('if (window.name !== handoff.targetName) return null'));
  assert.ok(handoff.includes('handoff.claimedBy && handoff.claimedBy !== instanceId'));
  assert.ok(handoff.includes('window.open(handoff.parentUrl, handoff.targetName)'));
  assert.ok(handoff.includes("phase: 'committed',\n      mode: 'same-tab'"));
  assert.ok(handoff.includes('replaceParentLocation(fallback.parentUrl)'));
  assert.ok(handoff.includes("location.replace('about:blank')"));
  assert.ok(handoff.includes('if (state.running) clearWorkflowHandoff(current.id)'));
});

test('iOS and iPadOS reload the parent in place instead of opening a second tab', () => {
  const detect = source.slice(source.indexOf('function isIosLikeBrowser'), source.indexOf('function isNarrowViewport'));
  assert.ok(detect.includes('/\\b(iPhone|iPod)\\b/i.test(userAgent)'));
  assert.ok(detect.includes('/\\biPad\\b/i.test(userAgent)'));
  assert.ok(detect.includes('/\\bMacintosh\\b/i.test(userAgent) && touchPoints > 1'));

  const restart = source.slice(source.indexOf('async function beginWorkflowParentRestart'), source.indexOf('async function resumeClaimedWorkflowHandoff'));
  // WebKit never reaches window.open: the same tab reloads and resumes the saved run.
  assert.ok(restart.includes('if (isIosLikeBrowser()) {'));
  assert.ok(restart.indexOf('continueWorkflowInCurrentTab') < restart.indexOf('openWorkflowHandoffTab'));
  assert.ok(restart.includes('const opened = openWorkflowHandoffTab(handoff)'));

  // The pop-up gesture dance it replaces is gone for good.
  assert.ok(!source.includes('awaitGestureHandoffTab'));
  assert.ok(!source.includes('scriptedTabOpenAllowed'));
  assert.ok(!source.includes('GESTURE_HANDOFF_EVENTS'));

  // Same blocks, same runtime cursor — only the tab strategy changed.
  const fallback = source.slice(source.indexOf('async function continueWorkflowInCurrentTab'), source.indexOf('function openWorkflowHandoffTab'));
  assert.ok(fallback.includes("phase: 'committed',\n      mode: 'same-tab'"));
  assert.ok(fallback.includes('window.name = fallback.targetName'));
  assert.ok(fallback.includes('replaceParentLocation(fallback.parentUrl)'));
});

test('same-tab parent restart forces a reload when only the fragment changes', () => {
  const replace = source.slice(source.indexOf('function replaceParentLocation'), source.indexOf('async function continueWorkflowInCurrentTab'));
  assert.ok(replace.includes('current.pathname === next.pathname'));
  assert.ok(replace.includes('current.search === next.search'));
  assert.ok(replace.includes('location.replace(next.href)'));
  assert.ok(replace.includes('if (fragmentOnly) setTimeout(() => { try { location.reload(); } catch {} }, 0)'));
});

test('workflow cursor resumes after the restart block without replaying it', () => {
  const runner = source.slice(source.indexOf('async function runBlockList'), source.indexOf('async function executeWorkflowBlock'));
  assert.ok(runner.includes('const frame = executionListFrame(context, listKey)'));
  assert.ok(runner.includes('if (!definition?.container) frame.index = index + 1'));
  assert.ok(runner.indexOf('if (!definition?.container) frame.index = index + 1') < runner.indexOf('await executeWorkflowBlock(block, context, execution)'));
  assert.ok(runner.includes('if (definition?.container) frame.index = index + 1'));
  assert.ok(source.includes('executionState: deepClone(context.executionState)'));
  assert.ok(source.includes('executionState: createWorkflowExecutionState(resumeRuntime?.executionState)'));
  assert.ok(source.includes("case 'parentTabRestart'"));
});

test('nested repeat and conditional frames retain exact in-progress state', () => {
  assert.ok(source.includes("kind: 'repeat', iteration: 0"));
  assert.ok(source.includes("kind: 'repeatUntil'"));
  assert.ok(source.includes('inIteration: false'));
  assert.ok(source.includes("kind: 'if'"));
  assert.ok(source.includes("branch: evaluateWorkflowCondition(block.config.condition) ? 'children' : 'elseChildren'"));
  assert.ok(source.includes('context.executionState = createWorkflowExecutionState()'));
});


function loadElementPickerTargeting() {
  const constants = source.slice(
    source.indexOf('const ELEMENT_PICKER_TARGET_SELECTOR'),
    source.indexOf('function cssIdentifier')
  );
  const helpers = source.slice(
    source.indexOf('function pickerEventPoint'),
    source.indexOf('function pickerTargetLabel')
  );
  return new Function(
    'finite',
    `${constants}\n${helpers}\nreturn { resolvePickerTarget, preferredPickerTarget };`
  )((value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback));
}

function fakePickerDocument(width = 360, height = 640) {
  const doc = {
    nodeType: 9,
    defaultView: { innerWidth: width, innerHeight: height },
    stack: [],
    elementsFromPoint: () => doc.stack
  };
  doc.documentElement = fakePickerElement({ id: 'html', width, height });
  doc.body = fakePickerElement({ id: 'body', width, height, parent: doc.documentElement });
  return doc;
}

function fakePickerElement({ id, width, height, interactive = false, parent = null }) {
  return {
    nodeType: 1,
    id,
    parentElement: parent,
    matches: () => interactive,
    getBoundingClientRect: () => ({ width, height })
  };
}

test('element picker keeps the tapped element instead of a screen-sized wrapper', () => {
  const { preferredPickerTarget } = loadElementPickerTargeting();
  const doc = fakePickerDocument();
  const wrapper = fakePickerElement({ id: 'prt-button-list', width: 360, height: 480, interactive: true, parent: doc.body });
  const leaf = fakePickerElement({ id: 'txt-name', width: 80, height: 24, parent: wrapper });
  assert.equal(preferredPickerTarget(leaf, doc), leaf);
});

test('element picker still promotes an inner label to its own button', () => {
  const { preferredPickerTarget } = loadElementPickerTargeting();
  const doc = fakePickerDocument();
  const button = fakePickerElement({ id: 'btn-usual-ok', width: 120, height: 44, interactive: true, parent: doc.body });
  const label = fakePickerElement({ id: 'label', width: 60, height: 20, parent: button });
  assert.equal(preferredPickerTarget(label, doc), button);
});

test('element picker looks past a full-screen overlay to the button under the tap', () => {
  const { resolvePickerTarget } = loadElementPickerTargeting();
  const doc = fakePickerDocument();
  const mask = fakePickerElement({ id: 'mask', width: 360, height: 640, parent: doc.body });
  const button = fakePickerElement({ id: 'btn-usual-ok', width: 120, height: 44, interactive: true, parent: doc.body });
  doc.stack = [mask, button, doc.body, doc.documentElement];
  const event = { clientX: 100, clientY: 420, target: mask };
  assert.equal(resolvePickerTarget(event, doc), button);
});

test('element picker resolves touch taps by their touch point', () => {
  const { resolvePickerTarget } = loadElementPickerTargeting();
  const doc = fakePickerDocument();
  const mask = fakePickerElement({ id: 'mask', width: 360, height: 640, parent: doc.body });
  const row = fakePickerElement({ id: 'lis-raid', width: 360, height: 80, interactive: true, parent: doc.body });
  doc.stack = [mask, row, doc.body];
  const event = { touches: [{ clientX: 40, clientY: 90 }], target: mask };
  assert.equal(resolvePickerTarget(event, doc), row);
});

test('element picker falls back to the tightest element when everything is oversized', () => {
  const { resolvePickerTarget } = loadElementPickerTargeting();
  const doc = fakePickerDocument();
  const mask = fakePickerElement({ id: 'mask', width: 360, height: 640, parent: doc.body });
  const panel = fakePickerElement({ id: 'panel', width: 360, height: 400, parent: doc.body });
  doc.stack = [mask, panel, doc.body, doc.documentElement];
  const event = { clientX: 300, clientY: 500, target: mask };
  assert.equal(resolvePickerTarget(event, doc), panel);
});

function loadTapGeometryHelpers() {
  const constants = source.slice(
    source.indexOf('const ELEMENT_PICKER_TARGET_SELECTOR'),
    source.indexOf('function cssIdentifier')
  );
  const viability = source.slice(
    source.indexOf('function pickerTapViability'),
    source.indexOf('function configuredTargetStatusText')
  );
  const computedVisible = source.slice(
    source.indexOf('function computedVisible'),
    source.indexOf('function hiddenOrAbsent')
  );
  const probe = source.slice(
    source.indexOf('const TARGET_PROBE_STEPS'),
    source.indexOf('function pointForTarget')
  );
  return new Function(
    'finite',
    `${constants}\n${computedVisible}\n${probe}\n${viability}\nreturn { probeTargetRect, pickerTapViability };`
  )((value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback));
}

// A GranBlue-style button: the div has no width of its own and paints its face
// through ::after, so hit testing resolves to the div well outside its own box.
function fakePaintedButton() {
  const face = { left: 204, right: 324, top: 561, bottom: 603 };
  const rect = (left, top, right, bottom) => ({
    left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top
  });
  const doc = {
    defaultView: {
      innerWidth: 360,
      innerHeight: 640,
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' })
    },
    elementFromPoint: (x, y) =>
      (x >= face.left && x <= face.right && y >= face.top && y <= face.bottom ? doc.button : doc.row)
  };
  doc.row = {
    nodeType: 1,
    isConnected: true,
    ownerDocument: doc,
    parentElement: null,
    contains: node => node === doc.row || node === doc.button,
    getBoundingClientRect: () => rect(0, 560, 360, 604),
    getClientRects: () => [rect(0, 560, 360, 604)]
  };
  doc.button = {
    nodeType: 1,
    isConnected: true,
    ownerDocument: doc,
    parentElement: doc.row,
    style: {},
    contains: node => node === doc.button,
    getBoundingClientRect: () => rect(200, 560, 200, 604),
    getClientRects: () => [rect(200, 560, 200, 604)]
  };
  return doc;
}

test('tap geometry is recovered for buttons that paint outside their own box', () => {
  const { probeTargetRect } = loadTapGeometryHelpers();
  const doc = fakePaintedButton();
  assert.equal(doc.button.getBoundingClientRect().width, 0);
  const probed = probeTargetRect(doc.button);
  assert.ok(probed, 'expected the painted area to be recovered');
  assert.ok(probed.width > 100 && probed.height > 30, `unexpected probe size: ${probed.width}x${probed.height}`);
  assert.ok(probed.left >= 204 && probed.right <= 324, `probe drifted outside the painted face: ${probed.left}-${probed.right}`);
});

test('picker reports a painted button as tappable instead of size zero', () => {
  const { pickerTapViability } = loadTapGeometryHelpers();
  const doc = fakePaintedButton();
  const viability = pickerTapViability(doc.button);
  assert.equal(viability.ok, true);
  assert.match(viability.reason, /推定/);
});

test('picker refuses to promote to a zero-area ancestor', () => {
  assert.ok(source.includes('if (pickerElementArea(current) > 0 && current.matches?.(ELEMENT_PICKER_TARGET_SELECTOR)) return current;'));
});

test('tap target waiting reports why the button never became tappable', () => {
  const runtime = source.slice(
    source.indexOf('function configuredElementState'),
    source.indexOf('function randomUniform')
  );
  assert.ok(runtime.includes("return pending('一致する要素がありません')"));
  assert.ok(runtime.includes("return pending('要素が非表示です')"));
  assert.ok(runtime.includes("return pending('要素が無効化されています')"));
  assert.ok(runtime.includes('if (!probeTargetRect(target)) return pending('));
  assert.ok(runtime.includes('${label}待ちがタイムアウトしました（${diagnostics.reason}）'));
  assert.ok(runtime.includes("if (error?.code === 'TIMEOUT') throw timeoutError()"));
  assert.ok(source.includes('rect = probeTargetRect(target);'));
  assert.ok(source.includes('現在の画面での状態: ${configuredTargetStatusText(block.config)}'));
});

test('assist slot switching completes even when both slots hold no raids', () => {
  const shared = source.slice(source.indexOf('async function runAssistListTransition'), source.indexOf('async function refreshAssistList'));
  assert.ok(shared.includes('let slotActiveSince = null'));
  assert.ok(shared.includes('if (!slotReady || loadingVisible) slotActiveSince = null'));
  assert.ok(shared.includes('performance.now() - slotActiveSince >= ASSIST_SLOT_SETTLE_MS'));
  assert.ok(shared.includes('intervalMs: expectedSlot == null ? null : ASSIST_SLOT_SETTLE_POLL_MS'));
  assert.ok(source.includes('const ASSIST_SLOT_SETTLE_MS = 700'));
});

test('assist evaluation reloads the list and resumes instead of stopping', () => {
  assert.ok(source.includes("const ASSIST_RETRY_ROUTE = '#quest/assist/multi/0'"));
  assert.ok(source.includes('const MAX_ASSIST_RECOVERY_RELOADS = 10'));
  const codes = source.slice(source.indexOf('const ASSIST_RECOVERABLE_CODES'), source.indexOf('const ASSIST_ROW_REBIND_CODES'));
  for (const code of ['TIMEOUT', 'TARGET_OCCLUDED', 'TARGET_UNSTABLE', 'STALE_TARGET']) {
    assert.ok(codes.includes(`'${code}'`));
  }
  const recovery = source.slice(source.indexOf('function isRecoverableAssistError'), source.indexOf('function evaluateWorkflowCondition'));
  assert.ok(recovery.includes('error instanceof FlowRestart || error instanceof FlowStop'));
  assert.ok(recovery.includes("if (error.name === 'AbortError') return false"));
  assert.ok(recovery.includes("if (screen.type === 'BATTLE') return false"));
  assert.ok(recovery.includes('await replaceFrame(gameRouteUrl(ASSIST_RETRY_ROUTE))'));
  const flow = source.slice(source.indexOf('async function assistSelectFullFlow'), source.indexOf('function isRecoverableAssistError'));
  assert.ok(flow.includes('if (!isRecoverableAssistError(error)) throw error'));
  assert.ok(flow.includes('if (consecutiveReloads >= MAX_ASSIST_RECOVERY_RELOADS) throw error'));
  assert.ok(flow.includes('await reloadAssistListForRetry(config, context, error)'));
});

test('occluded assist rows are rebound instead of failing the block', () => {
  assert.ok(source.includes("const ASSIST_ROW_REBIND_CODES = Object.freeze(['STALE_TARGET', 'TARGET_OCCLUDED', 'TARGET_UNSTABLE', 'TARGET_MISSING'])"));
  const tap = source.slice(source.indexOf('async function tapCurrentAssistRow'), source.indexOf('function assistListSignature'));
  assert.ok(tap.includes('if (rebound) await waitAssistListPaintable(signal)'));
  assert.ok(tap.includes('if (!ASSIST_ROW_REBIND_CODES.includes(error?.code)) throw error'));
  const wait = source.slice(source.indexOf('async function waitAssistListPaintable'), source.indexOf('async function tapCurrentAssistRow'));
  assert.ok(wait.includes('if (pageBaseReady(doc)) return true'));
});

test('iframe navigation blocks no longer ask for a destination screen', () => {
  assert.ok(!source.includes("grid.append(field('目的画面', expected))"));
  assert.ok(!source.includes('expectedScreen: block.config.expectedScreen'));
  assert.ok(source.includes("case 'iframeRoute':\n        return { route: '#quest/assist/multi/0', timeoutSec: 30 };"));
  assert.ok(source.includes("if (expected === 'any') return true;"));
  const execute = source.slice(source.indexOf('async function executeWorkflowBlock'), source.indexOf('async function startWorkflow'));
  assert.equal(execute.split("expectedScreen: 'any'").length - 1, 4);
  // 戻り先の目的画面（敵撃破後の復帰）は別設定なので残す
  assert.ok(source.includes("battleEndExpectedScreen: 'assist'"));
});

test('manual runs never surface stale handoff resume failures', () => {
  assert.ok(source.includes('function abandonWorkflowHandoffResume(reason)'));
  assert.ok(source.includes('function workflowHandoffResumeAbandoned()'));
  assert.ok(source.includes('const SOFT_HANDOFF_FAILURE_CODES'));
  const report = source.slice(source.indexOf('function reportWorkflowHandoffFailure'), source.indexOf('function abandonWorkflowHandoffResume'));
  assert.ok(report.includes('SOFT_HANDOFF_FAILURE_CODES.includes(error?.code)'));
  assert.ok(report.includes('保存済みの進行は復元しませんでした'));
  const start = source.slice(source.indexOf('async function startWorkflow'), source.indexOf('function stopWorkflow'));
  assert.ok(start.includes('if (!resumeHandoff) abandonWorkflowHandoffResume('));
  assert.ok(start.includes('reportWorkflowHandoffFailure(error)'));
  assert.ok(!start.includes("setStatus('進行復元に失敗')"));
  const stop = source.slice(source.indexOf('function stopWorkflow'), source.indexOf('const LEGACY_CONDITION_TYPES'));
  assert.ok(stop.includes('abandonWorkflowHandoffResume('));
  const resume = source.slice(source.indexOf('async function resumeClaimedWorkflowHandoff'), source.indexOf('async function runBlockList'));
  assert.equal(resume.split('if (workflowHandoffResumeAbandoned()) return;').length - 1, 3);
});

test('internal aborts are reported instead of masquerading as a user stop', () => {
  const start = source.slice(source.indexOf('async function startWorkflow'), source.indexOf('function stopWorkflow'));
  assert.ok(start.includes("if (error?.name === 'AbortError' && (controller.signal.aborted || state.destroyed))"));
  const show = source.slice(source.indexOf('function showWorkflowError'), source.indexOf('function clearWorkflowError'));
  assert.ok(show.includes("typeof error?.code === 'string' && error.code"));
});
