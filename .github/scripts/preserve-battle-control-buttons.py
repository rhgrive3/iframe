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
    """    const LOAD_QUEUE_MARKER = '__autoFlowBattlePerformanceLoadQueue__';
    const RENDER_MARKER = '__autoFlowBattlePerformanceRender__';

    const isBattleLocation = () => /(?:#|\\/)raid(?:[_/]|$)/i.test(`${location.pathname}${location.hash}`);
    const isBattleRuntime = () => isBattleLocation() || Boolean(document.querySelector('.cnt-raid-stage'));
    const shouldReplaceAsset = value => {
      if (!enabled || !isBattleRuntime()) return false;
      const url = String(value ?? '');
      return /\\/sp\\/cjs\\/[^?#]+\\.(?:png|jpe?g|webp)(?:[?#]|$)/i.test(url)
""",
    """    const LOAD_QUEUE_MARKER = '__autoFlowBattlePerformanceLoadQueue__';
    const RENDER_MARKER = '__autoFlowBattlePerformanceRender__';
    const WEBGL_TRACK_MARKER = '__autoFlowBattlePerformanceWebGLTrack__';
    const BATTLE_CONTROL_ASSET_PATTERN = /\\/sp\\/cjs\\/raid_parts_(?:attack|auto|full_auto|auto_guard|full_auto_guard)\\.(?:png|jpe?g|webp)(?:[?#]|$)/i;
    const protectedBattleTextures = new WeakSet();
    const webglBindings = new WeakMap();

    const isBattleLocation = () => /(?:#|\\/)raid(?:[_/]|$)/i.test(`${location.pathname}${location.hash}`);
    const isBattleRuntime = () => isBattleLocation() || Boolean(document.querySelector('.cnt-raid-stage'));
    const assetSource = value => String(value?.currentSrc || value?.src || value || '');
    const isBattleControlAsset = value => BATTLE_CONTROL_ASSET_PATTERN.test(assetSource(value));
    const shouldReplaceAsset = value => {
      if (!enabled || !isBattleRuntime()) return false;
      const url = String(value ?? '');
      if (isBattleControlAsset(url)) return false;
      return /\\/sp\\/cjs\\/[^?#]+\\.(?:png|jpe?g|webp)(?:[?#]|$)/i.test(url)
""",
    'battle control asset allowlist',
)

source = replace_once(
    source,
    """          .cnt-raid-stage canvas#canvas { visibility:hidden!important; }
          .cnt-raid-stage .prt-cutin,
""",
    """          .cnt-raid-stage canvas#canvas { visibility:visible!important; }
          .cnt-raid-stage .btn-auto,
          .cnt-raid-stage #cnt-raid-information .btn-attack-start {
            visibility:visible!important;
            opacity:1!important;
          }
          .cnt-raid-stage .prt-cutin,
""",
    'battle control visibility',
)

