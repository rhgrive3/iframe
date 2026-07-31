from pathlib import Path
import re

root = Path('.')
a_path = root / 'a.js'
test_path = root / 'tests/autoflow.static.test.mjs'
source = a_path.read_text(encoding='utf-8')
tests = test_path.read_text(encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


def sub_once(text, pattern, replacement, label):
    updated, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=re.MULTILINE | re.DOTALL)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return updated


version_match = re.search(r'  const APP_VERSION = (\d+);', source)
if not version_match:
    raise SystemExit('APP_VERSION not found')
old_version = int(version_match.group(1))
if old_version != 58:
    raise SystemExit(f'unexpected APP_VERSION: {old_version}')
source = source[:version_match.start()] + '  const APP_VERSION = 59;' + source[version_match.end():]

source = replace_once(
    source,
    "    pendingAutoAttack: null,\n    activeBattleStatus: null,\n    expectedBattleRaidId: '',\n    runningCard: null,",
    "    pendingAutoAttack: null,\n    battleEndArmed: false,\n    battleEndArmedAt: 0,\n    activeBattleDocument: null,\n    activeBattleStatus: null,\n    expectedBattleRaidId: '',\n    runningCard: null,",
    'battle lifecycle state'
)

source = replace_once(
    source,
    "        await jqTapStrict(target, { signal, label, fast });\n        state.activeBattleStatus = null;\n        state.expectedBattleRaidId = raidId;\n        return true;",
    "        await jqTapStrict(target, { signal, label, fast });\n        resetBattleEndDetection({ expectedRaidId: raidId });\n        return true;",
    'assist row battle lifecycle reset'
)

new_lifecycle = r'''  function resetBattleEndDetection({ expectedRaidId = '' } = {}) {
    state.battleEndArmed = false;
    state.battleEndArmedAt = 0;
    state.activeBattleDocument = null;
    state.activeBattleStatus = null;
    state.expectedBattleRaidId = String(expectedRaidId || '');
  }

  function battleControlReady(doc, runtime = battleRuntimeState(doc)) {
    if (runtime?.expectedRaidId && !runtime.matchesExpectedBattle) return false;
    if (runtime?.status) {
      if (runtime.finished) return false;
      return Boolean(
        runtime.autoButtonEnabled
        || runtime.autoAttack
        || runtime.attacking
        || runtime.attackButtonPushed
      );
    }
    if (!pageBaseReady(doc) || !doc.querySelector(SELECTORS.battleScreen)) return false;
    return computedVisible(doc.querySelector(SELECTORS.fullAuto))
      || computedVisible(doc.querySelector(SELECTORS.attackStart));
  }

  function armBattleEndDetection(doc = frameDocument(), runtime = battleRuntimeState(doc)) {
    if (!battleControlReady(doc, runtime)) return false;
    const sameSession = state.battleEndArmed
      && state.activeBattleDocument === doc
      && (!state.activeBattleStatus || !runtime.status || state.activeBattleStatus === runtime.status)
      && (!state.expectedBattleRaidId || !runtime.raidId || state.expectedBattleRaidId === runtime.raidId);
    if (!sameSession) {
      state.battleEndArmed = true;
      state.battleEndArmedAt = performance.now();
      state.activeBattleDocument = doc;
    }
    if (runtime.status) state.activeBattleStatus = runtime.status;
    if (!state.expectedBattleRaidId && runtime.raidId) state.expectedBattleRaidId = runtime.raidId;
    return true;
  }

  function battleEndDetectionMatches(runtime) {
    if (!state.battleEndArmed) return false;
    if (state.expectedBattleRaidId && runtime?.raidId && runtime.raidId !== state.expectedBattleRaidId) return false;
    if (state.activeBattleStatus && runtime?.status && runtime.status !== state.activeBattleStatus) return false;
    return true;
  }

  function fullAutoState'''
source = sub_once(
    source,
    r"  function trustLiveBattleRuntime\(runtime\) \{.*?\n  \}\n\n  function fullAutoState",
    new_lifecycle,
    'battle lifecycle helpers'
)

