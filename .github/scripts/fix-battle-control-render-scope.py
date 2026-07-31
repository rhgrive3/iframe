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
    """        state = { activeUnit: context?.TEXTURE0 ?? 0, texturesByUnit: new Map() };
""",
    """        state = { activeUnit: context?.TEXTURE0 ?? 0, texturesByUnit: new Map(), lastBoundTexture: null };
""",
    'webgl state shape',
)

source = replace_once(
    source,
    """    function hasProtectedBattleTexture(context) {
      const state = webglBindings.get(context);
      if (!state) return false;
      for (const texture of state.texturesByUnit.values()) {
        if (texture && protectedBattleTextures.has(texture)) return true;
      }
      return false;
    }
""",
    """    function hasProtectedBattleTexture(context) {
      const state = webglBindings.get(context);
      return Boolean(state?.lastBoundTexture && protectedBattleTextures.has(state.lastBoundTexture));
    }
""",
    'protected texture draw scope',
)

source = replace_once(
    source,
    """      wrap('bindTexture', function (original, args) {
        const result = original.apply(this, args);
        if (args[0] === this.TEXTURE_2D) webglState(this).texturesByUnit.set(webglState(this).activeUnit, args[1] || null);
        return result;
      });
""",
    """      wrap('bindTexture', function (original, args) {
        const result = original.apply(this, args);
        if (args[0] === this.TEXTURE_2D) {
          const state = webglState(this);
          const texture = args[1] || null;
          state.texturesByUnit.set(state.activeUnit, texture);
          state.lastBoundTexture = texture;
        }
        return result;
      });
""",
    'last bound texture tracking',
)

source = replace_once(
    source,
    """      wrap('deleteTexture', function (original, args) {
        const texture = args[0];
        if (texture) protectedBattleTextures.delete(texture);
        const state = webglState(this);
        for (const [unit, bound] of state.texturesByUnit) {
          if (bound === texture) state.texturesByUnit.delete(unit);
        }
        return original.apply(this, args);
      });
""",
    """      wrap('deleteTexture', function (original, args) {
        const texture = args[0];
        if (texture) protectedBattleTextures.delete(texture);
        const state = webglState(this);
        if (state.lastBoundTexture === texture) state.lastBoundTexture = null;
        for (const [unit, bound] of state.texturesByUnit) {
          if (bound === texture) state.texturesByUnit.delete(unit);
        }
        return original.apply(this, args);
      });
""",
    'deleted texture state cleanup',
)

path.write_text(source, encoding='utf-8')

test_path = Path('tests/autoflow.static.test.mjs')
tests = test_path.read_text(encoding='utf-8')
version_assertion = f"assert.ok(source.includes('const APP_VERSION = {current}'));"
if version_assertion in tests:
    tests = tests.replace(version_assertion, f"assert.ok(source.includes('const APP_VERSION = {next_version}'));", 1)

marker = "test('battle performance does not leak enemy rendering through stale button textures'"
if marker not in tests:
    tests += '''


test('battle performance does not leak enemy rendering through stale button textures', () => {
  const child = source.slice(source.indexOf('function installBattlePerformanceChildRuntime'), source.indexOf('const APP_VERSION'));
  const protectedCheck = child.slice(child.indexOf('function hasProtectedBattleTexture'), child.indexOf('function patchWebGLTracking'));
  assert.ok(child.includes('lastBoundTexture: null'));
  assert.ok(child.includes('state.lastBoundTexture = texture;'));
  assert.ok(protectedCheck.includes('protectedBattleTextures.has(state.lastBoundTexture)'));
  assert.ok(!protectedCheck.includes('texturesByUnit.values()'));
  assert.ok(child.includes('if (state.lastBoundTexture === texture) state.lastBoundTexture = null;'));
});
'''

test_path.write_text(tests, encoding='utf-8')
