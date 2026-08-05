import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../a.js', import.meta.url), 'utf8');
const childSource = source.slice(
  source.indexOf("  const BATTLE_PERFORMANCE_STORAGE_KEY = '"),
  source.indexOf('  if (window.top !== window) {')
);
const RUNTIME_KEY = '__FULLSCREEN_IFRAME_BATTLE_PERFORMANCE__';

// 子フレーム側ランタイムだけを取り出し、素材差し替えの実挙動を確かめる。
function bootChildRuntime({ hash = '#raid_multi/1234567/1/1' } = {}) {
  const loadedManifests = [];
  const loadedFiles = [];
  const imageSources = [];
  const removedAttributes = [];

  class StubImage {
    constructor() {
      this.crossOrigin = null;
      this.rawSrc = '';
    }
    removeAttribute(name) {
      removedAttributes.push(name);
      if (name === 'crossorigin') this.crossOrigin = null;
    }
  }
  Object.defineProperty(StubImage.prototype, 'src', {
    configurable: true,
    get() { return this.rawSrc; },
    set(value) {
      this.rawSrc = value;
      imageSources.push({ value, crossOrigin: this.crossOrigin });
    }
  });

  function StubLoadQueue() {}
  StubLoadQueue.prototype.loadManifest = function (manifest, loadNow) {
    loadedManifests.push({ manifest, loadNow });
  };
  StubLoadQueue.prototype.loadFile = function (item) {
    loadedFiles.push(item);
  };

  const styleElement = { id: '', textContent: '', disabled: false, isConnected: false, remove() {} };
  const documentStub = {
    getElementById: () => null,
    createElement: () => styleElement,
    querySelector: () => null,
    head: { append(node) { node.isConnected = true; } },
    documentElement: {}
  };

  const windowStub = {
    createjs: { LoadQueue: StubLoadQueue },
    HTMLImageElement: StubImage,
    Element: { prototype: { setAttribute(name, value) { this[name] = value; } } },
    setInterval: () => 1,
    clearInterval: () => {},
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const context = vm.createContext({
    window: windowStub,
    document: documentStub,
    location: { pathname: '/', hash },
    localStorage: { getItem: () => JSON.stringify({ version: 1, enabled: true }) },
    performance: { now: () => Date.now() },
    console
  });
  new vm.Script(`${childSource}\ninstallBattlePerformanceChildRuntime();`).runInContext(context);

  return {
    runtime: windowStub[RUNTIME_KEY],
    window: windowStub,
    StubImage,
    StubLoadQueue,
    loadedManifests,
    loadedFiles,
    imageSources,
    removedAttributes
  };
}

const CJS = id => `https://game.example/assets/sp/cjs/${id}.png`;
const TRANSPARENT_PREFIX = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

test('battle assets are replaced with one transparent URL per asset, not a single shared URL', () => {
  const child = bootChildRuntime();
  child.runtime.refresh();

  const manifest = ['a', 'b', 'c', 'd'].map(id => ({ id, src: CJS(id), type: 'image' }));
  new child.StubLoadQueue().loadManifest(manifest, true);

  const [{ manifest: rewritten, loadNow }] = child.loadedManifests;
  assert.equal(loadNow, true);
  assert.equal(rewritten.length, 4);
  for (const item of rewritten) assert.ok(item.src.startsWith(TRANSPARENT_PREFIX), item.src);
  // 同じURLへ寄せるとCreateJSの画像キャッシュが1枚に潰れ、以降の素材が同期完了して
  // キュー消化が素材数ぶんの再帰になる。素材が最多になる戦闘直リロードでスタックを
  // 使い切り、completeが飛ばず読み込みが終わらなくなるため、必ず別URLにする。
  assert.equal(new Set(rewritten.map(item => item.src)).size, 4);
  // 元の識別子は保持する（window.images の登録先が変わると描画側が壊れる）。
  assert.deepEqual(rewritten.map(item => item.id), ['a', 'b', 'c', 'd']);
});

test('the same battle asset always maps to the same transparent URL', () => {
  const child = bootChildRuntime();
  child.runtime.refresh();

  new child.StubLoadQueue().loadManifest([{ id: 'a', src: CJS('a') }], true);
  new child.StubLoadQueue().loadManifest([{ id: 'a', src: CJS('a') }], true);
  new child.StubLoadQueue().loadFile({ id: 'a', src: CJS('a') });

  const first = child.loadedManifests[0].manifest[0].src;
  const second = child.loadedManifests[1].manifest[0].src;
  assert.equal(first, second);
  assert.equal(child.loadedFiles[0].src, first);
});

test('non battle assets and non image assets keep their original source', () => {
  const child = bootChildRuntime();
  child.runtime.refresh();

  const untouched = [
    { id: 'atlas', src: 'https://game.example/assets/sp/raid/atlas/raid_ui.json' },
    { id: 'script', src: 'cjs/raid_parts_attack.js' },
    { id: 'ui', src: 'https://game.example/assets/sp/ui/icon/status/x64/status_1.png' }
  ];
  new child.StubLoadQueue().loadManifest(untouched, true);

  assert.deepEqual(child.loadedManifests[0].manifest, untouched);
});

test('outside a battle route nothing is replaced at all', () => {
  const child = bootChildRuntime({ hash: '#quest/assist/multi/0' });
  child.runtime.refresh();

  const manifest = [{ id: 'a', src: CJS('a') }];
  new child.StubLoadQueue().loadManifest(manifest, true);
  assert.deepEqual(child.loadedManifests[0].manifest, manifest);
});

test('replaced image elements drop the CORS mode CreateJS set for the CDN URL', () => {
  const child = bootChildRuntime();
  child.runtime.refresh();

  const image = new child.StubImage();
  image.crossOrigin = 'anonymous';
  image.src = CJS('a');
  assert.ok(image.rawSrc.startsWith(TRANSPARENT_PREFIX));
  assert.equal(image.crossOrigin, null);
  assert.ok(child.removedAttributes.includes('crossorigin'));

  const other = new child.StubImage();
  other.crossOrigin = 'anonymous';
  other.src = CJS('b');
  assert.notEqual(other.rawSrc, image.rawSrc);

  // 差し替えない画像のCORS指定には触らない。
  const untouched = new child.StubImage();
  untouched.crossOrigin = 'anonymous';
  untouched.src = 'https://game.example/assets/sp/ui/icon.png';
  assert.equal(untouched.rawSrc, 'https://game.example/assets/sp/ui/icon.png');
  assert.equal(untouched.crossOrigin, 'anonymous');
});

test('disabling the mode restores the untouched loader and image pipeline', () => {
  const child = bootChildRuntime();
  child.runtime.refresh();
  const patched = child.StubLoadQueue.prototype.loadManifest;

  child.runtime.setEnabled(false);
  assert.notEqual(child.StubLoadQueue.prototype.loadManifest, patched);

  const manifest = [{ id: 'a', src: CJS('a') }];
  new child.StubLoadQueue().loadManifest(manifest, true);
  assert.deepEqual(child.loadedManifests[0].manifest, manifest);

  const image = new child.StubImage();
  image.src = CJS('a');
  assert.equal(image.rawSrc, CJS('a'));
});