new_detector = r'''  function detectBattleEndState(doc = frameDocument()) {
    const runtime = battleRuntimeState(doc);
    armBattleEndDetection(doc, runtime);
    if (!battleEndDetectionMatches(runtime)) return null;

    const url = currentFrameUrl();
    if (url.includes('result_multi/')) return { type: 'RESULT', reason: 'リザルト画面を検出', url };

    if (
      runtime.finished
      && runtime.status
      && (!state.activeBattleStatus || runtime.status === state.activeBattleStatus)
    ) {
      return { type: 'RUNTIME_FINISHED', reason: '起動確認済みの現戦闘終了状態を検出', runtime };
    }

    if (doc !== state.activeBattleDocument) return null;
    if (performance.now() - state.battleEndArmedAt < DEFAULT_STABLE_MS) return null;

    const notice = doc.querySelector(SELECTORS.battleEndNotice);
    const noticeContainer = notice?.closest?.('#pop, #pop-force');
    const noticeVisible = Boolean(
      notice
      && computedVisible(notice)
      && (!noticeContainer || computedVisible(noticeContainer))
    );
    if (noticeVisible) {
      const text = normalizePopupText(notice.textContent || '');
      const expectedText = normalizePopupText(BATTLE_END_MESSAGE);
      if (text.includes(expectedText)) {
        return { type: 'REMATCH_FAIL', reason: text };
      }
    }

    const resultButton = doc.querySelector(SELECTORS.battleResult);
    const resultContainer = resultButton?.closest?.('.prt-command-end');
    const resultVisible = Boolean(
      resultButton
      && computedVisible(resultButton)
      && (!resultContainer || computedVisible(resultContainer))
    );
    if (resultVisible) {
      return { type: 'RESULT_BUTTON', reason: '起動確認済みの現戦闘で終了ボタンを検出' };
    }
    return null;
  }

  function safeBattleEndState'''
source = sub_once(
    source,
    r"  function detectBattleEndState\(doc = frameDocument\(\)\) \{.*?\n  \}\n\n  function safeBattleEndState",
    new_detector,
    'armed battle end detector'
)

source = replace_once(
    source,
    "  async function restartWorkflowAfterBattleEnd(config, context, endState) {\n    clearPendingAutoAttack('敵撃破を検出しました');\n    state.activeBattleStatus = null;\n    state.expectedBattleRaidId = '';",
    "  async function restartWorkflowAfterBattleEnd(config, context, endState) {\n    clearPendingAutoAttack('敵撃破を検出しました');\n    resetBattleEndDetection();",
    'battle lifecycle cleanup on restart'
)

new_ensure_full_auto = r'''  async function ensureFullAuto(config, context, { allowReloadProbe = true } = {}) {
    const { signal } = context;
    try {
      await waitForFrameReady({ signal, timeoutMs: config.timeoutSec * 1000, expectedScreen: 'battle' });
      const found = await monitorFrame(() => {
        const doc = frameDocument();
        const observed = fullAutoState(doc);
        const attack = attackSnapshot(doc);
        armBattleEndDetection(doc, observed.runtime);

        const battleEnd = detectBattleEndState(doc);
        if (battleEnd) return { battleEnd };

        if (observed.on) return observed;
        if (!observed.exists || !observed.visible || !observed.enabled) return false;

        const attackReady = Boolean(
          attack.start
          && attack.start.classList.contains('display-on')
          && !attack.start.classList.contains('display-off')
          && attack.startVisible
          && !attack.dummyVisible
          && !attack.cancelVisible
          && !attack.actorAttacking
        );
        return attackReady ? observed : false;
      }, {
        signal,
        timeoutMs: config.timeoutSec * 1000,
        stableMs: DEFAULT_STABLE_MS,
        description: 'フルオート操作可能状態待ち',
        observeRoots: battleObservationRoots
      });

      if (found.battleEnd) return restartWorkflowAfterBattleEnd(config, context, found.battleEnd);
      if (found.on) return { changed: false };
      const pending = armPendingAutoAttack(config.timeoutSec * 1000, signal);
      try {
        await jqTapStrict(found.button, { signal, label: 'フルオート' });
      } catch (error) {
        if (state.pendingAutoAttack === pending) clearPendingAutoAttack('フルオート押下に失敗しました');
        throw error;
      }
      return { changed: true };
    } catch (error) {
      if (error instanceof FlowRestart || error?.name === 'AbortError') throw error;
      if (error?.code === 'TIMEOUT' && allowReloadProbe) {
        const visibleEnd = safeBattleEndState();
        if (visibleEnd) return restartWorkflowAfterBattleEnd(config, context, visibleEnd);
        const probe = await reloadForBattleEndProbe(config, context);
        if (probe.endState) return restartWorkflowAfterBattleEnd(config, context, probe.endState);
        if (!probe.reloadError && probe.state?.type === 'BATTLE') {
          return ensureFullAuto(config, context, { allowReloadProbe: false });
        }
      }
      throw error;
    }
  }

  function elementDisplayOn'''
