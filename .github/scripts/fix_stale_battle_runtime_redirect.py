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


version_match = re.search(r'  const APP_VERSION = (\d+);', source)
if not version_match:
    raise SystemExit('APP_VERSION not found')
old_version = int(version_match.group(1))
if old_version != 57:
    raise SystemExit(f'unexpected APP_VERSION: {old_version}')
source = source[:version_match.start()] + '  const APP_VERSION = 58;' + source[version_match.end():]

source = replace_once(
    source,
    "    pendingAutoAttack: null,\n    runningCard: null,",
    "    pendingAutoAttack: null,\n    activeBattleStatus: null,\n    expectedBattleRaidId: '',\n    runningCard: null,",
    'battle runtime guard state'
)

source = replace_once(
    source,
    "        await jqTapStrict(target, { signal, label, fast });\n        return true;",
    "        await jqTapStrict(target, { signal, label, fast });\n        state.activeBattleStatus = null;\n        state.expectedBattleRaidId = raidId;\n        return true;",
    'assist row battle identity handoff'
)

old_runtime = """  function battleRuntimeState(doc = frameDocument()) {
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
"""
new_runtime = """  function battleRuntimeState(doc = frameDocument()) {
    let stage = null;
    let status = null;
    try {
      const win = doc.defaultView || frameWindow();
      stage = win.stage || null;
      status = stage?.gGameStatus || null;
    } catch {}
    const raidId = String(stage?.pJsnData?.raid_id || '');
    const expectedRaidId = String(state.expectedBattleRaidId || '');
    const matchesExpectedBattle = !expectedRaidId || (Boolean(raidId) && raidId === expectedRaidId);
    if (!status || !matchesExpectedBattle) {
      return {
        available: false,
        status,
        raidId,
        expectedRaidId,
        matchesExpectedBattle,
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
      status,
      raidId,
      expectedRaidId,
      matchesExpectedBattle: true,
      autoAttack: runtimeFlagEnabled(status.auto_attack),
      autoButtonEnabled: runtimeFlagEnabled(status.enable_auto_button),
      attacking: Number(status.attacking) > 0,
      attackButtonPushed,
      finished: runtimeFlagEnabled(status.finish)
        || runtimeFlagEnabled(status.battle_end)
        || runtimeFlagEnabled(status.already_finish)
    };
  }

  function trustLiveBattleRuntime(runtime) {
    if (!runtime?.available || runtime.finished) return runtime;
    const live = runtime.autoButtonEnabled
      || runtime.autoAttack
      || runtime.attacking
      || runtime.attackButtonPushed;
    if (live && runtime.status) state.activeBattleStatus = runtime.status;
    return runtime;
  }
"""
source = replace_once(source, old_runtime, new_runtime, 'battle runtime state')

source = replace_once(
    source,
    "    const runtime = battleRuntimeState(doc);\n    if (runtime.finished) {\n      return { type: 'RUNTIME_FINISHED', reason: 'ゲーム内部の戦闘終了状態を検出', runtime };\n    }",
    "    const runtime = trustLiveBattleRuntime(battleRuntimeState(doc));\n    if (runtime.finished && runtime.status && runtime.status === state.activeBattleStatus) {\n      return { type: 'RUNTIME_FINISHED', reason: '現戦闘で確認済みのゲーム内部終了状態を検出', runtime };\n    }",
    'trusted battle end detection'
)

source = replace_once(
    source,
    "  async function restartWorkflowAfterBattleEnd(config, context, endState) {\n    clearPendingAutoAttack('敵撃破を検出しました');",
    "  async function restartWorkflowAfterBattleEnd(config, context, endState) {\n    clearPendingAutoAttack('敵撃破を検出しました');\n    state.activeBattleStatus = null;\n    state.expectedBattleRaidId = '';",
    'battle guard cleanup'
)

tests = replace_once(
    tests,
    "assert.ok(source.includes('const APP_VERSION = 57'));",
    "assert.ok(source.includes('const APP_VERSION = 58'));",
    'version assertion'
)

new_test = r'''

test('full-auto startup rejects stale finished state from the previous rescue battle', () => {
  const runtime = source.slice(
    source.indexOf('function runtimeFlagEnabled'),
    source.indexOf('function visibleMyPageButton')
  );
  const assistTap = source.slice(
    source.indexOf('async function tapCurrentAssistRow'),
    source.indexOf('function assistListSignature')
  );
  const restart = source.slice(
    source.indexOf('async function restartWorkflowAfterBattleEnd'),
    source.indexOf('async function ensureFullAuto')
  );
  assert.ok(source.includes('activeBattleStatus: null'));
  assert.ok(source.includes("expectedBattleRaidId: ''"));
  assert.ok(assistTap.includes('state.activeBattleStatus = null'));
  assert.ok(assistTap.includes('state.expectedBattleRaidId = raidId'));
  assert.ok(runtime.includes('stage?.pJsnData?.raid_id'));
  assert.ok(runtime.includes('raidId === expectedRaidId'));
  assert.ok(runtime.includes('function trustLiveBattleRuntime'));
  assert.ok(runtime.includes('runtime.status === state.activeBattleStatus'));
  assert.ok(!runtime.includes("if (runtime.finished) {\n      return { type: 'RUNTIME_FINISHED'"));
  assert.ok(restart.includes('state.activeBattleStatus = null'));
  assert.ok(restart.includes("state.expectedBattleRaidId = ''"));
});
'''
if "test('full-auto startup rejects stale finished state from the previous rescue battle'" in tests:
    raise SystemExit('regression test already exists')
tests = tests.rstrip() + new_test + '\n'

a_path.write_text(source, encoding='utf-8')
test_path.write_text(tests, encoding='utf-8')
print('APP_VERSION 57 -> 58')
