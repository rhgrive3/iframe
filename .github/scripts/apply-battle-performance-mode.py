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

child_runtime = r'''  const BATTLE_PERFORMANCE_STORAGE_KEY = '__fullscreen_iframe_autoclicker_battle_performance_v1__';
  const BATTLE_PERFORMANCE_MESSAGE_TYPE = '__fullscreen_iframe_autoclicker_battle_performance__';
  const BATTLE_PERFORMANCE_RUNTIME_KEY = '__FULLSCREEN_IFRAME_BATTLE_PERFORMANCE__';
  const BATTLE_PERFORMANCE_STYLE_ID = '__fullscreen_iframe_battle_performance_style__';
  const BATTLE_PERFORMANCE_TRANSPARENT_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

  function readBattlePerformanceSetting() {
    try {
      const saved = JSON.parse(localStorage.getItem(BATTLE_PERFORMANCE_STORAGE_KEY) || 'null');
      return saved?.enabled === true;
    } catch {
      return false;
    }
  }

  function installBattlePerformanceChildRuntime() {
    const installed = window[BATTLE_PERFORMANCE_RUNTIME_KEY];
    if (installed?.setEnabled) {
      installed.setEnabled(readBattlePerformanceSetting());
      return;
    }

    let enabled = readBattlePerformanceSetting();
    let style = null;
    let pollTimer = null;
    let soundFlagSnapshot = null;
    let createjsMuteSnapshot = null;
    let soundModulesRequested = false;
    const soundRestorers = [];
    const patchedSoundObjects = new WeakSet();
    const LOAD_QUEUE_MARKER = '__autoFlowBattlePerformanceLoadQueue__';
    const RENDER_MARKER = '__autoFlowBattlePerformanceRender__';

    const isBattleLocation = () => /(?:#|\/)raid(?:[_/]|$)/i.test(`${location.pathname}${location.hash}`);
    const isBattleRuntime = () => isBattleLocation() || Boolean(document.querySelector('.cnt-raid-stage'));
    const shouldReplaceAsset = value => {
      if (!enabled || !isBattleRuntime()) return false;
      const url = String(value ?? '');
      return /\/sp\/cjs\/[^?#]+\.(?:png|jpe?g|webp)(?:[?#]|$)/i.test(url)
        || /\/sp\/raid\/bg\/[^?#]+\.(?:png|jpe?g|webp)(?:[?#]|$)/i.test(url)
        || /\/sp\/assets\/enemy\/[^?#]+\.(?:png|jpe?g|webp)(?:[?#]|$)/i.test(url);
    };
    const rewriteAsset = value => shouldReplaceAsset(value) ? BATTLE_PERFORMANCE_TRANSPARENT_IMAGE : value;
    const battleCanvas = canvas => Boolean(
      enabled
      && isBattleRuntime()
      && canvas
      && canvas.ownerDocument === document
      && (canvas.id === 'canvas' || canvas.closest?.('.cnt-raid-stage'))
    );

    function ensureStyle() {
      if (!style || !style.isConnected) {
        style = document.getElementById(BATTLE_PERFORMANCE_STYLE_ID) || document.createElement('style');
        style.id = BATTLE_PERFORMANCE_STYLE_ID;
        style.textContent = `
          .cnt-raid-stage .prt-bg-stage-distant,
          .cnt-raid-stage .prt-bg-effect-brightness,
          .cnt-raid-stage .prt-bg-effect-color { background-image:none!important; }
          .cnt-raid-stage canvas#canvas { visibility:hidden!important; }
          .cnt-raid-stage .prt-cutin,
          .cnt-raid-stage .prt-special-chain,
          .cnt-raid-stage .prt-turn-info,
          .cnt-raid-stage .prt-red-frame-anim,
          .cnt-raid-stage .anim-shine,
          .cnt-raid-stage .prt-tips,
          .cnt-raid-stage .prt-navi,
          .cnt-raid-stage .prt-bg-effect-brightness,
          .cnt-raid-stage .prt-bg-effect-color {
            animation-duration:.001s!important;
            -webkit-animation-duration:.001s!important;
            animation-delay:0s!important;
            -webkit-animation-delay:0s!important;
            transition-duration:.001s!important;
            transition-delay:0s!important;
          }
        `;
        const parent = document.head || document.documentElement;
        if (parent && !style.isConnected) parent.append(style);
      }
      if (style) style.disabled = !enabled;
    }

    function rewriteManifestItem(item) {
      if (typeof item === 'string') return rewriteAsset(item);
      if (!item || typeof item !== 'object' || !shouldReplaceAsset(item.src)) return item;
      return { ...item, src: BATTLE_PERFORMANCE_TRANSPARENT_IMAGE };
    }

    function rewriteManifest(manifest) {
      if (!enabled || !isBattleRuntime()) return manifest;
      if (Array.isArray(manifest)) return manifest.map(rewriteManifestItem);
      if (manifest && typeof manifest === 'object' && Array.isArray(manifest.manifest)) {
        return { ...manifest, manifest: manifest.manifest.map(rewriteManifestItem) };
      }
      return rewriteManifestItem(manifest);
    }

    function patchLoadQueue() {
      const prototype = window.createjs?.LoadQueue?.prototype;
      if (!prototype || prototype[LOAD_QUEUE_MARKER]) return;
      Object.defineProperty(prototype, LOAD_QUEUE_MARKER, { value: true, configurable: true });
      for (const name of ['loadManifest', 'loadFile']) {
        const original = prototype[name];
        if (typeof original !== 'function') continue;
        prototype[name] = function (...args) {
          if (args.length) args[0] = name === 'loadManifest' ? rewriteManifest(args[0]) : rewriteManifestItem(args[0]);
          return original.apply(this, args);
        };
      }
    }

    function patchRenderMethod(prototype, name) {
      const original = prototype?.[name];
      if (typeof original !== 'function' || original[RENDER_MARKER]) return;
      const wrapped = function (...args) {
        if (battleCanvas(this?.canvas)) return undefined;
        return original.apply(this, args);
      };
      Object.defineProperty(wrapped, RENDER_MARKER, { value: true });
      prototype[name] = wrapped;
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

    function resolvedLoad() {
      const deferred = window.jQuery?.Deferred?.();
      if (deferred) {
        deferred.resolve();
        return deferred.promise();
      }
      return Promise.resolve();
    }

    function patchSoundObject(sound) {
      if (!enabled || !sound || patchedSoundObjects.has(sound)) return;
      const loadMethods = ['loadSound', 'loadBGM', 'loadSE', 'loadVoice'];
      const noOpMethods = [
        'playSound', 'playBGM', 'playSE', 'playVoice', 'playBattleReadySE', 'playAssistSE',
        'playAssistJoinedSE', 'playRecastMaxSE', 'stopBGM', 'stopSE', 'stopVoice', 'stopVoiceFunc'
      ];
      const originals = new Map();
      for (const name of loadMethods) {
        if (typeof sound[name] !== 'function') continue;
        originals.set(name, sound[name]);
        sound[name] = resolvedLoad;
      }
      for (const name of noOpMethods) {
        if (typeof sound[name] !== 'function') continue;
        originals.set(name, sound[name]);
        sound[name] = () => undefined;
      }
      if (!originals.size) return;
      patchedSoundObjects.add(sound);
      soundRestorers.push(() => {
        for (const [name, original] of originals) sound[name] = original;
        patchedSoundObjects.delete(sound);
      });
    }

    function patchSoundRuntime() {
      if (!enabled || !isBattleRuntime()) return;
      const setting = window.Game?.setting;
      if (setting) {
        if (!soundFlagSnapshot || soundFlagSnapshot.owner !== setting) {
          soundFlagSnapshot = { owner: setting, value: setting.sound_flag };
        }
        setting.sound_flag = 0;
      }
      const sound = window.createjs?.Sound;
      if (sound) {
        if (!createjsMuteSnapshot || createjsMuteSnapshot.owner !== sound) {
          createjsMuteSnapshot = { owner: sound, value: sound.getMute?.() ?? false };
        }
        try { sound.stop?.(); } catch {}
        try { sound.setMute?.(true); } catch {}
      }
      if (soundModulesRequested) return;
      const requireAmd = window.requireAMD || window.requirejs || (window.require?.amd ? window.require : null);
      if (typeof requireAmd !== 'function') return;
      soundModulesRequested = true;
      try {
        requireAmd(['model/sound', 'lib/sound'], (...modules) => {
          if (!enabled) return;
          for (const module of modules) patchSoundObject(module);
        }, () => { soundModulesRequested = false; });
      } catch {
        soundModulesRequested = false;
      }
    }

    function restoreSoundRuntime() {
      while (soundRestorers.length) {
        try { soundRestorers.pop()(); } catch {}
      }
      soundModulesRequested = false;
      if (soundFlagSnapshot) {
        try { soundFlagSnapshot.owner.sound_flag = soundFlagSnapshot.value; } catch {}
        soundFlagSnapshot = null;
      }
      if (createjsMuteSnapshot) {
        try { createjsMuteSnapshot.owner.setMute?.(createjsMuteSnapshot.value); } catch {}
        createjsMuteSnapshot = null;
      }
    }

    function patchImageSources() {
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

    function setEnabled(next) {
      enabled = Boolean(next);
      ensureStyle();
      if (enabled) patchNow();
      else restoreSoundRuntime();
    }

    const onMessage = event => {
      if (event.source !== window.parent || event.origin !== location.origin) return;
      if (event.data?.type !== BATTLE_PERFORMANCE_MESSAGE_TYPE) return;
      setEnabled(event.data.enabled);
    };
    const onStorage = event => {
      if (event.key !== BATTLE_PERFORMANCE_STORAGE_KEY) return;
      setEnabled(readBattlePerformanceSetting());
    };

    patchImageSources();
    patchRendering();
    ensureStyle();
    if (enabled) patchNow();
    pollTimer = window.setInterval(() => {
      if (enabled) patchNow();
      else ensureStyle();
    }, 100);
    window.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
    window.addEventListener('pagehide', () => window.clearInterval(pollTimer), { once: true });

    window[BATTLE_PERFORMANCE_RUNTIME_KEY] = {
      get enabled() { return enabled; },
      setEnabled,
      refresh: patchNow
    };
  }

  if (window.top !== window) {
    installBattlePerformanceChildRuntime();
    return;
  }
'''
source = replace_once(
    source,
    "  if (window.top !== window) return;\n",
    child_runtime,
    'child runtime',
)