source = replace_once(
    source,
    """    function patchRenderMethod(prototype, name) {
      const original = prototype?.[name];
      if (typeof original !== 'function' || original[RENDER_MARKER]) return;
      const wrapped = function (...args) {
        if (battleCanvas(this?.canvas)) return undefined;
        return original.apply(this, args);
      };
      try { Object.defineProperty(wrapped, RENDER_MARKER, { value: true }); } catch {}
      try { prototype[name] = wrapped; } catch {}
    }

    function patchRendering() {
      for (const constructor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
        patchRenderMethod(constructor?.prototype, 'drawArrays');
        patchRenderMethod(constructor?.prototype, 'drawElements');
        patchRenderMethod(constructor?.prototype, 'drawArraysInstanced');
        patchRenderMethod(constructor?.prototype, 'drawElementsInstanced');
      }
      patchRenderMethod(window.CanvasRenderingContext2D?.prototype, 'drawImage');
    }
""",
    """    function webglState(context) {
      let state = webglBindings.get(context);
      if (!state) {
        state = { activeUnit: context?.TEXTURE0 ?? 0, texturesByUnit: new Map() };
        webglBindings.set(context, state);
      }
      return state;
    }

    function hasProtectedBattleTexture(context) {
      const state = webglBindings.get(context);
      if (!state) return false;
      for (const texture of state.texturesByUnit.values()) {
        if (texture && protectedBattleTextures.has(texture)) return true;
      }
      return false;
    }

    function patchWebGLTracking(prototype) {
      if (!prototype || prototype[WEBGL_TRACK_MARKER]) return;
      try { Object.defineProperty(prototype, WEBGL_TRACK_MARKER, { value: true, configurable: true }); } catch {}
      const wrap = (name, handler) => {
        const original = prototype[name];
        if (typeof original !== 'function' || original[WEBGL_TRACK_MARKER]) return;
        const wrapped = function (...args) {
          return handler.call(this, original, args);
        };
        try { Object.defineProperty(wrapped, WEBGL_TRACK_MARKER, { value: true }); } catch {}
        try { prototype[name] = wrapped; } catch {}
      };
      wrap('activeTexture', function (original, args) {
        webglState(this).activeUnit = args[0];
        return original.apply(this, args);
      });
      wrap('bindTexture', function (original, args) {
        const result = original.apply(this, args);
        if (args[0] === this.TEXTURE_2D) webglState(this).texturesByUnit.set(webglState(this).activeUnit, args[1] || null);
        return result;
      });
      for (const name of ['texImage2D', 'texSubImage2D']) {
        wrap(name, function (original, args) {
          const result = original.apply(this, args);
          const sourceObject = args.find(value => value && typeof value === 'object' && ('src' in value || 'currentSrc' in value));
          const state = webglState(this);
          const texture = state.texturesByUnit.get(state.activeUnit);
          if (texture && sourceObject) {
            if (isBattleControlAsset(sourceObject)) protectedBattleTextures.add(texture);
            else protectedBattleTextures.delete(texture);
          }
          return result;
        });
      }
      wrap('deleteTexture', function (original, args) {
        const texture = args[0];
        if (texture) protectedBattleTextures.delete(texture);
        const state = webglState(this);
        for (const [unit, bound] of state.texturesByUnit) {
          if (bound === texture) state.texturesByUnit.delete(unit);
        }
        return original.apply(this, args);
      });
    }

    function renderAllowed(context, name, args) {
      if (!battleCanvas(context?.canvas)) return true;
      if (name === 'drawImage') return isBattleControlAsset(args[0]);
      return hasProtectedBattleTexture(context);
    }

    function patchRenderMethod(prototype, name) {
      const original = prototype?.[name];
      if (typeof original !== 'function' || original[RENDER_MARKER]) return;
      const wrapped = function (...args) {
        if (!renderAllowed(this, name, args)) return undefined;
        return original.apply(this, args);
      };
      try { Object.defineProperty(wrapped, RENDER_MARKER, { value: true }); } catch {}
      try { prototype[name] = wrapped; } catch {}
    }

    function patchRendering() {
      for (const constructor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
        patchWebGLTracking(constructor?.prototype);
        patchRenderMethod(constructor?.prototype, 'drawArrays');
        patchRenderMethod(constructor?.prototype, 'drawElements');
        patchRenderMethod(constructor?.prototype, 'drawArraysInstanced');
        patchRenderMethod(constructor?.prototype, 'drawElementsInstanced');
      }
      patchRenderMethod(window.CanvasRenderingContext2D?.prototype, 'drawImage');
    }
""",
    'selective battle control rendering',
)

path.write_text(source, encoding='utf-8')

test_path = Path('tests/autoflow.static.test.mjs')
tests = test_path.read_text(encoding='utf-8')
version_assertion = f"assert.ok(source.includes('const APP_VERSION = {current}'));"
if version_assertion in tests:
    tests = tests.replace(version_assertion, f"assert.ok(source.includes('const APP_VERSION = {next_version}'));", 1)

marker = "test('battle performance keeps attack and full-auto controls visible'"
if marker not in tests:
    tests += '''

test('battle performance keeps attack and full-auto controls visible', () => {
  const child = source.slice(source.indexOf('function installBattlePerformanceChildRuntime'), source.indexOf('const APP_VERSION'));
  assert.ok(child.includes('BATTLE_CONTROL_ASSET_PATTERN'));
  assert.ok(child.includes('raid_parts_(?:attack|auto|full_auto|auto_guard|full_auto_guard)'));
  assert.ok(child.includes('if (isBattleControlAsset(url)) return false;'));
  assert.ok(child.includes('function patchWebGLTracking(prototype)'));
  assert.ok(child.includes('protectedBattleTextures'));
  assert.ok(child.includes("if (name === 'drawImage') return isBattleControlAsset(args[0]);"));
  assert.ok(child.includes('return hasProtectedBattleTexture(context);'));
  assert.ok(child.includes('.cnt-raid-stage canvas#canvas { visibility:visible!important; }'));
  assert.ok(child.includes('.cnt-raid-stage .btn-auto,'));
  assert.ok(child.includes('.btn-attack-start'));
});
'''

test_path.write_text(tests, encoding='utf-8')
