from pathlib import Path
import re


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label} insertion point mismatch: {count}')
    return source.replace(old, new, 1)


def regex_replace_once(source: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label} insertion point mismatch: {count}')
    return updated


path = Path('a.js')
source = path.read_text(encoding='utf-8')

version = re.search(r'const APP_VERSION = (\d+);', source)
if not version:
    raise SystemExit('APP_VERSION marker not found')
current = int(version.group(1))
if current != 49:
    raise SystemExit(f'unexpected APP_VERSION: {current}')
source = source[:version.start(1)] + '50' + source[version.end(1):]

source = regex_replace_once(
    source,
    r"  function fullAutoState\(doc = frameDocument\(\)\) \{.*?\n  \}\n\n  function battleObservationRoots",
    """  function runtimeFlagEnabled(value) {
    return value === true || value === 1 || value === '1';
  }

  function battleRuntimeState(doc = frameDocument()) {
    let status = null;
    try {
      const win = doc.defaultView || frameWindow();
      status = win.stage?.gGameStatus || null;
    } catch {}
    if (!status) {
      return {
        available: false,
        autoAttack: false,
        autoButtonEnabled: false,
        attacking: false,
        attackButtonPushed: false,
        finished: false
      };
    }
    const attackButtonPushed = runtimeFlagEnabled(status.attackQueue?.attackButtonPushed);
    return {
      available: true,
      autoAttack: runtimeFlagEnabled(status.auto_attack),
      autoButtonEnabled: runtimeFlagEnabled(status.enable_auto_button),
      attacking: Number(status.attacking) > 0,
      attackButtonPushed,
      finished: runtimeFlagEnabled(status.finish)
        || runtimeFlagEnabled(status.battle_end)
        || runtimeFlagEnabled(status.already_finish)
    };
  }

  function fullAutoState(doc = frameDocument()) {
    const button = doc.querySelector(SELECTORS.fullAuto);
    const visible = computedVisible(button);
    const runtime = battleRuntimeState(doc);
    return {
      button,
      exists: Boolean(button),
      visible,
      enabled: runtime.available ? runtime.autoButtonEnabled : visible,
      on: runtime.available ? runtime.autoAttack : Boolean(button?.classList.contains('on')),
      runtime
    };
  }

  function battleObservationRoots""",
    'Granblue runtime-backed full auto state',
)

source = regex_replace_once(
    source,
    r"  function detectBattleEndState\(doc = frameDocument\(\)\) \{.*?\n  \}\n\n  function safeBattleEndState",
    """  function detectBattleEndState(doc = frameDocument()) {
    const url = currentFrameUrl();
    if (url.includes('result_multi/')) return { type: 'RESULT', reason: 'リザルト画面を検出', url };
    const runtime = battleRuntimeState(doc);
    if (runtime.finished) {
      return { type: 'RUNTIME_FINISHED', reason: 'ゲーム内部の戦闘終了状態を検出', runtime };
    }
    const notice = doc.querySelector(SELECTORS.battleEndNotice);
    if (notice && computedVisible(notice)) {
      const text = normalizePopupText(notice.textContent || '');
      if (!text || text.includes(BATTLE_END_MESSAGE)) {
        return { type: 'REMATCH_FAIL', reason: text || BATTLE_END_MESSAGE };
      }
    }
    const resultButton = doc.querySelector(SELECTORS.battleResult);
    if (resultButton && computedVisible(resultButton)) {
      return { type: 'RESULT_BUTTON', reason: 'バトル終了ボタンを検出' };
    }
    return null;
  }

  function safeBattleEndState""",
    'runtime-backed battle end state',
)

source = regex_replace_once(
    source,
    r"  function attackSnapshot\(doc = frameDocument\(\)\) \{.*?\n  \}\n\n  function isAttackInProgress\(snapshot\) \{.*?\n  \}\n\n  function attackTransitionFromBaseline",
    """  function attackSnapshot(doc = frameDocument()) {
    const start = doc.querySelector(SELECTORS.attackStart);
    const dummy = doc.querySelector(SELECTORS.attackDummy);
    const cancel = doc.querySelector(SELECTORS.attackCancel);
    const turn = turnSignature(doc);
    const runtime = battleRuntimeState(doc);
    const domActorAttacking = Boolean(doc.querySelector(SELECTORS.attackActor));
    return {
      start,
      dummy,
      cancel,
      startVisible: elementDisplayOn(start),
      dummyVisible: elementDisplayOn(dummy),
      cancelVisible: elementDisplayOn(cancel),
      runtime,
      runtimeAttacking: runtime.attacking,
      attackButtonPushed: runtime.attackButtonPushed,
      actorAttacking: runtime.attacking || runtime.attackButtonPushed || domActorAttacking,
      turn,
      progress: battleProgressSignature(doc, turn)
    };
  }

  function isAttackInProgress(snapshot) {
    return Boolean(
      snapshot.runtimeAttacking
      || snapshot.attackButtonPushed
      || snapshot.cancelVisible
      || snapshot.dummyVisible
      || snapshot.actorAttacking
    );
  }

  function attackTransitionFromBaseline""",
    'runtime-backed attack state',
)

source = replace_once(
    source,
    """        const observed = fullAutoState(doc);
        if (!observed.exists || !observed.visible) return false;
        if (observed.on) return observed;
""",
    """        const observed = fullAutoState(doc);
        if (observed.on) return observed;
        if (!observed.exists || !observed.visible || !observed.enabled) return false;
""",
    'full auto actionable state gate',
)

source = replace_once(
    source,
    'await refreshAssistList(refreshConfig, context, { waitForCompletion: false });',
    'await refreshAssistList(refreshConfig, context, { waitForCompletion: true });',
    'single-slot assist refresh completion',
)

path.write_text(source, encoding='utf-8')

test_path = Path('tests/autoflow.static.test.mjs')
tests = test_path.read_text(encoding='utf-8')
tests = replace_once(
    tests,
    "assert.ok(source.includes('const APP_VERSION = 49'));",
    "assert.ok(source.includes('const APP_VERSION = 50'));",
    'test APP_VERSION assertion',
)
tests = replace_once(
    tests,
    "assert.ok(source.includes('await refreshAssistList(refreshConfig, context, { waitForCompletion: false })'));",
    "assert.ok(source.includes('await refreshAssistList(refreshConfig, context, { waitForCompletion: true })'));",
    'assist refresh completion assertion',
)

marker = "test('Granblue runtime flags are authoritative for full auto, attacks, and battle end'"
if marker not in tests:
    insertion = """

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
"""
    target = "\ntest('battle ended is available as a workflow condition without HP inference'"
    if target not in tests:
        raise SystemExit('runtime tests insertion marker not found')
    tests = tests.replace(target, insertion + target, 1)

test_path.write_text(tests, encoding='utf-8')