source = sub_once(
    source,
    r"  async function ensureFullAuto\(config, context, \{ allowReloadProbe = true \} = \{\}\) \{.*?\n  \}\n\n  function elementDisplayOn",
    new_ensure_full_auto,
    'full auto startup ordering'
)

source = replace_once(
    source,
    "    try {\n      const initialEnd = safeBattleEndState();\n      if (initialEnd) return restartWorkflowAfterBattleEnd(config, context, initialEnd);\n\n      await waitForFrameReady({ signal, timeoutMs, expectedScreen: 'battle' });\n\n      const pendingAttack = await consumePendingAutoAttack(timeoutMs);",
    "    try {\n      await waitForFrameReady({ signal, timeoutMs, expectedScreen: 'battle' });\n      const startupDoc = frameDocument();\n      const startupRuntime = battleRuntimeState(startupDoc);\n      armBattleEndDetection(startupDoc, startupRuntime);\n      const initialEnd = safeBattleEndState();\n      if (initialEnd) return restartWorkflowAfterBattleEnd(config, context, initialEnd);\n\n      const pendingAttack = await consumePendingAutoAttack(timeoutMs);",
    'auto attack startup ordering'
)

source = replace_once(
    source,
    "    state.running = context;\n    const restoreExpandedDock = enterRuntimeCompactMode();",
    "    state.running = context;\n    resetBattleEndDetection();\n    const restoreExpandedDock = enterRuntimeCompactMode();",
    'workflow start battle lifecycle reset'
)

source = replace_once(
    source,
    "    } finally {\n      clearPendingAutoAttack('ワークフローを終了しました');\n      if (state.running === context) state.running = null;",
    "    } finally {\n      clearPendingAutoAttack('ワークフローを終了しました');\n      resetBattleEndDetection();\n      if (state.running === context) state.running = null;",
    'workflow end battle lifecycle cleanup'
)

tests = replace_once(
    tests,
    "assert.ok(source.includes('const APP_VERSION = 58'));",
    "assert.ok(source.includes('const APP_VERSION = 59'));",
    'version assertion'
)

tests = replace_once(
    tests,
    "  const end = source.slice(source.indexOf('function detectBattleEndState'), source.indexOf('function safeBattleEndState'));\n  assert.ok(end.includes('const runtime = trustLiveBattleRuntime(battleRuntimeState(doc))'));\n  assert.ok(end.includes('runtime.status === state.activeBattleStatus'));",
    "  const end = source.slice(source.indexOf('function detectBattleEndState'), source.indexOf('function safeBattleEndState'));\n  assert.ok(end.includes('armBattleEndDetection(doc, runtime)'));\n  assert.ok(end.includes('battleEndDetectionMatches(runtime)'));\n  assert.ok(end.includes('runtime.status === state.activeBattleStatus'));",
    'runtime end assertions'
)

old_regression_pattern = r"\ntest\('full-auto startup rejects stale finished state from the previous rescue battle', \(\) => \{.*?\n\}\);\n?"
tests, removed = re.subn(old_regression_pattern, '\n', tests, count=1, flags=re.MULTILINE | re.DOTALL)
if removed != 1:
    raise SystemExit(f'old stale runtime regression: expected exactly one match, found {removed}')

new_regressions = r'''

test('full-auto startup cannot return to assist before the current battle is armed', () => {
  const ensure = source.slice(
    source.indexOf('async function ensureFullAuto'),
    source.indexOf('function elementDisplayOn')
  );
  const readyIndex = ensure.indexOf("await waitForFrameReady({ signal, timeoutMs: config.timeoutSec * 1000, expectedScreen: 'battle' })");
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
  assert.ok(gateIndex < detector.indexOf("url.includes('result_multi/')"));
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
'''
tests = tests.rstrip() + new_regressions + '\n'

a_path.write_text(source, encoding='utf-8')
test_path.write_text(tests, encoding='utf-8')
print('APP_VERSION 58 -> 59')
