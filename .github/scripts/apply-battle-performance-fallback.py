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

old = '''  function syncBattlePerformanceFrame() {
    try {
      iframe.contentWindow?.postMessage({
        type: BATTLE_PERFORMANCE_MESSAGE_TYPE,
        enabled: state.battlePerformanceEnabled
      }, location.origin);
    } catch {}
  }
'''
new = '''  function bootstrapBattlePerformanceFrameRuntime(win) {
    if (!win || win === window) return null;
    try {
      if (new URL(win.location.href).origin !== location.origin) return null;
      let runtime = win[BATTLE_PERFORMANCE_RUNTIME_KEY];
      if (!runtime?.setEnabled) {
        const bootstrap = win.Function(
          'BATTLE_PERFORMANCE_STORAGE_KEY',
          'BATTLE_PERFORMANCE_MESSAGE_TYPE',
          'BATTLE_PERFORMANCE_RUNTIME_KEY',
          'BATTLE_PERFORMANCE_STYLE_ID',
          'BATTLE_PERFORMANCE_TRANSPARENT_IMAGE',
          `
            const readBattlePerformanceSetting = ${readBattlePerformanceSetting.toString()};
            const installBattlePerformanceChildRuntime = ${installBattlePerformanceChildRuntime.toString()};
            installBattlePerformanceChildRuntime();
          `
        );
        bootstrap(
          BATTLE_PERFORMANCE_STORAGE_KEY,
          BATTLE_PERFORMANCE_MESSAGE_TYPE,
          BATTLE_PERFORMANCE_RUNTIME_KEY,
          BATTLE_PERFORMANCE_STYLE_ID,
          BATTLE_PERFORMANCE_TRANSPARENT_IMAGE
        );
        runtime = win[BATTLE_PERFORMANCE_RUNTIME_KEY];
      }
      runtime?.setEnabled(state.battlePerformanceEnabled);
      return runtime || null;
    } catch {
      return null;
    }
  }

  function syncBattlePerformanceFrame() {
    try {
      const win = iframe.contentWindow;
      bootstrapBattlePerformanceFrameRuntime(win);
      win?.postMessage({
        type: BATTLE_PERFORMANCE_MESSAGE_TYPE,
        enabled: state.battlePerformanceEnabled
      }, location.origin);
    } catch {}
  }
'''
source = replace_once(source, old, new, 'iframe bootstrap fallback')
path.write_text(source, encoding='utf-8')

test_path = Path('tests/autoflow.static.test.mjs')
tests = test_path.read_text(encoding='utf-8')
version_assertion = f"assert.ok(source.includes('const APP_VERSION = {current}'));"
if version_assertion in tests:
    tests = tests.replace(version_assertion, f"assert.ok(source.includes('const APP_VERSION = {next_version}'));", 1)

marker = "test('battle performance mode bootstraps into a same-origin iframe when only the controller was injected'"
if marker not in tests:
    tests += '''

test('battle performance mode bootstraps into a same-origin iframe when only the controller was injected', () => {
  assert.ok(source.includes('function bootstrapBattlePerformanceFrameRuntime(win)'));
  assert.ok(source.includes('const bootstrap = win.Function('));
  assert.ok(source.includes('readBattlePerformanceSetting.toString()'));
  assert.ok(source.includes('installBattlePerformanceChildRuntime.toString()'));
  const sync = source.slice(source.indexOf('function syncBattlePerformanceFrame'), source.indexOf('function setBattlePerformanceEnabled'));
  assert.ok(sync.includes('bootstrapBattlePerformanceFrameRuntime(win);'));
  assert.ok(sync.indexOf('bootstrapBattlePerformanceFrameRuntime(win);') < sync.indexOf('postMessage'));
});
'''

test_path.write_text(tests, encoding='utf-8')
