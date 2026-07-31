from pathlib import Path
import re

root = Path('.')
a_path = root / 'a.js'
test_path = root / 'tests/autoflow.static.test.mjs'
source = a_path.read_text(encoding='utf-8')
tests = test_path.read_text(encoding='utf-8')

old_constants = """    const RENDER_MARKER = '__autoFlowBattlePerformanceRender__';
    const WEBGL_TRACK_MARKER = '__autoFlowBattlePerformanceWebGLTrack__';
    const BATTLE_CONTROL_ASSET_PATTERN = /\\/sp\\/cjs\\/raid_parts_(?:attack|auto|full_auto|auto_guard|full_auto_guard)\\.(?:png|jpe?g|webp)(?:[?#]|$)/i;
    const protectedBattleTextures = new WeakSet();
    const webglBindings = new WeakMap();
"""
new_constants = """    const RENDER_MARKER = '__autoFlowBattlePerformanceRender__';
"""
if old_constants not in source:
    raise SystemExit('battle control WebGL constants block not found')
source = source.replace(old_constants, new_constants, 1)

old_assets = """    const assetSource = value => String(value?.currentSrc || value?.src || value || '');
    const isBattleControlAsset = value => BATTLE_CONTROL_ASSET_PATTERN.test(assetSource(value));
    const shouldReplaceAsset = value => {
      if (!enabled || !isBattleRuntime()) return false;
      const url = String(value ?? '');
      if (isBattleControlAsset(url)) return false;
      return /\\/sp\\/cjs\\/[^?#]+\\.(?:png|jpe?g|webp)(?:[?#]|$)/i.test(url)
"""
new_assets = """    const shouldReplaceAsset = value => {
      if (!enabled || !isBattleRuntime()) return false;
      const url = String(value ?? '');
      return /\\/sp\\/cjs\\/[^?#]+\\.(?:png|jpe?g|webp)(?:[?#]|$)/i.test(url)
"""
if old_assets not in source:
    raise SystemExit('battle control asset allowlist block not found')
source = source.replace(old_assets, new_assets, 1)

old_css = """          .cnt-raid-stage canvas#canvas { visibility:visible!important; }
          .cnt-raid-stage .btn-auto,
          .cnt-raid-stage #cnt-raid-information .btn-attack-start {
            visibility:visible!important;
            opacity:1!important;
          }
"""
new_css = """          .cnt-raid-stage canvas#canvas { visibility:hidden!important; }
          .cnt-raid > .btn-auto,
          .cnt-raid #cnt-raid-information .btn-attack-start {
            visibility:visible!important;
            opacity:1!important;
          }
"""
if old_css not in source:
    raise SystemExit('battle canvas/control CSS block not found')
source = source.replace(old_css, new_css, 1)

tracking_start = source.find('    function webglState(context) {')
render_start = source.find('    function patchRenderMethod(prototype, name) {', tracking_start)
if tracking_start < 0 or render_start < 0:
    raise SystemExit('WebGL tracking section not found')
source = source[:tracking_start] + source[render_start:]

old_render = """      const wrapped = function (...args) {
        if (!renderAllowed(this, name, args)) return undefined;
        return original.apply(this, args);
      };
"""
new_render = """      const wrapped = function (...args) {
        if (battleCanvas(this?.canvas)) return undefined;
        return original.apply(this, args);
      };
"""
if old_render not in source:
    raise SystemExit('selective render wrapper not found')
source = source.replace(old_render, new_render, 1)

source = source.replace("        patchWebGLTracking(constructor?.prototype);\n", '', 1)

version_match = re.search(r'  const APP_VERSION = (\d+);', source)
if not version_match:
    raise SystemExit('APP_VERSION not found')
old_version = int(version_match.group(1))
new_version = old_version + 1
source = source[:version_match.start()] + f'  const APP_VERSION = {new_version};' + source[version_match.end():]

tests = re.sub(r"assert\.ok\(source\.includes\('const APP_VERSION = \d+'\)\);", f"assert.ok(source.includes('const APP_VERSION = {new_version}'));", tests, count=1)

for name in [
    'battle performance keeps attack and full-auto controls visible',
    'battle performance does not leak enemy rendering through stale button textures',
]:
    pattern = re.compile(r"\n*test\('" + re.escape(name) + r"',[\s\S]*?\n\}\);\n?", re.MULTILINE)
    tests, count = pattern.subn('\n', tests, count=1)
    if count != 1:
        raise SystemExit(f'test block not found: {name}')

new_test = r'''

test('battle performance fully suppresses battle canvas while preserving DOM attack controls', () => {
  const child = source.slice(source.indexOf('function installBattlePerformanceChildRuntime'), source.indexOf('const APP_VERSION'));
  const renderer = child.slice(child.indexOf('function patchRenderMethod'), child.indexOf('function patchRendering'));
  const assets = child.slice(child.indexOf('const shouldReplaceAsset'), child.indexOf('const rewriteAsset'));
  assert.ok(child.includes('.cnt-raid-stage canvas#canvas { visibility:hidden!important; }'));
  assert.ok(child.includes('.cnt-raid > .btn-auto,'));
  assert.ok(child.includes('.cnt-raid #cnt-raid-information .btn-attack-start'));
  assert.ok(renderer.includes('if (battleCanvas(this?.canvas)) return undefined;'));
  assert.ok(assets.includes('/\\/sp\\/cjs\\/'));
  assert.ok(!assets.includes('isBattleControlAsset'));
  assert.ok(!child.includes('BATTLE_CONTROL_ASSET_PATTERN'));
  assert.ok(!child.includes('WEBGL_TRACK_MARKER'));
  assert.ok(!child.includes('protectedBattleTextures'));
  assert.ok(!child.includes('patchWebGLTracking'));
  assert.ok(!child.includes('renderAllowed'));
});
'''
tests = tests.rstrip() + new_test + '\n'

a_path.write_text(source, encoding='utf-8')
test_path.write_text(tests, encoding='utf-8')
print(f'APP_VERSION {old_version} -> {new_version}')
