from pathlib import Path
import re


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label} insertion point mismatch: {count}')
    return source.replace(old, new, 1)


path = Path('a.js')
source = path.read_text(encoding='utf-8')

version = re.search(r'const APP_VERSION = (\d+);', source)
if not version:
    raise SystemExit('APP_VERSION marker not found')
current = int(version.group(1))
next_version = current + 1
source = source[:version.start(1)] + str(next_version) + source[version.end(1):]

source = replace_once(
    source,
    """    function setEnabled(next) {
      enabled = Boolean(next);
      ensureStyle();
      if (enabled) patchNow();
      else restoreSoundRuntime();
    }
""",
    """    function stopPoll() {
      if (pollTimer == null) return;
      window.clearInterval(pollTimer);
      pollTimer = null;
    }

    function startPoll() {
      if (pollTimer != null) return;
      pollTimer = window.setInterval(() => {
        try { patchNow(); } catch {}
      }, 100);
    }

    function setEnabled(next) {
      enabled = Boolean(next);
      ensureStyle();
      if (enabled) {
        patchNow();
        startPoll();
      } else {
        stopPoll();
        restoreSoundRuntime();
      }
    }
""",
    'enabled polling lifecycle',
)

source = replace_once(
    source,
    """    patchImageSources();
    patchRendering();
    ensureStyle();
    if (enabled) patchNow();
    pollTimer = window.setInterval(() => {
      try {
        if (enabled) patchNow();
        else ensureStyle();
      } catch {}
    }, 100);
    window.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
    window.addEventListener('pagehide', () => window.clearInterval(pollTimer), { once: true });
""",
    """    patchImageSources();
    patchRendering();
    ensureStyle();
    if (enabled) {
      patchNow();
      startPoll();
    }
    window.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
    window.addEventListener('pagehide', stopPoll, { once: true });
""",
    'startup polling lifecycle',
)

source = replace_once(
    source,
    """  function setBattlePerformanceEnabled(next, { notify = true } = {}) {
    state.battlePerformanceEnabled = Boolean(next);
    ui.battlePerformanceToggle.checked = state.battlePerformanceEnabled;
    try {
      localStorage.setItem(BATTLE_PERFORMANCE_STORAGE_KEY, JSON.stringify({
        version: 1,
        enabled: state.battlePerformanceEnabled,
        updatedAt: Date.now()
      }));
    } catch (error) {
      appendLog(`バトル軽量化設定の保存失敗: ${error.message}`, 'error');
      if (notify) toast('バトル軽量化設定を保存できませんでした');
      return false;
    }
""",
    """  function setBattlePerformanceEnabled(next, { notify = true } = {}) {
    const previous = state.battlePerformanceEnabled;
    state.battlePerformanceEnabled = Boolean(next);
    ui.battlePerformanceToggle.checked = state.battlePerformanceEnabled;
    try {
      localStorage.setItem(BATTLE_PERFORMANCE_STORAGE_KEY, JSON.stringify({
        version: 1,
        enabled: state.battlePerformanceEnabled,
        updatedAt: Date.now()
      }));
    } catch (error) {
      state.battlePerformanceEnabled = previous;
      ui.battlePerformanceToggle.checked = previous;
      appendLog(`バトル軽量化設定の保存失敗: ${error.message}`, 'error');
      if (notify) toast('バトル軽量化設定を保存できませんでした');
      return false;
    }
""",
    'settings persistence rollback',
)

path.write_text(source, encoding='utf-8')

test_path = Path('tests/autoflow.static.test.mjs')
tests = test_path.read_text(encoding='utf-8')
version_assertion = f"assert.ok(source.includes('const APP_VERSION = {current}'));"
if version_assertion in tests:
    tests = tests.replace(version_assertion, f"assert.ok(source.includes('const APP_VERSION = {next_version}'));", 1)

marker = "test('battle performance polling only runs while the persistent setting is enabled'"
if marker not in tests:
    tests += '''

test('battle performance polling only runs while the persistent setting is enabled', () => {
  const child = source.slice(source.indexOf('function installBattlePerformanceChildRuntime'), source.indexOf('const APP_VERSION'));
  assert.ok(child.includes('function startPoll()'));
  assert.ok(child.includes('function stopPoll()'));
  assert.ok(child.includes('if (pollTimer != null) return;'));
  assert.ok(child.includes('window.addEventListener(\'pagehide\', stopPoll, { once: true })'));
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
'''

test_path.write_text(tests, encoding='utf-8')
