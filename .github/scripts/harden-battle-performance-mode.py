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
    """      Object.defineProperty(wrapped, RENDER_MARKER, { value: true });
      prototype[name] = wrapped;
""",
    """      try { Object.defineProperty(wrapped, RENDER_MARKER, { value: true }); } catch {}
      try { prototype[name] = wrapped; } catch {}
""",
    'render method assignment',
)

source = replace_once(
    source,
    """    function patchImageSources() {
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLImageElement?.prototype || {}, 'src');
      if (descriptor?.get && descriptor?.set && descriptor.configurable) {
        Object.defineProperty(window.HTMLImageElement.prototype, 'src', {
          ...descriptor,
          set(value) { return descriptor.set.call(this, rewriteAsset(value)); }
        });
      }
      const originalSetAttribute = window.Element?.prototype?.setAttribute;
      if (typeof originalSetAttribute === 'function') {
        window.Element.prototype.setAttribute = function (name, value) {
          const isImageSource = this instanceof window.HTMLImageElement && String(name).toLowerCase() === 'src';
          return originalSetAttribute.call(this, name, isImageSource ? rewriteAsset(value) : value);
        };
      }
    }

    function patchNow() {
      ensureStyle();
      patchLoadQueue();
      patchRendering();
      patchSoundRuntime();
    }
""",
    """    function patchImageSources() {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(window.HTMLImageElement?.prototype || {}, 'src');
        if (descriptor?.get && descriptor?.set && descriptor.configurable) {
          Object.defineProperty(window.HTMLImageElement.prototype, 'src', {
            ...descriptor,
            set(value) { return descriptor.set.call(this, rewriteAsset(value)); }
          });
        }
      } catch {}
      try {
        const originalSetAttribute = window.Element?.prototype?.setAttribute;
        if (typeof originalSetAttribute === 'function') {
          window.Element.prototype.setAttribute = function (name, value) {
            const isImageSource = this instanceof window.HTMLImageElement && String(name).toLowerCase() === 'src';
            return originalSetAttribute.call(this, name, isImageSource ? rewriteAsset(value) : value);
          };
        }
      } catch {}
    }

    function patchNow() {
      ensureStyle();
      try { patchLoadQueue(); } catch {}
      try { patchRendering(); } catch {}
      if (isBattleRuntime()) {
        try { patchSoundRuntime(); } catch {}
      } else {
        restoreSoundRuntime();
      }
    }
""",
    'isolated hooks and route-scoped sound restoration',
)

source = replace_once(
    source,
    """    pollTimer = window.setInterval(() => {
      if (enabled) patchNow();
      else ensureStyle();
    }, 100);
""",
    """    pollTimer = window.setInterval(() => {
      try {
        if (enabled) patchNow();
        else ensureStyle();
      } catch {}
    }, 100);
""",
    'poll error isolation',
)

path.write_text(source, encoding='utf-8')

test_path = Path('tests/autoflow.static.test.mjs')
tests = test_path.read_text(encoding='utf-8')
version_assertion = f"assert.ok(source.includes('const APP_VERSION = {current}'));"
if version_assertion in tests:
    tests = tests.replace(version_assertion, f"assert.ok(source.includes('const APP_VERSION = {next_version}'));", 1)

marker = "test('battle performance hooks are isolated and restore audio outside battle routes'"
if marker not in tests:
    tests += '''

test('battle performance hooks are isolated and restore audio outside battle routes', () => {
  const child = source.slice(source.indexOf('function installBattlePerformanceChildRuntime'), source.indexOf('const APP_VERSION'));
  const patchNow = child.slice(child.indexOf('function patchNow'), child.indexOf('function setEnabled'));
  assert.ok(patchNow.includes('try { patchLoadQueue(); } catch {}'));
  assert.ok(patchNow.includes('try { patchRendering(); } catch {}'));
  assert.ok(patchNow.includes('if (isBattleRuntime())'));
  assert.ok(patchNow.includes('else {\n        restoreSoundRuntime();'));
  assert.ok(child.includes('try { prototype[name] = wrapped; } catch {}'));
  assert.ok(child.includes('pollTimer = window.setInterval'));
  assert.ok(child.includes('if (enabled) patchNow();'));
});
'''

test_path.write_text(tests, encoding='utf-8')