source = replace_once(
    source,
    'grid-template-columns:repeat(3,1fr)',
    'grid-template-columns:repeat(4,1fr)',
    'main tab columns',
)

setting_css = r'''      .settingToggle{
        position:relative;display:grid;grid-template-columns:24px minmax(0,1fr);gap:12px;align-items:start;
        padding:14px;border:1px solid var(--line-strong);border-radius:var(--radius-sm);background:var(--panel-deep);cursor:pointer
      }
      .settingToggle:hover{border-color:rgba(124,140,255,.45);background:#10131c}
      .settingToggle input{margin:1px 0 0}
      .settingToggleCopy{display:grid;gap:4px;min-width:0}
      .settingToggleCopy strong{font-size:13px;color:var(--text)}
      .settingToggleCopy small,.settingNote{color:var(--muted);font-size:10.5px;line-height:1.6}
      .settingNote{margin-top:10px;padding:10px 12px;border-left:2px solid var(--accent);background:var(--accent-soft);border-radius:0 8px 8px 0}
'''
source = replace_once(
    source,
    "      .card::after{content:'';position:absolute;inset:0;pointer-events:none;border-radius:inherit;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}\n",
    "      .card::after{content:'';position:absolute;inset:0;pointer-events:none;border-radius:inherit;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}\n" + setting_css,
    'setting css',
)

