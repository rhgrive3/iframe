from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
path = root / 'a.js'
source = path.read_text(encoding='utf-8')

source, count = re.subn(
    r"  const APP_VERSION = (\d+);",
    lambda m: f"  const APP_VERSION = {int(m.group(1)) + 1};",
    source,
    count=1,
)
if count != 1:
    raise SystemExit('APP_VERSION not found')

state_anchor = "    activeRecordPointers: new Map(),\n    dockX: null,"
if 'lastFullAutoEnabledAt:' not in source:
    if source.count(state_anchor) != 1:
        raise SystemExit('state anchor mismatch')
    source = source.replace(
        state_anchor,
        "    activeRecordPointers: new Map(),\n    lastFullAutoEnabledAt: 0,\n    dockX: null,",
        1,
    )

tap_anchor = "    await jqTapStrict(found.button, { signal, label: 'フルオート' });\n    return { changed: true };"
if 'state.lastFullAutoEnabledAt = performance.now();' not in source:
    if source.count(tap_anchor) != 1:
        raise SystemExit('full-auto tap anchor mismatch')
    source = source.replace(
        tap_anchor,
        "    await jqTapStrict(found.button, { signal, label: 'フルオート' });\n    state.lastFullAutoEnabledAt = performance.now();\n    return { changed: true };",
        1,
    )

replacement = '''  async function waitForAutoAttack(config, context) {
    const { signal } = context;
    const timeoutMs = config.timeoutSec * 1000;
    await waitForFrameReady({ signal, timeoutMs, expectedScreen: 'battle' });

    const consumeRecentFullAutoEnable = () => {
      const enabledAt = finite(state.lastFullAutoEnabledAt, 0);
      if (enabledAt <= 0 || performance.now() - enabledAt > timeoutMs) return null;
      state.lastFullAutoEnabledAt = 0;
      return { triggeredByFullAutoToggle: true, enabledAt };
    };

    const recentEnable = consumeRecentFullAutoEnable();
    if (recentEnable) return recentEnable;

    const initial = attackSnapshot();
    if (isAttackInProgress(initial)) return { alreadyAttacking: true, snapshot: initial };

    const auto = fullAutoState();
    if (!auto.on) {
      await ensureFullAuto(config, context);
      const enabledByThisBlock = consumeRecentFullAutoEnable();
      if (enabledByThisBlock) return enabledByThisBlock;
    }

    const armed = await monitorFrame(() => {
      const snapshot = attackSnapshot();
      if (isAttackInProgress(snapshot)) return { snapshot, alreadyAttacking: true };
      const attackReady = snapshot.startVisible && !snapshot.cancelVisible && !snapshot.dummyVisible;
      return attackReady ? { snapshot, alreadyAttacking: false } : false;
    }, { signal, timeoutMs, stableMs: 0, description: 'フルオート攻撃受付待ち' });
    if (armed.alreadyAttacking) return armed;

    const baseline = armed.snapshot;
    return monitorFrame(() => {
      const current = attackSnapshot();
      const startReplaced = Boolean(baseline.start && current.start && baseline.start !== current.start);
      const startBecameHidden = baseline.startVisible && !current.startVisible;
      const turnChanged = Boolean(baseline.turn && current.turn && baseline.turn !== current.turn);
      const started = isAttackInProgress(current) || startReplaced || startBecameHidden || turnChanged;
      return started ? { current, startReplaced, startBecameHidden, turnChanged } : false;
    }, { signal, timeoutMs, stableMs: 0, description: 'フルオート攻撃開始待ち' });
  }
'''
source, count = re.subn(
    r"  async function waitForAutoAttack\(config, context\) \{.*?\n  \}\n\n  async function recoverKnownPopup",
    replacement + "\n  async function recoverKnownPopup",
    source,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit('waitForAutoAttack replacement mismatch')

path.write_text(source, encoding='utf-8')

test_path = root / 'test/touch-event-regression.test.mjs'
test_source = test_path.read_text(encoding='utf-8')
test_name = "full-auto activation is latched across workflow blocks"
if test_name not in test_source:
    test_source += r'''

test('full-auto activation is latched across workflow blocks', () => {
  assert.match(source, /lastFullAutoEnabledAt: 0/);
  assert.match(source, /state\.lastFullAutoEnabledAt = performance\.now\(\)/);
  const start = source.indexOf('async function waitForAutoAttack');
  const end = source.indexOf('async function recoverKnownPopup', start);
  const body = source.slice(start, end);
  assert.match(body, /consumeRecentFullAutoEnable/);
  assert.match(body, /triggeredByFullAutoToggle: true/);
});
'''
    test_path.write_text(test_source, encoding='utf-8')

standard_workflow = '''name: Validate Auto Flow

on:
  pull_request:
    paths:
      - a.js
      - test/**
      - tests/**
      - .github/workflows/validate-autoflow.yml
  push:
    branches: [main]
    paths:
      - a.js
      - test/**
      - tests/**
      - .github/workflows/validate-autoflow.yml

permissions:
  contents: read

concurrency:
  group: autoflow-validation-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: JavaScript syntax
        run: node --check a.js
      - name: Regression checks
        run: node --test tests/autoflow.static.test.mjs test/touch-event-regression.test.mjs
'''
(root / '.github/workflows/validate-autoflow.yml').write_text(standard_workflow, encoding='utf-8')
for temporary in [
    root / '.github/workflows/one-shot-auto-attack-latch.yml',
    root / '.auto-attack-latch-pr-trigger',
    Path(__file__),
]:
    temporary.unlink(missing_ok=True)