source = replace_once(
    source,
    '''        <button id="tab-logs" class="mainTab" role="tab" aria-selected="false" aria-controls="page-logs" tabindex="-1" data-page="logs"><span class="tabIcon" aria-hidden="true">≡</span><span>ログ</span></button>''',
    '''        <button id="tab-logs" class="mainTab" role="tab" aria-selected="false" aria-controls="page-logs" tabindex="-1" data-page="logs"><span class="tabIcon" aria-hidden="true">≡</span><span>ログ</span></button>
        <button id="tab-settings" class="mainTab" role="tab" aria-selected="false" aria-controls="page-settings" tabindex="-1" data-page="settings"><span class="tabIcon" aria-hidden="true">⚙</span><span>設定</span></button>''',
    'settings tab',
)

settings_page = r'''        <section id="page-settings" class="page" role="tabpanel" aria-labelledby="tab-settings" hidden>
          <header class="pageIntro">
            <div class="pageIntroText"><span class="eyebrow">Runtime settings</span><h2>動作設定</h2><p>ワークフロー実行とは独立して、iframe内へ常時適用する機能を管理します。</p></div>
          </header>
          <article class="card">
            <div class="cardHeader">
              <div class="cardTitleGroup"><span class="sectionIcon" aria-hidden="true">⚡</span><div class="cardHeading" role="heading" aria-level="3"><strong>グラブル バトル</strong><small>通信・描画・音声負荷を削減</small></div></div>
            </div>
            <label class="settingToggle" for="battlePerformanceToggle">
              <input id="battlePerformanceToggle" type="checkbox">
              <span class="settingToggleCopy"><strong>バトル軽量化・高速化</strong><small>CJS画像と背景画像を透明データへ置換し、WebGL描画とバトル音声を止め、表示専用演出を最短化します。バトルロジックとタイムラインは維持します。</small></span>
            </label>
            <div class="settingNote">設定をONにすると、フローの実行ボタンを押していなくても常時有効です。現在のiframeへ即時反映し、次回のページ読込では画像取得前から適用します。OFFにした時、すでに省略済みの画像は次の再読込から復元されます。</div>
          </article>
        </section>
'''
source = replace_once(
    source,
    '''            <div id="logList" class="logList"></div>
          </article>
        </section>
      </div>''',
    '''            <div id="logList" class="logList"></div>
          </article>
        </section>
''' + settings_page + '''      </div>''',
    'settings page',
)

source = replace_once(
    source,
    "    validateWorkflow: byId('validateWorkflow')\n",
    "    validateWorkflow: byId('validateWorkflow'), battlePerformanceToggle: byId('battlePerformanceToggle')\n",
    'settings ui reference',
)

source = replace_once(
    source,
    "    frameNavigationId: 0\n",
    "    frameNavigationId: 0,\n    battlePerformanceEnabled: readBattlePerformanceSetting()\n",
    'settings state',
)

settings_functions = r'''
  function syncBattlePerformanceFrame() {
    try {
      iframe.contentWindow?.postMessage({
        type: BATTLE_PERFORMANCE_MESSAGE_TYPE,
        enabled: state.battlePerformanceEnabled
      }, location.origin);
    } catch {}
  }

  function setBattlePerformanceEnabled(next, { notify = true } = {}) {
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
    syncBattlePerformanceFrame();
    if (notify) toast(state.battlePerformanceEnabled ? 'バトル軽量化・高速化をONにしました' : 'バトル軽量化・高速化をOFFにしました');
    return true;
  }
'''
source = replace_once(
    source,
    "  function consumeDragEvent(event, immediate = false) {\n",
    settings_functions + "\n  function consumeDragEvent(event, immediate = false) {\n",
    'settings functions',
)

source = replace_once(
    source,
    "    if (loadedSameOrigin) releaseHostRuntimeOnce();\n",
    "    if (loadedSameOrigin) {\n      syncBattlePerformanceFrame();\n      releaseHostRuntimeOnce();\n    }\n",
    'frame load sync',
)

source = replace_once(
    source,
    "    state.page = ['workflow', 'legacy', 'logs'].includes(page) ? page : 'workflow';\n",
    "    state.page = ['workflow', 'legacy', 'logs', 'settings'].includes(page) ? page : 'workflow';\n",
    'settings page routing',
)

source = replace_once(
    source,
    "  byId('workflowErrorLogs').addEventListener('click', () => setPage('logs'));\n",
    "  byId('workflowErrorLogs').addEventListener('click', () => setPage('logs'));\n  ui.battlePerformanceToggle.addEventListener('change', () => setBattlePerformanceEnabled(ui.battlePerformanceToggle.checked));\n",
    'settings event',
)

source = replace_once(
    source,
    "  loadLegacyState();\n  renderTemplateSelect();\n",
    "  loadLegacyState();\n  ui.battlePerformanceToggle.checked = state.battlePerformanceEnabled;\n  renderTemplateSelect();\n",
    'settings initialization',
)

path.write_text(source, encoding='utf-8')

test_path = Path('tests/autoflow.static.test.mjs')
tests = test_path.read_text(encoding='utf-8')
old_guard = "  assert.match(source, /if \\(window\\.top !== window\\) return;/);"
new_guard = "  assert.ok(source.includes('installBattlePerformanceChildRuntime();'));\n  assert.ok(source.includes('if (window.top !== window) {'));"
if old_guard in tests:
    tests = tests.replace(old_guard, new_guard, 1)
else:
    raise SystemExit('top-level guard test marker not found')

version_assertion = f"assert.ok(source.includes('const APP_VERSION = {current}'));"
if version_assertion in tests:
    tests = tests.replace(version_assertion, f"assert.ok(source.includes('const APP_VERSION = {next_version}'));", 1)

marker = "test('battle performance mode is persistent and independent from workflow execution'"
if marker not in tests:
    tests += r'''

test('battle performance mode is persistent and independent from workflow execution', () => {
  assert.ok(source.includes("const BATTLE_PERFORMANCE_STORAGE_KEY = '__fullscreen_iframe_autoclicker_battle_performance_v1__'"));
  assert.ok(source.includes('function installBattlePerformanceChildRuntime()'));
  assert.ok(source.includes('if (window.top !== window) {'));
  assert.ok(source.includes('installBattlePerformanceChildRuntime();'));
  assert.ok(source.includes('id="tab-settings"'));
  assert.ok(source.includes('id="battlePerformanceToggle"'));
  assert.ok(source.includes("state.page = ['workflow', 'legacy', 'logs', 'settings']"));
  assert.ok(source.includes('setBattlePerformanceEnabled(ui.battlePerformanceToggle.checked)'));
  assert.ok(source.includes('syncBattlePerformanceFrame();'));
});

test('battle performance child runtime preserves logic while suppressing heavy media', () => {
  const child = source.slice(source.indexOf('function installBattlePerformanceChildRuntime'), source.indexOf('const APP_VERSION'));
  assert.ok(child.includes("['loadManifest', 'loadFile']"));
  assert.ok(child.includes('BATTLE_PERFORMANCE_TRANSPARENT_IMAGE'));
  assert.ok(child.includes("patchRenderMethod(constructor?.prototype, 'drawArrays')"));
  assert.ok(child.includes("patchRenderMethod(constructor?.prototype, 'drawElements')"));
  assert.ok(child.includes("patchRenderMethod(window.CanvasRenderingContext2D?.prototype, 'drawImage')"));
  assert.ok(child.includes("requireAmd(['model/sound', 'lib/sound']"));
  assert.ok(child.includes('setting.sound_flag = 0'));
  assert.ok(child.includes('animation-duration:.001s!important'));
  assert.ok(child.includes("canvas.id === 'canvas'"));
  assert.ok(!child.includes('Ticker.removeAllEventListeners'));
  assert.ok(!child.includes('Stage.update ='));
});
'''

test_path.write_text(tests, encoding='utf-8')
