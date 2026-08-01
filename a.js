(() => {
  'use strict';

  const BATTLE_PERFORMANCE_STORAGE_KEY = '__fullscreen_iframe_autoclicker_battle_performance_v1__';
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
    if (installed?.version === 2 && installed?.setEnabled) {
      installed.setEnabled(readBattlePerformanceSetting());
      return;
    }
    try { installed?.destroy?.(); } catch {}

    let enabled = readBattlePerformanceSetting();
    let destroyed = false;
    let style = null;
    let pollTimer = null;
    let pollDeadline = 0;
    let battleRuntime = false;
    let soundFlagSnapshot = null;
    let createjsMuteSnapshot = null;
    let soundModulesRequested = false;
    let imageSrcRestore = null;
    let setAttributeRestore = null;
    const soundRestorers = [];
    const patchedSoundObjects = new WeakSet();
    const patchedStages = new Map();
    const LOAD_QUEUE_MARKER = '__autoFlowBattlePerformanceLoadQueue__';
    const STAGE_RENDER_MARKER = '__autoFlowBattlePerformanceStageRender__';
    const runtimeToken = {};

    const isBattleLocation = () => /(?:#|\/)raid(?:[_/]|$)/i.test(`${location.pathname}${location.hash}`);
    const refreshBattleRuntime = () => {
      battleRuntime = isBattleLocation() || Boolean(document.querySelector('.cnt-raid-stage'));
      return battleRuntime;
    };
    const isBattleRuntime = () => battleRuntime;
    refreshBattleRuntime();
    const shouldReplaceAsset = value => {
      if (!enabled || !isBattleRuntime()) return false;
      const url = String(value ?? '');
      return /\/sp\/cjs\/[^?#]+\.(?:png|jpe?g|webp)(?:[?#]|$)/i.test(url)
        || /\/sp\/raid\/bg\/[^?#]+\.(?:png|jpe?g|webp)(?:[?#]|$)/i.test(url)
        || /\/sp\/assets\/enemy\/[^?#]+\.(?:png|jpe?g|webp)(?:[?#]|$)/i.test(url);
    };
    const rewriteAsset = value => shouldReplaceAsset(value) ? BATTLE_PERFORMANCE_TRANSPARENT_IMAGE : value;

    function ensureStyle() {
      if (!style || !style.isConnected) {
        style = document.getElementById(BATTLE_PERFORMANCE_STYLE_ID) || document.createElement('style');
        style.id = BATTLE_PERFORMANCE_STYLE_ID;
        style.textContent = `
          .cnt-raid-stage .prt-bg-stage-distant,
          .cnt-raid-stage .prt-bg-effect-brightness,
          .cnt-raid-stage .prt-bg-effect-color { background-image:none!important; }
          .cnt-raid-stage canvas#canvas { visibility:hidden!important; }
          .cnt-raid > .btn-auto,
          .cnt-raid #cnt-raid-information .btn-attack-start {
            visibility:visible!important;
            opacity:1!important;
          }
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

    function restoreLoadQueue() {
      const prototype = window.createjs?.LoadQueue?.prototype;
      const marker = prototype?.[LOAD_QUEUE_MARKER];
      if (!prototype || marker?.owner !== runtimeToken) return;
      for (const [name, original] of marker.originals) {
        try {
          if (prototype[name] === marker.wrappers.get(name)) prototype[name] = original;
        } catch {}
      }
      try { delete prototype[LOAD_QUEUE_MARKER]; } catch {}
    }

    function patchLoadQueue() {
      const prototype = window.createjs?.LoadQueue?.prototype;
      if (!prototype) return false;
      const installed = prototype[LOAD_QUEUE_MARKER];
      if (installed?.owner === runtimeToken) return true;
      if (installed) return false;
      const originals = new Map();
      const wrappers = new Map();
      for (const name of ['loadManifest', 'loadFile']) {
        const original = prototype[name];
        if (typeof original !== 'function') continue;
        const wrapped = function (...args) {
          if (args.length) args[0] = name === 'loadManifest' ? rewriteManifest(args[0]) : rewriteManifestItem(args[0]);
          return original.apply(this, args);
        };
        originals.set(name, original);
        wrappers.set(name, wrapped);
        prototype[name] = wrapped;
      }
      if (!originals.size) return false;
      try {
        Object.defineProperty(prototype, LOAD_QUEUE_MARKER, {
          value: { owner: runtimeToken, originals, wrappers },
          configurable: true
        });
      } catch {
        for (const [name, original] of originals) {
          try {
            if (prototype[name] === wrappers.get(name)) prototype[name] = original;
          } catch {}
        }
        return false;
      }
      return true;
    }

    function battleStage(stage) {
      try {
        const canvas = stage?.canvas;
        return Boolean(
          stage
          && canvas
          && canvas.ownerDocument === document
          && (canvas.id === 'canvas' || canvas.closest?.('.cnt-raid-stage'))
        );
      } catch {
        return false;
      }
    }

    function restoreStageRendering() {
      for (const [stage, snapshot] of patchedStages) {
        try {
          if (stage[snapshot.name] !== snapshot.wrapper) continue;
          if (snapshot.hadOwn) stage[snapshot.name] = snapshot.original;
          else delete stage[snapshot.name];
        } catch {}
      }
      patchedStages.clear();
    }

    function patchStageRendering() {
      if (!enabled || !isBattleRuntime()) return false;
      const candidates = new Set([
        window.stage,
        window.Game?.view?.stage,
        window.exportRoot?.stage
      ].filter(Boolean));
      let ready = false;
      for (const stage of candidates) {
        if (!battleStage(stage)) continue;
        if (patchedStages.has(stage)) {
          ready = true;
          continue;
        }
        const name = typeof stage.ra === 'function'
          ? 'ra'
          : typeof stage.draw === 'function' ? 'draw' : null;
        if (!name) continue;
        const original = stage[name];
        const hadOwn = Object.prototype.hasOwnProperty.call(stage, name);
        const wrapper = function () { return true; };
        try { Object.defineProperty(wrapper, STAGE_RENDER_MARKER, { value: true }); } catch {}
        try {
          stage[name] = wrapper;
          patchedStages.set(stage, {
            name,
            original,
            wrapper,
            hadOwn
          });
          ready = true;
        } catch {}
      }
      return ready;
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

    function restoreImageSources() {
      try { imageSrcRestore?.(); } catch {}
      try { setAttributeRestore?.(); } catch {}
      imageSrcRestore = null;
      setAttributeRestore = null;
    }

    function patchImageSources() {
      if (!imageSrcRestore) {
        try {
          const prototype = window.HTMLImageElement?.prototype;
          const descriptor = Object.getOwnPropertyDescriptor(prototype || {}, 'src');
          if (prototype && descriptor?.get && descriptor?.set && descriptor.configurable) {
            const wrappedSet = function (value) {
              return descriptor.set.call(this, rewriteAsset(value));
            };
            Object.defineProperty(prototype, 'src', { ...descriptor, set: wrappedSet });
            imageSrcRestore = () => {
              const current = Object.getOwnPropertyDescriptor(prototype, 'src');
              if (current?.set === wrappedSet) Object.defineProperty(prototype, 'src', descriptor);
            };
          }
        } catch {}
      }
      if (!setAttributeRestore) {
        try {
          const prototype = window.Element?.prototype;
          const originalSetAttribute = prototype?.setAttribute;
          if (prototype && typeof originalSetAttribute === 'function') {
            const wrappedSetAttribute = function (name, value) {
              const isImageSource = this instanceof window.HTMLImageElement && String(name).toLowerCase() === 'src';
              return originalSetAttribute.call(this, name, isImageSource ? rewriteAsset(value) : value);
            };
            prototype.setAttribute = wrappedSetAttribute;
            setAttributeRestore = () => {
              if (prototype.setAttribute === wrappedSetAttribute) prototype.setAttribute = originalSetAttribute;
            };
          }
        } catch {}
      }
    }

    function patchNow() {
      refreshBattleRuntime();
      ensureStyle();
      if (isBattleRuntime()) {
        try { patchImageSources(); } catch {}
        try { patchLoadQueue(); } catch {}
        try { patchStageRendering(); } catch {}
        try { patchSoundRuntime(); } catch {}
      } else {
        restoreSoundRuntime();
        restoreStageRendering();
        restoreLoadQueue();
        restoreImageSources();
      }
    }

    function stopPoll() {
      if (pollTimer != null) window.clearInterval(pollTimer);
      pollTimer = null;
      pollDeadline = 0;
    }

    function startPoll(durationMs = 30_000) {
      if (!enabled || destroyed) return;
      pollDeadline = Math.max(pollDeadline, performance.now() + durationMs);
      if (pollTimer != null) return;
      pollTimer = window.setInterval(() => {
        if (!enabled || destroyed) {
          stopPoll();
          return;
        }
        try { patchNow(); } catch {}
        if (performance.now() >= pollDeadline) stopPoll();
      }, 250);
    }

    function setEnabled(next) {
      if (destroyed) return;
      enabled = Boolean(next);
      ensureStyle();
      if (enabled) {
        patchNow();
        startPoll();
      } else {
        stopPoll();
        restoreStageRendering();
        restoreSoundRuntime();
        restoreLoadQueue();
        restoreImageSources();
      }
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
    const onRouteChange = () => {
      refreshBattleRuntime();
      if (enabled) {
        patchNow();
        startPoll();
      } else {
        restoreStageRendering();
        restoreSoundRuntime();
      }
    };
    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      enabled = false;
      stopPoll();
      restoreStageRendering();
      restoreSoundRuntime();
      restoreLoadQueue();
      restoreImageSources();
      window.removeEventListener('message', onMessage);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('hashchange', onRouteChange);
      window.removeEventListener('popstate', onRouteChange);
      window.removeEventListener('pageshow', onRouteChange);
      window.removeEventListener('load', onRouteChange);
      window.removeEventListener('pagehide', destroy);
      try { style?.remove(); } catch {}
      style = null;
      const runtime = window[BATTLE_PERFORMANCE_RUNTIME_KEY];
      if (runtime?.destroy === destroy) {
        try { delete window[BATTLE_PERFORMANCE_RUNTIME_KEY]; }
        catch { window[BATTLE_PERFORMANCE_RUNTIME_KEY] = null; }
      }
    };

    ensureStyle();
    if (enabled) {
      patchNow();
      startPoll();
    }
    window.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
    window.addEventListener('hashchange', onRouteChange);
    window.addEventListener('popstate', onRouteChange);
    window.addEventListener('pageshow', onRouteChange);
    window.addEventListener('load', onRouteChange);
    window.addEventListener('pagehide', destroy, { once: true });

    window[BATTLE_PERFORMANCE_RUNTIME_KEY] = {
      version: 2,
      get enabled() { return enabled; },
      setEnabled,
      refresh: patchNow,
      destroy
    };
  }

  if (window.top !== window) {
    installBattlePerformanceChildRuntime();
    return;
  }

  const APP_VERSION = 68;
  const ROOT_ID = '__fullscreen_iframe_autoclicker__';
  const GLOBAL_KEY = '__FULLSCREEN_IFRAME_AUTOCLICKER__';
  const HOST_RUNTIME_RELEASED_KEY = '__FULLSCREEN_IFRAME_AUTOCLICKER_HOST_RELEASED__';
  const LEGACY_STORAGE_KEY = '__fullscreen_iframe_autoclicker_state_v12__';
  const LEGACY_STORAGE_KEYS = Array.from({ length: 11 }, (_, index) =>
    `__fullscreen_iframe_autoclicker_state_v${11 - index}__`
  );
  const LEGACY_PRESET_PREFIX = '__fullscreen_iframe_autoclicker_preset_v8__';
  const LEGACY_PRESET_PREFIXES = Array.from({ length: 7 }, (_, index) =>
    `__fullscreen_iframe_autoclicker_preset_v${7 - index}__`
  );
  const WORKFLOW_STORAGE_KEY = '__fullscreen_iframe_autoclicker_workflows_v1__';
  const WORKFLOW_AUTOSAVE_KEY = '__fullscreen_iframe_autoclicker_workflow_autosave_v1__';
  const WORKFLOW_CHECKPOINT_KEY = '__fullscreen_iframe_autoclicker_workflow_checkpoint_v1__';
  const WORKFLOW_HANDOFF_KEY = '__fullscreen_iframe_autoclicker_workflow_handoff_v1__';
  const WORKFLOW_HANDOFF_SCHEMA_VERSION = 1;
  const WORKFLOW_HANDOFF_TTL_MS = 5 * 60_000;
  const WORKFLOW_HANDOFF_READY_TIMEOUT_MS = 45_000;
  const WORKFLOW_HANDOFF_POLL_MS = 100;
  const MAX_REPEAT_COUNT = 10_000;
  const MAX_WORKFLOW_LOOP_COUNT = 999_999;
  const MAX_CONDITION_ITERATIONS = 10_000;
  const MAX_WORKFLOW_RESTARTS = 10_000;
  const WORKFLOW_YIELD_INTERVAL = 64;
  const DEFAULT_TIMEOUT_MS = 15_000;
  const DEFAULT_FLOW_TIMEOUT_MS = 120_000;
  const DEFAULT_STABLE_MS = 140;
  const MAX_LOGS = 20;
  const MAX_WORKFLOW_HISTORY = 40;
  const MAX_WORKFLOW_HISTORY_BYTES = 12_000_000;
  const MAX_IMPORT_BYTES = 2_000_000;
  const MAX_IMPORTED_WORKFLOWS = 100;
  const MAX_IMPORTED_BLOCKS = 5_000;
  const MAX_IMPORTED_DEPTH = 30;
  const LOG_TIME_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const BATTLE_END_MESSAGE = '敵が倒されたため、このバトルは終了しました。';

  const ERROR_MESSAGES = Object.freeze({
    MAX_ASSIST: '救援できるマルチバトルは最大3つまでです。',
    UNCLAIMED: '未確認バトルを確認して下さい。',
    RAID_FULL: '参戦人数が上限に達しているため参戦できませんでした。'
  });

  const SELECTORS = Object.freeze({
    assistScreen: '#prt-assist-search.prt-assist-contents.active',
    assistRefresh: '#prt-assist-search .btn-search-refresh',
    assistList: '#prt-search-list',
    assistRows: '#prt-search-list > .btn-multi-raid.lis-raid.search',
    assistSlot: '#prt-search-switch .btn-search-switch',
    unclaimedAttention: '.btn-unconfirmed-result.flow-unclaimed.attention',
    supporterScreen: '#cnt-quest.cnt-quest.supporter_raid',
    supporterRows: '.btn-supporter.lis-supporter',
    supporterAuto: '.btn-autoselect-supporter',
    deckOk: '.pop-deck.supporter_raid .prt-btn-deck > .btn-usual-ok.se-quest-start',
    popup: '#pop .common-pop-error.pop-show',
    popupBody: '#popup-body',
    popupOk: '.prt-popup-footer > .btn-usual-ok',
    unclaimedList: '#prt-unclaimed-list',
    unclaimedRows: '#prt-unclaimed-list > .btn-multi-raid.lis-raid[data-href^="result_multi/"]',
    assistReturn: '#btn-link-quest-assist',
    // マルチ（救援）だけでなくシングル・semiのバトルも同じステージ要素を使うため、
    // .multi のような種別クラスは条件に含めない。
    battleScreen: '.cnt-raid-stage',
    battleResult: '.prt-command-end .btn-result',
    battleEndNotice: '#pop .prt-rematch-fail, #pop-force .prt-rematch-fail, .txt-rematch-fail',
    fullAuto: '.btn-auto',
    attackStart: '.btn-attack-start',
    attackDummy: '.prt-attack-start-dummy',
    attackCancel: '.btn-attack-cancel',
    attackActor: '.prt-command .btn-command-character.attack',
    turn: '#js-turn-num-count',
    myPageScreen: '.cnt-mypage'
  });
  const MY_PAGE_BUTTON_SELECTORS = Object.freeze([
    '.btn-footer-mypage[data-href="mypage"]',
    '.btn-treasure-footer-mypage[data-href="mypage"]',
    '.btn-head-mypage[data-href="mypage"]'
  ]);

  {
    const previous = window[GLOBAL_KEY];
    if (previous?.destroy) previous.destroy({ restoreHost: false });
  }
  document.getElementById(ROOT_ID)?.remove();
  let focusBeforeInstall = document.activeElement;
  const backgroundBody = document.body;
  const backgroundWasInert = Boolean(backgroundBody?.inert);
  const backgroundAriaHidden = backgroundBody?.getAttribute('aria-hidden') ?? null;
  const backgroundStyle = backgroundBody ? {
    visibility: backgroundBody.style.visibility,
    contentVisibility: backgroundBody.style.contentVisibility
  } : null;

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.lang = 'ja';
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    background: '#000',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'
  });

  const shadow = root.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host,*{box-sizing:border-box;-webkit-tap-highlight-color:rgba(124,140,255,.16)}
      :host{
        display:block;position:fixed;inset:0;overflow:hidden;overscroll-behavior:none;
        --panel:#12141b;--panel-raised:#181b24;--panel-deep:#0d0f15;--surface:rgba(255,255,255,.055);
        --surface2:rgba(255,255,255,.09);--surface3:rgba(255,255,255,.13);--line:rgba(255,255,255,.105);
        --line-strong:rgba(255,255,255,.17);--text:#f5f7ff;--text-soft:#d8dcec;--muted:#939aac;
        --accent:#7c8cff;--accent-strong:#4e5ccc;--accent-soft:rgba(124,140,255,.15);
        --green:#46d495;--green-soft:rgba(70,212,149,.13);--red:#ff6b78;--red-soft:rgba(255,107,120,.13);
        --amber:#f0b65c;--amber-soft:rgba(240,182,92,.13);--purple:#b197fc;--purple-soft:rgba(177,151,252,.13);
        --blue:#66b8ff;--blue-soft:rgba(102,184,255,.13);--radius-xs:8px;--radius-sm:11px;
        --radius-md:15px;--radius-lg:20px;--shadow-lg:0 24px 70px rgba(0,0,0,.52),0 2px 12px rgba(0,0,0,.32);
        color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI","Helvetica Neue",sans-serif;
        font-size:14px;line-height:1.45;color:var(--text)
      }
      button,input,select,textarea{font:inherit;color:var(--text)}
      button{min-height:44px;border:1px solid var(--line);border-radius:var(--radius-sm);padding:0 14px;
        background:var(--surface);font-size:12px;font-weight:720;letter-spacing:.01em;touch-action:manipulation;
        cursor:pointer;transition:background-color .16s ease,border-color .16s ease,color .16s ease,transform .12s ease,opacity .16s ease
      }
      button:hover:not(:disabled){border-color:var(--line-strong);background:var(--surface2)}
      button:not(#dockGrip):not(#compactGrip):active{transform:translateY(1px) scale(.985)}
      button:disabled{opacity:.38;cursor:not-allowed;filter:saturate(.4)}
      button.primary,#loadUrl{border-color:#7682e8;background:linear-gradient(180deg,#5967d8 0%,var(--accent-strong) 100%);color:#fff}
      button.primary:hover:not(:disabled),#loadUrl:hover:not(:disabled){background:linear-gradient(180deg,#6270df 0%,#5361d2 100%)}
      button.success{border-color:rgba(70,212,149,.35);background:var(--green-soft);color:#aef1cf}
      button.danger{border-color:rgba(255,107,120,.2);background:var(--red-soft);color:#ffb5bc}
      button.warn{border-color:rgba(240,182,92,.22);background:var(--amber-soft);color:#f8d49d}
      button.ghost{border-color:transparent;background:transparent;color:var(--muted)}
      button.ghost:hover:not(:disabled){color:var(--text);background:var(--surface)}
      input,select,textarea{
        width:100%;min-height:44px;border:1px solid #5c6377;border-radius:var(--radius-sm);padding:9px 11px;
        background:#0e1017;font-size:14px;line-height:1.35;outline:none;transition:border-color .16s ease,background-color .16s ease,box-shadow .16s ease
      }
      input:hover:not(:disabled),select:hover:not(:disabled),textarea:hover:not(:disabled){border-color:#737c92}
      input:focus,select:focus,textarea:focus{border-color:rgba(124,140,255,.72);background:#10131c;box-shadow:0 0 0 3px rgba(124,140,255,.12)}
      input[aria-invalid=true],select[aria-invalid=true],textarea[aria-invalid=true]{border-color:#d95867;box-shadow:0 0 0 3px rgba(255,107,120,.1)}
      input::placeholder,textarea::placeholder{color:#7c8498;opacity:1}
      input[type=checkbox]{width:20px;min-height:20px;height:20px;margin:4px 0;padding:0;accent-color:var(--accent);cursor:pointer}
      input[type=number]{font-variant-numeric:tabular-nums}
      select{cursor:pointer}
      textarea{min-height:78px;resize:vertical}
      button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,[tabindex]:focus-visible{
        outline:2px solid #bdc5ff;outline-offset:2px
      }
      ::-webkit-scrollbar{width:10px;height:10px}
      ::-webkit-scrollbar-track{background:transparent}
      ::-webkit-scrollbar-thumb{border:3px solid transparent;border-radius:999px;background:rgba(255,255,255,.17);background-clip:padding-box}
      ::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.26);background-clip:padding-box}
      .srOnly{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
      #frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}
      :host(.ui-dragging) #frame{pointer-events:none}

      #browserBar{
        position:fixed;z-index:150;top:max(8px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);
        width:min(1060px,calc(100vw - 20px));display:grid;grid-template-columns:42px 42px 42px minmax(160px,1fr) 76px 42px;
        gap:5px;padding:6px;border:1px solid var(--line-strong);border-radius:17px;background:rgba(18,20,27,.98);
        box-shadow:0 12px 38px rgba(0,0,0,.38)
      }
      #browserBar.hidden{display:none}
      #browserBar button{height:42px;min-height:42px;padding:0}
      #browserBar .navButton{font-size:18px;color:var(--text-soft);background:transparent;border-color:transparent}
      #browserBar .navButton:hover:not(:disabled){border-color:var(--line);background:var(--surface)}
      #urlInput{height:42px;min-height:42px;border-color:#555c70;border-radius:10px;background:#0b0d13;padding-left:14px;font-size:13px}
      #loadUrl{height:42px;min-height:42px;padding:0 12px;font-size:11px}
      #hideBrowser{font-size:16px;color:var(--muted)}
      #browserHandle{
        position:fixed;z-index:149;top:max(5px,env(safe-area-inset-top));left:50%;display:none;transform:translateX(-50%);
        width:66px;min-height:40px;height:40px;border-color:var(--line-strong);border-top:0;border-radius:0 0 13px 13px;
        background:var(--panel);color:var(--muted);box-shadow:0 8px 26px rgba(0,0,0,.35)
      }
      #browserHandle.visible{display:block}

      #dock{
        position:fixed;z-index:180;left:10px;bottom:max(10px,env(safe-area-inset-bottom));
        width:var(--dock-width,min(820px,calc(100vw - 20px)));width:var(--dock-width,min(820px,calc(100dvw - 20px)));
        height:var(--dock-height,min(860px,calc(100vh - 86px)));height:var(--dock-height,min(860px,calc(100dvh - 86px)));
        max-width:calc(100vw - 8px);max-width:calc(100dvw - 8px);
        max-height:calc(100vh - 8px);max-height:calc(100dvh - 8px);display:flex;flex-direction:column;
        border:1px solid var(--line-strong);border-radius:var(--radius-lg);color:var(--text);
        background:var(--panel);box-shadow:var(--shadow-lg);overflow:hidden;isolation:isolate
      }
      #dock.narrowViewport{
        width:var(--dock-width,min(380px,82vw));width:var(--dock-width,min(380px,82dvw));
        height:var(--dock-height,min(500px,46vh));height:var(--dock-height,min(500px,46dvh));
        max-width:calc(100vw - 24px);max-width:calc(100dvw - 24px);
        max-height:54vh;max-height:54dvh;border-radius:14px
      }
      #dock::before{
        content:'';position:absolute;z-index:-1;inset:0 0 auto;height:150px;pointer-events:none;
        background:radial-gradient(ellipse at 12% -20%,rgba(124,140,255,.15),transparent 62%)
      }
      #dock.is-running{border-color:rgba(70,212,149,.48)}
      #dock.compact{width:124px;height:58px;border-radius:29px}
      .compactOnly{display:none;width:100%;height:100%}
      #dock.compact .compactOnly{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
      #dock.compact .fullOnly{display:none!important}
      .compactOnly button{display:grid;min-height:100%;place-items:center;padding:0;border:0;border-radius:28px;background:transparent;line-height:1}
      .compactOnly #compactRun{border-left:1px solid var(--line);border-radius:0 28px 28px 0;background:var(--green-soft);color:#aef1cf;font-size:15px}
      .compactOnly #compactRun.is-stop{background:var(--red-soft);color:#ffc0c6}

      #dockHeader{
        flex:0 0 auto;display:grid;grid-template-columns:44px minmax(0,1fr) 40px 40px;align-items:center;
        gap:6px;min-height:64px;padding:8px 10px;border-bottom:1px solid var(--line);background:rgba(10,12,18,.28)
      }
      #dockGrip,#compactGrip{
        position:relative;padding:0;border-color:transparent;background:transparent;touch-action:none;cursor:grab;
        user-select:none;-webkit-user-select:none;-webkit-user-drag:none
      }
      #dockGrip{width:40px;height:40px;min-height:40px;border:1px solid rgba(124,140,255,.2);border-radius:12px;background:var(--accent-soft)}
      #dockGrip::before{
        content:'';position:absolute;inset:13px;border-radius:2px;
        background:radial-gradient(circle,#aeb7ff 1.5px,transparent 1.7px);background-size:6px 6px
      }
      #compactGrip::after{
        content:'';display:block;width:18px;height:18px;border-radius:4px;
        background:radial-gradient(circle,#aeb7ff 1.5px,transparent 1.8px);background-position:center;background-size:6px 6px
      }
      #dockGrip.is-dragging,#compactGrip.is-dragging{cursor:grabbing}
      #dockHeader{cursor:move;touch-action:none;user-select:none;-webkit-user-select:none}
      #dockHeader.is-dragging{cursor:grabbing}
      #dockHeader button{cursor:pointer}
      .resizeHandle{
        position:absolute;z-index:20;bottom:0;width:34px;min-height:34px;height:34px;padding:0;border:0;background:transparent;
        touch-action:none;opacity:.55
      }
      .resizeHandle:hover,.resizeHandle:focus-visible{background:rgba(124,140,255,.08);opacity:1}
      .resizeHandle::before{
        content:'';position:absolute;right:7px;bottom:7px;width:12px;height:12px;
        border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);border-radius:0 0 2px
      }
      #resizeDockLeft{left:0;cursor:nesw-resize;transform:scaleX(-1)}
      #resizeDockRight{right:0;cursor:nwse-resize}
      .resizeHandle.is-dragging{opacity:1}
      #toggleCompact,#closeApp{width:40px;height:40px;min-height:40px;padding:0;border-color:transparent;background:transparent;color:var(--muted);font-size:17px}
      #toggleCompact:hover:not(:disabled){color:var(--text);background:var(--surface)}
      #closeApp:hover:not(:disabled){color:#ffc0c6;background:var(--red-soft)}
      .title{min-width:0}
      .title strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:760;letter-spacing:.01em}
      .title small{display:flex;align-items:center;gap:7px;min-width:0;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:10.5px}
      .title small::before{content:'';flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:var(--muted)}
      .title small[data-tone=running]::before{background:var(--accent);box-shadow:0 0 0 4px rgba(124,140,255,.13);animation:statusPulse 1.8s ease-in-out infinite}
      .title small[data-tone=success]::before{background:var(--green)}
      .title small[data-tone=warn]::before{background:var(--amber)}
      .title small[data-tone=error]::before{background:var(--red)}

      #mainTabs{
        flex:0 0 auto;position:relative;display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:7px 10px;
        border-bottom:1px solid var(--line);background:rgba(9,11,16,.34)
      }
      .mainTab{
        position:relative;display:flex;align-items:center;justify-content:center;gap:7px;min-height:40px;height:40px;
        border-color:transparent;border-radius:10px;background:transparent;color:var(--muted);font-size:11.5px
      }
      .mainTab:hover:not(:disabled){background:var(--surface);color:var(--text-soft)}
      .mainTab[aria-selected=true]{border-color:rgba(124,140,255,.2);background:var(--accent-soft);color:#dfe3ff}
      .mainTab[aria-selected=true]::after{content:'';position:absolute;right:18%;bottom:-8px;left:18%;height:2px;border-radius:2px;background:var(--accent)}
      .tabIcon{display:grid;place-items:center;width:18px;height:18px;font-size:14px;line-height:1}

      #pages{flex:1;min-height:0;overflow:hidden;background:linear-gradient(180deg,#11131a 0%,#0e1016 100%)}
      .page{
        display:none;height:100%;overflow:auto;padding:16px 16px 0;overscroll-behavior:contain;
        -webkit-overflow-scrolling:touch;scrollbar-gutter:stable
      }
      .page.active{display:block}
      #page-workflow.active{display:flex;flex-direction:column}
      #page-workflow>*{flex-shrink:0}
      #page-workflow>.pageIntro{order:0}
      #workflowError,#externalConflict{order:1}
      .workflowSettings{order:2}
      .editorCard{order:3}
      .paletteCard{order:4}
      .templateCard{order:5}
      #runBar{order:6}
      .pageIntro{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin:2px 2px 14px}
      .pageIntroText{min-width:0}
      .eyebrow{display:block;margin-bottom:4px;color:#9ba7ff;font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
      .pageIntro h2{margin:0;color:var(--text);font-size:18px;line-height:1.25;letter-spacing:-.01em}
      .pageIntro p{margin:5px 0 0;color:var(--muted);font-size:11px;line-height:1.55}
      .shortcutHint{
        flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:7px 9px;border:1px solid var(--line);
        border-radius:9px;background:rgba(0,0,0,.14);color:var(--muted);font-size:9.5px;white-space:nowrap
      }
      kbd{display:inline-grid;min-width:22px;height:20px;place-items:center;padding:0 5px;border:1px solid var(--line-strong);border-bottom-color:rgba(255,255,255,.23);border-radius:5px;background:var(--surface);color:var(--text-soft);font:600 9px/1 inherit}

      .card{
        position:relative;margin-bottom:12px;padding:15px;border:1px solid var(--line);border-radius:var(--radius-md);
        background:rgba(255,255,255,.026)
      }
      .card::after{content:'';position:absolute;inset:0;pointer-events:none;border-radius:inherit;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}
      .settingToggle{
        position:relative;display:grid;grid-template-columns:24px minmax(0,1fr);gap:12px;align-items:start;
        padding:14px;border:1px solid var(--line-strong);border-radius:var(--radius-sm);background:var(--panel-deep);cursor:pointer
      }
      .settingToggle:hover{border-color:rgba(124,140,255,.45);background:#10131c}
      .settingToggle input{margin:1px 0 0}
      .settingToggleCopy{display:grid;gap:4px;min-width:0}
      .settingToggleCopy strong{font-size:13px;color:var(--text)}
      .settingToggleCopy small,.settingNote{color:var(--muted);font-size:10.5px;line-height:1.6}
      .settingNote{margin-top:10px;padding:10px 12px;border-left:2px solid var(--accent);background:var(--accent-soft);border-radius:0 8px 8px 0}
      .cardHeader,.cardTitle{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;font-size:12.5px;font-weight:780}
      .workflowSettings>summary{list-style:none;cursor:pointer}
      .workflowSettings>summary::-webkit-details-marker{display:none}
      .workflowSettings>summary::after{content:'⌄';flex:0 0 auto;color:var(--muted);font-size:15px;transition:transform .16s ease}
      .workflowSettings:not([open])>summary{margin-bottom:0}
      .workflowSettings:not([open])>summary::after{transform:rotate(-90deg)}
      .workflowSettings>summary .cardTitleGroup{flex:1 1 auto}
      .cardTitleGroup{display:flex;align-items:center;gap:9px;min-width:0}
      .sectionIcon{
        flex:0 0 auto;display:grid;width:28px;height:28px;place-items:center;border:1px solid var(--line);
        border-radius:9px;background:var(--surface);color:#c9ceff;font-size:13px
      }
      .cardHeading{min-width:0}
      .cardHeading strong{display:block;font-size:12.5px;line-height:1.3}
      .cardHeading small{display:block;margin-top:2px;color:var(--muted);font-size:9.5px;font-weight:520}
      .hint{color:var(--muted);font-size:10.5px;font-weight:500;line-height:1.55}
      .grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .field{display:flex;min-width:0;flex-direction:column;gap:6px;color:#a8afc0;font-size:10px;font-weight:670;letter-spacing:.01em}
      .field:focus-within{color:#ccd1e1}
      .field>span{display:flex;align-items:center;min-height:15px}
      .field:has(input[type=checkbox]){justify-content:flex-end}
      .field:has(input[type=checkbox])>span{min-height:auto}
      .span2{grid-column:1/-1}
      .toolbar{display:flex;flex-wrap:wrap;gap:7px;margin-top:11px}
      .toolbar>*{flex:1 1 108px;min-width:0}
      .toolbar.compactActions>*{flex:0 1 auto}
      .historyActions{align-items:center}
      .historyActions::after{content:'';width:1px;height:24px;margin:0 3px;background:var(--line)}
      .historyActions button{min-width:92px}
      .toolbar button{min-height:40px;padding:0 12px;font-size:10.5px}
      .workflowActions{padding-top:1px}
      .workflowActions button{flex-basis:94px}
      .workflowActions .secondaryAction{background:rgba(255,255,255,.035)}
      .templateActions button{flex-basis:150px}

      .saveState{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
      .saveState::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--muted)}
      .saveState[data-state=saving]::before{background:var(--amber);animation:statusPulse 1.4s ease-in-out infinite}
      .saveState[data-state=saved]::before{background:var(--green)}
      .saveState[data-state=error]{color:#ffc1c6}
      .saveState[data-state=error]::before{background:var(--red)}
      .saveState[data-state=conflict]{color:#f2d29d}
      .saveState[data-state=conflict]::before{background:var(--amber)}

      .paletteCard{padding:0;overflow:hidden}
      .paletteCard>summary{position:relative;z-index:1;margin:0;padding:14px 15px;list-style:none;cursor:pointer}
      .paletteCard>summary::-webkit-details-marker{display:none}
      .paletteCard>summary::after{content:'⌄';margin-left:auto;color:var(--muted);font-size:16px;transition:transform .16s ease}
      .paletteCard:not([open])>summary::after{transform:rotate(-90deg)}
      .paletteCard[open]>summary{border-bottom:1px solid var(--line)}
      .paletteContent{padding:13px 15px 15px}
      .paletteControls{display:grid;grid-template-columns:minmax(160px,1fr) auto;gap:8px;margin-bottom:10px}
      .paletteSearchWrap{position:relative}
      .paletteSearchWrap::before{content:'⌕';position:absolute;z-index:1;top:50%;left:12px;transform:translateY(-52%);color:var(--muted);font-size:16px;pointer-events:none}
      #paletteSearch{padding-left:34px}
      .paletteFilters{display:flex;gap:4px}
      .paletteFilter{min-height:40px;height:40px;padding:0 10px;border-color:transparent;background:transparent;color:var(--muted);font-size:9.5px}
      .paletteFilter[aria-pressed=true]{border-color:rgba(124,140,255,.23);background:var(--accent-soft);color:#dfe3ff}
      .insertionNotice{
        display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:11px;padding:9px 10px;
        border:1px solid var(--line);border-radius:10px;background:rgba(0,0,0,.12)
      }
      .insertionNotice.active{border-color:rgba(124,140,255,.32);background:var(--accent-soft)}
      #insertHint{margin:0}
      #clearInsertion{display:none;flex:0 0 auto;min-height:32px;height:32px;padding:0 9px}
      .insertionNotice.active #clearInsertion{display:block}
      .paletteGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .paletteSection{grid-column:1/-1;display:grid;gap:7px}
      .paletteSection+.paletteSection{margin-top:4px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07)}
      .paletteSectionHead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 2px}
      .paletteSectionTitle{display:flex;align-items:center;gap:7px;color:var(--text-soft);font-size:10px;font-weight:760}
      .paletteSectionTitle::before{content:'';width:7px;height:7px;border-radius:2px;background:var(--accent)}
      .paletteSection[data-category=gbf] .paletteSectionTitle::before{background:var(--green)}
      .paletteSection[data-category=control] .paletteSectionTitle::before{background:var(--purple)}
      .paletteSection[data-category=wait] .paletteSectionTitle::before{background:var(--amber)}
      .paletteSection[data-category=frame] .paletteSectionTitle::before{background:var(--blue)}
      .paletteCount{color:var(--muted);font-size:9px}
      .paletteItems{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
      .paletteButton{position:relative;min-height:68px;padding:10px 11px 10px 14px;overflow:hidden;text-align:left;background:rgba(255,255,255,.03)}
      .paletteButton::before{content:'＋';position:absolute;top:9px;right:10px;color:var(--muted);font-size:14px;font-weight:500}
      .paletteButton::after{content:'';position:absolute;top:9px;bottom:9px;left:0;width:3px;border-radius:0 3px 3px 0;background:var(--accent)}
      .paletteButton:hover:not(:disabled){transform:translateY(-1px)}
      .paletteButton strong{display:block;padding-right:20px;color:var(--text-soft);font-size:10.5px;line-height:1.35}
      .paletteButton small{display:block;margin-top:4px;padding-right:12px;color:var(--muted);font-size:9px;font-weight:500;line-height:1.45}
      .paletteButton.gbf::after{background:var(--green)}.paletteButton.control::after{background:var(--purple)}
      .paletteButton.wait::after{background:var(--amber)}.paletteButton.frame::after{background:var(--blue)}
      .paletteEmpty{grid-column:1/-1;padding:22px 12px;border:1px dashed var(--line-strong);border-radius:12px;color:var(--muted);font-size:10.5px;text-align:center}

      .editorCard{padding-bottom:4px}
      .editorCard>.cardHeader{margin-bottom:7px}
      .statsPill{display:inline-flex;align-items:center;min-height:24px;padding:0 8px;border:1px solid var(--line);border-radius:999px;background:rgba(0,0,0,.12);font-size:9.5px}
      #workflowEditor{position:relative;padding:1px 0 94px}
      .empty{display:grid;min-height:122px;place-items:center;padding:26px 16px;border:1px dashed rgba(124,140,255,.28);border-radius:13px;background:rgba(124,140,255,.035);color:var(--muted);font-size:10.5px;line-height:1.6;text-align:center}
      .dropZone{position:relative;height:12px;margin:0 7px;border-radius:7px;transition:height .14s ease,background-color .14s ease}
      .dropZone::after{content:'';position:absolute;top:50%;right:6px;left:6px;height:2px;transform:translateY(-50%) scaleX(.1);border-radius:2px;background:transparent;transition:transform .14s ease,background-color .14s ease}
      .dropZone.dragOver{height:28px;background:rgba(124,140,255,.08)}
      .dropZone.dragOver::after{transform:translateY(-50%) scaleX(1);background:var(--accent)}
      .blockCard{
        position:relative;margin:3px 0;border:1px solid var(--line);border-radius:14px;background:#12151d;
        box-shadow:0 6px 18px rgba(0,0,0,.12);overflow:hidden;transition:border-color .16s ease,opacity .16s ease,transform .16s ease
      }
      .blockCard::before{content:'';position:absolute;z-index:2;top:0;bottom:0;left:0;width:4px;background:var(--accent)}
      .blockCard.category-gbf::before{background:var(--green)}.blockCard.category-control::before{background:var(--purple)}
      .blockCard.category-wait::before{background:var(--amber)}.blockCard.category-frame::before{background:var(--blue)}
      .blockCard:hover{border-color:var(--line-strong)}
      .blockCard.running{border-color:rgba(70,212,149,.56);outline:2px solid rgba(70,212,149,.24);outline-offset:1px;box-shadow:none}
      .blockCard.running::after{content:'';position:absolute;z-index:4;top:0;right:0;left:0;height:2px;background:linear-gradient(90deg,transparent,var(--green),transparent);animation:runSweep 1.8s linear infinite}
      .blockCard.validation-error{border-color:rgba(255,107,120,.55);box-shadow:0 0 0 2px rgba(255,107,120,.08)}
      .blockCard.validation-warning{border-color:rgba(240,182,92,.45)}
      .blockCard.dragging{opacity:.45;transform:scale(.99)}
      .blockHead{display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:8px;min-height:58px;padding:8px 9px 8px 10px;border-bottom:1px solid rgba(255,255,255,.065)}
      .blockHead button{min-height:34px;height:34px}
      .collapseToggle{position:relative;width:34px;padding:0;border-color:transparent;background:transparent;color:var(--muted);font-size:0}
      .collapseToggle::before{content:'⌄';display:grid;place-items:center;font-size:17px;transition:transform .16s ease}
      .blockCard.collapsed .collapseToggle::before{transform:rotate(-90deg)}
      .blockName{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:6px;min-width:0}
      .blockTypeBadge{grid-row:1/3;display:inline-flex;align-items:center;align-self:center;min-height:22px;padding:0 7px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--muted);font-size:8px;font-weight:760;white-space:nowrap}
      .category-gbf .blockTypeBadge{border-color:rgba(70,212,149,.2);background:var(--green-soft);color:#a6e8c8}
      .category-control .blockTypeBadge{border-color:rgba(177,151,252,.2);background:var(--purple-soft);color:#d6c7ff}
      .category-wait .blockTypeBadge{border-color:rgba(240,182,92,.2);background:var(--amber-soft);color:#efd09c}
      .category-frame .blockTypeBadge{border-color:rgba(102,184,255,.2);background:var(--blue-soft);color:#b9ddff}
      .blockName strong{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-soft);font-size:11.5px;line-height:1.3}
      .blockName small{grid-column:2/-1;display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:9px;line-height:1.3}
      .blockName>.progressBadge{grid-column:3;grid-row:1/3}
      .blockBadges{grid-column:3;grid-row:1/3;display:flex;align-items:center;gap:4px}
      .blockTools{display:flex;flex-wrap:nowrap;justify-content:flex-end;gap:3px}
      .blockTools button{position:relative;min-width:34px;width:34px;padding:0;border-color:transparent;background:transparent;color:var(--muted);font-size:12px}
      .blockTools button:hover:not(:disabled){border-color:var(--line);background:var(--surface);color:var(--text)}
      .blockTools button.toolDelete:hover:not(:disabled){border-color:rgba(255,107,120,.2);background:var(--red-soft);color:#ffb5bc}
      .blockBody{padding:12px 12px 13px 14px;background:rgba(0,0,0,.08)}
      .blockBody>.cardTitle{margin:14px 0 8px;padding-top:11px;border-top:1px solid var(--line);font-size:10px;color:var(--text-soft)}
      .blockCard.collapsed .blockHead{border-bottom:0}
      .blockCard.collapsed .blockContent{display:none}
      .childArea{position:relative;margin:0 11px 11px 24px;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:rgba(0,0,0,.12)}
      .childArea::before{content:'';position:absolute;top:-8px;bottom:8px;left:-13px;width:1px;background:rgba(255,255,255,.13)}
      .childLabel{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px;padding:1px 2px 4px;color:var(--muted);font-size:9px;font-weight:740}
      .childLabel button{min-height:30px;height:30px;padding:0 9px;border-color:transparent;background:transparent;color:#bfc6ff;font-size:9px}
      .progressBadge{display:inline-flex;min-width:44px;justify-content:center;padding:3px 7px;border:1px solid rgba(70,212,149,.18);border-radius:999px;background:var(--green-soft);color:#a6edc8;font-size:8.5px;white-space:nowrap}
      .validationBadge{display:inline-flex;min-width:44px;justify-content:center;padding:3px 7px;border:1px solid rgba(240,182,92,.24);border-radius:999px;background:var(--amber-soft);color:#f2d29d;font-size:8.5px;white-space:nowrap}
      .validationBadge.error{border-color:rgba(255,107,120,.24);background:var(--red-soft);color:#ffc0c6}

      #runBar{
        position:sticky;z-index:6;bottom:0;display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:8px;
        margin:0 -16px;padding:16px 16px calc(14px + env(safe-area-inset-bottom));
        border-top:1px solid rgba(255,255,255,.08);background:rgba(14,16,22,.98)
      }
      #runBar button{min-height:48px;font-size:12px}
      #runWorkflow{border-color:rgba(70,212,149,.34);background:linear-gradient(180deg,#54dda1 0%,#35bf82 100%);color:#071d13}
      #runWorkflow:hover:not(:disabled){background:linear-gradient(180deg,#62e4aa 0%,#3dc98a 100%)}
      #stopWorkflow{border-color:rgba(255,107,120,.2);background:var(--red-soft);color:#ffc0c6}
      #validationBar{
        grid-column:1/-1;display:grid;grid-template-columns:9px minmax(0,1fr) auto auto;align-items:center;gap:9px;
        min-height:44px;padding:7px 8px;border:1px solid var(--line);border-radius:11px;background:rgba(0,0,0,.14)
      }
      #validationBar::before{content:'';width:8px;height:8px;border-radius:50%;background:var(--muted)}
      #validationBar[data-tone=success]::before{background:var(--green)}
      #validationBar[data-tone=warning]::before{background:var(--amber)}
      #validationBar[data-tone=error]::before{background:var(--red)}
      .validationText{min-width:0}
      .validationText strong,.validationText small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .validationText strong{color:var(--text-soft);font-size:10px}
      .validationText small{margin-top:2px;color:var(--muted);font-size:9px}
      #validationBar button{min-height:34px;height:34px;padding:0 10px;font-size:9.5px}
      #validationFocus[hidden]{display:none}

      #legacyActionList{display:grid;gap:9px;padding-bottom:16px}
      .legacyRow{padding:12px;border:1px solid var(--line);border-radius:13px;background:rgba(255,255,255,.025)}
      .legacyRow.selected{border-color:rgba(124,140,255,.42);box-shadow:0 0 0 2px rgba(124,140,255,.08)}
      .legacyHead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;padding-bottom:9px;border-bottom:1px solid rgba(255,255,255,.06)}
      .legacySelect{min-height:36px;height:36px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 8px;border-color:transparent;background:transparent;color:var(--text-soft);font-size:11px;text-align:left}
      .legacySelect[aria-pressed=true]{background:var(--accent-soft);color:#dfe3ff}
      .legacyTools{display:flex;gap:3px}
      .legacyTools button{min-width:34px;width:auto;min-height:34px;height:34px;padding:0 8px;border-color:transparent;background:transparent;color:var(--muted);font-size:9.5px}

      #markerLayer,#recordLayer{position:fixed;inset:0;pointer-events:none}
      #markerLayer{z-index:100}
      .marker{position:fixed;width:44px;height:44px;transform:translate(-50%,-50%);display:grid;place-items:center;border:2px solid #ff9189;border-radius:50%;background:#751f2d;color:#fff;font-size:10px;font-weight:850;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-user-drag:none;box-shadow:0 0 0 2px #fff,0 0 0 4px rgba(0,0,0,.82),0 8px 22px rgba(0,0,0,.38)}
      .marker.selected{border-color:#86efbd;background:#0d5b3a}
      #recordLayer.active{z-index:210;pointer-events:auto;background:rgba(255,60,90,.035);touch-action:none}
      .recordDot{position:fixed;width:28px;height:28px;transform:translate(-50%,-50%);display:grid;place-items:center;border:2px solid #fff;border-radius:50%;background:#ef4f68;font-size:10px;font-weight:850}
      #recordToolbar{
        position:fixed;z-index:230;top:max(16px,calc(env(safe-area-inset-top) + 8px));left:50%;transform:translateX(-50%);
        width:min(520px,calc(100dvw - 24px));display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;
        gap:7px;padding:8px;border:1px solid rgba(255,107,120,.36);border-radius:15px;background:rgba(18,20,27,.98);
        box-shadow:0 16px 44px rgba(0,0,0,.45)
      }
      #recordToolbar[hidden]{display:none}
      #recordToolbar button{min-height:38px;height:38px;padding:0 12px;font-size:10px}
      .recordStatus{display:flex;align-items:center;gap:8px;min-width:0;padding-left:5px;color:var(--text-soft);font-size:10.5px;font-weight:700}
      .recordStatus strong{display:inline-flex;min-width:36px;justify-content:center;padding:3px 6px;border-radius:999px;background:var(--red-soft);color:#ffc0c6;font-size:9px}
      .recordPulse{flex:0 0 auto;width:8px;height:8px;border-radius:50%;background:var(--red);box-shadow:0 0 0 4px rgba(255,107,120,.12);animation:statusPulse 1.3s ease-in-out infinite}

      :host(.element-picking) #dock,
      :host(.element-picking) #browserBar,
      :host(.element-picking) #browserHandle,
      :host(.element-picking) #markerLayer{visibility:hidden;pointer-events:none}
      #elementPickerToolbar{
        position:fixed;z-index:250;top:max(16px,calc(env(safe-area-inset-top) + 8px));left:50%;transform:translateX(-50%);
        width:min(620px,calc(100dvw - 24px));display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;
        gap:8px;padding:9px;border:1px solid rgba(102,184,255,.42);border-radius:15px;background:rgba(18,20,27,.98);
        box-shadow:0 16px 44px rgba(0,0,0,.45)
      }
      #elementPickerToolbar[hidden]{display:none}
      #elementPickerToolbar button{min-height:40px;height:40px}
      .pickerStatus{display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px;align-items:center;min-width:0;padding-left:5px}
      .pickerStatus strong,.pickerStatus small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pickerStatus strong{font-size:11px;color:var(--text-soft)}
      .pickerStatus small{margin-top:2px;font-size:9.5px;color:var(--muted)}
      .pickerPulse{width:9px;height:9px;border-radius:50%;background:var(--blue);box-shadow:0 0 0 4px rgba(102,184,255,.13);animation:statusPulse 1.3s ease-in-out infinite}

      #toast{
        position:fixed;z-index:260;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translate(-50%,12px);
        visibility:hidden;max-width:calc(100vw - 24px);padding:11px 15px;border:1px solid var(--line-strong);border-radius:12px;
        color:#fff;background:rgba(18,20,27,.98);font-size:11px;line-height:1.4;opacity:0;
        box-shadow:0 14px 38px rgba(0,0,0,.42);transition:opacity .18s ease,transform .18s ease,visibility .18s
      }
      #toast.show{visibility:visible;transform:translate(-50%,0);opacity:1}
      .logList{display:grid}
      .logEntry{display:grid;grid-template-columns:68px 96px minmax(0,1fr);gap:9px;padding:10px 8px;border-bottom:1px solid rgba(255,255,255,.07);font-size:10.5px;line-height:1.5}
      .logEntry:last-child{border-bottom:0}
      .logEntry.error{color:#ffc0c6}.logEntry.success{color:#a6edc8}.logEntry.warn{color:#f2d29d}
      .logTime{color:var(--muted);font-variant-numeric:tabular-nums}
      .errorBox{display:none;margin-bottom:12px;padding:12px;border:1px solid rgba(255,107,120,.36);border-radius:13px;background:var(--red-soft);color:#ffc8cd;font-size:10.5px;line-height:1.55}
      .errorBox.show{display:block}
      .errorBox.conflictBox{border-color:rgba(240,182,92,.38);background:var(--amber-soft);color:#f2d29d}
      .conflictBox strong{display:block;color:#ffe0ab;font-size:11px}
      .conflictBox p{margin:4px 0 0;color:#d7bd91}
      .errorMessage{font-weight:680;overflow-wrap:anywhere}
      .errorActions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:10px}
      .errorActions button{min-height:38px;padding:6px;font-size:10px}

      @keyframes statusPulse{0%,100%{opacity:.58}50%{opacity:1}}
      @keyframes runSweep{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
      @media(prefers-reduced-motion:reduce){
        *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}
        button:not(#dockGrip):not(#compactGrip):active{transform:none}
      }
      @media(max-width:760px){
        .paletteControls{grid-template-columns:1fr}
        .paletteFilters{display:grid;grid-template-columns:repeat(5,minmax(0,1fr))}
        .paletteFilter{padding:0 5px}
        .blockHead{grid-template-columns:38px minmax(0,1fr)}
        .blockTools{grid-column:1/-1;justify-content:flex-start;padding-left:46px}
      }
      @media(max-width:620px){
        #browserBar{top:max(3px,env(safe-area-inset-top));width:calc(100dvw - 8px);grid-template-columns:44px 44px 44px minmax(70px,1fr) 56px 44px;gap:3px;padding:3px;border-radius:10px}
        #browserBar button,#browserBar input{height:44px;min-height:44px}
        #browserBar input{padding:4px 8px;font-size:16px}
        #loadUrl{font-size:10px}
        #dock{left:6px;width:var(--dock-width,min(380px,82vw));width:var(--dock-width,min(380px,82dvw));height:var(--dock-height,min(500px,46vh));height:var(--dock-height,min(500px,46dvh));max-width:calc(100vw - 24px);max-width:calc(100dvw - 24px);max-height:54vh;max-height:54dvh;border-radius:14px}
        #dock.compact{width:104px;height:48px;border-radius:24px}
        #dockHeader{grid-template-columns:40px minmax(0,1fr) 40px 40px;gap:3px;min-height:56px;padding:5px 7px}
        #dockGrip,#toggleCompact,#closeApp{width:40px;height:40px;min-height:40px}
        #dockGrip::before{inset:12px}
        .title strong{font-size:11.5px}.title small{font-size:9px}
        #mainTabs{gap:3px;padding:4px 6px}
        .mainTab{height:44px;min-height:44px;font-size:10px}
        .mainTab[aria-selected=true]::after{bottom:-5px}
        .tabIcon{font-size:12px}
        .page{padding:10px 9px 0}
        .pageIntro{margin:0 1px 10px}
        .pageIntro h2{font-size:15px}.pageIntro p{display:none}.eyebrow{font-size:8px}.shortcutHint{display:none}
        .card{margin-bottom:8px;padding:10px;border-radius:11px}
        .cardHeader,.cardTitle{margin-bottom:9px}
        .sectionIcon{width:26px;height:26px}
        .cardHeading strong{font-size:11px}.cardHeading small{font-size:8.5px}
        .grid2,.grid3{gap:7px}
        .grid3{grid-template-columns:repeat(2,minmax(0,1fr))}
        .toolbar{gap:5px;margin-top:8px}.toolbar>*{flex-basis:78px}
        .toolbar button{min-height:38px;padding:0 8px;font-size:9.5px}
        .paletteCard{padding:0}
        .paletteCard>summary{padding:11px}
        .paletteContent{padding:10px}
        .paletteGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}
        .paletteItems{grid-template-columns:1fr;gap:5px}
        .paletteFilters{overflow:auto;grid-template-columns:repeat(5,minmax(60px,1fr))}
        .paletteButton{min-height:54px;padding:8px 9px 8px 12px}
        .paletteButton strong{font-size:9.5px}.paletteButton small{font-size:8.5px}
        .editorCard{padding-bottom:1px}
        #workflowEditor{padding-bottom:82px}
        .empty{min-height:96px}
        .blockCard{margin:3px 0;border-radius:10px}
        .blockHead{grid-template-columns:32px minmax(0,1fr);gap:4px;min-height:50px;padding:6px 6px 6px 8px}
        .blockHead button,.legacyTools button{min-height:40px;height:40px}
        .collapseToggle{width:30px}
        .blockName{gap:5px}
        .blockTypeBadge{padding:0 5px;font-size:7.5px}
        .blockName strong{font-size:10px}.blockName small{font-size:8px}
        .blockBody{padding:9px}
        .blockTools{grid-column:1/-1;flex-wrap:wrap;justify-content:flex-start;padding-left:35px;gap:2px}
        .blockTools button{min-width:40px;width:40px}
        .childArea{margin:0 6px 7px 15px;padding:5px}
        #runBar{margin:0 -9px;padding:10px 9px calc(9px + env(safe-area-inset-bottom))}
        #runBar button{min-height:43px}
        #validationBar{grid-template-columns:8px minmax(0,1fr) auto;padding:7px}
        #validationFocus{display:none!important}
        #validateWorkflow{min-width:78px}
        .historyActions button{min-width:0;flex:1}
        .logEntry{grid-template-columns:50px 68px minmax(0,1fr);gap:5px;padding:7px 4px;font-size:9px}
      }
      @media(max-width:430px){
        #browserBar{grid-template-columns:44px 44px minmax(66px,1fr) 52px 44px}
        #forwardFrame{display:none}
        .toolbar>*{flex-basis:72px}
        .paletteFilter{font-size:8.5px}
        .errorActions{grid-template-columns:1fr}
        .grid2,.grid3{grid-template-columns:1fr}
        .span2{grid-column:auto}
        #recordToolbar{grid-template-columns:1fr 1fr}
        .recordStatus{grid-column:1/-1;justify-content:center}
      }
      @media(hover:none) and (pointer:coarse){
        #browserBar,#dock,.blockCard{backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:none}
        button{min-height:40px}
        input,select,textarea{min-height:40px}
        .blockHead button,.legacyTools button{min-height:40px;height:40px}
        #recordToolbar button{min-height:44px;height:44px}
        .paletteButton:hover:not(:disabled){transform:none}
      }
      @media(max-width:620px){
        #browserBar button,#browserBar input{height:38px;min-height:38px}
        #dockHeader{grid-template-columns:34px minmax(0,1fr) 34px 34px;min-height:48px;padding:4px 6px}
        #dockGrip,#toggleCompact,#closeApp{width:34px;height:34px;min-height:34px}
        #dockGrip::before{inset:10px}
        .mainTab{height:36px;min-height:36px}
        input,select,textarea{min-height:36px;padding:6px 8px;font-size:16px}
        .grid2,.grid3{grid-template-columns:repeat(2,minmax(0,1fr))}
        .span2{grid-column:1/-1}
        .field{gap:4px}
        .toolbar button{min-height:34px;height:34px;padding:0 7px}
        .blockHead button,.legacyTools button{min-height:32px;height:32px}
        .blockTools button{min-width:32px;width:32px}
        .paletteFilter{min-height:34px;height:34px}
        .paletteButton{min-height:46px}
        #runBar button{min-height:40px;height:40px}
        #validationBar button{min-height:32px;height:32px}
      }
      #dock.narrowViewport.androidCompact{
        width:var(--dock-width,72vw);width:var(--dock-width,72dvw);
        height:var(--dock-height,38vh);height:var(--dock-height,38dvh);
        max-width:82vw;max-width:82dvw;max-height:48vh;max-height:48dvh;border-radius:14px
      }
      #dock.compact.androidCompact{width:124px;height:58px;border-radius:29px}
      #dock.androidCompact{font-size:7.4px}
      #dock.androidCompact #dockHeader{gap:5px;min-height:41px;padding:6px 8px}
      #dock.androidCompact .title strong{font-size:7px}
      #dock.androidCompact .title small{font-size:5.5px}
      #dock.androidCompact #toggleCompact,#dock.androidCompact #closeApp{width:17px;height:17px;min-height:17px;font-size:8.7px}
      #dock.androidCompact #mainTabs{gap:3px;padding:6px 8px}
      #dock.androidCompact .tabIcon{width:9px;height:9px;font-size:7.2px}
      @media(forced-colors:active){
        #dock,#browserBar,.card,.blockCard,input,select,textarea,button{border:1px solid CanvasText}
        .blockCard::before,.paletteButton::after{width:5px}
        .resizeHandle{border:1px solid CanvasText}
      }
    </style>
    <iframe id="frame" title="自動操作の対象ページ" allow="fullscreen; autoplay; clipboard-read; clipboard-write" referrerpolicy="no-referrer-when-downgrade"></iframe>
    <div id="markerLayer"></div><div id="recordLayer"></div>
    <div id="recordToolbar" role="dialog" aria-modal="true" aria-labelledby="recordToolbarTitle" hidden>
      <div class="recordStatus"><span class="recordPulse" aria-hidden="true"></span><span id="recordToolbarTitle">タッチを記録中</span><strong id="recordCount" role="status" aria-live="polite">0件</strong></div>
      <button id="recordCancel" class="ghost">キャンセル</button>
      <button id="recordFinish" class="primary">記録を完了</button>
    </div>
    <div id="elementPickerToolbar" role="dialog" aria-modal="true" aria-labelledby="elementPickerTitle" hidden>
      <div class="pickerStatus"><span class="pickerPulse" aria-hidden="true"></span><span><strong id="elementPickerTitle">押すボタンを選択</strong><small id="elementPickerHint">iframe内のHTML要素をタップしてください。実際のゲーム操作は発火しません。</small></span></div>
      <button id="elementPickerCancel" class="ghost">キャンセル</button>
    </div>
    <div id="browserBar" role="navigation" aria-label="対象ページのナビゲーション">
      <button id="backFrame" class="navButton" aria-label="戻る" title="戻る">‹</button>
      <button id="forwardFrame" class="navButton" aria-label="進む" title="進む">›</button>
      <button id="reloadFrame" class="navButton" aria-label="再読み込み" title="再読み込み">↻</button>
      <label class="srOnly" for="urlInput">表示するURL</label>
      <input id="urlInput" aria-label="表示するURL" placeholder="URLを入力" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false">
      <button id="loadUrl">開く</button>
      <button id="hideBrowser" class="navButton" aria-label="URLバーを隠す" title="URLバーを隠す">⌃</button>
    </div>
    <button id="browserHandle" aria-label="URLバーを表示" title="URLバーを表示">⌄</button>
    <div id="dock" role="region" aria-label="AutoFlow Studio">
      <div class="compactOnly">
        <button id="compactGrip" aria-label="メニューを開く" aria-expanded="false" title="メニューを開く・移動"></button>
        <button id="compactRun" aria-label="実行" title="実行">▶</button>
      </div>
      <div class="fullOnly" id="dockHeader">
        <button id="dockGrip" aria-label="パネルを移動" title="ドラッグして移動"></button>
        <div class="title">
          <strong>AutoFlow Studio</strong>
          <small id="statusText" data-tone="success">準備完了</small>
        </div>
        <button id="toggleCompact" aria-label="パネルを最小化" title="最小化">—</button>
        <button id="closeApp" aria-label="AutoFlowを終了" title="終了">×</button>
      </div>
      <div class="fullOnly" id="mainTabs" role="tablist" aria-label="操作モード">
        <button id="tab-workflow" class="mainTab active" role="tab" aria-selected="true" aria-controls="page-workflow" data-page="workflow"><span class="tabIcon" aria-hidden="true">◇</span><span>フロー</span></button>
        <button id="tab-legacy" class="mainTab" role="tab" aria-selected="false" aria-controls="page-legacy" tabindex="-1" data-page="legacy"><span class="tabIcon" aria-hidden="true">◎</span><span>マクロ</span></button>
        <button id="tab-logs" class="mainTab" role="tab" aria-selected="false" aria-controls="page-logs" tabindex="-1" data-page="logs"><span class="tabIcon" aria-hidden="true">≡</span><span>ログ</span></button>
        <button id="tab-settings" class="mainTab" role="tab" aria-selected="false" aria-controls="page-settings" tabindex="-1" data-page="settings"><span class="tabIcon" aria-hidden="true">⚙</span><span>設定</span></button>
      </div>
      <div class="fullOnly" id="pages">
        <section id="page-workflow" class="page active" role="tabpanel" aria-labelledby="tab-workflow">
          <header class="pageIntro">
            <div class="pageIntroText">
              <span class="eyebrow">Workflow builder</span>
              <h2>オートフローを設計</h2>
              <p>ブロックを組み合わせて、実行順と条件を視覚的に設定します。</p>
            </div>
            <div class="shortcutHint" aria-label="キーボードショートカット"><kbd>⌘</kbd><kbd>↵</kbd><span>実行 / 停止</span></div>
          </header>
          <div id="workflowError" class="errorBox" role="alert" aria-live="assertive" tabindex="-1">
            <div id="workflowErrorMessage" class="errorMessage"></div>
            <div class="errorActions">
              <button id="workflowErrorRetry" class="primary">再実行</button>
              <button id="workflowErrorLogs">詳細ログ</button>
              <button id="workflowErrorDismiss" class="ghost">閉じる</button>
            </div>
          </div>
          <div id="externalConflict" class="errorBox conflictBox" role="alert" tabindex="-1">
            <strong>別のタブでワークフローが更新されました</strong>
            <p>自動上書きを停止しています。利用する内容を選んでください。</p>
            <div class="errorActions">
              <button id="loadExternalWorkflows" class="primary">別タブ版を読み込む</button>
              <button id="keepLocalWorkflows">このタブを優先</button>
              <button id="backupConflictWorkflows" class="ghost">現在版をJSON出力</button>
            </div>
          </div>
          <details id="workflowSettingsPanel" class="card workflowSettings" open>
            <summary class="cardHeader">
              <div class="cardTitleGroup">
                <span class="sectionIcon" aria-hidden="true">◇</span>
                <div class="cardHeading" role="heading" aria-level="3"><strong>ワークフロー設定</strong><small>保存と実行方法を管理</small></div>
              </div>
              <span id="autosaveState" class="hint saveState" role="status" aria-live="polite" data-state="saved">保存済み</span>
            </summary>
            <div class="grid2">
              <label class="field span2"><span>ワークフロー</span><select id="workflowSelect"></select></label>
              <label class="field span2"><span>表示名</span><input id="workflowName" maxlength="60" autocomplete="off"></label>
              <label class="field"><span>実行回数</span><input id="workflowLoopCount" type="number" min="1" max="999999" inputmode="numeric"></label>
              <label class="field"><span>ループ方式</span><select id="workflowLoopMode"><option value="count">指定回数</option><option value="infinite">無限ループ</option></select></label>
            </div>
            <div class="toolbar workflowActions">
              <button id="newWorkflow" class="secondaryAction">＋ 新規</button>
              <button id="renameWorkflow" class="secondaryAction">名前を保存</button>
              <button id="duplicateWorkflow" class="secondaryAction">複製</button>
              <button id="deleteWorkflow" class="danger">削除</button>
              <button id="exportWorkflow" class="ghost">JSON出力</button>
              <button id="exportAllWorkflows" class="ghost">全フロー出力</button>
              <button id="importWorkflow" class="ghost">JSON読込</button>
              <button id="restoreCheckpoint" class="ghost" disabled>復旧ポイント</button>
            </div>
          </details>
          <article class="card templateCard">
            <div class="cardHeader">
              <div class="cardTitleGroup">
                <span class="sectionIcon" aria-hidden="true">✦</span>
                <div class="cardHeading" role="heading" aria-level="3"><strong>クイックスタート</strong><small>完成テンプレートから始める</small></div>
              </div>
              <span class="hint">読込後も編集できます</span>
            </div>
            <div class="grid2"><label class="field span2"><span>テンプレート</span><select id="templateSelect"></select></label></div>
            <div class="toolbar templateActions">
              <button id="replaceTemplate" class="primary">現在の内容と置換</button>
              <button id="appendTemplate">末尾へ追加</button>
            </div>
          </article>
          <details class="card paletteCard">
            <summary class="cardTitle">
              <div class="cardTitleGroup">
                <span class="sectionIcon" aria-hidden="true">＋</span>
                <div class="cardHeading" role="heading" aria-level="3"><strong>ブロックライブラリ</strong><small>検索してフローへ追加</small></div>
              </div>
            </summary>
            <div class="paletteContent">
              <div class="paletteControls">
                <div class="paletteSearchWrap"><label class="srOnly" for="paletteSearch">ブロックを検索</label><input id="paletteSearch" type="search" placeholder="ブロックを検索..." autocomplete="off"></div>
                <div class="paletteFilters" role="group" aria-label="ブロックカテゴリ">
                  <button class="paletteFilter" data-category="all" aria-pressed="true">すべて</button>
                  <button class="paletteFilter" data-category="gbf" aria-pressed="false">ゲーム</button>
                  <button class="paletteFilter" data-category="control" aria-pressed="false">制御</button>
                  <button class="paletteFilter" data-category="wait" aria-pressed="false">待機</button>
                  <button class="paletteFilter" data-category="frame" aria-pressed="false">画面</button>
                </div>
              </div>
              <div id="insertionNotice" class="insertionNotice">
                <span class="hint" id="insertHint">フローの末尾へ追加します。各ブロックから挿入先を変更できます。</span>
                <button id="clearInsertion" class="ghost" type="button">解除</button>
              </div>
              <span id="paletteStatus" class="srOnly" role="status" aria-live="polite"></span>
              <div id="palette" class="paletteGrid"></div>
            </div>
          </details>
          <article class="card editorCard">
            <div class="cardHeader">
              <div class="cardTitleGroup">
                <span class="sectionIcon" aria-hidden="true">⌁</span>
                <div class="cardHeading" role="heading" aria-level="3"><strong>フローステップ</strong><small>上から順に実行</small></div>
              </div>
              <span id="workflowStats" class="hint statsPill"></span>
            </div>
            <div class="toolbar compactActions historyActions" role="group" aria-label="編集履歴とブロック表示操作">
              <button id="undoWorkflow" class="ghost" title="元に戻す（Ctrl/⌘ + Z）" disabled>↶ 元に戻す</button>
              <button id="redoWorkflow" class="ghost" title="やり直す（Ctrl/⌘ + Shift + Z）" disabled>↷ やり直す</button>
              <button id="expandAllBlocks" class="ghost">すべて展開</button>
              <button id="collapseAllBlocks" class="ghost">すべて折りたたむ</button>
            </div>
            <div id="workflowEditor"></div>
          </article>
          <div id="runBar" role="group" aria-label="ワークフロー実行操作">
            <div id="validationBar" data-tone="idle">
              <div class="validationText"><strong id="validationTitle">実行前チェック</strong><small id="validationMessage">変更内容は実行時に自動確認されます</small></div>
              <button id="validationFocus" class="ghost" hidden>問題を確認</button>
              <button id="validateWorkflow" class="ghost">チェック</button>
            </div>
            <button id="runWorkflow">▶ フローを実行</button>
            <button id="stopWorkflow" disabled>■ 停止</button>
          </div>
        </section>
        <section id="page-legacy" class="page" role="tabpanel" aria-labelledby="tab-legacy" hidden>
          <header class="pageIntro">
            <div class="pageIntroText"><span class="eyebrow">Classic macro</span><h2>固定マクロ</h2><p>クリック位置やURL移動を、従来形式のまま管理します。</p></div>
          </header>
          <article class="card">
            <div class="cardHeader">
              <div class="cardTitleGroup"><span class="sectionIcon" aria-hidden="true">＋</span><div class="cardHeading" role="heading" aria-level="3"><strong>アクションを追加</strong><small>v1〜v12 保存データ互換</small></div></div>
            </div>
            <div class="toolbar">
              <button id="legacyAddClick">クリック</button>
              <button id="legacyAddNavigate">URL移動</button>
              <button id="legacyAddWait">条件待ち</button>
              <button id="legacyRecord" class="warn">● タッチ記録</button>
            </div>
          </article>
          <article class="card">
            <div class="cardHeader"><div class="cardTitleGroup"><span class="sectionIcon" aria-hidden="true">↻</span><div class="cardHeading" role="heading" aria-level="3"><strong>実行設定</strong><small>回数とランダム幅</small></div></div></div>
            <div class="grid3">
              <label class="field"><span>実行回数</span><input id="legacyCount" type="number" min="1" max="999999"></label>
              <label class="field"><span>時間ずれ (ms)</span><input id="legacyJitter" type="number" min="0" max="5000"></label>
              <label class="field"><span>位置ずれ (px)</span><input id="legacyPositionJitter" type="number" min="0" max="30" step="0.5"></label>
            </div>
            <div class="toolbar"><button id="legacyRun" class="success">▶ マクロを実行</button><button id="legacyStop" class="danger" disabled>■ 停止</button></div>
          </article>
          <article class="card">
            <div class="cardHeader">
              <div class="cardTitleGroup"><span class="sectionIcon" aria-hidden="true">▣</span><div class="cardHeading" role="heading" aria-level="3"><strong>保存スロット</strong><small>既存プリセットと互換</small></div></div>
            </div>
            <div class="grid3">
              <label class="field"><span>スロット</span><select id="legacyPresetSlot"></select></label>
              <label class="field span2"><span>プリセット名</span><input id="legacyPresetName" maxlength="40" autocomplete="off"></label>
            </div>
            <div class="toolbar"><button id="legacySavePreset" class="primary">保存</button><button id="legacyLoadPreset">読み込む</button><button id="legacyDeletePreset" class="danger">削除</button></div>
          </article>
          <div id="legacyActionList"></div>
        </section>
        <section id="page-logs" class="page" role="tabpanel" aria-labelledby="tab-logs" hidden>
          <header class="pageIntro">
            <div class="pageIntroText"><span class="eyebrow">Diagnostics</span><h2>実行ログ</h2><p>実行中に発生したエラーと復旧に必要な情報を確認できます。</p></div>
          </header>
          <article class="card">
            <div class="cardHeader">
              <div class="cardTitleGroup"><span class="sectionIcon" aria-hidden="true">≡</span><div class="cardHeading" role="heading" aria-level="3"><strong>エラー履歴</strong><small>直近20件を保持</small></div></div>
              <div class="toolbar compactActions"><button id="copyLogs" class="ghost">ログをコピー</button><button id="clearLogs" class="ghost">すべて消去</button></div>
            </div>
            <div id="logList" class="logList"></div>
          </article>
        </section>
        <section id="page-settings" class="page" role="tabpanel" aria-labelledby="tab-settings" hidden>
          <header class="pageIntro">
            <div class="pageIntroText"><span class="eyebrow">Runtime settings</span><h2>動作設定</h2><p>ワークフロー実行とは独立して、iframe内へ常時適用する機能を管理します。</p></div>
          </header>
          <article class="card">
            <div class="cardHeader">
              <div class="cardTitleGroup"><span class="sectionIcon" aria-hidden="true">⚡</span><div class="cardHeading" role="heading" aria-level="3"><strong>グラブル バトル</strong><small>通信・描画・音声負荷を削減</small></div></div>
            </div>
            <label class="settingToggle" for="battlePerformanceToggle">
              <input id="battlePerformanceToggle" type="checkbox">
              <span class="settingToggleCopy"><strong>バトル軽量化・高速化</strong><small>CJS画像と背景画像を透明データへ置換し、CreateJSの描画走査とバトル音声を止め、表示専用演出を最短化します。Ticker・バトルロジック・Tween・タイムラインは維持します。</small></span>
            </label>
            <div class="settingNote">設定をONにすると、フローの実行ボタンを押していなくても常時有効です。現在のiframeへ即時反映し、次回のページ読込では画像取得前から適用します。OFFにした時、すでに省略済みの画像は次の再読込から復元されます。</div>
          </article>
        </section>
      </div>
      <button id="resizeDockLeft" class="resizeHandle fullOnly" aria-label="左下からパネルの大きさを変更" title="ドラッグしてサイズ変更・ダブルクリックで初期化"></button>
      <button id="resizeDockRight" class="resizeHandle fullOnly" aria-label="右下からパネルの大きさを変更" title="ドラッグしてサイズ変更・ダブルクリックで初期化"></button>
    </div>
    <div id="toast"></div>
    <div id="announcer" class="srOnly" role="status" aria-live="polite" aria-atomic="true"></div>
    <input id="importFile" type="file" accept="application/json,.json" hidden>
  `;

  const byId = id => shadow.getElementById(id);
  let iframe = byId('frame');
  const urlInput = byId('urlInput');
  const dock = byId('dock');
  const workflowEditor = byId('workflowEditor');
  const markerLayer = byId('markerLayer');
  const recordLayer = byId('recordLayer');
  const importFile = byId('importFile');

  const ui = {
    status: byId('statusText'), toast: byId('toast'), autosave: byId('autosaveState'), error: byId('workflowError'), errorMessage: byId('workflowErrorMessage'),
    browserBar: byId('browserBar'), browserHandle: byId('browserHandle'), workflowSelect: byId('workflowSelect'), workflowName: byId('workflowName'),
    templateSelect: byId('templateSelect'), palette: byId('palette'), paletteSearch: byId('paletteSearch'), paletteStatus: byId('paletteStatus'), insertHint: byId('insertHint'),
    insertionNotice: byId('insertionNotice'), clearInsertion: byId('clearInsertion'), workflowStats: byId('workflowStats'),
    workflowLoopCount: byId('workflowLoopCount'), workflowLoopMode: byId('workflowLoopMode'),
    runWorkflow: byId('runWorkflow'), stopWorkflow: byId('stopWorkflow'), legacyList: byId('legacyActionList'), legacyCount: byId('legacyCount'),
    legacyJitter: byId('legacyJitter'), legacyPositionJitter: byId('legacyPositionJitter'), legacyRun: byId('legacyRun'), legacyStop: byId('legacyStop'),
    legacyPresetSlot: byId('legacyPresetSlot'), legacyPresetName: byId('legacyPresetName'), logList: byId('logList'),
    recordToolbar: byId('recordToolbar'), recordCount: byId('recordCount'), announcer: byId('announcer'),
    elementPickerToolbar: byId('elementPickerToolbar'), elementPickerHint: byId('elementPickerHint'), elementPickerCancel: byId('elementPickerCancel'),
    undoWorkflow: byId('undoWorkflow'), redoWorkflow: byId('redoWorkflow'), validationBar: byId('validationBar'),
    validationTitle: byId('validationTitle'), validationMessage: byId('validationMessage'), validationFocus: byId('validationFocus'),
    validateWorkflow: byId('validateWorkflow'), battlePerformanceToggle: byId('battlePerformanceToggle')
  };

  const state = {
    destroyed: false,
    page: 'workflow',
    logs: [],
    toastTimer: null,
    announceFrame: null,
    autosaveTimer: null,
    workflowUndo: [],
    workflowRedo: [],
    historyRestoring: false,
    validationIssues: [],
    recoveredFromCheckpoint: false,
    externalWorkflowConflict: false,
    externalWorkflowStore: null,
    workflowStorageUpdatedAt: 0,
    workflowStorageFingerprint: '',
    workflows: null,
    selectedWorkflowId: null,
    insertion: null,
    paletteCategory: 'all',
    paletteQuery: '',
    dragBlockId: null,
    running: null,
    handoffResumeId: null,
    handoffResumeAbandoned: false,
    blockProgress: new Map(),
    collapsed: new Set(),
    legacy: null,
    legacyRunning: null,
    selectedLegacyId: null,
    nextLegacyId: 1,
    recording: false,
    recordedPoints: [],
    recordStartedAt: 0,
    recordReturnFocus: null,
    activeRecordPointers: new Map(),
    elementPicker: null,
    pendingAutoAttack: null,
    battleEndArmed: false,
    battleEndArmedAt: 0,
    activeBattleDocument: null,
    activeBattleStatus: null,
    expectedBattleRaidId: '',
    runningCard: null,
    runningBadge: null,
    dockX: null,
    dockY: null,
    dockWidth: null,
    dockHeight: null,
    hostRuntimeReleased: Boolean(window[HOST_RUNTIME_RELEASED_KEY]),
    telemetryTimers: new Set(),
    frameGeneration: 0,
    frameNavigationId: 0,
    battlePerformanceEnabled: readBattlePerformanceSetting()
  };

  const cleanup = new Set();
  const frameLifecycleSubscribers = new Set();
  const addCleanup = fn => (cleanup.add(fn), fn);
  const notifyFrameLifecycle = (previousFrame, nextFrame, phase = 'attach') => {
    for (const subscriber of [...frameLifecycleSubscribers]) {
      try { subscriber({ previousFrame, nextFrame, phase }); } catch {}
    }
  };
  const deepClone = value => JSON.parse(JSON.stringify(value));
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const int = (value, fallback = 0) => Math.round(finite(value, fallback));
  const nowId = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const instanceId = nowId('instance');
  const sleepMicrotask = () => new Promise(resolve => queueMicrotask(resolve));

  const supportsNativeBlockDrag = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true;
  const lightweightMode = window.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false;
  function isAndroidPhone() {
    const userAgent = String(navigator.userAgent || '');
    const mobileHint = navigator.userAgentData?.mobile === true || /\bMobile\b/i.test(userAgent);
    return /\bAndroid\b/i.test(userAgent) && mobileHint;
  }
  function isNarrowViewport() {
    if (isAndroidPhone()) return true;
    if (window.matchMedia?.('(max-width: 620px)').matches) return true;
    return [window.visualViewport?.width, window.screen?.width, window.innerWidth].some(value => {
      const width = Number(value);
      return Number.isFinite(width) && width > 0 && width <= 620;
    });
  }
  let narrowScreen = isNarrowViewport();
  dock.classList.toggle('narrowViewport', narrowScreen);
  dock.classList.toggle('androidCompact', isAndroidPhone());
  const dragLock = { active: false, pointerId: null, owner: null, restore: null, cancel: null };


  function bootstrapBattlePerformanceFrameRuntime(win) {
    if (!win || win === window) return null;
    try {
      if (new URL(win.location.href).origin !== location.origin) return null;
      let runtime = win[BATTLE_PERFORMANCE_RUNTIME_KEY];
      if (runtime?.version !== 2) {
        try { runtime?.destroy?.(); } catch {}
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

  function setBattlePerformanceEnabled(next, { notify = true } = {}) {
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
    syncBattlePerformanceFrame();
    if (notify) toast(state.battlePerformanceEnabled ? 'バトル軽量化・高速化をONにしました' : 'バトル軽量化・高速化をOFFにしました');
    return true;
  }

  function consumeDragEvent(event, immediate = false) {
    if (event?.cancelable) event.preventDefault();
    if (immediate) event?.stopImmediatePropagation?.();
    else event?.stopPropagation?.();
  }

  function cancelActiveDrag(reason = 'cancel') {
    if (!dragLock.active) return;
    const cancel = dragLock.cancel;
    dragLock.cancel = null;
    try {
      cancel?.(reason);
    } finally {
      if (dragLock.active) releaseDragLock();
    }
  }

  function acquireDragLock(event, owner, cancel = null) {
    cancelActiveDrag('replaced');
    consumeDragEvent(event, true);
    dragLock.active = true;
    dragLock.pointerId = event.pointerId;
    dragLock.owner = owner;
    dragLock.cancel = cancel;
    root.classList.add('ui-dragging');
    owner?.classList?.add('is-dragging');
    try { owner?.setPointerCapture?.(event.pointerId); } catch {}

    const targets = [document.documentElement, document.body].filter(Boolean);
    const properties = ['touchAction', 'overscrollBehavior', 'userSelect', 'webkitUserSelect'];
    const snapshots = targets.map(target => [target, Object.fromEntries(properties.map(property => [property, target.style[property]]))]);
    for (const target of targets) {
      target.style.touchAction = 'none';
      target.style.overscrollBehavior = 'none';
      target.style.userSelect = 'none';
      target.style.webkitUserSelect = 'none';
    }
    dragLock.restore = () => {
      for (const [target, snapshot] of snapshots) {
        for (const property of properties) target.style[property] = snapshot[property];
      }
    };
  }

  function releaseDragLock(event = null, owner = dragLock.owner) {
    if (!dragLock.active) return;
    if (event && dragLock.pointerId != null && event.pointerId != null && event.pointerId !== dragLock.pointerId) return;
    consumeDragEvent(event, true);
    const pointerId = dragLock.pointerId;
    const restore = dragLock.restore;
    dragLock.active = false;
    dragLock.pointerId = null;
    dragLock.owner = null;
    dragLock.restore = null;
    dragLock.cancel = null;
    owner?.classList?.remove('is-dragging');
    root.classList.remove('ui-dragging');
    try {
      if (owner?.hasPointerCapture?.(pointerId)) owner.releasePointerCapture(pointerId);
    } catch {}
    try { restore?.(); } catch {}
  }

  const suppressNativeDrag = event => {
    if (dragLock.active) consumeDragEvent(event, true);
  };
  for (const type of ['touchmove', 'gesturestart', 'gesturechange']) {
    window.addEventListener(type, suppressNativeDrag, { capture: true, passive: false });
  }
  const cancelDragOnBlur = () => {
    cancelActiveDrag('blur');
    cancelActiveRecordPointers();
  };
  const cancelDragOnPageHide = () => {
    cancelActiveDrag('pagehide');
    cancelActiveRecordPointers();
  };
  const cancelDragOnVisibilityChange = () => {
    if (document.visibilityState !== 'hidden') return;
    cancelActiveDrag('hidden');
    cancelActiveRecordPointers();
  };
  const cancelDragOnLostCapture = event => {
    if (
      dragLock.active
      && event.target === dragLock.owner
      && (dragLock.pointerId == null || event.pointerId === dragLock.pointerId)
    ) cancelActiveDrag('lostpointercapture');
  };
  window.addEventListener('blur', cancelDragOnBlur, true);
  window.addEventListener('pagehide', cancelDragOnPageHide, true);
  document.addEventListener('visibilitychange', cancelDragOnVisibilityChange, true);
  shadow.addEventListener('lostpointercapture', cancelDragOnLostCapture, true);
  addCleanup(() => {
    cancelActiveDrag('destroy');
    for (const type of ['touchmove', 'gesturestart', 'gesturechange']) {
      window.removeEventListener(type, suppressNativeDrag, true);
    }
    window.removeEventListener('blur', cancelDragOnBlur, true);
    window.removeEventListener('pagehide', cancelDragOnPageHide, true);
    document.removeEventListener('visibilitychange', cancelDragOnVisibilityChange, true);
    shadow.removeEventListener('lostpointercapture', cancelDragOnLostCapture, true);
  });

  function pointerDragThreshold(event) {
    if (event?.pointerType === 'touch') return 9;
    if (event?.pointerType === 'pen') return 6;
    return 3;
  }

  function normalizePopupText(value) {
    return String(value ?? '').replace(/\s+/g, '').trim();
  }

  const NORMALIZED_ERRORS = Object.fromEntries(
    Object.entries(ERROR_MESSAGES).map(([key, value]) => [key, normalizePopupText(value)])
  );

  function announce(message) {
    const next = String(message ?? '');
    if (state.announceFrame) cancelAnimationFrame(state.announceFrame);
    ui.announcer.textContent = '';
    state.announceFrame = requestAnimationFrame(() => {
      state.announceFrame = null;
      if (!state.destroyed) ui.announcer.textContent = next;
    });
  }

  function setStatus(message) {
    const next = String(message ?? '');
    if (lightweightMode && (state.running || state.legacyRunning) && !/(?:エラー|停止|完了)/.test(next)) return;
    if (ui.status.textContent !== next) {
      ui.status.textContent = next;
      announce(next);
    }
    const tone = /(?:エラー|失敗)/.test(next)
      ? 'error'
      : /停止/.test(next)
        ? 'warn'
        : /(?:完了|準備完了|保存済み)/.test(next)
          ? 'success'
          : /(?:読込中|記録中)/.test(next)
            ? 'running'
            : (state.running || state.legacyRunning || state.recording)
            ? 'running'
            : 'idle';
    ui.status.dataset.tone = tone;
    ui.status.title = next;
  }

  function toast(message) {
    clearTimeout(state.toastTimer);
    const next = String(message ?? '');
    ui.toast.textContent = next;
    ui.toast.classList.add('show');
    announce(next);
    state.toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2200);
  }

  function createLogRow(log) {
    const row = document.createElement('div');
    row.className = `logEntry ${log.level || ''}`;
    const time = document.createElement('span');
    time.className = 'logTime';
    time.textContent = log.time;
    const name = document.createElement('span');
    name.textContent = log.blockName || '全体';
    const body = document.createElement('span');
    body.textContent = log.message;
    row.append(time, name, body);
    return row;
  }

  let logScrollFrame = 0;

  function scheduleLogScroll() {
    if (logScrollFrame || state.destroyed || state.page !== 'logs') return;
    logScrollFrame = requestAnimationFrame(() => {
      logScrollFrame = 0;
      if (!state.destroyed && state.page === 'logs') ui.logList.scrollTop = ui.logList.scrollHeight;
    });
  }

  addCleanup(() => {
    if (logScrollFrame) cancelAnimationFrame(logScrollFrame);
    logScrollFrame = 0;
  });

  function appendLog(message, level = '', blockName = '') {
    if (level !== 'error') return;
    const log = {
      time: LOG_TIME_FORMATTER.format(new Date()),
      level,
      blockName,
      message: String(message)
    };
    state.logs.push(log);
    if (state.logs.length > MAX_LOGS) state.logs.splice(0, state.logs.length - MAX_LOGS);
    byId('copyLogs').disabled = false;
    byId('clearLogs').disabled = false;
    if (state.page !== 'logs') return;
    ui.logList.querySelector('.logEmpty')?.remove();
    ui.logList.append(createLogRow(log));
    while (ui.logList.children.length > MAX_LOGS) ui.logList.firstElementChild?.remove();
    scheduleLogScroll();
  }

  function renderLogs() {
    ui.logList.textContent = '';
    byId('copyLogs').disabled = !state.logs.length;
    byId('clearLogs').disabled = !state.logs.length;
    if (!state.logs.length) {
      const empty = document.createElement('div');
      empty.className = 'empty logEmpty';
      empty.textContent = 'エラーが発生するとここに記録されます。';
      ui.logList.append(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const log of state.logs.slice(-MAX_LOGS)) fragment.append(createLogRow(log));
    ui.logList.append(fragment);
    scheduleLogScroll();
  }

  async function copyErrorLogs() {
    if (!state.logs.length) return toast('コピーできるエラーログはありません');
    const text = [
      `AutoFlow Studio v${APP_VERSION}`,
      `出力日時: ${new Date().toLocaleString('ja-JP')}`,
      ...state.logs.map(log => `[${log.time}] [${log.blockName || '全体'}] ${log.message}`)
    ].join('\n');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(text);
    } catch {
      const active = shadow.activeElement;
      const textarea = element('textarea', { attrs: { 'aria-hidden': 'true' } });
      textarea.value = text;
      Object.assign(textarea.style, { position: 'fixed', left: '-9999px', opacity: '0' });
      shadow.append(textarea);
      textarea.select();
      const copied = document.execCommand?.('copy');
      textarea.remove();
      active?.focus?.({ preventScroll: true });
      if (!copied) return toast('ログをコピーできませんでした');
    }
    toast(`${state.logs.length}件のエラーログをコピーしました`);
  }

  function showWorkflowError(error, block = null) {
    const workflow = currentWorkflow();
    const screen = safeDetectScreenState();
    const message = error?.message || String(error);
    const code = typeof error?.code === 'string' && error.code
      ? error.code
      : (error?.name && error.name !== 'Error' ? error.name : 'UNEXPECTED_ERROR');
    ui.errorMessage.textContent = `ワークフロー: ${workflow?.name || '不明'} / ブロック: ${block ? blockLabel(block.type) : '不明'} / 画面: ${screen.type} / コード: ${code} / 理由: ${message}`;
    ui.error.classList.add('show');
    appendLog(`[${code}] ${workflow?.name || '不明'} / ${screen.type}: ${message}`, 'error', block ? blockLabel(block.type) : '実行');
    setPage('workflow');
    requestAnimationFrame(() => {
      const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      ui.error.scrollIntoView({ block: 'start', behavior });
      ui.error.focus({ preventScroll: true });
    });
  }

  function clearWorkflowError({ restoreFocus = true } = {}) {
    const hadFocus = ui.error.contains(shadow.activeElement);
    ui.error.classList.remove('show');
    ui.errorMessage.textContent = '';
    if (hadFocus && restoreFocus) requestAnimationFrame(() => ui.runWorkflow.focus({ preventScroll: true }));
  }

  const CONDITION_OPTIONS = Object.freeze([
    ['gbfFullAutoOn', 'フルオートがON'],
    ['gbfFullAutoOff', 'フルオートがOFF'],
    ['gbfAttacking', 'フルオート攻撃中'],
    ['gbfAttackWaiting', '攻撃待機中'],
    ['gbfBattleEnded', '戦闘が終了した'],
    ['gbfBattle', 'バトル画面である'],
    ['gbfAssist', '救援一覧である'],
    ['gbfUnclaimedEmpty', '未確認バトルが0件'],
    ['selectorVisible', '指定セレクタが表示'],
    ['selectorHidden', '指定セレクタが非表示'],
    ['selectorExists', '指定セレクタが存在'],
    ['selectorMissing', '指定セレクタが消失'],
    ['pageReady', 'ページ読込完了'],
    ['urlContains', 'URLに文字を含む']
  ]);

  const BLOCK_DEFINITIONS = Object.freeze({
    gbfAssistSelect: { category: 'gbf', label: '救援を評価して参加する（HP以上）', description: '設定HP以上と人数を評価し、例外・サポーター・編成確認まで処理' },
    gbfAssistSelectBelow: { category: 'gbf', label: '救援を評価して参加する（HP以下）', description: '設定HP以下と人数を評価し、例外・サポーター・編成確認まで処理' },
    gbfSupporterAuto: { category: 'gbf', label: 'サポーターを自動選択する', description: 'ゲーム側の自動選択ボタンをtap' },
    gbfSupporterConditional: { category: 'gbf', label: 'サポーターを条件選択する', description: '第1〜第3候補と最高レベルフォールバック' },
    gbfDeckConfirm: { category: 'gbf', label: '編成確認OKを押す', description: '前面エラーを優先して編成開始を確認' },
    gbfUnclaimedAll: { category: 'gbf', label: '未確認バトルをすべて確認する', description: '1ページ目の最上段を0件まで処理' },
    gbfEnsureFullAuto: { category: 'gbf', label: 'フルオートをONにする', description: 'ONなら押さず、撃破時は指定ルートから先頭へ復帰' },
    gbfWaitAutoAttack: { category: 'gbf', label: 'フルオートによる攻撃開始を待つ', description: '攻撃開始または敵撃破通知を低負荷で監視' },
    gbfRefreshAssist: { category: 'gbf', label: '救援一覧を更新する', description: '一覧更新完了をDOM変化で監視' },
    gbfMyPage: { category: 'gbf', label: 'MyPageボタンを押す', description: '即座にゲーム標準の完全再読込でMyPageへ戻る' },
    gbfReleaseResources: { category: 'gbf', label: 'Safariメモリを解放して戻る', description: '即座にMyPageを経由し、Canvas・音声・旧Viewを解放して指定画面へ戻る' },
    parentTabRestart: { category: 'frame', label: '親ページを完全再起動して続行', description: '進行位置を保存し、新しい親タブへ移譲。新規タブが拒否された場合は同じタブを完全再起動' },
    repeat: { category: 'control', label: '指定回数繰り返す', description: '子ブロックを指定回数実行', container: true },
    repeatUntil: { category: 'control', label: '条件成立まで繰り返す', description: '前判定型。成立済みなら0回', container: true },
    if: { category: 'control', label: '条件分岐', description: '成立時と不成立時の子ブロックを分岐', container: true, elseBranch: true },
    stop: { category: 'control', label: '処理を停止する', description: '正常な意図的停止' },
    fixedWait: { category: 'wait', label: '固定時間待機', description: '停止可能な固定待機' },
    randomWait: { category: 'wait', label: '指定区間をランダム待機', description: '最小〜最大の一様乱数' },
    watch: { category: 'wait', label: '要素または状態を監視する', description: 'MutationObserver中心で条件成立を待機' },
    iframeTapElement: { category: 'frame', label: '指定ボタンを押す', description: '画面上で選択したHTML要素をタップ' },
    iframeReload: { category: 'frame', label: 'iframeを再読み込みする', description: '操作前からloadとDOM変化を監視' },
    iframeBack: { category: 'frame', label: 'iframeの履歴を1つ戻る', description: 'リロードせず履歴を戻る' },
    iframeRoute: { category: 'frame', label: '指定したゲーム内ルートへ移動する', description: 'hash/ゲーム内ルートへ移動して完了待機' },
    iframeReady: { category: 'frame', label: 'ページ読込完了まで待つ', description: 'readyState・loading・主要DOM・安定化を確認' }
  });

  const CATEGORY_LABELS = Object.freeze({ gbf: 'グラブル', control: '制御', wait: '待機', frame: 'iframe' });
  const CATEGORY_META = Object.freeze({
    gbf: { label: 'ゲーム操作', description: 'グラブル固有の操作' },
    control: { label: 'フロー制御', description: '分岐・反復・停止' },
    wait: { label: '待機と監視', description: '時間・状態を待つ' },
    frame: { label: 'ページ操作', description: '移動・再読込・準備待ち' }
  });

  function blockLabel(type) {
    return BLOCK_DEFINITIONS[type]?.label || `不明ブロック (${type})`;
  }

  function defaultSupporterCandidates() {
    return [
      { name: 'ルシフェル', minimumLevel: 220 },
      { name: '', minimumLevel: 0 },
      { name: '', minimumLevel: 0 }
    ];
  }

  function defaultBlockConfig(type) {
    switch (type) {
      case 'gbfAssistSelect':
        return { minimumHp: 50, baseDelaySec: 0.6, jitterSec: 0, timeoutSec: 15, maxAttempts: 10000, assistSlots: [1], supporterCandidates: defaultSupporterCandidates() };
      case 'gbfAssistSelectBelow':
        return { maximumHp: 10, baseDelaySec: 0.6, jitterSec: 0, timeoutSec: 15, maxAttempts: 10000, assistSlots: [1], supporterCandidates: defaultSupporterCandidates() };
      case 'gbfSupporterAuto':
        return { timeoutSec: 15 };
      case 'gbfSupporterConditional':
        return { timeoutSec: 15, supporterCandidates: defaultSupporterCandidates() };
      case 'gbfDeckConfirm':
        return { timeoutSec: 30, refreshBaseDelaySec: 0.6, refreshJitterSec: 0 };
      case 'gbfUnclaimedAll':
        return { timeoutSec: 30, maxItems: 10000 };
      case 'gbfEnsureFullAuto':
      case 'gbfWaitAutoAttack':
        return {
          timeoutSec: 15,
          battleEndRoute: '#quest/assist/multi/0',
          battleEndExpectedScreen: 'assist',
          memoryReliefEveryBattles: 3,
          memoryReliefSettleSec: 1.5
        };
      case 'gbfRefreshAssist':
        return { baseDelaySec: 0.6, jitterSec: 0, timeoutSec: 15 };
      case 'gbfMyPage':
        return { timeoutSec: 45, settleSec: 1.5 };
      case 'gbfReleaseResources':
        return { destination: 'assist', timeoutSec: 45, settleSec: 2 };
      case 'repeat':
        return { count: 5 };
      case 'repeatUntil':
        return { condition: { type: 'gbfBattle', selector: '', value: '' }, maxIterations: 10000, maxDurationSec: 600 };
      case 'if':
        return { condition: { type: 'gbfBattle', selector: '', value: '' } };
      case 'stop':
        return { reason: '停止ブロックに到達しました' };
      case 'fixedWait':
        return { seconds: 1 };
      case 'randomWait':
        return { minSeconds: 0.5, maxSeconds: 0.8 };
      case 'watch':
        return { condition: { type: 'selectorVisible', selector: '', value: '' }, timeoutSec: 30, stableMs: 100 };
      case 'iframeTapElement':
        return { selector: '', targetLabel: '', timeoutSec: 30 };
      case 'iframeReload':
      case 'iframeBack':
        return { timeoutSec: 30 };
      case 'iframeRoute':
        return { route: '#quest/assist/multi/0', timeoutSec: 30 };
      case 'iframeReady':
        return { timeoutSec: 30 };
      default:
        return {};
    }
  }

  function createBlock(type, overrides = {}) {
    const definition = BLOCK_DEFINITIONS[type];
    if (!definition) throw new Error(`未対応のブロックです: ${type}`);
    const block = {
      type,
      id: nowId('block'),
      config: { ...defaultBlockConfig(type), ...(overrides.config || {}) }
    };
    if (definition.container) block.children = Array.isArray(overrides.children) ? overrides.children.map(normalizeBlock) : [];
    if (definition.elseBranch) block.elseChildren = Array.isArray(overrides.elseChildren) ? overrides.elseChildren.map(normalizeBlock) : [];
    return block;
  }

  function normalizeAssistSlots(value) {
    const raw = Array.isArray(value) ? value : [value];
    const slots = [...new Set(raw.map(item => int(item, 0)).filter(item => item >= 1 && item <= 4))]
      .sort((a, b) => a - b);
    return slots.length ? slots : [1];
  }

  function normalizeCandidates(value) {
    const raw = Array.isArray(value) ? value : [];
    return [0, 1, 2].map(index => ({
      name: String(raw[index]?.name || '').trim(),
      minimumLevel: clamp(int(raw[index]?.minimumLevel, 0), 0, 9999)
    }));
  }

  function normalizeConditionConfig(value) {
    const condition = value && typeof value === 'object' ? value : {};
    const allowed = CONDITION_OPTIONS.map(option => option[0]);
    return {
      type: allowed.includes(condition.type) ? condition.type : 'gbfBattle',
      selector: String(condition.selector || '').trim(),
      value: String(condition.value || '')
    };
  }

  function normalizeBlock(raw) {
    if (!raw || typeof raw !== 'object') return createBlock('fixedWait');
    const type = BLOCK_DEFINITIONS[raw.type] ? raw.type : 'stop';
    const block = createBlock(type);
    block.id = String(raw.id || nowId('block'));
    const config = raw.config && typeof raw.config === 'object' ? raw.config : {};
    switch (type) {
      case 'gbfAssistSelect':
        block.config = {
          minimumHp: clamp(finite(config.minimumHp, 50), 0, 100),
          baseDelaySec: clamp(finite(config.baseDelaySec, 0.6), 0, 600),
          jitterSec: clamp(finite(config.jitterSec, 0), 0, 600),
          timeoutSec: clamp(finite(config.timeoutSec, 15), 1, 600),
          maxAttempts: clamp(int(config.maxAttempts, 10000), 1, 100000),
          assistSlots: normalizeAssistSlots(config.assistSlots),
          supporterCandidates: normalizeCandidates(config.supporterCandidates)
        };
        break;
      case 'gbfAssistSelectBelow':
        block.config = {
          maximumHp: clamp(finite(config.maximumHp, 10), 0, 100),
          baseDelaySec: clamp(finite(config.baseDelaySec, 0.6), 0, 600),
          jitterSec: clamp(finite(config.jitterSec, 0), 0, 600),
          timeoutSec: clamp(finite(config.timeoutSec, 15), 1, 600),
          maxAttempts: clamp(int(config.maxAttempts, 10000), 1, 100000),
          assistSlots: normalizeAssistSlots(config.assistSlots),
          supporterCandidates: normalizeCandidates(config.supporterCandidates)
        };
        break;
      case 'gbfSupporterConditional':
        block.config = { timeoutSec: clamp(finite(config.timeoutSec, 15), 1, 600), supporterCandidates: normalizeCandidates(config.supporterCandidates) };
        break;
      case 'gbfSupporterAuto':
        block.config = { timeoutSec: clamp(finite(config.timeoutSec, 15), 1, 600) };
        break;
      case 'gbfEnsureFullAuto':
      case 'gbfWaitAutoAttack':
        block.config = {
          timeoutSec: clamp(finite(config.timeoutSec, 15), 1, 600),
          battleEndRoute: String(config.battleEndRoute || '#quest/assist/multi/0').trim() || '#quest/assist/multi/0',
          battleEndExpectedScreen: normalizeExpectedScreen(config.battleEndExpectedScreen || 'assist'),
          memoryReliefEveryBattles: clamp(int(config.memoryReliefEveryBattles, 3), 0, 100),
          memoryReliefSettleSec: clamp(finite(config.memoryReliefSettleSec, 1.5), 0, 30)
        };
        break;
      case 'gbfDeckConfirm':
        block.config = {
          timeoutSec: clamp(finite(config.timeoutSec, 30), 1, 600),
          refreshBaseDelaySec: clamp(finite(config.refreshBaseDelaySec, 0.6), 0, 600),
          refreshJitterSec: clamp(finite(config.refreshJitterSec, 0), 0, 600)
        };
        break;
      case 'gbfUnclaimedAll':
        block.config = { timeoutSec: clamp(finite(config.timeoutSec, 30), 1, 600), maxItems: clamp(int(config.maxItems, 10000), 1, 100000) };
        break;
      case 'gbfRefreshAssist':
        block.config = {
          baseDelaySec: clamp(finite(config.baseDelaySec, 0.6), 0, 600),
          jitterSec: clamp(finite(config.jitterSec, 0), 0, 600),
          timeoutSec: clamp(finite(config.timeoutSec, 15), 1, 600)
        };
        break;
      case 'gbfMyPage':
        block.config = {
          timeoutSec: clamp(finite(config.timeoutSec, 45), 1, 600),
          settleSec: clamp(finite(config.settleSec, 1.5), 0, 30)
        };
        break;
      case 'gbfReleaseResources':
        block.config = {
          destination: ['assist', 'mypage', 'current'].includes(config.destination) ? config.destination : 'assist',
          timeoutSec: clamp(finite(config.timeoutSec, 45), 1, 600),
          settleSec: clamp(finite(config.settleSec, 2), 0, 30)
        };
        break;
      case 'repeat':
        block.config = { count: clamp(int(config.count, 5), 0, MAX_REPEAT_COUNT) };
        break;
      case 'repeatUntil':
        block.config = {
          condition: normalizeConditionConfig(config.condition),
          maxIterations: clamp(int(config.maxIterations, MAX_CONDITION_ITERATIONS), 1, 100000),
          maxDurationSec: clamp(finite(config.maxDurationSec, 600), 1, 86400)
        };
        break;
      case 'if':
        block.config = { condition: normalizeConditionConfig(config.condition) };
        break;
      case 'stop':
        block.config = { reason: String(config.reason || '停止ブロックに到達しました').slice(0, 300) };
        break;
      case 'fixedWait':
        block.config = { seconds: clamp(finite(config.seconds, 1), 0, 86400) };
        break;
      case 'randomWait':
        block.config = {
          minSeconds: clamp(finite(config.minSeconds, 0.5), 0, 86400),
          maxSeconds: clamp(finite(config.maxSeconds, 0.8), 0, 86400)
        };
        break;
      case 'watch':
        block.config = {
          condition: normalizeConditionConfig(config.condition),
          timeoutSec: clamp(finite(config.timeoutSec, 30), 0, 86400),
          stableMs: clamp(int(config.stableMs, 100), 0, 5000)
        };
        break;
      case 'iframeTapElement':
        block.config = {
          selector: String(config.selector || '').trim().slice(0, 1000),
          targetLabel: String(config.targetLabel || '').trim().slice(0, 120),
          timeoutSec: clamp(finite(config.timeoutSec, 30), 1, 600)
        };
        break;
      case 'iframeReload':
      case 'iframeBack':
      case 'iframeReady':
        block.config = {
          timeoutSec: clamp(finite(config.timeoutSec, 30), 1, 600)
        };
        break;
      case 'iframeRoute':
        block.config = {
          route: String(config.route || '#quest/assist/multi/0').trim(),
          timeoutSec: clamp(finite(config.timeoutSec, 30), 1, 600)
        };
        break;
    }
    if (BLOCK_DEFINITIONS[type].container) block.children = (Array.isArray(raw.children) ? raw.children : []).map(normalizeBlock);
    if (BLOCK_DEFINITIONS[type].elseBranch) block.elseChildren = (Array.isArray(raw.elseChildren) ? raw.elseChildren : []).map(normalizeBlock);
    return block;
  }

  function normalizeExpectedScreen(value) {
    const allowed = ['auto', 'assist', 'supporter', 'unclaimed', 'battle', 'result', 'mypage'];
    return allowed.includes(value) ? value : 'auto';
  }

  function normalizeWorkflow(raw, index = 0) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
      version: 1,
      id: String(source.id || nowId('workflow')),
      name: String(source.name || `ワークフロー ${index + 1}`).trim().slice(0, 60) || `ワークフロー ${index + 1}`,
      blocks: (Array.isArray(source.blocks) ? source.blocks : []).map(normalizeBlock),
      loopCount: clamp(int(source.loopCount, 1), 1, MAX_WORKFLOW_LOOP_COUNT),
      loopInfinite: Boolean(source.loopInfinite),
      createdAt: finite(source.createdAt, Date.now()),
      updatedAt: finite(source.updatedAt, Date.now())
    };
  }

  function defaultWorkflow() {
    return normalizeWorkflow({
      name: '救援フルオート',
      blocks: [
        createBlock('gbfAssistSelect'),
        createBlock('gbfEnsureFullAuto'),
        createBlock('gbfWaitAutoAttack')
      ]
    });
  }

  function repairWorkflowStoreIds(workflows) {
    const workflowIds = new Set();
    const blockIds = new Set();
    for (const workflow of workflows) {
      if (workflowIds.has(workflow.id)) workflow.id = nowId('workflow');
      workflowIds.add(workflow.id);
      walkBlocks(workflow.blocks, block => {
        if (blockIds.has(block.id)) block.id = nowId('block');
        blockIds.add(block.id);
        return null;
      });
    }
    return workflows;
  }

  function migrateWorkflowStore(raw) {
    if (!raw) {
      const workflow = defaultWorkflow();
      return { version: 1, currentId: workflow.id, workflows: [workflow] };
    }
    if (Array.isArray(raw)) {
      const workflows = repairWorkflowStoreIds(raw.map(normalizeWorkflow));
      const fallback = workflows[0] || defaultWorkflow();
      return { version: 1, currentId: fallback.id, workflows: workflows.length ? workflows : [fallback] };
    }
    if (Array.isArray(raw.blocks)) {
      const workflow = normalizeWorkflow(raw);
      repairWorkflowStoreIds([workflow]);
      return { version: 1, currentId: workflow.id, workflows: [workflow] };
    }
    const workflows = repairWorkflowStoreIds((Array.isArray(raw.workflows) ? raw.workflows : []).map(normalizeWorkflow));
    if (!workflows.length) workflows.push(defaultWorkflow());
    const currentId = workflows.some(workflow => workflow.id === raw.currentId) ? raw.currentId : workflows[0].id;
    return { version: 1, currentId, workflows };
  }

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  }

  function loadWorkflowStore() {
    const primary = readJson(WORKFLOW_STORAGE_KEY);
    const autosave = readJson(WORKFLOW_AUTOSAVE_KEY);
    const checkpoint = readJson(WORKFLOW_CHECKPOINT_KEY);
    let source = autosave?.updatedAt > (primary?.updatedAt || 0) ? autosave.store : primary;
    if (!source && checkpoint?.store?.workflows?.length) {
      source = checkpoint.store;
      state.recoveredFromCheckpoint = true;
    }
    state.workflows = migrateWorkflowStore(source);
    state.selectedWorkflowId = state.workflows.currentId;
    state.workflowStorageUpdatedAt = finite(source?.updatedAt, 0);
    state.workflowStorageFingerprint = source ? JSON.stringify(source) : '';
  }

  function workflowStoreSnapshot() {
    return {
      version: 1,
      currentId: state.selectedWorkflowId,
      workflows: state.workflows.workflows.map(workflow => normalizeWorkflow(workflow)),
      updatedAt: Date.now(),
      writerId: instanceId
    };
  }

  function workflowStateSnapshot() {
    return deepClone({
      version: 1,
      currentId: state.selectedWorkflowId,
      workflows: state.workflows.workflows
    });
  }

  function setAutosaveStatus(status) {
    const labels = { saving: '保存中', saved: '保存済み', error: '保存失敗', conflict: '別タブ更新あり' };
    ui.autosave.textContent = labels[status] || labels.saved;
    ui.autosave.dataset.state = status;
  }

  function persistWorkflowStore({ force = false } = {}) {
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = null;
    if (state.externalWorkflowConflict && !force) {
      setAutosaveStatus('conflict');
      return false;
    }
    try {
      const snapshot = workflowStoreSnapshot();
      const serialized = JSON.stringify(snapshot);
      localStorage.setItem(WORKFLOW_STORAGE_KEY, serialized);
      localStorage.setItem(WORKFLOW_AUTOSAVE_KEY, JSON.stringify({ updatedAt: snapshot.updatedAt, store: snapshot }));
      state.workflowStorageUpdatedAt = snapshot.updatedAt;
      state.workflowStorageFingerprint = serialized;
      setAutosaveStatus('saved');
      return true;
    } catch (error) {
      setAutosaveStatus('error');
      appendLog(`ワークフロー保存失敗: ${error.message}`, 'error');
      return false;
    }
  }

  function saveWorkflowStore({ immediate = false, force = false } = {}) {
    setAutosaveStatus('saving');
    clearTimeout(state.autosaveTimer);
    if (immediate) return persistWorkflowStore({ force });
    state.autosaveTimer = setTimeout(() => persistWorkflowStore({ force }), 180);
    return true;
  }

  function flushWorkflowStore() {
    if (state.autosaveTimer) persistWorkflowStore();
  }

  function syncWorkflowHistoryControls() {
    const locked = Boolean(state.running || state.legacyRunning);
    ui.undoWorkflow.disabled = locked || !state.workflowUndo.length;
    ui.redoWorkflow.disabled = locked || !state.workflowRedo.length;
    const undoLabel = state.workflowUndo.at(-1)?.label;
    const redoLabel = state.workflowRedo.at(-1)?.label;
    ui.undoWorkflow.title = undoLabel ? `${undoLabel}を元に戻す（Ctrl/⌘ + Z）` : '元に戻せる編集はありません';
    ui.redoWorkflow.title = redoLabel ? `${redoLabel}をやり直す（Ctrl/⌘ + Shift + Z）` : 'やり直せる編集はありません';
  }

  function trimWorkflowHistory(stack) {
    while (stack.length > MAX_WORKFLOW_HISTORY) stack.shift();
    let bytes = stack.reduce((total, entry) => total + (entry.bytes || JSON.stringify(entry.snapshot).length), 0);
    while (stack.length > 1 && bytes > MAX_WORKFLOW_HISTORY_BYTES) {
      const removed = stack.shift();
      bytes -= removed.bytes || JSON.stringify(removed.snapshot).length;
    }
  }

  function commitWorkflowMutation(label, mutate) {
    if (state.historyRestoring || !state.workflows) return mutate();
    const before = workflowStateSnapshot();
    const fingerprint = JSON.stringify(before);
    let result;
    try {
      result = mutate();
    } catch (error) {
      state.workflows = migrateWorkflowStore(before);
      state.selectedWorkflowId = state.workflows.currentId;
      throw error;
    }
    if (JSON.stringify(workflowStateSnapshot()) !== fingerprint) {
      state.workflowUndo.push({ label, snapshot: before, bytes: fingerprint.length });
      trimWorkflowHistory(state.workflowUndo);
      state.workflowRedo.length = 0;
      invalidateWorkflowValidation();
      syncWorkflowHistoryControls();
      if (state.externalWorkflowConflict) saveWorkflowCheckpoint('別タブ競合中のこのタブ');
    }
    return result;
  }

  function applyWorkflowHistorySnapshot(snapshot) {
    let saved = false;
    state.historyRestoring = true;
    try {
      state.workflows = migrateWorkflowStore(deepClone(snapshot));
      state.selectedWorkflowId = state.workflows.currentId;
      state.collapsed.clear();
      resetInsertion();
      clearWorkflowError({ restoreFocus: false });
      invalidateWorkflowValidation();
      saved = saveWorkflowStore({ immediate: true });
      renderWorkflowSelect();
      syncRunControls();
    } finally {
      state.historyRestoring = false;
    }
    return saved;
  }

  function undoWorkflowChange() {
    if (state.running || state.legacyRunning) return;
    const entry = state.workflowUndo.pop();
    if (!entry) return toast('元に戻せる編集はありません');
    const current = workflowStateSnapshot();
    state.workflowRedo.push({ label: entry.label, snapshot: current, bytes: JSON.stringify(current).length });
    trimWorkflowHistory(state.workflowRedo);
    const saved = applyWorkflowHistorySnapshot(entry.snapshot);
    syncWorkflowHistoryControls();
    toast(saved ? `${entry.label}を元に戻しました` : '元に戻しましたが保存に失敗しました');
  }

  function redoWorkflowChange() {
    if (state.running || state.legacyRunning) return;
    const entry = state.workflowRedo.pop();
    if (!entry) return toast('やり直せる編集はありません');
    const current = workflowStateSnapshot();
    state.workflowUndo.push({ label: entry.label, snapshot: current, bytes: JSON.stringify(current).length });
    trimWorkflowHistory(state.workflowUndo);
    const saved = applyWorkflowHistorySnapshot(entry.snapshot);
    syncWorkflowHistoryControls();
    toast(saved ? `${entry.label}をやり直しました` : 'やり直しましたが保存に失敗しました');
  }

  function readWorkflowCheckpoint() {
    const checkpoint = readJson(WORKFLOW_CHECKPOINT_KEY);
    return checkpoint?.store?.workflows?.length ? checkpoint : null;
  }

  function syncWorkflowCheckpointControl() {
    const button = byId('restoreCheckpoint');
    const checkpoint = readWorkflowCheckpoint();
    button.disabled = Boolean(state.running || state.legacyRunning || !checkpoint);
    button.title = checkpoint
      ? `${new Date(checkpoint.savedAt).toLocaleString('ja-JP')} · ${checkpoint.label || '保存状態'}`
      : '復旧ポイントはまだありません';
  }

  function saveWorkflowCheckpoint(label) {
    try {
      localStorage.setItem(WORKFLOW_CHECKPOINT_KEY, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        label,
        store: workflowStateSnapshot()
      }));
      syncWorkflowCheckpointControl();
      return true;
    } catch (error) {
      appendLog(`復旧ポイント保存失敗: ${error.message}`, 'error');
      return false;
    }
  }

  function restoreWorkflowCheckpoint() {
    if (state.running || state.legacyRunning) return;
    const checkpoint = readWorkflowCheckpoint();
    if (!checkpoint) return toast('復旧ポイントはありません');
    const savedAt = new Date(checkpoint.savedAt).toLocaleString('ja-JP');
    if (!confirm(`${savedAt}の「${checkpoint.label || '保存状態'}」へ復元しますか？\n現在の状態も復旧ポイントとして退避します。`)) return;
    const restoreTarget = deepClone(checkpoint.store);
    saveWorkflowCheckpoint('復元前の状態');
    commitWorkflowMutation('復旧ポイントの復元', () => {
      state.workflows = migrateWorkflowStore(restoreTarget);
      state.selectedWorkflowId = state.workflows.currentId;
    });
    state.collapsed.clear();
    resetInsertion();
    const saved = saveWorkflowStore({ immediate: true });
    renderWorkflowSelect();
    syncWorkflowCheckpointControl();
    toast(saved ? '復旧ポイントを復元しました' : '復元しましたが保存に失敗しました');
  }

  function setExternalConflictVisible(visible) {
    byId('externalConflict').classList.toggle('show', visible);
  }

  function handleExternalWorkflowUpdate(event) {
    if (state.destroyed || event.key !== WORKFLOW_STORAGE_KEY || !event.newValue) return;
    let incoming;
    try { incoming = JSON.parse(event.newValue); }
    catch { return; }
    if (!Array.isArray(incoming?.workflows) || incoming.writerId === instanceId) return;
    if (event.newValue === state.workflowStorageFingerprint) return;
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = null;
    saveWorkflowCheckpoint('別タブ競合時のこのタブ');
    state.externalWorkflowConflict = true;
    state.externalWorkflowStore = incoming;
    setAutosaveStatus('conflict');
    setExternalConflictVisible(true);
    announce('別のタブでワークフローが更新されました。自動保存を停止しています');
  }

  function loadExternalWorkflowVersion() {
    if (state.running || state.legacyRunning) return;
    const incoming = state.externalWorkflowStore;
    if (!incoming) return;
    if (!confirm('このタブの未保存変更を復旧ポイントへ退避し、別タブ版を読み込みますか？')) return;
    saveWorkflowCheckpoint('別タブ版の読込前');
    state.historyRestoring = true;
    try {
      state.workflows = migrateWorkflowStore(incoming);
      state.selectedWorkflowId = state.workflows.currentId;
      state.workflowUndo.length = 0;
      state.workflowRedo.length = 0;
      state.collapsed.clear();
      resetInsertion();
      invalidateWorkflowValidation();
      state.workflowStorageUpdatedAt = finite(incoming.updatedAt, Date.now());
      state.workflowStorageFingerprint = JSON.stringify(incoming);
      state.externalWorkflowConflict = false;
      state.externalWorkflowStore = null;
      setExternalConflictVisible(false);
      setAutosaveStatus('saved');
      renderWorkflowSelect();
      syncRunControls();
    } finally {
      state.historyRestoring = false;
    }
    toast('別タブのワークフローを読み込みました');
  }

  function keepLocalWorkflowVersion() {
    if (state.running || state.legacyRunning) return;
    if (!confirm('このタブの内容で、別タブの更新を上書きしますか？')) return;
    state.externalWorkflowConflict = false;
    state.externalWorkflowStore = null;
    setExternalConflictVisible(false);
    const saved = saveWorkflowStore({ immediate: true, force: true });
    toast(saved ? 'このタブの内容を保存しました' : 'このタブの内容を保存できませんでした');
  }

  function currentWorkflow() {
    return state.workflows?.workflows.find(workflow => workflow.id === state.selectedWorkflowId) || null;
  }

  function touchWorkflow() {
    const workflow = currentWorkflow();
    if (workflow) workflow.updatedAt = Date.now();
    saveWorkflowStore();
  }

  const TEMPLATES = Object.freeze([
    ['gbf-assist', 'グラブル：救援を評価して参加（HP以上）', () => [createBlock('gbfAssistSelect')]],
    ['gbf-assist-below', 'グラブル：救援を評価して参加（HP以下）', () => [createBlock('gbfAssistSelectBelow')]],
    ['gbf-unclaimed', 'グラブル：未確認バトルをすべて確認', () => [createBlock('gbfUnclaimedAll')]],
    ['gbf-supporter', 'グラブル：サポーター条件選択', () => [createBlock('gbfSupporterConditional')]],
    ['gbf-fullauto', 'グラブル：フルオートをON', () => [createBlock('gbfEnsureFullAuto')]],
    ['gbf-attack-wait', 'グラブル：フルオート攻撃開始まで待つ', () => [createBlock('gbfWaitAutoAttack')]],
    ['gbf-full-flow', 'グラブル：救援参加フルフロー', () => [createBlock('gbfAssistSelect'), createBlock('gbfEnsureFullAuto'), createBlock('gbfWaitAutoAttack')]],
    ['gbf-mypage', 'グラブル：MyPageボタンで完全再読込', () => [createBlock('gbfMyPage')]],
    ['gbf-memory-relief', 'グラブル：Safariメモリを解放', () => [createBlock('gbfReleaseResources')]],
    ['gbf-low-memory-flow', 'グラブル：省メモリ救援フロー', () => [createBlock('gbfAssistSelect'), createBlock('gbfEnsureFullAuto'), createBlock('gbfWaitAutoAttack'), createBlock('gbfReleaseResources')]],
    ['control-repeat', '制御：指定回数繰り返す', () => [createBlock('repeat', { children: [createBlock('gbfEnsureFullAuto'), createBlock('gbfWaitAutoAttack'), createBlock('randomWait', { config: { minSeconds: 0.5, maxSeconds: 0.8 } })] })]],
    ['control-until', '制御：条件成立まで繰り返す', () => [createBlock('repeatUntil')]],
    ['wait-random', '待機：指定区間をランダム待機', () => [createBlock('randomWait')]],
    ['frame-reload', 'iframe：再読み込み', () => [createBlock('iframeReload')]],
    ['frame-back', 'iframe：履歴を1つ戻る', () => [createBlock('iframeBack')]]
  ]);

  function findTemplate(id) {
    return TEMPLATES.find(template => template[0] === id) || TEMPLATES[0];
  }

  function walkBlocks(blocks, visitor, parent = null, branch = 'blocks') {
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index];
      const result = visitor(block, blocks, index, parent, branch);
      if (result) return result;
      if (Array.isArray(block.children)) {
        const nested = walkBlocks(block.children, visitor, block, 'children');
        if (nested) return nested;
      }
      if (Array.isArray(block.elseChildren)) {
        const nested = walkBlocks(block.elseChildren, visitor, block, 'elseChildren');
        if (nested) return nested;
      }
    }
    return null;
  }

  function findBlockLocation(id) {
    const workflow = currentWorkflow();
    if (!workflow) return null;
    return walkBlocks(workflow.blocks, (block, list, index, parent, branch) =>
      block.id === id ? { block, list, index, parent, branch } : null
    );
  }

  function regenerateBlockIds(block) {
    block.id = nowId('block');
    block.children?.forEach(regenerateBlockIds);
    block.elseChildren?.forEach(regenerateBlockIds);
    return block;
  }

  function cloneBlock(block) {
    return regenerateBlockIds(deepClone(block));
  }

  function countBlocks(blocks) {
    let count = 0;
    walkBlocks(blocks, () => {
      count += 1;
      return null;
    });
    return count;
  }

  function setAllBlocksCollapsed(collapsed) {
    const workflow = currentWorkflow();
    if (!workflow || state.running) return;
    walkBlocks(workflow.blocks, block => {
      if (collapsed) state.collapsed.add(block.id);
      else state.collapsed.delete(block.id);
      return null;
    });
    renderWorkflowEditor();
    announce(collapsed ? 'すべてのブロックを折りたたみました' : 'すべてのブロックを展開しました');
  }

  function isDescendant(block, targetId) {
    if (block.id === targetId) return true;
    return [...(block.children || []), ...(block.elseChildren || [])].some(child => isDescendant(child, targetId));
  }

  function removeBlockById(id) {
    const location = findBlockLocation(id);
    if (!location) return null;
    return commitWorkflowMutation('ブロックの削除', () => {
      resetInsertion();
      const [removed] = location.list.splice(location.index, 1);
      return removed;
    });
  }

  function moveBlockToList(id, targetList, targetIndex) {
    const location = findBlockLocation(id);
    if (!location) return false;
    const moving = location.block;
    const targetOwner = walkBlocks(currentWorkflow().blocks, block =>
      block.children === targetList || block.elseChildren === targetList ? block : null
    );
    if (targetOwner && isDescendant(moving, targetOwner.id)) return false;
    commitWorkflowMutation('ブロックの移動', () => {
      resetInsertion();
      location.list.splice(location.index, 1);
      let index = clamp(int(targetIndex, targetList.length), 0, targetList.length);
      if (location.list === targetList && location.index < index) index -= 1;
      targetList.splice(index, 0, moving);
    });
    touchWorkflow();
    renderWorkflowEditor();
    return true;
  }

  function moveBlockSibling(id, direction) {
    const location = findBlockLocation(id);
    if (!location) return;
    const next = location.index + direction;
    if (next < 0 || next >= location.list.length) return;
    commitWorkflowMutation('ブロックの並べ替え', () => {
      resetInsertion();
      [location.list[location.index], location.list[next]] = [location.list[next], location.list[location.index]];
    });
    touchWorkflow();
    renderWorkflowEditor();
  }

  function indentBlock(id) {
    const location = findBlockLocation(id);
    if (!location || location.index <= 0) return;
    const previous = location.list[location.index - 1];
    if (!BLOCK_DEFINITIONS[previous.type]?.container) {
      toast('直前のブロックは入れ子を持てません');
      return;
    }
    commitWorkflowMutation('ブロックのインデント', () => {
      resetInsertion();
      location.list.splice(location.index, 1);
      previous.children.push(location.block);
    });
    touchWorkflow();
    renderWorkflowEditor();
  }

  function outdentBlock(id) {
    const location = findBlockLocation(id);
    if (!location?.parent) return;
    const parentLocation = findBlockLocation(location.parent.id);
    if (!parentLocation) return;
    commitWorkflowMutation('ブロックのアウトデント', () => {
      resetInsertion();
      location.list.splice(location.index, 1);
      parentLocation.list.splice(parentLocation.index + 1, 0, location.block);
    });
    touchWorkflow();
    renderWorkflowEditor();
  }

  function setInsertion(list, index, description) {
    state.insertion = { list, index };
    ui.insertHint.textContent = `${description}へ追加します。`;
    ui.insertionNotice.classList.add('active');
    ui.palette.closest('details').open = true;
    const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    ui.palette.scrollIntoView({ behavior, block: 'center' });
    requestAnimationFrame(() => ui.paletteSearch.focus({ preventScroll: true }));
    announce(`追加先を${description}に設定しました`);
  }

  function resetInsertion({ notify = false } = {}) {
    state.insertion = null;
    ui.insertHint.textContent = 'フローの末尾へ追加します。各ブロックから挿入先を変更できます。';
    ui.insertionNotice.classList.remove('active');
    if (notify) toast('追加先をフロー末尾に戻しました');
  }

  function addBlockAtInsertion(type) {
    const workflow = currentWorkflow();
    if (!workflow || state.running) return;
    const insertionIsCurrent = state.insertion && (
      state.insertion.list === workflow.blocks ||
      walkBlocks(workflow.blocks, block =>
        block.children === state.insertion.list || block.elseChildren === state.insertion.list ? true : null
      )
    );
    const target = insertionIsCurrent ? state.insertion : { list: workflow.blocks, index: workflow.blocks.length };
    commitWorkflowMutation('ブロックの追加', () => {
      target.list.splice(clamp(target.index, 0, target.list.length), 0, createBlock(type));
      resetInsertion();
    });
    touchWorkflow();
    renderWorkflowEditor();
    toast(`「${blockLabel(type)}」を追加しました`);
  }

  function element(tag, options = {}, children = []) {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text != null) node.textContent = options.text;
    if (options.type) node.type = options.type;
    if (options.value != null) node.value = options.value;
    if (options.title) node.title = options.title;
    if (options.dataset) Object.assign(node.dataset, options.dataset);
    if (options.attrs) for (const [key, value] of Object.entries(options.attrs)) node.setAttribute(key, value);
    for (const child of Array.isArray(children) ? children : [children]) if (child) node.append(child);
    return node;
  }

  function field(labelText, input) {
    return element('label', { className: 'field' }, [element('span', { text: labelText }), input]);
  }

  function numberInput(value, min, max, step, onChange) {
    const input = element('input', { type: 'number', value });
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.inputMode = 'decimal';
    input.addEventListener('change', () => {
      let normalized = clamp(finite(input.value, value), min, max);
      if (Number.isInteger(Number(step)) && Number(step) >= 1) normalized = Math.round(normalized);
      input.value = String(normalized);
      onChange(input);
    });
    return input;
  }

  function textInput(value, onChange, placeholder = '', readNormalizedValue = null) {
    const input = element('input', { type: 'text', value });
    input.placeholder = placeholder;
    input.addEventListener('change', () => {
      onChange(input);
      if (readNormalizedValue) input.value = String(readNormalizedValue() ?? '');
    });
    return input;
  }

  function selectInput(value, options, onChange) {
    const select = element('select');
    for (const [optionValue, labelText] of options) {
      const option = element('option', { value: optionValue, text: labelText });
      select.append(option);
    }
    select.value = value;
    select.addEventListener('change', () => onChange(select));
    return select;
  }

  function updateBlockConfig(block, updater) {
    commitWorkflowMutation(`${blockLabel(block.type)}の設定変更`, () => {
      updater(block.config);
      const normalized = normalizeBlock(block);
      block.config = normalized.config;
    });
    touchWorkflow();
  }

  function renderCandidates(block, container) {
    const candidates = normalizeCandidates(block.config.supporterCandidates);
    const grid = element('div', { className: 'grid2' });
    candidates.forEach((candidate, index) => {
      const name = textInput(candidate.name, input => updateBlockConfig(block, config => {
        config.supporterCandidates = normalizeCandidates(config.supporterCandidates);
        config.supporterCandidates[index].name = input.value;
      }), '召喚石名（完全一致）', () => block.config.supporterCandidates[index].name);
      const level = numberInput(candidate.minimumLevel, 0, 9999, 1, input => updateBlockConfig(block, config => {
        config.supporterCandidates = normalizeCandidates(config.supporterCandidates);
        config.supporterCandidates[index].minimumLevel = finite(input.value, 0);
      }));
      grid.append(field(`候補${index + 1} 名前`, name), field(`候補${index + 1} 最低Lv`, level));
    });
    container.append(grid);
  }

  function renderConditionFields(block, container, configKey = 'condition') {
    const condition = normalizeConditionConfig(block.config[configKey]);
    const grid = element('div', { className: 'grid2' });
    const type = selectInput(condition.type, CONDITION_OPTIONS, input => updateBlockConfig(block, config => {
      config[configKey] = normalizeConditionConfig(config[configKey]);
      config[configKey].type = input.value;
    }));
    const selector = textInput(condition.selector, input => updateBlockConfig(block, config => {
      config[configKey] = normalizeConditionConfig(config[configKey]);
      config[configKey].selector = input.value;
    }), '.selector または #id', () => block.config[configKey].selector);
    const value = textInput(condition.value, input => updateBlockConfig(block, config => {
      config[configKey] = normalizeConditionConfig(config[configKey]);
      config[configKey].value = input.value;
    }), 'URLに含む文字など', () => block.config[configKey].value);
    grid.append(field('条件', type), field('セレクタ', selector), field('比較値', value));
    container.append(grid);
  }

  function renderAssistSlots(block, container) {
    const selectedSlots = normalizeAssistSlots(block.config.assistSlots);
    const grid = element('div', { className: 'grid2' });
    for (const slot of [1, 2, 3, 4]) {
      const input = element('input', { type: 'checkbox' });
      input.checked = selectedSlots.includes(slot);
      input.addEventListener('change', () => {
        let accepted = true;
        updateBlockConfig(block, config => {
          const slots = new Set(normalizeAssistSlots(config.assistSlots));
          if (input.checked) slots.add(slot);
          else if (slots.size > 1) slots.delete(slot);
          else accepted = false;
          config.assistSlots = [...slots].sort((a, b) => a - b);
        });
        if (!accepted) {
          input.checked = true;
          announce('救援番号は1件以上選択してください');
        }
      });
      grid.append(field(`救援${slot}`, input));
    }
    container.append(
      element('div', { className: 'cardTitle', text: '巡回する救援番号（2件以上で有効）' }),
      grid,
      element('div', { className: 'hint', text: '複数選択時はこの順で切替。1件だけなら従来どおり更新ボタンを使用します。' })
    );
  }

  function renderBlockConfig(block, container) {
    const config = block.config;
    const grid = element('div', { className: 'grid2' });
    const addNumber = (labelText, key, min, max, step) => grid.append(field(labelText,
      numberInput(config[key], min, max, step, input => updateBlockConfig(block, next => { next[key] = finite(input.value, config[key]); }))
    ));
    switch (block.type) {
      case 'gbfAssistSelect':
      case 'gbfAssistSelectBelow': {
        const below = block.type === 'gbfAssistSelectBelow';
        addNumber(below ? '最大残HP（%）' : '最低残HP（%）', below ? 'maximumHp' : 'minimumHp', 0, 100, 0.1);
        addNumber('更新基準時間（秒）', 'baseDelaySec', 0, 600, 0.1);
        addNumber('更新ずれ時間 ±秒', 'jitterSec', 0, 600, 0.1);
        addNumber('状態待ちタイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        addNumber('最大再試行回数', 'maxAttempts', 1, 100000, 1);
        container.append(grid);
        renderAssistSlots(block, container);
        renderCandidates(block, container);
        return;
      }
      case 'gbfSupporterConditional':
        addNumber('候補待ちタイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        container.append(grid);
        renderCandidates(block, container);
        return;
      case 'gbfSupporterAuto':
        addNumber('タイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        break;
      case 'gbfEnsureFullAuto':
      case 'gbfWaitAutoAttack': {
        addNumber('タイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        addNumber('何戦ごとに完全軽量化（0=無効）', 'memoryReliefEveryBattles', 0, 100, 1);
        addNumber('軽量化後の休止（秒）', 'memoryReliefSettleSec', 0, 30, 0.1);
        const recoveryRoute = textInput(
          config.battleEndRoute,
          input => updateBlockConfig(block, next => { next.battleEndRoute = input.value; }),
          '#quest/assist/multi/0',
          () => block.config.battleEndRoute
        );
        grid.append(field('敵撃破時の戻り先ルート', recoveryRoute));
        const recoveryScreen = selectInput(config.battleEndExpectedScreen, [
          ['auto', '自動判定'], ['assist', '救援一覧'], ['supporter', 'サポーター'], ['unclaimed', '未確認'], ['battle', 'バトル'], ['result', '結果画面'], ['mypage', 'MyPage']
        ], input => updateBlockConfig(block, next => { next.battleEndExpectedScreen = input.value; }));
        grid.append(field('戻り先の目的画面', recoveryScreen));
        break;
      }
      case 'gbfDeckConfirm':
        addNumber('タイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        addNumber('エラー後更新基準（秒）', 'refreshBaseDelaySec', 0, 600, 0.1);
        addNumber('エラー後更新ずれ ±秒', 'refreshJitterSec', 0, 600, 0.1);
        break;
      case 'gbfUnclaimedAll':
        addNumber('画面待ちタイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        addNumber('安全上限件数', 'maxItems', 1, 100000, 1);
        break;
      case 'gbfRefreshAssist':
        addNumber('更新前待機（秒）', 'baseDelaySec', 0, 600, 0.1);
        addNumber('待機ずれ ±秒', 'jitterSec', 0, 600, 0.1);
        addNumber('更新タイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        break;
      case 'gbfMyPage':
        addNumber('MyPage読込タイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        addNumber('読込後の休止（秒）', 'settleSec', 0, 30, 0.1);
        break;
      case 'gbfReleaseResources': {
        const destination = selectInput(config.destination, [
          ['assist', '救援一覧へ戻る'],
          ['mypage', 'MyPageに留まる'],
          ['current', '現在のURLを再構築']
        ], input => updateBlockConfig(block, next => { next.destination = input.value; }));
        grid.append(field('軽量化後の移動先', destination));
        addNumber('画面読込タイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        addNumber('MyPageでの休止（秒）', 'settleSec', 0, 30, 0.1);
        break;
      }
      case 'repeat':
        addNumber('繰り返す回数', 'count', 0, MAX_REPEAT_COUNT, 1);
        break;
      case 'repeatUntil':
        renderConditionFields(block, container);
        addNumber('最大反復回数', 'maxIterations', 1, 100000, 1);
        addNumber('最大実行時間（秒）', 'maxDurationSec', 1, 86400, 1);
        break;
      case 'if':
        renderConditionFields(block, container);
        return;
      case 'stop': {
        const reason = textInput(
          config.reason,
          input => updateBlockConfig(block, next => { next.reason = input.value; }),
          '停止理由',
          () => block.config.reason
        );
        grid.append(field('停止理由', reason));
        break;
      }
      case 'fixedWait':
        addNumber('待機秒数', 'seconds', 0, 86400, 0.01);
        break;
      case 'randomWait':
        addNumber('最小秒', 'minSeconds', 0, 86400, 0.01);
        addNumber('最大秒', 'maxSeconds', 0, 86400, 0.01);
        break;
      case 'watch':
        renderConditionFields(block, container);
        addNumber('タイムアウト（秒、0=無制限）', 'timeoutSec', 0, 86400, 1);
        addNumber('成立安定時間（ms）', 'stableMs', 0, 5000, 10);
        break;
      case 'iframeTapElement': {
        const selector = textInput(
          config.selector,
          input => updateBlockConfig(block, next => { next.selector = input.value; }),
          '#id または .class',
          () => block.config.selector
        );
        selector.spellcheck = false;
        const targetLabel = textInput(
          config.targetLabel,
          input => updateBlockConfig(block, next => { next.targetLabel = input.value; }),
          '表示名',
          () => block.config.targetLabel
        );
        grid.append(field('CSSセレクタ', selector), field('表示名', targetLabel));
        addNumber('対象待ちタイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        container.append(grid);
        const pick = element('button', {
          className: 'primary',
          text: config.selector ? '画面から選び直す' : '画面から選択'
        });
        pick.addEventListener('click', () => startElementPicker(block.id));
        container.append(
          element('div', { className: 'toolbar compactActions' }, [pick]),
          element('div', { className: 'hint', text: `現在の画面での状態: ${configuredTargetStatusText(block.config)}` }),
          element('div', { className: 'hint', text: '選択中はゲーム側のタップ処理を止め、選んだ要素の一意なCSSセレクタだけを保存します。' })
        );
        return;
      }
      case 'iframeReload':
      case 'iframeBack':
      case 'iframeReady': {
        addNumber('タイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        break;
      }
      case 'iframeRoute': {
        const route = textInput(
          config.route,
          input => updateBlockConfig(block, next => { next.route = input.value; }),
          '#quest/assist/multi/0',
          () => block.config.route
        );
        grid.append(field('ゲーム内ルート', route));
        addNumber('タイムアウト（秒）', 'timeoutSec', 1, 600, 1);
        container.append(grid, element('div', {
          className: 'hint',
          text: '読込完了だけを待つため、一覧にない画面へ移動しても次のブロックへ進みます。'
        }));
        return;
      }
    }
    container.append(grid);
  }

  function createDropZone(list, index) {
    const zone = element('div', { className: 'dropZone' });
    zone.addEventListener('dragover', event => {
      if (!state.dragBlockId) return;
      event.preventDefault();
      zone.classList.add('dragOver');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragOver'));
    zone.addEventListener('drop', event => {
      event.preventDefault();
      zone.classList.remove('dragOver');
      if (state.dragBlockId) moveBlockToList(state.dragBlockId, list, index);
      state.dragBlockId = null;
    });
    return zone;
  }

  function focusBlockControl(blockId, action = 'toggle', message = '') {
    requestAnimationFrame(() => {
      const card = blockCardById(blockId);
      const preferred = card?.querySelector(`[data-action="${action}"]`);
      const control = preferred && !preferred.disabled ? preferred : card?.querySelector('.collapseToggle');
      control?.focus({ preventScroll: true });
      if (message) announce(message);
    });
  }

  function renderBlockList(blocks, host, depth = 0, branchName = 'blocks') {
    host.append(createDropZone(blocks, 0));
    blocks.forEach((block, index) => {
      const definition = BLOCK_DEFINITIONS[block.type] || { category: 'control', label: block.type, description: '未対応' };
      const card = element('div', { className: `blockCard category-${definition.category}` });
      const contentId = `blockContent-${String(block.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
      card.dataset.blockId = block.id;
      card.dataset.depth = String(depth);
      card.setAttribute('role', 'group');
      card.setAttribute('aria-label', `${index + 1}. ${definition.label}`);
      const validationIssues = state.validationIssues.filter(issue => issue.blockId === block.id);
      const validationError = validationIssues.some(issue => issue.severity === 'error');
      if (validationIssues.length) {
        card.classList.add(validationError ? 'validation-error' : 'validation-warning');
        card.setAttribute('aria-description', validationIssues.map(issue => issue.message).join('。'));
      }
      if (state.running?.currentBlockId === block.id) card.setAttribute('aria-current', 'step');
      card.draggable = !state.running && supportsNativeBlockDrag;
      card.classList.toggle('running', state.running?.currentBlockId === block.id);
      card.classList.toggle('collapsed', state.collapsed.has(block.id));
      card.addEventListener('dragstart', event => {
        if (state.running || !supportsNativeBlockDrag || event.target.closest?.('button,input,select,textarea,label')) return event.preventDefault();
        state.dragBlockId = block.id;
        card.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', block.id);
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        state.dragBlockId = null;
        shadow.querySelectorAll('.dropZone.dragOver').forEach(zone => zone.classList.remove('dragOver'));
      });

      const isCollapsed = state.collapsed.has(block.id);
      const collapse = element('button', {
        className: 'collapseToggle',
        text: isCollapsed ? '展開' : '折りたたむ',
        title: isCollapsed ? '設定を展開' : '設定を折りたたむ',
        dataset: { action: 'toggle' },
        attrs: {
          'aria-label': isCollapsed ? `${definition.label}を展開` : `${definition.label}を折りたたむ`,
          'aria-expanded': String(!isCollapsed),
          'aria-controls': contentId
        }
      });
      collapse.addEventListener('click', () => {
        if (state.collapsed.has(block.id)) state.collapsed.delete(block.id); else state.collapsed.add(block.id);
        renderWorkflowEditor();
        focusBlockControl(block.id, 'toggle', state.collapsed.has(block.id) ? 'ブロックを折りたたみました' : 'ブロックを展開しました');
      });
      const name = element('div', { className: 'blockName' }, [
        element('span', { className: 'blockTypeBadge', text: CATEGORY_LABELS[definition.category] }),
        element('strong', { text: definition.label }),
        element('small', { text: definition.description })
      ]);
      const badges = element('div', { className: 'blockBadges' });
      if (validationIssues.length) {
        badges.append(element('span', {
          className: `validationBadge${validationError ? ' error' : ''}`,
          text: validationError ? '要修正' : '注意',
          title: validationIssues[0].message
        }));
      }
      const progress = state.blockProgress.get(block.id);
      if (progress) badges.append(element('span', { className: 'progressBadge', text: progress }));
      if (badges.childElementCount) name.append(badges);
      const tools = element('div', { className: 'blockTools' });
      const tool = (text, title, handler, { action, disabled = false, className = '', restoreFocus = true } = {}) => {
        const button = element('button', {
          text, title, className, dataset: { action }, attrs: { 'aria-label': `${definition.label}：${title}` }
        });
        button.disabled = Boolean(state.running || disabled);
        button.addEventListener('click', () => {
          const focusId = handler();
          if (restoreFocus) focusBlockControl(typeof focusId === 'string' ? focusId : block.id, action, title);
        });
        tools.append(button);
      };
      tool('↑', 'ひとつ上へ移動', () => moveBlockSibling(block.id, -1), { action: 'move-up', disabled: index === 0 });
      tool('↓', 'ひとつ下へ移動', () => moveBlockSibling(block.id, 1), { action: 'move-down', disabled: index === blocks.length - 1 });
      tool('→', '直前のブロックの内側へ移動', () => indentBlock(block.id), {
        action: 'indent', disabled: index === 0 || !BLOCK_DEFINITIONS[blocks[index - 1]?.type]?.container
      });
      tool('←', '親ブロックの外へ移動', () => outdentBlock(block.id), { action: 'outdent', disabled: !findBlockLocation(block.id)?.parent });
      tool('⧉', 'ブロックを複製', () => {
        const location = findBlockLocation(block.id);
        const copy = cloneBlock(block);
        commitWorkflowMutation('ブロックの複製', () => {
          resetInsertion();
          location.list.splice(location.index + 1, 0, copy);
        });
        touchWorkflow();
        renderWorkflowEditor();
        return copy.id;
      }, { action: 'duplicate' });
      tool('＋', 'このブロックの直後へ追加', () => {
        const location = findBlockLocation(block.id);
        setInsertion(location.list, location.index + 1, `「${definition.label}」の直後`);
      }, { action: 'insert-after', restoreFocus: false });
      if (definition.container) tool('↳', '子ブロックを追加', () => setInsertion(block.children, block.children.length, `「${definition.label}」の内側`), {
        action: 'insert-child', restoreFocus: false
      });
      tool('×', 'ブロックを削除', () => {
        const location = findBlockLocation(block.id);
        const focusTarget = location?.list[location.index + 1] || location?.list[location.index - 1] || location?.parent;
        removeBlockById(block.id);
        touchWorkflow();
        renderWorkflowEditor();
        toast(`「${definition.label}」を削除しました`);
        if (focusTarget) focusBlockControl(focusTarget.id, 'toggle');
        else {
          ui.palette.closest('details').open = true;
          requestAnimationFrame(() => ui.paletteSearch.focus());
        }
      }, { action: 'delete', className: 'toolDelete', restoreFocus: false });
      const head = element('div', { className: 'blockHead' }, [collapse, name, tools]);
      const body = element('div', { className: 'blockBody' });
      renderBlockConfig(block, body);
      if (state.running) body.querySelectorAll('input,select,textarea,button').forEach(control => { control.disabled = true; });
      const content = element('div', { className: 'blockContent', attrs: { id: contentId } }, [body]);
      card.append(head, content);

      if (definition.container) {
        const childArea = element('div', { className: 'childArea' });
        const childLabel = element('div', { className: 'childLabel' }, [
          element('span', { text: block.type === 'if' ? '条件成立時' : '内側の処理' }),
          element('button', { text: '＋子' })
        ]);
        childLabel.lastElementChild.disabled = Boolean(state.running);
        childLabel.lastElementChild.addEventListener('click', () => setInsertion(block.children, block.children.length, `「${definition.label}」の内側`));
        childArea.append(childLabel);
        renderBlockList(block.children, childArea, depth + 1, 'children');
        content.append(childArea);
      }
      if (definition.elseBranch) {
        const elseArea = element('div', { className: 'childArea' });
        const elseLabel = element('div', { className: 'childLabel' }, [element('span', { text: '条件不成立時' }), element('button', { text: '＋else' })]);
        elseLabel.lastElementChild.disabled = Boolean(state.running);
        elseLabel.lastElementChild.addEventListener('click', () => setInsertion(block.elseChildren, block.elseChildren.length, '条件不成立側'));
        elseArea.append(elseLabel);
        renderBlockList(block.elseChildren, elseArea, depth + 1, 'elseChildren');
        content.append(elseArea);
      }
      host.append(card, createDropZone(blocks, index + 1));
    });
  }

  function renderWorkflowEditor() {
    state.runningCard = null;
    state.runningBadge = null;
    workflowEditor.textContent = '';
    const workflow = currentWorkflow();
    if (!workflow) return;
    ui.workflowName.value = workflow.name;
    ui.workflowLoopCount.value = String(workflow.loopCount);
    ui.workflowLoopMode.value = workflow.loopInfinite ? 'infinite' : 'count';
    ui.workflowLoopMode.disabled = Boolean(state.running);
    ui.workflowLoopCount.disabled = Boolean(state.running || workflow.loopInfinite);
    const loopLabel = workflow.loopInfinite ? '無限ループ' : `${workflow.loopCount}回実行`;
    ui.workflowStats.textContent = `${countBlocks(workflow.blocks)}ブロック · ${loopLabel}`;
    byId('expandAllBlocks').disabled = Boolean(state.running || !workflow.blocks.length);
    byId('collapseAllBlocks').disabled = Boolean(state.running || !workflow.blocks.length);
    if (!workflow.blocks.length) {
      workflowEditor.append(element('div', { className: 'empty', text: 'まだブロックがありません。「ブロックライブラリ」またはクイックスタートから追加してください。' }));
      return;
    }
    renderBlockList(workflow.blocks, workflowEditor);
  }

  function renderWorkflowSelect() {
    ui.workflowSelect.textContent = '';
    for (const workflow of state.workflows.workflows) {
      ui.workflowSelect.append(element('option', { value: workflow.id, text: workflow.name }));
    }
    ui.workflowSelect.value = state.selectedWorkflowId;
    renderWorkflowEditor();
  }

  function renderPalette() {
    ui.palette.textContent = '';
    const query = state.paletteQuery.trim().toLocaleLowerCase('ja');
    let visibleCount = 0;
    for (const category of Object.keys(CATEGORY_META)) {
      if (state.paletteCategory !== 'all' && state.paletteCategory !== category) continue;
      const matches = Object.entries(BLOCK_DEFINITIONS).filter(([, definition]) => {
        if (definition.category !== category) return false;
        if (!query) return true;
        return `${definition.label} ${definition.description} ${CATEGORY_LABELS[category]}`.toLocaleLowerCase('ja').includes(query);
      });
      if (!matches.length) continue;
      visibleCount += matches.length;
      const meta = CATEGORY_META[category];
      const items = element('div', { className: 'paletteItems' });
      for (const [type, definition] of matches) {
        const button = element('button', {
          className: `paletteButton ${definition.category}`,
          attrs: { 'aria-label': `${definition.label}を追加` }
        }, [
          element('strong', { text: definition.label }),
          element('small', { text: definition.description })
        ]);
        button.disabled = Boolean(state.running);
        button.addEventListener('click', () => addBlockAtInsertion(type));
        items.append(button);
      }
      ui.palette.append(element('section', {
        className: 'paletteSection',
        attrs: { 'data-category': category, 'aria-label': meta.label }
      }, [
        element('div', { className: 'paletteSectionHead' }, [
          element('span', { className: 'paletteSectionTitle', text: meta.label }),
          element('span', { className: 'paletteCount', text: `${matches.length}種類` })
        ]),
        items
      ]));
    }
    if (!visibleCount) ui.palette.append(element('div', { className: 'paletteEmpty', text: '条件に一致するブロックがありません。' }));
    ui.paletteStatus.textContent = `${visibleCount}件のブロックを表示`;
  }

  const SELECTOR_CONDITION_TYPES = new Set(['selectorVisible', 'selectorHidden', 'selectorExists', 'selectorMissing']);

  function selectorSyntaxError(selector) {
    try {
      document.createDocumentFragment().querySelector(selector);
      return '';
    } catch {
      return 'セレクタの書式が正しくありません';
    }
  }

  function validateWorkflowDefinition(workflow) {
    const issues = [];
    if (!workflow?.blocks?.length) {
      issues.push({ severity: 'error', blockId: null, message: '実行するブロックがありません' });
      return issues;
    }
    const ids = new Set();
    let totalBlocks = 0;
    let deepWarningAdded = false;
    const add = (severity, block, message) => issues.push({ severity, blockId: block?.id || null, message });
    const validateCondition = (block, condition) => {
      const normalized = normalizeConditionConfig(condition);
      if (SELECTOR_CONDITION_TYPES.has(normalized.type)) {
        if (!normalized.selector) add('error', block, '条件に使用するセレクタが空です');
        else {
          const syntaxError = selectorSyntaxError(normalized.selector);
          if (syntaxError) add('error', block, syntaxError);
        }
      }
      if (normalized.type === 'urlContains' && !normalized.value.trim()) {
        add('error', block, 'URL条件に使用する比較値が空です');
      }
    };
    const visit = (blocks, depth = 0) => {
      let stopped = false;
      blocks.forEach(block => {
        totalBlocks += 1;
        if (stopped) add('warning', block, '同じ階層の停止ブロックより後にあるため、このブロックには到達しません');
        if (!BLOCK_DEFINITIONS[block.type]) add('error', block, `未対応のブロック種別です: ${block.type}`);
        if (!block.id || ids.has(block.id)) add('error', block, 'ブロックIDが重複または空です');
        else ids.add(block.id);
        if (depth > 10 && !deepWarningAdded) {
          add('warning', block, '入れ子が深いため、編集や実行の確認が難しくなっています');
          deepWarningAdded = true;
        }
        if (block.type === 'randomWait' && finite(block.config.minSeconds) > finite(block.config.maxSeconds)) {
          add('error', block, 'ランダム待機の最小秒数が最大秒数を超えています');
        }
        if (block.type === 'repeat') {
          if (!block.children?.length) add('warning', block, '繰り返す子ブロックがありません');
          if (int(block.config.count) === 0) add('warning', block, '繰り返し回数が0のため何も実行されません');
        }
        if (block.type === 'repeatUntil') {
          validateCondition(block, block.config.condition);
          if (!block.children?.length) add('error', block, '条件成立まで繰り返す子ブロックがありません');
        }
        if (block.type === 'if') {
          validateCondition(block, block.config.condition);
          if (!block.children?.length && !block.elseChildren?.length) add('warning', block, '条件分岐の両方が空です');
        }
        if (block.type === 'watch') {
          validateCondition(block, block.config.condition);
          if (finite(block.config.timeoutSec) === 0) add('warning', block, 'タイムアウトが無制限です');
        }
        if (block.type === 'iframeTapElement') {
          if (!String(block.config.selector || '').trim()) add('error', block, '押すボタンが選択されていません');
          else {
            const syntaxError = selectorSyntaxError(block.config.selector);
            if (syntaxError) add('error', block, syntaxError);
          }
        }
        if (block.type === 'stop') stopped = true;
        if (Array.isArray(block.children)) visit(block.children, depth + 1);
        if (Array.isArray(block.elseChildren)) visit(block.elseChildren, depth + 1);
      });
    };
    visit(workflow.blocks);
    const blockListGuaranteesYield = blocks => blocks.some(block => {
      if (block.type === 'stop') return true;
      if (['fixedWait', 'randomWait', 'watch', 'iframeTapElement', 'iframeReload', 'iframeBack', 'iframeRoute', 'iframeReady', 'parentTabRestart'].includes(block.type)) return true;
      if (BLOCK_DEFINITIONS[block.type]?.category === 'gbf') return true;
      if (block.type === 'repeat' && int(block.config.count) > 0) return blockListGuaranteesYield(block.children || []);
      if (block.type === 'if') {
        return blockListGuaranteesYield(block.children || []) && blockListGuaranteesYield(block.elseChildren || []);
      }
      return false;
    });
    if ((workflow.loopInfinite || workflow.loopCount > 1_000) && !blockListGuaranteesYield(workflow.blocks)) {
      issues.unshift({
        severity: 'error',
        blockId: workflow.blocks[0]?.id || null,
        message: '長時間ループ内に待機または画面操作がなく、停止操作を受け付けなくなる可能性があります'
      });
    }
    if (workflow.loopInfinite) {
      issues.unshift({ severity: 'warning', blockId: null, message: 'ワークフローは手動停止するまで無限に繰り返します' });
    }
    if (totalBlocks > 1_000) {
      issues.unshift({ severity: 'warning', blockId: null, message: `${totalBlocks}ブロックあります。実行前に処理時間を確認してください` });
    }
    return issues;
  }

  function invalidateWorkflowValidation() {
    state.validationIssues = [];
    ui.validationBar.dataset.tone = 'idle';
    ui.validationTitle.textContent = '実行前チェック';
    ui.validationMessage.textContent = '変更内容は実行時に自動確認されます';
    ui.validationFocus.hidden = true;
    shadow.querySelectorAll('.blockCard.validation-error,.blockCard.validation-warning').forEach(card => {
      card.classList.remove('validation-error', 'validation-warning');
      card.removeAttribute('aria-description');
    });
    shadow.querySelectorAll('.validationBadge').forEach(badge => badge.remove());
  }

  function firstActionableValidationIssue() {
    return state.validationIssues.find(issue => issue.severity === 'error' && issue.blockId)
      || state.validationIssues.find(issue => issue.blockId)
      || state.validationIssues[0]
      || null;
  }

  function focusWorkflowValidationIssue(issue = firstActionableValidationIssue()) {
    if (!issue) return;
    if (!issue.blockId) {
      ui.validateWorkflow?.focus?.({ preventScroll: true });
      return announce(issue.message);
    }
    let location = findBlockLocation(issue.blockId);
    while (location?.parent) {
      state.collapsed.delete(location.parent.id);
      location = findBlockLocation(location.parent.id);
    }
    state.collapsed.delete(issue.blockId);
    renderWorkflowEditor();
    requestAnimationFrame(() => {
      const card = blockCardById(issue.blockId);
      card?.scrollIntoView({
        block: 'center',
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
      });
      focusBlockControl(issue.blockId, 'toggle', issue.message);
    });
  }

  function runWorkflowValidation({ announceResult = true, focusFirstError = false } = {}) {
    const workflow = currentWorkflow();
    const issues = validateWorkflowDefinition(workflow);
    state.validationIssues = issues;
    const errors = issues.filter(issue => issue.severity === 'error');
    const warnings = issues.filter(issue => issue.severity === 'warning');
    ui.validationFocus.hidden = !issues.length;
    if (errors.length) {
      ui.validationBar.dataset.tone = 'error';
      ui.validationTitle.textContent = `${errors.length}件のエラー`;
      ui.validationMessage.textContent = errors[0].message;
    } else if (warnings.length) {
      ui.validationBar.dataset.tone = 'warning';
      ui.validationTitle.textContent = `${warnings.length}件の注意`;
      ui.validationMessage.textContent = warnings[0].message;
    } else {
      ui.validationBar.dataset.tone = 'success';
      ui.validationTitle.textContent = '実行準備OK';
      ui.validationMessage.textContent = `${countBlocks(workflow.blocks)}ブロックを確認しました`;
    }
    renderWorkflowEditor();
    const summary = errors.length
      ? `${errors.length}件のエラーがあります`
      : warnings.length
        ? `${warnings.length}件の注意があります。実行は可能です`
        : '実行前チェックに問題はありません';
    if (announceResult) toast(summary);
    if (focusFirstError && errors.length) focusWorkflowValidationIssue(errors[0]);
    return { issues, errors, warnings, valid: !errors.length };
  }

  function commitActiveEditorInput() {
    const active = shadow.activeElement;
    if (active?.matches?.('input,select,textarea')) active.blur();
  }

  function prepareWorkflowRun() {
    commitActiveEditorInput();
    const result = runWorkflowValidation({ announceResult: false, focusFirstError: true });
    if (!result.valid) {
      toast(`${result.errors.length}件の設定エラーを修正してください`);
      return null;
    }
    if (!saveWorkflowStore({ immediate: true })) {
      toast('保存できないため実行を開始できません。JSONバックアップを取得してください');
      return null;
    }
    return normalizeWorkflow(deepClone(currentWorkflow()));
  }

  function renderTemplateSelect() {
    ui.templateSelect.textContent = '';
    for (const [id, labelText] of TEMPLATES) ui.templateSelect.append(element('option', { value: id, text: labelText }));
  }

  class FlowError extends Error {
    constructor(message, code = 'FLOW_ERROR', details = null) {
      super(message);
      this.name = 'FlowError';
      this.code = code;
      this.details = details;
    }
  }

  class FlowStop extends Error {
    constructor(message = '停止しました') {
      super(message);
      this.name = 'FlowStop';
    }
  }

  class FlowRestart extends Error {
    constructor(message = 'ワークフローの先頭から再開します', details = null) {
      super(message);
      this.name = 'FlowRestart';
      this.details = details;
    }
  }

  function abortException(signal) {
    const reason = signal?.reason;
    if (reason instanceof Error) return reason;
    return new DOMException(String(reason || 'Aborted'), 'AbortError');
  }

  function throwIfAborted(signal) {
    if (signal?.aborted) throw abortException(signal);
  }

  function abortableDelay(ms, signal) {
    throwIfAborted(signal);
    const delay = Math.max(0, finite(ms, 0));
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = callback => value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        callback(value);
      };
      const onResolve = finish(resolve);
      const onReject = finish(reject);
      const onAbort = () => onReject(abortException(signal));
      const timer = setTimeout(() => onResolve(), delay);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  async function runObservedAction(waitFactory, action, { signal, cancelMessage = '監視を解除しました' } = {}) {
    throwIfAborted(signal);
    const controller = new AbortController();
    const relayAbort = () => {
      if (!controller.signal.aborted) controller.abort(abortException(signal));
    };
    signal?.addEventListener('abort', relayAbort, { once: true });
    const waitPromise = Promise.resolve().then(() => waitFactory(controller.signal));
    waitPromise.catch(() => {});
    try {
      await action();
      return await waitPromise;
    } catch (error) {
      if (!controller.signal.aborted) controller.abort(new DOMException(cancelMessage, 'AbortError'));
      await waitPromise.catch(() => {});
      throw error;
    } finally {
      signal?.removeEventListener('abort', relayAbort);
    }
  }

  function frameWindow() {
    const win = iframe.contentWindow;
    if (!win) throw new FlowError('iframeがまだ利用できません', 'FRAME_UNAVAILABLE');
    return win;
  }

  function frameDocument() {
    try {
      const doc = iframe.contentDocument || frameWindow().document;
      if (!doc) throw new Error('document unavailable');
      return doc;
    } catch {
      throw new FlowError('iframe内部を読み取れません。同一オリジンで開いてください', 'CROSS_ORIGIN');
    }
  }

  function currentFrameUrl() {
    try {
      return frameWindow().location.href;
    } catch {
      return urlInput.value || iframe.src || '';
    }
  }

  const ELEMENT_PICKER_TARGET_SELECTOR = [
    'button', 'a', 'input', 'select', 'textarea',
    '[role="button"]', '[onclick]', '[data-href]', '[data-location-href]',
    '[class*="btn-"]', '[class*="button"]'
  ].join(',');
  const ELEMENT_PICKER_ATTRIBUTES = Object.freeze([
    'data-testid', 'data-test', 'data-href', 'data-location-href',
    'data-slot', 'data-raid-id', 'aria-label', 'name', 'title', 'role'
  ]);
  const ELEMENT_PICKER_VOLATILE_CLASSES = new Set([
    'active', 'selected', 'show', 'hide', 'hidden', 'display-on', 'display-off',
    'on', 'off', 'enabled', 'disabled', 'focus', 'hover', 'touch', 'se'
  ]);
  const ELEMENT_PICKER_MAX_ANCESTOR_CLIMB = 6;
  const ELEMENT_PICKER_MAX_VIEWPORT_RATIO = 0.55;
  const ELEMENT_PICKER_MIN_TAP_AREA = 44 * 44;
  const ELEMENT_PICKER_MAX_AREA_GROWTH = 24;

  function cssIdentifier(value, doc = document) {
    const escape = doc.defaultView?.CSS?.escape || window.CSS?.escape;
    if (escape) return escape(String(value));
    return String(value).replace(/(^-?\d)|[^a-zA-Z0-9_-]/g, match =>
      [...match].map(char => `\\${char.codePointAt(0).toString(16)} `).join('')
    );
  }

  function cssAttributeValue(value) {
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\a ');
  }

  function selectorUniquelyMatches(doc, selector, target) {
    try {
      const matches = doc.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === target;
    } catch {
      return false;
    }
  }

  function stablePickerClasses(element) {
    return [...element.classList].filter(name =>
      name
      && name.length <= 80
      && /^[a-zA-Z_][\w-]*$/.test(name)
      && !ELEMENT_PICKER_VOLATILE_CLASSES.has(name)
      && !/^(?:is-|has-)?(?:active|selected|show|hide|hidden|disabled|enabled)$/i.test(name)
    ).slice(0, 3);
  }

  function pickerSelectorSegment(element, doc) {
    const tag = element.localName || '*';
    const classes = stablePickerClasses(element);
    let segment = `${tag}${classes.map(name => `.${cssIdentifier(name, doc)}`).join('')}`;
    const parent = element.parentElement;
    if (!parent) return segment;
    let duplicates = [];
    try { duplicates = [...parent.children].filter(child => child.matches(segment)); } catch {}
    if (duplicates.length > 1) {
      const sameTag = [...parent.children].filter(child => child.localName === element.localName);
      segment += `:nth-of-type(${sameTag.indexOf(element) + 1})`;
    }
    return segment;
  }

  function uniqueElementSelector(target, doc = target?.ownerDocument) {
    if (!target || !doc || target.ownerDocument !== doc) {
      throw new FlowError('選択したHTML要素を確認できません', 'PICKER_TARGET_INVALID');
    }
    if (target.id) {
      const candidate = `#${cssIdentifier(target.id, doc)}`;
      if (selectorUniquelyMatches(doc, candidate, target)) return candidate;
    }
    const tag = target.localName || '*';
    for (const name of ELEMENT_PICKER_ATTRIBUTES) {
      const value = target.getAttribute(name);
      if (!value || value.length > 240) continue;
      const candidate = `${tag}[${name}="${cssAttributeValue(value)}"]`;
      if (selectorUniquelyMatches(doc, candidate, target)) return candidate;
    }
    const classes = stablePickerClasses(target);
    if (classes.length) {
      const candidate = `${tag}${classes.map(name => `.${cssIdentifier(name, doc)}`).join('')}`;
      if (selectorUniquelyMatches(doc, candidate, target)) return candidate;
    }
    const path = [];
    let current = target;
    for (let depth = 0; current && current.nodeType === 1 && depth < 12; depth++) {
      path.unshift(pickerSelectorSegment(current, doc));
      const candidate = path.join(' > ');
      if (selectorUniquelyMatches(doc, candidate, target)) return candidate;
      if (current === doc.body || current === doc.documentElement) break;
      current = current.parentElement;
    }
    throw new FlowError('選択した要素を一意に識別できませんでした', 'PICKER_SELECTOR_NOT_UNIQUE');
  }

  function pickerEventPoint(event) {
    const source = event?.touches?.[0] || event?.changedTouches?.[0] || event;
    const x = finite(source?.clientX, NaN);
    const y = finite(source?.clientY, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  function pickerElementArea(element) {
    const rect = element?.getBoundingClientRect?.();
    if (!rect) return 0;
    return Math.max(0, finite(rect.width, 0)) * Math.max(0, finite(rect.height, 0));
  }

  function pickerViewportArea(doc) {
    const view = doc?.defaultView;
    const width = finite(view?.innerWidth, 0) || finite(doc?.documentElement?.clientWidth, 0);
    const height = finite(view?.innerHeight, 0) || finite(doc?.documentElement?.clientHeight, 0);
    return Math.max(1, width * height);
  }

  function pickerElementIsOversized(element, doc) {
    return pickerElementArea(element) > pickerViewportArea(doc) * ELEMENT_PICKER_MAX_VIEWPORT_RATIO;
  }

  function pickerEventTarget(event) {
    const path = event?.composedPath?.();
    const composed = Array.isArray(path) ? path.find(node => node?.nodeType === 1) : null;
    const target = composed || event?.target;
    return target?.nodeType === 1 ? target : null;
  }

  function pickerHitTarget(doc, point, fallback = null) {
    if (!doc || !point || typeof doc.elementsFromPoint !== 'function') return fallback;
    let stack;
    try { stack = doc.elementsFromPoint(point.x, point.y); } catch { return fallback; }
    const candidates = [...(stack || [])].filter(node =>
      node?.nodeType === 1 && node !== doc.body && node !== doc.documentElement
    );
    if (!candidates.length) return fallback;
    const precise = candidates.find(node => !pickerElementIsOversized(node, doc));
    if (precise) return precise;
    return candidates.reduce((smallest, node) =>
      pickerElementArea(node) < pickerElementArea(smallest) ? node : smallest
    );
  }

  function preferredPickerTarget(raw, doc = raw?.ownerDocument) {
    if (!raw || raw.nodeType !== 1) return null;
    if (raw.matches?.(ELEMENT_PICKER_TARGET_SELECTOR)) return raw;
    const baseArea = Math.max(pickerElementArea(raw), ELEMENT_PICKER_MIN_TAP_AREA);
    let current = raw.parentElement;
    for (let depth = 0; current?.nodeType === 1 && depth < ELEMENT_PICKER_MAX_ANCESTOR_CLIMB; depth++) {
      if (current === doc?.body || current === doc?.documentElement) break;
      if (pickerElementIsOversized(current, doc)) break;
      if (pickerElementArea(current) > baseArea * ELEMENT_PICKER_MAX_AREA_GROWTH) break;
      if (pickerElementArea(current) > 0 && current.matches?.(ELEMENT_PICKER_TARGET_SELECTOR)) return current;
      current = current.parentElement;
    }
    return raw;
  }

  function pickerTapViability(target) {
    if (!target?.isConnected) return { ok: false, reason: '画面から消えています' };
    const own = target.getBoundingClientRect?.();
    const width = Math.round(finite(own?.width, 0));
    const height = Math.round(finite(own?.height, 0));
    if (own && width > 0 && height > 0 && !computedVisible(target)) return { ok: false, reason: '非表示です' };
    const usable = own && width > 0 && height > 0 ? own : probeTargetRect(target);
    if (!usable) return { ok: false, reason: `大きさが0です（${width}×${height}）` };
    const hit = target.ownerDocument?.elementFromPoint?.(
      usable.left + (usable.width / 2),
      usable.top + (usable.height / 2)
    );
    if (hit && hit !== target && !target.contains(hit)) return { ok: false, reason: '他の要素に覆われています' };
    const usableWidth = Math.round(usable.width);
    const usableHeight = Math.round(usable.height);
    return {
      ok: true,
      reason: usable === own
        ? `${usableWidth}×${usableHeight}px`
        : `約${usableWidth}×${usableHeight}px・描画位置から推定`
    };
  }

  function configuredTargetStatusText(config) {
    const selector = String(config?.selector || '').trim();
    if (!selector) return '未選択';
    let doc;
    try { doc = frameDocument(); } catch { return '対象ページを開くと確認できます'; }
    let matches;
    try { matches = [...doc.querySelectorAll(selector)]; } catch { return 'セレクタ書式が不正です'; }
    if (!matches.length) return '一致0件（この画面には存在しません）';
    if (matches.length > 1) return `一致${matches.length}件（選び直してください）`;
    const viability = pickerTapViability(matches[0]);
    return viability.ok ? `一致1件・タップ可能（${viability.reason}）` : `一致1件・タップ不可（${viability.reason}）`;
  }

  function resolvePickerTarget(event, doc) {
    const raw = pickerHitTarget(doc, pickerEventPoint(event), pickerEventTarget(event));
    return preferredPickerTarget(raw, doc);
  }

  function pickerTargetLabel(target) {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
    const text = compact(
      target.getAttribute('aria-label')
      || target.getAttribute('title')
      || target.textContent
    ).slice(0, 60);
    const classes = stablePickerClasses(target).slice(0, 2);
    const descriptor = `${target.localName || 'element'}${target.id ? `#${target.id}` : classes.map(name => `.${name}`).join('')}`;
    return (text ? `${text} (${descriptor})` : descriptor).slice(0, 120);
  }

  function suppressElementPickerEvent(event) {
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function clearElementPickerHighlight(picker = state.elementPicker) {
    const highlighted = picker?.highlighted;
    if (!highlighted) return;
    const {
      element: highlightedElement,
      outline,
      outlinePriority,
      outlineOffset,
      outlineOffsetPriority,
      cursor,
      cursorPriority
    } = highlighted;
    if (highlightedElement?.style) {
      highlightedElement.style.setProperty('outline', outline, outlinePriority);
      highlightedElement.style.setProperty('outline-offset', outlineOffset, outlineOffsetPriority);
      highlightedElement.style.setProperty('cursor', cursor, cursorPriority);
    }
    picker.highlighted = null;
  }

  function highlightElementPickerTarget(target, picker = state.elementPicker) {
    if (!picker || picker.highlighted?.element === target) return;
    clearElementPickerHighlight(picker);
    if (!target?.style) return;
    picker.highlighted = {
      element: target,
      outline: target.style.getPropertyValue('outline'),
      outlinePriority: target.style.getPropertyPriority('outline'),
      outlineOffset: target.style.getPropertyValue('outline-offset'),
      outlineOffsetPriority: target.style.getPropertyPriority('outline-offset'),
      cursor: target.style.getPropertyValue('cursor'),
      cursorPriority: target.style.getPropertyPriority('cursor')
    };
    target.style.setProperty('outline', '3px solid #66b8ff', 'important');
    target.style.setProperty('outline-offset', '2px', 'important');
    target.style.setProperty('cursor', 'crosshair', 'important');
  }

  function stopElementPicker({ restoreFocus = true, message = '' } = {}) {
    const picker = state.elementPicker;
    if (!picker) return;
    state.elementPicker = null;
    clearTimeout(picker.finishTimer);
    clearElementPickerHighlight(picker);
    try { picker.cleanupDocument?.(); } catch {}
    picker.frame?.removeEventListener('load', picker.onFrameLoad);
    window.removeEventListener('keydown', picker.onKeyDown, true);
    root.classList.remove('element-picking');
    ui.elementPickerToolbar.hidden = true;
    if (message) toast(message);
    if (restoreFocus) focusBlockControl(picker.blockId, 'toggle', message || '要素選択を終了しました');
  }

  function bindElementPickerDocument(picker) {
    picker.cleanupDocument?.();
    picker.cleanupDocument = null;
    let doc;
    try {
      doc = frameDocument();
    } catch (error) {
      ui.elementPickerHint.textContent = error.message;
      return;
    }

    const preview = event => {
      if (picker.finishing || state.elementPicker !== picker) return;
      const target = resolvePickerTarget(event, doc);
      if (!target) return;
      highlightElementPickerTarget(target, picker);
      ui.elementPickerHint.textContent = `選択候補: ${pickerTargetLabel(target)}`;
    };
    const choose = event => {
      suppressElementPickerEvent(event);
      if (picker.finishing || state.elementPicker !== picker) return;
      let target = resolvePickerTarget(event, doc);
      if (!target) {
        ui.elementPickerHint.textContent = 'HTML要素を選択できませんでした。別の位置をタップしてください。';
        return;
      }
      let viability = pickerTapViability(target);
      if (!viability.ok) {
        const touched = pickerHitTarget(doc, pickerEventPoint(event), pickerEventTarget(event));
        const touchedViability = touched && touched !== target ? pickerTapViability(touched) : null;
        if (touchedViability?.ok) {
          target = touched;
          viability = touchedViability;
        }
      }
      try {
        const selector = uniqueElementSelector(target, doc);
        const matches = doc.querySelectorAll(selector);
        if (matches.length !== 1 || matches[0] !== target) {
          throw new FlowError('選択した要素を一意に識別できませんでした', 'PICKER_SELECTOR_NOT_UNIQUE');
        }
        const location = findBlockLocation(picker.blockId);
        if (!location || location.block.type !== 'iframeTapElement') {
          throw new FlowError('設定対象のブロックが見つかりません', 'PICKER_BLOCK_MISSING');
        }
        const label = pickerTargetLabel(target);
        picker.finishing = true;
        highlightElementPickerTarget(target, picker);
        updateBlockConfig(location.block, config => {
          config.selector = selector;
          config.targetLabel = label;
        });
        renderWorkflowEditor();
        const warning = viability.ok ? '' : `この要素は今タップできません（${viability.reason}）`;
        ui.elementPickerHint.textContent = warning || `${label} を保存しました（${viability.reason}）`;
        picker.finishTimer = setTimeout(() => {
          stopElementPicker({ message: warning || `「${label}」を選択しました` });
        }, warning ? 1200 : 350);
      } catch (error) {
        ui.elementPickerHint.textContent = error.message;
        toast(error.message);
      }
    };
    const suppress = event => suppressElementPickerEvent(event);
    const listeners = [
      ['pointerover', preview, { capture: true, passive: true }],
      ['pointerdown', choose, { capture: true, passive: false }],
      ['touchstart', choose, { capture: true, passive: false }],
      ['mousedown', choose, { capture: true, passive: false }],
      ['click', suppress, { capture: true, passive: false }],
      ['contextmenu', suppress, { capture: true, passive: false }]
    ];
    for (const [type, listener, options] of listeners) doc.addEventListener(type, listener, options);
    picker.cleanupDocument = () => {
      for (const [type, listener, options] of listeners) doc.removeEventListener(type, listener, options);
    };
  }

  function startElementPicker(blockId) {
    if (state.running || state.legacyRunning || state.recording) {
      return toast('実行中または記録中はHTML要素を選択できません');
    }
    const location = findBlockLocation(blockId);
    if (!location || location.block.type !== 'iframeTapElement') {
      return toast('設定対象のブロックが見つかりません');
    }
    try {
      frameDocument();
    } catch (error) {
      return toast(error.message);
    }
    if (state.elementPicker) stopElementPicker({ restoreFocus: false });
    const picker = {
      blockId,
      frame: iframe,
      highlighted: null,
      cleanupDocument: null,
      finishing: false,
      finishTimer: null,
      onFrameLoad: null,
      onKeyDown: null
    };
    picker.onFrameLoad = () => {
      if (state.elementPicker === picker) bindElementPickerDocument(picker);
    };
    picker.onKeyDown = event => {
      if (event.key !== 'Escape' || state.elementPicker !== picker) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      stopElementPicker({ message: '要素選択をキャンセルしました' });
    };
    state.elementPicker = picker;
    root.classList.add('element-picking');
    ui.elementPickerHint.textContent = 'iframe内のHTML要素をタップしてください。実際のゲーム操作は発火しません。';
    ui.elementPickerToolbar.hidden = false;
    picker.frame.addEventListener('load', picker.onFrameLoad);
    window.addEventListener('keydown', picker.onKeyDown, true);
    bindElementPickerDocument(picker);
    announce('押すボタンを画面から選択します');
    requestAnimationFrame(() => ui.elementPickerCancel.focus({ preventScroll: true }));
  }

  function stopRuntimeTelemetry(win) {
    try {
      win?.DD_RUM?.stopSessionReplayRecording?.();
      win?.DD_RUM?.stopSession?.();
    } catch {}
  }

  function releaseCanvasResources(doc) {
    if (!doc?.querySelectorAll) return;
    for (const canvas of doc.querySelectorAll('canvas')) {
      try {
        const declaredContext = `${canvas.getAttribute('dena-context') || ''} ${canvas.getAttribute('cjs-context') || ''}`.toLowerCase();
        if (declaredContext.includes('webgl')) {
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
          gl?.getExtension?.('WEBGL_lose_context')?.loseContext?.();
        }
      } catch {}
      try {
        canvas.width = 0;
        canvas.height = 0;
      } catch {}
    }
  }

  function releaseKnownGraphicsContexts(win) {
    const stages = new Set([
      win?.stage,
      win?.Game?.view?.stage,
      win?.exportRoot?.stage,
      ...Object.values(win?.cjs?.stage || {})
    ].filter(Boolean));
    for (const stage of stages) {
      for (const key of ['_webGLContext', 'webGLContext', '_gl', 'gl']) {
        try { stage?.[key]?.getExtension?.('WEBGL_lose_context')?.loseContext?.(); } catch {}
      }
      try {
        if (stage.canvas) {
          stage.canvas.width = 0;
          stage.canvas.height = 0;
        }
      } catch {}
    }
  }

  function releaseImageResources(doc) {
    try {
      for (const image of doc?.images || []) {
        try {
          image.removeAttribute('srcset');
          image.removeAttribute('sizes');
          image.src = '';
        } catch {}
      }
    } catch {}
  }

  function detachHostRuntimeEvents(win, doc) {
    const jq = win?.jQuery || win?.$;
    if (typeof jq === 'function') {
      try { jq(doc).off('ajaxStop ajaxError'); } catch {}
      try { jq(win).off('resize hashchange popstate error'); } catch {}
    }
    try { win.onresize = null; } catch {}
    try { win.onhashchange = null; } catch {}
    try { win.onpopstate = null; } catch {}
    try { win.onerror = null; } catch {}
    try { if (win?.requirejs) win.requirejs.onError = () => {}; } catch {}
  }

  function releaseWindowRuntime(win, doc, { stopWindow = true, hostShell = false } = {}) {
    if (!win || !doc) return;
    try {
      if (hostShell) detachHostRuntimeEvents(win, doc);
      try { win[BATTLE_PERFORMANCE_RUNTIME_KEY]?.destroy?.(); } catch {}
      stopRuntimeTelemetry(win);
      try { releaseKnownGraphicsContexts(win); } catch {}

      let routerCleaned = false;
      try {
        if (typeof win?.Game?.router?.move === 'function') {
          if (hostShell) {
            try {
              if (typeof win.Game?.loading?.loadStart === 'function') win.Game.loading.loadStart = () => {};
            } catch {}
          }
          win.Game.router.move();
          routerCleaned = true;
        }
      } catch {}
      if (!routerCleaned) {
        try { win?.Game?.view?.content_close?.(); } catch {}
        try { win?.Game?.view?.destroyImages?.(); } catch {}
      }

      try { win?.Backbone?.history?.stop?.(); } catch {}
      try { win?.createjs?.Ticker?.removeAllEventListeners?.(); } catch {}
      try { win?.createjs?.Ticker?.reset?.(true); } catch {}
      try { win?.createjs?.Tween?.removeAllTweens?.(); } catch {}
      try { win?.createjs?.Sound?.stop?.(); } catch {}
      try { win?.createjs?.Sound?.reset?.(true); } catch {}
      try { win?.createjs?.WebAudioPlugin?.reset?.(); } catch {}

      releaseCanvasResources(doc);
      releaseImageResources(doc);
      try {
        for (const media of doc?.querySelectorAll?.('audio,video') || []) {
          try { media.pause?.(); } catch {}
          try {
            media.removeAttribute('src');
            media.load?.();
          } catch {}
        }
      } catch {}
      try {
        if (win?.Game) win.Game.view = null;
        win.stage = null;
        win.exportRoot = null;
        win.cjs = null;
        win.lib = null;
        win.images = null;
      } catch {}
      if (stopWindow) {
        try { win.stop?.(); } catch {}
      }
    } catch {}
  }

  function releaseFrameRuntime(frame) {
    if (!frame) return;
    try {
      releaseWindowRuntime(frame.contentWindow, frame.contentDocument, { stopWindow: true });
    } catch {}
  }

  function releaseFrameParentReferences(frame) {
    if (!frame) return;
    let frameDoc = null;
    try { frameDoc = frame.contentDocument; } catch {}
    try { if (frameDoc) battleProgressCache.delete(frameDoc); } catch {}
    state.activeBattleDocument = null;
    state.activeBattleStatus = null;
  }

  function hideBackgroundRendering() {
    if (!backgroundBody) return;
    backgroundBody.style.visibility = 'hidden';
    backgroundBody.style.contentVisibility = 'hidden';
  }

  function discardHostRuntimeShell() {
    focusBeforeInstall = null;
    try { backgroundBody?.replaceChildren(); } catch {}
    for (const key of [
      'Game',
      'Backbone',
      'createjs',
      'requirejs',
      'require',
      'requireAMD',
      'requireESM',
      'define',
      'jQuery',
      '$',
      'stage',
      'exportRoot',
      'cjs',
      'lib',
      'images'
    ]) {
      try { window[key] = null; } catch {}
    }
  }

  function releaseHostRuntimeOnce() {
    const hostLooksLikeGranblue = Boolean(
      window.Game
      && (window.Game.router || window.Game.view || window.createjs)
      && document.querySelector('#wrapper, .contents, .cnt-raid-stage, .cnt-mypage')
    );
    if (!hostLooksLikeGranblue && !state.hostRuntimeReleased) return;
    hideBackgroundRendering();
    if (state.hostRuntimeReleased) return;
    state.hostRuntimeReleased = true;
    window[HOST_RUNTIME_RELEASED_KEY] = true;
    releaseWindowRuntime(window, document, { stopWindow: false, hostShell: true });
    discardHostRuntimeShell();
  }

  function blankFrame(frame) {
    return new Promise(resolve => {
      let settled = false;
      let timer = null;
      const finish = loaded => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        frame.removeEventListener('load', onLoad);
        resolve(Boolean(loaded));
      };
      const onLoad = () => finish(true);
      frame.addEventListener('load', onLoad);
      timer = setTimeout(() => finish(false), 3000);
      try { frame.contentWindow.location.replace('about:blank'); }
      catch {
        try { frame.src = 'about:blank'; }
        catch { finish(false); }
      }
    });
  }

  function handleFrameLoad() {
    state.frameGeneration += 1;
    const loadedGeneration = state.frameGeneration;
    let loadedSameOrigin = false;
    stopRuntimeTelemetry(iframe?.contentWindow);
    const telemetryTimer = setTimeout(() => {
      state.telemetryTimers.delete(telemetryTimer);
      if (!state.destroyed && state.frameGeneration === loadedGeneration) {
        stopRuntimeTelemetry(iframe?.contentWindow);
      }
    }, 1200);
    state.telemetryTimers.add(telemetryTimer);
    try {
      urlInput.value = iframe.contentWindow.location.href;
      loadedSameOrigin = new URL(urlInput.value, location.href).origin === location.origin;
      state.legacy.url = urlInput.value;
      saveLegacyState();
      if (!state.running && !state.legacyRunning) setStatus('読込完了');
    } catch {
      if (!state.running && !state.legacyRunning) setStatus('読込完了・別オリジン');
    }
    if (loadedSameOrigin) {
      syncBattlePerformanceFrame();
      releaseHostRuntimeOnce();
    }
  }

  function bindFrameLoad(frame) {
    frame.addEventListener('load', handleFrameLoad);
  }

  async function replaceFrame(destination, { forceNewElement = false } = {}) {
    const targetUrl = String(destination || '').trim();
    if (!targetUrl) throw new FlowError('iframeの移動先が空です', 'INVALID_ROUTE');
    if (state.destroyed) throw new DOMException('AutoFlowは終了しています', 'AbortError');
    const navigationId = ++state.frameNavigationId;
    const assertCurrentNavigation = () => {
      if (state.destroyed || navigationId !== state.frameNavigationId) {
        throw new DOMException('より新しいiframe遷移に置き換えられました', 'AbortError');
      }
    };
    clearPendingAutoAttack('iframeを再構築するため攻撃監視を解除しました');
    let previousFrame = iframe;
    previousFrame.removeEventListener('load', handleFrameLoad);
    notifyFrameLifecycle(previousFrame, null, 'detach');
    releaseFrameParentReferences(previousFrame);
    releaseFrameRuntime(previousFrame);
    const blanked = await blankFrame(previousFrame);
    assertCurrentNavigation();
    await new Promise(resolve => setTimeout(resolve, 0));
    assertCurrentNavigation();
    const replaceElement = forceNewElement || !blanked;
    if (!replaceElement) {
      iframe = previousFrame;
      bindFrameLoad(previousFrame);
      notifyFrameLifecycle(previousFrame, previousFrame, 'attach');
      try { previousFrame.contentWindow.location.replace(targetUrl); }
      catch { previousFrame.src = targetUrl; }
      if (window.__AUTO_TEST__) window.__AUTO_TEST__.iframe = previousFrame;
      return previousFrame;
    }
    const nextFrame = previousFrame.cloneNode(false);
    nextFrame.removeAttribute('src');
    bindFrameLoad(nextFrame);
    previousFrame.replaceWith(nextFrame);
    iframe = nextFrame;
    notifyFrameLifecycle(previousFrame, nextFrame, 'attach');
    previousFrame = null;
    await new Promise(resolve => setTimeout(resolve, 0));
    assertCurrentNavigation();
    nextFrame.src = targetUrl;
    if (window.__AUTO_TEST__) window.__AUTO_TEST__.iframe = nextFrame;
    return nextFrame;
  }

  function computedVisible(element) {
    if (!element || !element.isConnected || element.hidden) return false;
    const inlineStyle = element.style;
    if (inlineStyle) {
      if (inlineStyle.display === 'none' || inlineStyle.visibility === 'hidden' || inlineStyle.visibility === 'collapse') return false;
      if (inlineStyle.opacity !== '' && Number(inlineStyle.opacity) === 0) return false;
    }
    const view = element.ownerDocument?.defaultView || window;
    const style = view.getComputedStyle?.(element);
    if (style) {
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      if (Number(style.opacity) === 0) return false;
    }
    const rect = element.getBoundingClientRect?.();
    return Boolean(rect && rect.width > 0 && rect.height > 0 && element.getClientRects?.().length);
  }

  function hiddenOrAbsent(doc, selector) {
    const element = doc.querySelector(selector);
    return !element || !computedVisible(element);
  }

  function popupInfo(doc = frameDocument()) {
    const popup = doc.querySelector(SELECTORS.popup);
    if (!popup || !computedVisible(popup)) return null;
    const body = popup.querySelector(SELECTORS.popupBody);
    const text = normalizePopupText(body?.textContent || '');
    let type = 'UNKNOWN_ERROR';
    if (text === NORMALIZED_ERRORS.MAX_ASSIST) type = 'MAX_ASSIST_ERROR';
    else if (text === NORMALIZED_ERRORS.UNCLAIMED) type = 'UNCLAIMED_ERROR';
    else if (text === NORMALIZED_ERRORS.RAID_FULL) type = 'RAID_FULL_ERROR';
    return { type, text, rawText: String(body?.textContent || '').trim(), popup, ok: popup.querySelector(SELECTORS.popupOk) };
  }

  // 戦闘結果は #result/<raid_id>（シングル）と #result_multi/<raid_id>（マルチ）の2種類。
  // result/scene・result/quest・result/detail などraid_idを取らないルートは対象外。
  const BATTLE_RESULT_URL_PATTERN = /(?:#|\/)result(?:_multi)?\/\d+/i;

  function isBattleResultUrl(url = currentFrameUrl()) {
    return BATTLE_RESULT_URL_PATTERN.test(String(url || ''));
  }

  function detectScreenState(doc = frameDocument()) {
    const popup = popupInfo(doc);
    if (popup) return { ...popup, document: doc };
    const deckOk = doc.querySelector(SELECTORS.deckOk);
    if (deckOk && computedVisible(deckOk)) return { type: 'DECK_CONFIRM', element: deckOk, document: doc };
    const unclaimedList = doc.querySelector(SELECTORS.unclaimedList);
    if (unclaimedList) return { type: 'UNCLAIMED_LIST', element: unclaimedList, document: doc };
    const supporter = doc.querySelector(SELECTORS.supporterScreen);
    if (supporter) return { type: 'SUPPORTER', element: supporter, document: doc };
    const assist = doc.querySelector(SELECTORS.assistScreen);
    if (assist) return { type: 'ASSIST_LIST', element: assist, document: doc };
    const battle = doc.querySelector(SELECTORS.battleScreen);
    if (battle && !isBattleResultUrl()) return { type: 'BATTLE', element: battle, document: doc };
    const myPage = doc.querySelector(SELECTORS.myPageScreen);
    if (myPage) return { type: 'MYPAGE', element: myPage, document: doc };
    if (isBattleResultUrl()) return { type: 'RESULT', document: doc };
    return { type: 'UNKNOWN', document: doc };
  }

  function safeDetectScreenState() {
    try {
      return detectScreenState();
    } catch (error) {
      return { type: error.code || 'UNAVAILABLE', error };
    }
  }

  function screenSignature(doc = frameDocument(), stateInfo = null) {
    const detected = stateInfo || detectScreenState(doc);
    let detail = '';
    if (detected.type === 'ASSIST_LIST') {
      detail = assistListSignature(doc.querySelector(SELECTORS.assistList));
    } else if (detected.type === 'UNCLAIMED_LIST') {
      detail = Array.from(doc.querySelectorAll(SELECTORS.unclaimedRows), row =>
        row.dataset.raidId || row.dataset.href || ''
      ).slice(0, 12).join('|');
    } else if (detected.type.endsWith('_ERROR')) {
      detail = detected.text || detected.rawText || '';
    }
    return `${detected.type}|${detail}|${doc.body?.childElementCount || 0}`;
  }

  function captureFrameState({ includeDocument = false } = {}) {
    let doc = null;
    let href = currentFrameUrl();
    let screen = 'UNAVAILABLE';
    let signature = '';
    try {
      doc = frameDocument();
      const stateInfo = detectScreenState(doc);
      screen = stateInfo.type;
      signature = screenSignature(doc, stateInfo);
    } catch {}
    return {
      doc: includeDocument ? doc : null,
      generation: state.frameGeneration,
      href,
      screen,
      signature,
      at: performance.now()
    };
  }

  function expectedScreenMatches(expected, doc, stateInfo = detectScreenState(doc)) {
    if (expected === 'any') return true;
    if (!expected || expected === 'auto') return ['ASSIST_LIST', 'SUPPORTER', 'DECK_CONFIRM', 'UNCLAIMED_LIST', 'BATTLE', 'RESULT', 'MYPAGE'].includes(stateInfo.type);
    if (expected === 'assist') return stateInfo.type === 'ASSIST_LIST';
    if (expected === 'supporter') return stateInfo.type === 'SUPPORTER' || stateInfo.type === 'DECK_CONFIRM';
    if (expected === 'unclaimed') return stateInfo.type === 'UNCLAIMED_LIST';
    if (expected === 'battle') return stateInfo.type === 'BATTLE';
    if (expected === 'result') return stateInfo.type === 'RESULT' || isBattleResultUrl();
    if (expected === 'mypage') return stateInfo.type === 'MYPAGE';
    return false;
  }

  function pageBaseReady(doc) {
    return ['interactive', 'complete'].includes(doc.readyState)
      && hiddenOrAbsent(doc, '#loading')
      && hiddenOrAbsent(doc, '#ready');
  }

  function monitorFrame(check, {
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    stableMs = 0,
    description = '状態待ち',
    allowInterval = true,
    observeRoots = null,
    observeOnLightweight = false,
    observeCharacterData = false,
    intervalMs = null
  } = {}) {
    throwIfAborted(signal);
    return new Promise((resolve, reject) => {
      let settled = false;
      let observer = null;
      let observedDoc = null;
      let observedRoots = [];
      let timeout = null;
      let interval = null;
      let stableSince = null;
      let lastMutation = performance.now();
      let listenedFrame = null;
      let observerScheduled = false;
      let observerTimer = null;
      let observerFrame = null;

      const cleanupMonitor = () => {
        observer?.disconnect();
        observer = null;
        observedDoc = null;
        observedRoots = [];
        clearTimeout(observerTimer);
        observerTimer = null;
        if (observerFrame != null) cancelAnimationFrame(observerFrame);
        observerFrame = null;
        observerScheduled = false;
        clearTimeout(timeout);
        clearInterval(interval);
        listenedFrame?.removeEventListener('load', onFrameLoad);
        listenedFrame = null;
        signal?.removeEventListener('abort', onAbort);
        frameLifecycleSubscribers.delete(onFrameLifecycle);
      };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanupMonitor();
        callback(value);
      };
      const onAbort = () => finish(reject, abortException(signal));
      const onFrameLoad = () => {
        lastMutation = performance.now();
        bindObserver();
        evaluate();
      };
      const syncFrameListener = () => {
        if (listenedFrame === iframe) return;
        listenedFrame?.removeEventListener('load', onFrameLoad);
        listenedFrame = iframe;
        listenedFrame?.addEventListener('load', onFrameLoad);
      };
      const bindObserver = () => {
        syncFrameListener();
        let doc;
        try { doc = frameDocument(); } catch { return; }
        if (lightweightMode && !observeOnLightweight) {
          if (doc !== observedDoc) {
            observer?.disconnect();
            observer = null;
            observedDoc = doc;
            observedRoots = [];
          }
          return;
        }
        let requestedRoots = observeRoots;
        if (typeof observeRoots === 'function') {
          try { requestedRoots = observeRoots(doc); } catch { requestedRoots = []; }
        }
        if (requestedRoots == null) requestedRoots = [doc.documentElement || doc];
        const roots = [...new Set((Array.isArray(requestedRoots) ? requestedRoots : [requestedRoots]).filter(root =>
          root && root.ownerDocument === doc && root.isConnected !== false
        ))];
        const unchanged = doc === observedDoc
          && roots.length === observedRoots.length
          && roots.every((root, index) => root === observedRoots[index]);
        if (unchanged) return;
        observer?.disconnect();
        observedDoc = doc;
        observedRoots = roots;
        if (!roots.length) return;
        observer = new MutationObserver(() => {
          lastMutation = performance.now();
          stableSince = null;
          if (observerScheduled) return;
          observerScheduled = true;
          const run = () => {
            observerTimer = null;
            observerFrame = null;
            observerScheduled = false;
            if (!settled) evaluate();
          };
          if (observeOnLightweight && lightweightMode) observerTimer = setTimeout(run, 120);
          else if (observeOnLightweight) queueMicrotask(run);
          else observerFrame = requestAnimationFrame(run);
        });
        for (const rootNode of roots) {
          try {
            observer.observe(rootNode, {
              subtree: true,
              childList: true,
              attributes: true,
              attributeFilter: ['class', 'style'],
              characterData: observeCharacterData
            });
          } catch {}
        }
      };
      const evaluate = () => {
        if (settled) return;
        if (signal?.aborted) return onAbort();
        syncFrameListener();
        bindObserver();
        let result;
        try {
          result = check({ lastMutation });
        } catch (error) {
          if (error instanceof FlowError && ['CROSS_ORIGIN', 'FRAME_UNAVAILABLE'].includes(error.code)) return;
          return finish(reject, error);
        }
        if (!result) {
          stableSince = null;
          return;
        }
        const now = performance.now();
        if (stableMs > 0) {
          if (stableSince == null) stableSince = now;
          const stableFrom = Math.max(stableSince, lastMutation);
          if (now - stableFrom < stableMs) return;
        }
        finish(resolve, result === true ? {} : result);
      };
      const onFrameLifecycle = ({ phase } = {}) => {
        if (settled) return;
        observer?.disconnect();
        observer = null;
        observedDoc = null;
        observedRoots = [];
        stableSince = null;
        lastMutation = performance.now();
        listenedFrame?.removeEventListener('load', onFrameLoad);
        listenedFrame = null;
        if (phase === 'detach') return;
        bindObserver();
        evaluate();
      };

      frameLifecycleSubscribers.add(onFrameLifecycle);
      syncFrameListener();
      signal?.addEventListener('abort', onAbort, { once: true });
      if (timeoutMs > 0) timeout = setTimeout(() => finish(reject, new FlowError(`${description}がタイムアウトしました`, 'TIMEOUT')), timeoutMs);
      if (allowInterval) {
        const requestedInterval = intervalMs ?? (timeoutMs === 0 ? 1000 : (lightweightMode ? 750 : 300));
        const pollingInterval = lightweightMode && observeOnLightweight ? Math.max(240, requestedInterval) : requestedInterval;
        interval = setInterval(evaluate, Math.max(50, pollingInterval));
      }
      bindObserver();
      evaluate();
    });
  }

  async function waitForFrameReady({ signal, timeoutMs = DEFAULT_TIMEOUT_MS, expectedScreen = 'auto', before = null, requireChange = false, stableMs = DEFAULT_STABLE_MS } = {}) {
    const baseline = requireChange ? (before || captureFrameState()) : null;
    return monitorFrame(() => {
      const doc = frameDocument();
      const stateInfo = detectScreenState(doc);
      if (!pageBaseReady(doc)) return false;
      if (!expectedScreenMatches(expectedScreen, doc, stateInfo)) return false;
      if (requireChange) {
        const changed = (baseline.generation != null && state.frameGeneration !== baseline.generation)
          || (baseline.doc && doc !== baseline.doc)
          || currentFrameUrl() !== baseline.href
          || stateInfo.type !== baseline.screen
          || screenSignature(doc, stateInfo) !== baseline.signature;
        if (!changed) return false;
      }
      return { document: doc, state: stateInfo.type, url: currentFrameUrl() };
    }, { signal, timeoutMs, stableMs, description: 'ページ読込完了待ち' });
  }

  async function performFrameOperation(operation, { signal, timeoutMs = DEFAULT_TIMEOUT_MS, expectedScreen = 'auto', requireChange = true } = {}) {
    const before = captureFrameState({ includeDocument: true });
    return runObservedAction(
      waitSignal => waitForFrameReady({ signal: waitSignal, timeoutMs, expectedScreen, before, requireChange }),
      () => {
        try {
          operation();
        } catch (error) {
          throw new FlowError(`iframe操作に失敗しました: ${error.message}`, 'NAVIGATION_FAILED');
        }
      },
      { signal, cancelMessage: 'iframe操作監視を解除しました' }
    );
  }

  function gameRouteUrl(route) {
    const raw = String(route || '').trim();
    if (!raw) throw new FlowError('ゲーム内ルートが空です', 'INVALID_ROUTE');
    const current = new URL(currentFrameUrl() || urlInput.value || location.href, location.href);
    if (/^https?:/i.test(raw)) return new URL(raw).href;
    if (raw.startsWith('#')) {
      current.hash = raw.slice(1);
      return current.href;
    }
    if (raw.startsWith('/')) return new URL(raw, current.origin).href;
    current.hash = raw.replace(/^#/, '');
    return current.href;
  }

  let tapQueue = Promise.resolve();
  const activeTapTargets = new WeakSet();

  function queueExclusive(task) {
    const next = tapQueue.then(task, task);
    tapQueue = next.catch(() => {});
    return next;
  }

  const TOUCH_VISIBLE_LATENCY_MS = Object.freeze({ mean: 130, stdDev: 20, min: 80, max: 250 });
  const TOUCH_FAST_VISIBLE_LATENCY_MS = Object.freeze({ mean: 24, stdDev: 6, min: 12, max: 42 });
  const TOUCH_HANDOFF_VISIBLE_LATENCY_MS = Object.freeze({ mean: 8, stdDev: 3, min: 2, max: 16 });
  const TOUCH_HOLD_LATENCY_MS = Object.freeze({ mean: 95, stdDev: 15, min: 50, max: 180 });
  const TOUCH_FAST_HOLD_LATENCY_MS = Object.freeze({ mean: 55, stdDev: 9, min: 32, max: 85 });
  const TOUCH_HANDOFF_HOLD_LATENCY_MS = Object.freeze({ mean: 42, stdDev: 7, min: 28, max: 65 });
  const TOUCH_SCROLL_SETTLE_LATENCY_MS = Object.freeze({ mean: 72, stdDev: 16, min: 36, max: 130 });
  const TOUCH_SCROLL_INERTIA_LATENCY_MS = Object.freeze({ mean: 180, stdDev: 34, min: 110, max: 290 });
  const TOUCH_START_STDDEV_RATIO = Object.freeze({ mean: 0.135, stdDev: 0.008, min: 0.12, max: 0.15 });
  const TOUCH_SESSION_OFFSET_X_RATIO = Object.freeze({ mean: 0.03, stdDev: 0.006, min: 0.015, max: 0.045 });
  const TOUCH_SESSION_OFFSET_Y_RATIO = Object.freeze({ mean: 0.02, stdDev: 0.006, min: 0.005, max: 0.035 });
  const TOUCH_COORDINATE_INSET_RATIO = 0.001;
  const TOUCH_DRIFT_STDDEV_RATIO = 0.012;
  const TOUCH_DRIFT_STDDEV_MIN_PX = 0.35;
  const TOUCH_DRIFT_STDDEV_MAX_PX = 3;
  const TOUCH_TRAJECTORY_NOISE_CORRELATION = 0.72;
  const SCROLL_SPEED_MIN_PX_PER_SEC = 900;
  const SCROLL_SPEED_MAX_PX_PER_SEC = 1800;
  const SCROLL_INERTIA_MIN_DISTANCE_PX = 80;
  const TRUNCATED_NORMAL_MAX_ATTEMPTS = 10_000;

  function sampleStandardNormal(random = Math.random) {
    const u1 = Math.max(Number.MIN_VALUE, 1 - random());
    const u2 = 1 - random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function sampleTruncatedNormal({ mean, stdDev, min, max }, random = Math.random) {
    const meanValue = Number(mean);
    const stdDevValue = Number(stdDev);
    const minValue = Number(min);
    const maxValue = Number(max);
    if (![meanValue, stdDevValue, minValue, maxValue].every(Number.isFinite)
      || stdDevValue < 0
      || maxValue < minValue) {
      throw new FlowError('切断正規分布のパラメータが不正です', 'INVALID_TRUNCATED_NORMAL');
    }
    if (stdDevValue === 0) {
      if (meanValue < minValue || meanValue > maxValue) {
        throw new FlowError('標準偏差0の平均値が切断範囲外です', 'INVALID_TRUNCATED_NORMAL');
      }
      return meanValue;
    }
    for (let attempt = 0; attempt < TRUNCATED_NORMAL_MAX_ATTEMPTS; attempt++) {
      const sample = meanValue + (sampleStandardNormal(random) * stdDevValue);
      if (sample >= minValue && sample <= maxValue) return sample;
    }
    throw new FlowError('切断正規分布の再抽選上限に達しました', 'TRUNCATED_NORMAL_EXHAUSTED');
  }

  function sampleTruncatedNormalMs(config, random = Math.random) {
    const minValue = Number(config?.min);
    const maxValue = Number(config?.max);
    for (let attempt = 0; attempt < TRUNCATED_NORMAL_MAX_ATTEMPTS; attempt++) {
      const rounded = Math.round(sampleTruncatedNormal(config, random));
      if (rounded >= minValue && rounded <= maxValue) return rounded;
    }
    throw new FlowError('切断正規分布の時間再抽選上限に達しました', 'TRUNCATED_NORMAL_MS_EXHAUSTED');
  }

  const TOUCH_SESSION = Object.freeze({
    rightOffsetX: sampleTruncatedNormal(TOUCH_SESSION_OFFSET_X_RATIO),
    verticalOffsetY: sampleTruncatedNormal(TOUCH_SESSION_OFFSET_Y_RATIO),
    startStdDevRatio: sampleTruncatedNormal(TOUCH_START_STDDEV_RATIO)
  });

  function createSyntheticTouch(win, target, identifier, point) {
    if (typeof win.Touch !== 'function') {
      throw new FlowError('この環境は標準Touchコンストラクタに対応していません', 'TOUCH_UNSUPPORTED');
    }
    const init = {
      identifier,
      target,
      clientX: point.x,
      clientY: point.y,
      screenX: point.x + finite(win.screenX, 0),
      screenY: point.y + finite(win.screenY, 0),
      pageX: point.x + finite(win.scrollX, 0),
      pageY: point.y + finite(win.scrollY, 0)
    };
    try {
      return new win.Touch(init);
    } catch (error) {
      throw new FlowError(`Touch生成に失敗しました: ${error.message}`, 'TOUCH_CONSTRUCTION_FAILED');
    }
  }

  function dispatchSyntheticTouch(win, target, type, touch, active) {
    if (typeof win.TouchEvent !== 'function') {
      throw new FlowError('この環境は標準TouchEventに対応していません', 'TOUCH_EVENT_UNSUPPORTED');
    }
    const activeTouches = active ? [touch] : [];
    let event;
    try {
      event = new win.TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        touches: activeTouches,
        targetTouches: activeTouches,
        changedTouches: [touch]
      });
    } catch (error) {
      throw new FlowError(`TouchEvent生成に失敗しました: ${error.message}`, 'TOUCH_EVENT_CONSTRUCTION_FAILED');
    }
    // preventDefault() is a normal part of many touch handlers: it suppresses
    // emulated mouse/click behavior while the page still consumes the gesture.
    // Do not terminate touchmove/touchend merely because dispatchEvent() is false.
    target.dispatchEvent(event);
    return event;
  }

  function scrollableAncestors(target) {
    const doc = target.ownerDocument;
    const win = doc.defaultView;
    const result = [];
    for (let node = target.parentElement; node && node !== doc.documentElement; node = node.parentElement) {
      const style = win.getComputedStyle(node);
      const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
      const canScrollX = /(auto|scroll|overlay)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1;
      if (canScrollX || canScrollY) result.push(node);
    }
    const root = doc.scrollingElement || doc.documentElement;
    if (root && !result.includes(root)) result.push(root);
    return result;
  }

  function scrollViewport(win, scroller) {
    const doc = win.document;
    const root = doc.scrollingElement || doc.documentElement;
    if (scroller === root || scroller === doc.documentElement || scroller === doc.body) {
      return { left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight };
    }
    const rect = scroller.getBoundingClientRect();
    return {
      left: rect.left + scroller.clientLeft,
      top: rect.top + scroller.clientTop,
      right: rect.left + scroller.clientLeft + scroller.clientWidth,
      bottom: rect.top + scroller.clientTop + scroller.clientHeight
    };
  }

  function scrollPosition(win, scroller) {
    const doc = win.document;
    const root = doc.scrollingElement || doc.documentElement;
    if (scroller === root || scroller === doc.documentElement || scroller === doc.body) {
      return { x: finite(win.scrollX, root.scrollLeft), y: finite(win.scrollY, root.scrollTop) };
    }
    return { x: scroller.scrollLeft, y: scroller.scrollTop };
  }

  function setScrollPosition(win, scroller, x, y) {
    const doc = win.document;
    const root = doc.scrollingElement || doc.documentElement;
    if (scroller === root || scroller === doc.documentElement || scroller === doc.body) {
      win.scrollTo(x, y);
      return;
    }
    scroller.scrollLeft = x;
    scroller.scrollTop = y;
  }

  function maxScrollPosition(win, scroller) {
    const doc = win.document;
    const root = doc.scrollingElement || doc.documentElement;
    if (scroller === root || scroller === doc.documentElement || scroller === doc.body) {
      return {
        x: Math.max(0, root.scrollWidth - win.innerWidth),
        y: Math.max(0, root.scrollHeight - win.innerHeight)
      };
    }
    return {
      x: Math.max(0, scroller.scrollWidth - scroller.clientWidth),
      y: Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    };
  }

  function nextAnimationFrame(win, signal) {
    return new Promise((resolve, reject) => {
      throwIfAborted(signal);
      const request = win.requestAnimationFrame?.bind(win)
        || (callback => win.setTimeout(() => callback(win.performance?.now?.() ?? performance.now()), 16));
      const cancel = win.cancelAnimationFrame?.bind(win) || win.clearTimeout.bind(win);
      let frameId = 0;
      const onAbort = () => {
        cancel(frameId);
        reject(abortException(signal));
      };
      frameId = request(timestamp => {
        signal?.removeEventListener('abort', onAbort);
        resolve(timestamp);
      });
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  function quadraticBezierScalar(p0, p1, p2, progress) {
    const inverse = 1 - progress;
    return (inverse * inverse * p0) + (2 * inverse * progress * p1) + (progress * progress * p2);
  }

  function quadraticBezier(start, control, end, progress) {
    return {
      x: quadraticBezierScalar(start.x, control.x, end.x, progress),
      y: quadraticBezierScalar(start.y, control.y, end.y, progress)
    };
  }

  function pointWithinRect(point, rect) {
    return point.x >= rect.left
      && point.x <= rect.right
      && point.y >= rect.top
      && point.y <= rect.bottom;
  }

  function createCorrelatedTrajectory(start, end, rect, random = Math.random) {
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const perpendicular = distance > Number.EPSILON
      ? { x: -(end.y - start.y) / distance, y: (end.x - start.x) / distance }
      : { x: 0, y: 0 };
    const bendStdDev = Math.min(2.4, Math.max(0.2, distance * 0.035));
    const bend = sampleTruncatedNormal({
      mean: 0,
      stdDev: bendStdDev,
      min: -bendStdDev * 2,
      max: bendStdDev * 2
    }, random);
    const controlMean = {
      x: midpoint.x + (perpendicular.x * bend),
      y: midpoint.y + (perpendicular.y * bend)
    };
    const controlStdDev = Math.min(1.4, Math.max(0.15, distance * 0.012));
    const control = {
      x: sampleTruncatedNormal({
        mean: controlMean.x,
        stdDev: controlStdDev,
        min: rect.left,
        max: rect.right
      }, random),
      y: sampleTruncatedNormal({
        mean: controlMean.y,
        stdDev: controlStdDev,
        min: rect.top,
        max: rect.bottom
      }, random)
    };
    return {
      start,
      end,
      control,
      rect,
      noiseX: 0,
      noiseY: 0,
      noiseStdDev: Math.min(0.85, Math.max(0.08, distance * 0.006))
    };
  }

  function sampleCorrelatedTrajectoryPoint(trajectory, progress, random = Math.random) {
    const base = quadraticBezier(trajectory.start, trajectory.control, trajectory.end, progress);
    const innovationScale = Math.sqrt(1 - (TOUCH_TRAJECTORY_NOISE_CORRELATION ** 2));
    const fade = Math.sin(Math.PI * progress);
    for (let attempt = 0; attempt < 32; attempt++) {
      const nextNoiseX = (TOUCH_TRAJECTORY_NOISE_CORRELATION * trajectory.noiseX)
        + (sampleStandardNormal(random) * trajectory.noiseStdDev * innovationScale);
      const nextNoiseY = (TOUCH_TRAJECTORY_NOISE_CORRELATION * trajectory.noiseY)
        + (sampleStandardNormal(random) * trajectory.noiseStdDev * innovationScale);
      const candidate = {
        x: base.x + (nextNoiseX * fade),
        y: base.y + (nextNoiseY * fade)
      };
      if (pointWithinRect(candidate, trajectory.rect)) {
        trajectory.noiseX = nextNoiseX;
        trajectory.noiseY = nextNoiseY;
        return candidate;
      }
    }
    trajectory.noiseX = 0;
    trajectory.noiseY = 0;
    return base;
  }

  function scrollVelocityEnvelope(progress) {
    if (progress <= 0.2) {
      return quadraticBezierScalar(0, 0.58, 1, progress / 0.2);
    }
    if (progress <= 0.72) return 1;
    return quadraticBezierScalar(1, 0.62, 0, (progress - 0.72) / 0.28);
  }

  function integrateScrollVelocity(progress, steps = 48) {
    if (progress <= 0) return 0;
    const count = Math.max(1, Math.ceil(steps * progress));
    const width = progress / count;
    let area = 0;
    let previous = scrollVelocityEnvelope(0);
    for (let index = 1; index <= count; index++) {
      const current = scrollVelocityEnvelope(index * width);
      area += ((previous + current) / 2) * width;
      previous = current;
    }
    return area;
  }

  const SCROLL_VELOCITY_AREA = integrateScrollVelocity(1);

  function sampleScrollGesturePoints(viewport, delta, random = Math.random) {
    const width = viewport.right - viewport.left;
    const height = viewport.bottom - viewport.top;
    const insetX = Math.min(12, width * 0.12);
    const insetY = Math.min(12, height * 0.12);
    const horizontalDominant = Math.abs(delta.x) > Math.abs(delta.y);
    const directionX = Math.sign(delta.x);
    const directionY = Math.sign(delta.y);
    const startMeanX = horizontalDominant
      ? viewport.left + (width * (directionX >= 0 ? 0.72 : 0.28))
      : viewport.left + (width * (0.5 + TOUCH_SESSION.rightOffsetX));
    const startMeanY = horizontalDominant
      ? viewport.top + (height * (0.5 + TOUCH_SESSION.verticalOffsetY))
      : viewport.top + (height * (directionY >= 0 ? 0.72 : 0.28));
    const endMeanX = horizontalDominant
      ? viewport.left + (width * (directionX >= 0 ? 0.28 : 0.72))
      : startMeanX;
    const endMeanY = horizontalDominant
      ? startMeanY
      : viewport.top + (height * (directionY >= 0 ? 0.28 : 0.72));
    const stdDevX = Math.max(0.5, width * 0.035);
    const stdDevY = Math.max(0.5, height * 0.035);
    const bounds = {
      left: viewport.left + insetX,
      top: viewport.top + insetY,
      right: viewport.right - insetX,
      bottom: viewport.bottom - insetY
    };
    return {
      bounds,
      start: {
        x: sampleTruncatedNormal({ mean: startMeanX, stdDev: stdDevX, min: bounds.left, max: bounds.right }, random),
        y: sampleTruncatedNormal({ mean: startMeanY, stdDev: stdDevY, min: bounds.top, max: bounds.bottom }, random)
      },
      end: {
        x: sampleTruncatedNormal({ mean: endMeanX, stdDev: stdDevX, min: bounds.left, max: bounds.right }, random),
        y: sampleTruncatedNormal({ mean: endMeanY, stdDev: stdDevY, min: bounds.top, max: bounds.bottom }, random)
      }
    };
  }

  function highResolutionNow(win) {
    return win.performance?.now?.() ?? performance.now();
  }

  async function animatePhysicalScroll(win, scroller, destination, signal) {
    const start = scrollPosition(win, scroller);
    const max = maxScrollPosition(win, scroller);
    const end = {
      x: Math.min(max.x, Math.max(0, destination.x)),
      y: Math.min(max.y, Math.max(0, destination.y))
    };
    const delta = { x: end.x - start.x, y: end.y - start.y };
    const distance = Math.hypot(delta.x, delta.y);
    if (distance < 1) return false;

    const speed = randomUniform(SCROLL_SPEED_MIN_PX_PER_SEC, SCROLL_SPEED_MAX_PX_PER_SEC);
    const rawDuration = (distance / speed) * 1000;
    const durationMean = Math.min(860, Math.max(170, rawDuration));
    const duration = sampleTruncatedNormalMs({
      mean: durationMean,
      stdDev: Math.max(18, durationMean * 0.08),
      min: 140,
      max: 900
    });
    const useInertia = distance >= SCROLL_INERTIA_MIN_DISTANCE_PX;
    const dragRatio = useInertia
      ? sampleTruncatedNormal({ mean: 0.86, stdDev: 0.025, min: 0.8, max: 0.91 })
      : 1;
    const viewport = scrollViewport(win, scroller);
    const gesture = sampleScrollGesturePoints(viewport, delta);
    const dispatchTarget = win.document.elementFromPoint(gesture.start.x, gesture.start.y)
      || (scroller.nodeType === 1 ? scroller : win.document.body);
    const identifier = Math.floor(randomUniform(1, 2_147_483_647));
    const trajectory = createCorrelatedTrajectory(gesture.start, gesture.end, gesture.bounds);
    let activePoint = gesture.start;
    let touchActive = false;

    try {
      const startTouch = createSyntheticTouch(win, dispatchTarget, identifier, activePoint);
      dispatchSyntheticTouch(win, dispatchTarget, 'touchstart', startTouch, true);
      touchActive = true;
      const startedAt = highResolutionNow(win);
      while (true) {
        const now = await nextAnimationFrame(win, signal);
        const elapsedProgress = Math.min(1, Math.max(0, (now - startedAt) / duration));
        const scrollProgress = integrateScrollVelocity(elapsedProgress) / SCROLL_VELOCITY_AREA;
        activePoint = sampleCorrelatedTrajectoryPoint(trajectory, elapsedProgress);
        const moveTouch = createSyntheticTouch(win, dispatchTarget, identifier, activePoint);
        dispatchSyntheticTouch(win, dispatchTarget, 'touchmove', moveTouch, true);
        setScrollPosition(
          win,
          scroller,
          start.x + (delta.x * dragRatio * scrollProgress),
          start.y + (delta.y * dragRatio * scrollProgress)
        );
        if (elapsedProgress >= 1) break;
      }

      activePoint = gesture.end;
      const endTouch = createSyntheticTouch(win, dispatchTarget, identifier, activePoint);
      dispatchSyntheticTouch(win, dispatchTarget, 'touchend', endTouch, false);
      touchActive = false;

      if (useInertia) {
        const inertiaStart = scrollPosition(win, scroller);
        const inertiaDuration = sampleTruncatedNormalMs(TOUCH_SCROLL_INERTIA_LATENCY_MS);
        const inertiaStartedAt = highResolutionNow(win);
        const decayDenominator = 1 - Math.exp(-5);
        while (true) {
          const now = await nextAnimationFrame(win, signal);
          const progress = Math.min(1, Math.max(0, (now - inertiaStartedAt) / inertiaDuration));
          const decayed = (1 - Math.exp(-5 * progress)) / decayDenominator;
          setScrollPosition(
            win,
            scroller,
            inertiaStart.x + ((end.x - inertiaStart.x) * decayed),
            inertiaStart.y + ((end.y - inertiaStart.y) * decayed)
          );
          if (progress >= 1) break;
        }
      }

      setScrollPosition(win, scroller, end.x, end.y);
      await abortableDelay(sampleTruncatedNormalMs(TOUCH_SCROLL_SETTLE_LATENCY_MS), signal);
      return true;
    } catch (error) {
      if (touchActive) {
        try {
          const cancelTouch = createSyntheticTouch(win, dispatchTarget, identifier, activePoint);
          dispatchSyntheticTouch(win, dispatchTarget, 'touchcancel', cancelTouch, false);
        } catch {}
      }
      throw error;
    }
  }

  const TARGET_PROBE_STEPS = 15;

  function probeTargetRect(target) {
    const doc = target?.ownerDocument;
    const view = doc?.defaultView;
    if (!doc?.elementFromPoint || !view || !target.isConnected) return null;
    const own = target.getBoundingClientRect?.();
    const host = target.parentElement?.getBoundingClientRect?.() || own;
    if (!host || !own) return null;
    const left = Math.max(0, Math.min(host.left, own.left));
    const top = Math.max(0, Math.min(host.top, own.top));
    const right = Math.min(finite(view.innerWidth, 0), Math.max(host.right, own.right));
    const bottom = Math.min(finite(view.innerHeight, 0), Math.max(host.bottom, own.bottom));
    if (!(right > left) || !(bottom > top)) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let row = 0; row < TARGET_PROBE_STEPS; row++) {
      const y = top + ((bottom - top) * ((row + 0.5) / TARGET_PROBE_STEPS));
      for (let column = 0; column < TARGET_PROBE_STEPS; column++) {
        const x = left + ((right - left) * ((column + 0.5) / TARGET_PROBE_STEPS));
        const hit = doc.elementFromPoint(x, y);
        if (!hit || (hit !== target && !target.contains(hit))) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return null;
    return {
      left: minX,
      top: minY,
      right: maxX,
      bottom: maxY,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  function pointForTarget(target, fractions) {
    let rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      rect = probeTargetRect(target);
      if (!rect) throw new FlowError('押下対象の大きさを取得できません', 'TARGET_HAS_NO_AREA');
    }
    if (!Number.isFinite(fractions?.x) || !Number.isFinite(fractions?.y)
      || fractions.x <= 0 || fractions.x >= 1
      || fractions.y <= 0 || fractions.y >= 1) {
      throw new FlowError('押下座標比率が要素範囲外です', 'TARGET_POINT_OUT_OF_RANGE');
    }
    return {
      rect,
      x: rect.left + (rect.width * fractions.x),
      y: rect.top + (rect.height * fractions.y)
    };
  }

  function pointInsideViewport(point, viewport, margin = 1) {
    return point.x >= viewport.left + margin
      && point.x < viewport.right - margin
      && point.y >= viewport.top + margin
      && point.y < viewport.bottom - margin;
  }

  async function ensureTargetPointVisible(target, fractions, { signal } = {}) {
    const win = target.ownerDocument.defaultView;
    let scrolled = false;
    for (const scroller of scrollableAncestors(target)) {
      throwIfAborted(signal);
      const point = pointForTarget(target, fractions);
      const viewport = scrollViewport(win, scroller);
      if (pointInsideViewport(point, viewport, 4)) continue;
      const current = scrollPosition(win, scroller);
      const anchorX = randomUniform(0.38, 0.62);
      const anchorY = randomUniform(0.34, 0.66);
      const desiredX = viewport.left + ((viewport.right - viewport.left) * anchorX);
      const desiredY = viewport.top + ((viewport.bottom - viewport.top) * anchorY);
      scrolled = await animatePhysicalScroll(win, scroller, {
        x: current.x + point.x - desiredX,
        y: current.y + point.y - desiredY
      }, signal) || scrolled;
    }
    const finalPoint = pointForTarget(target, fractions);
    const viewport = { left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight };
    if (!pointInsideViewport(finalPoint, viewport, 1)) {
      throw new FlowError('押下対象を画面内までスクロールできませんでした', 'TARGET_OFFSCREEN');
    }
    return { ...finalPoint, scrolled };
  }

  function sampleTouchStartFractions(random = Math.random) {
    const inset = TOUCH_COORDINATE_INSET_RATIO;
    return {
      x: sampleTruncatedNormal({
        mean: 0.5 + TOUCH_SESSION.rightOffsetX,
        stdDev: TOUCH_SESSION.startStdDevRatio,
        min: inset,
        max: 1 - inset
      }, random),
      y: sampleTruncatedNormal({
        mean: 0.5 + TOUCH_SESSION.verticalOffsetY,
        stdDev: TOUCH_SESSION.startStdDevRatio,
        min: inset,
        max: 1 - inset
      }, random)
    };
  }

  function sampleTouchEndPoint(start, rect, random = Math.random) {
    const stdDev = Math.min(
      TOUCH_DRIFT_STDDEV_MAX_PX,
      Math.max(
        TOUCH_DRIFT_STDDEV_MIN_PX,
        Math.min(rect.width, rect.height) * TOUCH_DRIFT_STDDEV_RATIO
      )
    );
    const insetX = Math.min(0.01, rect.width / 2);
    const insetY = Math.min(0.01, rect.height / 2);
    return {
      x: sampleTruncatedNormal({
        mean: start.x,
        stdDev,
        min: rect.left + insetX,
        max: rect.right - insetX
      }, random),
      y: sampleTruncatedNormal({
        mean: start.y,
        stdDev,
        min: rect.top + insetY,
        max: rect.bottom - insetY
      }, random)
    };
  }

  function determineTouchMoveCount(durationMs, distancePx, random = Math.random) {
    const duration = Math.max(1, finite(durationMs, 1));
    const distance = Math.max(0, finite(distancePx, 0));
    const meanIntervalMs = sampleTruncatedNormal({
      mean: 15.5,
      stdDev: 3.4,
      min: 7.5,
      max: 27
    }, random);
    const expectedCount = (duration / meanIntervalMs) + Math.min(4.5, distance / 2.4);
    const dynamicMaximum = Math.max(2, Math.floor(duration / 5.5));
    return Math.round(sampleTruncatedNormal({
      mean: Math.max(1, expectedCount),
      stdDev: Math.max(1.15, expectedCount * 0.34),
      min: 1,
      max: dynamicMaximum
    }, random));
  }

  function sampleTouchMoveProgresses(moveCount, random = Math.random) {
    const count = Math.max(1, Math.floor(finite(moveCount, 1)));
    const gapCount = count + 1;
    const gaps = [];
    let previousWeight = 1;
    for (let index = 0; index < gapCount; index++) {
      const independentWeight = Math.exp(sampleTruncatedNormal({
        mean: 0,
        stdDev: 0.52,
        min: -1.35,
        max: 1.35
      }, random));
      const correlatedWeight = (previousWeight * 0.38) + (independentWeight * 0.62);
      const edgeScale = index === 0 || index === gapCount - 1
        ? sampleTruncatedNormal({ mean: 1.08, stdDev: 0.16, min: 0.72, max: 1.48 }, random)
        : 1;
      const weight = Math.max(0.08, correlatedWeight * edgeScale);
      gaps.push(weight);
      previousWeight = weight;
    }
    const total = gaps.reduce((sum, gap) => sum + gap, 0);
    const progresses = [];
    let elapsed = 0;
    for (let index = 0; index < count; index++) {
      elapsed += gaps[index];
      progresses.push(elapsed / total);
    }
    return progresses;
  }

  async function waitForGestureProgress(win, startedAt, durationMs, progress, signal) {
    const targetTime = startedAt + (durationMs * progress);
    while (true) {
      const remaining = targetTime - highResolutionNow(win);
      if (remaining <= 0) return;
      if (remaining > 20) {
        await abortableDelay(remaining - 8, signal);
      } else {
        await nextAnimationFrame(win, signal);
      }
    }
  }

  async function jqTapStrict(target, { signal, label: targetLabel = '対象', fast = false, handoff = false } = {}) {
    if (!target || !target.isConnected) throw new FlowError(`${targetLabel}が見つかりません`, 'TARGET_MISSING');
    return queueExclusive(async () => {
      throwIfAborted(signal);
      if (activeTapTargets.has(target)) throw new FlowError(`${targetLabel}はすでに押下処理中です`, 'TAP_BUSY');
      const win = target.ownerDocument?.defaultView;
      if (!win || win !== frameWindow()) throw new FlowError(`${targetLabel}が現在のiframeに属していません`, 'STALE_TARGET');
      activeTapTargets.add(target);
      let dispatchTarget = null;
      let identifier = null;
      let activePoint = null;
      let touchActive = false;
      try {
        let start = null;
        let sawStablePoint = false;
        for (let attempt = 0; attempt < 8; attempt++) {
          const fractions = sampleTouchStartFractions();
          await ensureTargetPointVisible(target, fractions, { signal });
          const visibleLatency = handoff
            ? TOUCH_HANDOFF_VISIBLE_LATENCY_MS
            : fast ? TOUCH_FAST_VISIBLE_LATENCY_MS : TOUCH_VISIBLE_LATENCY_MS;
          await abortableDelay(sampleTruncatedNormalMs(visibleLatency), signal);
          if (!target.isConnected || target.ownerDocument?.defaultView !== frameWindow()) {
            throw new FlowError(`${targetLabel}が押下直前に無効になりました`, 'STALE_TARGET');
          }
          const checked = await ensureTargetPointVisible(target, fractions, { signal });
          if (checked.scrolled) continue;
          sawStablePoint = true;
          const hit = target.ownerDocument.elementFromPoint(checked.x, checked.y);
          if (!hit || (hit !== target && !target.contains(hit))) continue;
          start = checked;
          dispatchTarget = hit;
          break;
        }
        if (!start) {
          const code = sawStablePoint ? 'TARGET_OCCLUDED' : 'TARGET_UNSTABLE';
          const reason = sawStablePoint
            ? `${targetLabel}のガウス座標が他要素に遮られています`
            : `${targetLabel}の表示位置が安定しません`;
          throw new FlowError(reason, code);
        }
        identifier = Math.floor(randomUniform(1, 2_147_483_647));
        activePoint = start;
        const startTouch = createSyntheticTouch(win, dispatchTarget, identifier, start);
        dispatchSyntheticTouch(win, dispatchTarget, 'touchstart', startTouch, true);
        touchActive = true;
        const holdLatency = handoff
          ? TOUCH_HANDOFF_HOLD_LATENCY_MS
          : fast ? TOUCH_FAST_HOLD_LATENCY_MS : TOUCH_HOLD_LATENCY_MS;
        const holdDuration = sampleTruncatedNormalMs(holdLatency);
        const endPoint = sampleTouchEndPoint(start, start.rect);
        const movement = Math.hypot(endPoint.x - start.x, endPoint.y - start.y);
        const moveCount = determineTouchMoveCount(holdDuration, movement);
        const moveProgresses = sampleTouchMoveProgresses(moveCount);
        const trajectory = createCorrelatedTrajectory(start, endPoint, start.rect);
        const startedAt = highResolutionNow(win);
        for (const moveProgress of moveProgresses) {
          await waitForGestureProgress(win, startedAt, holdDuration, moveProgress, signal);
          const movePoint = sampleCorrelatedTrajectoryPoint(trajectory, moveProgress);
          activePoint = movePoint;
          const moveTouch = createSyntheticTouch(win, dispatchTarget, identifier, movePoint);
          dispatchSyntheticTouch(win, dispatchTarget, 'touchmove', moveTouch, true);
        }
        await waitForGestureProgress(win, startedAt, holdDuration, 1, signal);
        activePoint = endPoint;
        const endTouch = createSyntheticTouch(win, dispatchTarget, identifier, endPoint);
        dispatchSyntheticTouch(win, dispatchTarget, 'touchend', endTouch, false);
        touchActive = false;
        await sleepMicrotask();
      } catch (error) {
        if (touchActive && dispatchTarget && activePoint && identifier != null) {
          try {
            const cancelTouch = createSyntheticTouch(win, dispatchTarget, identifier, activePoint);
            dispatchSyntheticTouch(win, dispatchTarget, 'touchcancel', cancelTouch, false);
          } catch {}
        }
        throw error;
      } finally {
        activeTapTargets.delete(target);
      }
    });
  }

  function configuredElementState(config, diagnostics = null) {
    const pending = reason => {
      if (diagnostics) diagnostics.reason = reason;
      return false;
    };
    const selector = String(config.selector || '').trim();
    if (!selector) throw new FlowError('押すボタンのセレクタが空です', 'TARGET_SELECTOR_EMPTY');
    const doc = frameDocument();
    let matches;
    try {
      matches = [...doc.querySelectorAll(selector)];
    } catch {
      throw new FlowError('押すボタンのセレクタ書式が不正です', 'INVALID_SELECTOR');
    }
    if (matches.length > 1) {
      throw new FlowError(`押すボタンが${matches.length}件一致しました。画面から選び直してください`, 'TARGET_AMBIGUOUS');
    }
    const target = matches[0] || null;
    if (!target) return pending('一致する要素がありません');
    if (!computedVisible(target)) {
      const rect = target.getBoundingClientRect?.();
      const width = Math.round(finite(rect?.width, 0));
      const height = Math.round(finite(rect?.height, 0));
      if (width > 0 && height > 0) return pending('要素が非表示です');
      if (!probeTargetRect(target)) return pending(`要素の大きさが0です（${width}×${height}）`);
    }
    const disabled = Boolean(
      ('disabled' in target && target.disabled)
      || target.getAttribute('aria-disabled') === 'true'
      || target.classList.contains('disabled')
    );
    if (disabled) return pending('要素が無効化されています');
    if (diagnostics) diagnostics.reason = '';
    return { target, selector };
  }

  async function tapConfiguredElement(config, context) {
    const selector = String(config.selector || '').trim();
    const label = String(config.targetLabel || '').trim() || selector || '指定ボタン';
    const timeoutMs = clamp(finite(config.timeoutSec, 30), 1, 600) * 1000;
    const deadline = performance.now() + timeoutMs;
    const diagnostics = { reason: '' };
    const timeoutError = () => new FlowError(
      diagnostics.reason
        ? `${label}待ちがタイムアウトしました（${diagnostics.reason}）`
        : `${label}待ちがタイムアウトしました`,
      'TIMEOUT'
    );
    while (true) {
      throwIfAborted(context.signal);
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw timeoutError();
      let found;
      try {
        found = await monitorFrame(() => configuredElementState(config, diagnostics), {
          signal: context.signal,
          timeoutMs: remaining,
          stableMs: 0,
          description: `${label}待ち`,
          observeCharacterData: false
        });
      } catch (error) {
        if (error?.code === 'TIMEOUT') throw timeoutError();
        throw error;
      }
      try {
        await jqTapStrict(found.target, { signal: context.signal, label });
        return { selector, label };
      } catch (error) {
        if (error?.code !== 'STALE_TARGET') throw error;
      }
    }
  }

  function randomUniform(min, max, random = Math.random) {
    const a = finite(min, 0);
    const b = finite(max, 0);
    if (b < a) throw new FlowError('ランダム待機の最大値が最小値未満です', 'INVALID_RANGE');
    return a + random() * (b - a);
  }

  function gbfStateObservationRoots(doc = frameDocument()) {
    return [
      doc.querySelector('#pop'),
      doc.querySelector('#prt-assist-search'),
      doc.querySelector(SELECTORS.assistList),
      doc.querySelector(SELECTORS.supporterScreen),
      doc.querySelector(SELECTORS.unclaimedList),
      doc.querySelector(SELECTORS.battleScreen),
      doc.querySelector('#loading'),
      doc.querySelector('#ready')
    ].filter(Boolean);
  }

  function waitForGbfState(accepted, {
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    stableMs = 0,
    description = '画面状態待ち',
    intervalMs = null
  } = {}) {
    const acceptedSet = new Set(accepted);
    return monitorFrame(() => {
      const stateInfo = detectScreenState();
      if (stateInfo.type === 'UNKNOWN_ERROR') return stateInfo;
      return acceptedSet.has(stateInfo.type) ? stateInfo : false;
    }, {
      signal,
      timeoutMs,
      stableMs,
      description,
      observeRoots: gbfStateObservationRoots,
      intervalMs
    });
  }

  function assertNoUnknownPopup(doc = frameDocument()) {
    const popup = popupInfo(doc);
    if (popup?.type === 'UNKNOWN_ERROR') {
      throw new FlowError(`未知のエラー本文を検出しました: ${popup.rawText || '(空)'}`, 'UNKNOWN_POPUP', popup);
    }
    return popup;
  }

  async function tapPopupOk(popup, { signal, timeoutMs = DEFAULT_TIMEOUT_MS, expected = null } = {}) {
    if (!popup?.ok) throw new FlowError('表示中エラーポップアップのOKが見つかりません', 'POPUP_OK_MISSING');
    if (expected) {
      return runObservedAction(
        waitSignal => waitForGbfState(expected, {
          signal: waitSignal,
          timeoutMs,
          description: 'エラー後画面待ち'
        }),
        () => jqTapStrict(popup.ok, { signal, label: 'エラーポップアップOK' }),
        { signal, cancelMessage: 'エラー後画面監視を解除しました' }
      );
    }
    const before = captureFrameState({ includeDocument: true });
    await jqTapStrict(popup.ok, { signal, label: 'エラーポップアップOK' });
    return monitorFrame(() => {
      const current = popupInfo();
      if (!current) return { closed: true };
      if (current.popup !== popup.popup) return { changed: true };
      const changed = frameDocument() !== before.doc || currentFrameUrl() !== before.href;
      return changed ? { changed: true } : false;
    }, { signal, timeoutMs, stableMs: 80, description: 'ポップアップ終了待ち' });
  }

  function parseAssistRow(row, index = 0) {
    const hp = parseFloat(row.querySelector('.prt-raid-gauge-inner')?.style.width ?? 'NaN');
    const peopleText = row.querySelector('.prt-flees-in')?.textContent?.trim() ?? '';
    const currentPeople = Number.parseInt(peopleText.split('/')[0], 10);
    return {
      row,
      index,
      hp,
      peopleText,
      currentPeople,
      raidId: String(row.dataset.raidId || ''),
      score: Number.isFinite(hp) && Number.isInteger(currentPeople) && currentPeople > 0
        ? (hp ** 3) / currentPeople
        : Number.NEGATIVE_INFINITY
    };
  }

  function rankAssistRows(rows, hpThreshold = 50, comparison = 'atLeast') {
    return [...rows].map(parseAssistRow).filter(item =>
      Number.isFinite(item.hp)
      && (comparison === 'atMost' ? item.hp <= hpThreshold : item.hp >= hpThreshold)
      && Number.isInteger(item.currentPeople)
      && item.currentPeople > 0
    ).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });
  }

  const MAX_RECENT_RAID_IDS = 128;
  const ASSIST_HANDOFF_POLL_MS = 50;
  const ASSIST_SLOT_SETTLE_MS = 700;
  const ASSIST_RETRY_ROUTE = '#quest/assist/multi/0';
  const MAX_ASSIST_RECOVERY_RELOADS = 10;
  const ASSIST_SLOT_SETTLE_POLL_MS = 120;
  const ASSIST_RECOVERABLE_CODES = Object.freeze([
    'TIMEOUT', 'TARGET_OCCLUDED', 'TARGET_UNSTABLE', 'STALE_TARGET', 'TAP_BUSY',
    'TARGET_MISSING', 'ASSIST_LIST_MISSING', 'ASSIST_SLOT_MISSING', 'REFRESH_MISSING',
    'FRAME_UNAVAILABLE', 'NAVIGATION_FAILED'
  ]);

  function recentRaidIdSet(context = state.running) {
    const target = context || state.running;
    if (!target) return null;
    if (!(target.recentRaidIds instanceof Set)) target.recentRaidIds = new Set();
    return target.recentRaidIds;
  }

  function rememberRecentRaidId(context, raidId) {
    const normalized = String(raidId || '').trim();
    if (!normalized) return false;
    const ids = recentRaidIdSet(context);
    if (!ids) return false;
    if (ids.has(normalized)) ids.delete(normalized);
    ids.add(normalized);
    while (ids.size > MAX_RECENT_RAID_IDS) {
      const oldest = ids.values().next().value;
      ids.delete(oldest);
    }
    return true;
  }

  function wasRecentRaidId(context, raidId) {
    const normalized = String(raidId || '').trim();
    if (!normalized) return false;
    return Boolean(recentRaidIdSet(context)?.has(normalized));
  }

  function findAssistRowByRaidId(raidId, doc = frameDocument()) {
    const normalizedRaidId = String(raidId || '');
    if (!normalizedRaidId) return null;
    return [...doc.querySelectorAll(SELECTORS.assistRows)].find(row =>
      String(row.dataset.raidId || '') === normalizedRaidId
    ) || null;
  }

  // 一覧が押下直前に差し替わると、押そうとした行が古いDOMのままになったり
  // ローディング幕に覆われたりして TARGET_OCCLUDED / TARGET_UNSTABLE になる。
  // その場合は最新のDOMから同じraidIdを取り直して押し直す。
  const ASSIST_ROW_REBIND_CODES = Object.freeze(['STALE_TARGET', 'TARGET_OCCLUDED', 'TARGET_UNSTABLE', 'TARGET_MISSING']);

  async function waitAssistListPaintable(signal, timeoutMs = 1500) {
    const deadline = performance.now() + Math.max(0, timeoutMs);
    while (performance.now() < deadline) {
      throwIfAborted(signal);
      let doc;
      try { doc = frameDocument(); } catch { return false; }
      if (pageBaseReady(doc)) return true;
      await abortableDelay(60, signal);
    }
    return false;
  }

  async function tapCurrentAssistRow(selected, context, { maxRebinds = 20, fast = false, handoff = false } = {}) {
    const { signal } = context;
    const raidId = String(selected?.raidId || '');
    const label = `救援 ${raidId || selected?.index + 1 || ''}`.trim();
    let target = selected?.row || null;
    let rebound = false;

    for (let rebind = 0; rebind <= maxRebinds; rebind++) {
      throwIfAborted(signal);
      if (rebound) await waitAssistListPaintable(signal);
      const latest = raidId ? findAssistRowByRaidId(raidId) : null;
      if (latest) target = latest;
      if (!target || !target.isConnected) return false;

      try {
        await jqTapStrict(target, { signal, label, fast, handoff });
        resetBattleEndDetection({ expectedRaidId: raidId });
        return true;
      } catch (error) {
        if (!ASSIST_ROW_REBIND_CODES.includes(error?.code)) throw error;
        rebound = true;
        target = raidId ? findAssistRowByRaidId(raidId) : null;
        if (!target) return false;
      }
    }

    return false;
  }

  function assistListSignature(list) {
    if (!list) return '';
    let signature = '';
    for (const row of list.children) {
      if (!row.matches?.('.btn-multi-raid.lis-raid.search')) continue;
      const hp = row.querySelector('.prt-raid-gauge-inner')?.style.width || '';
      const people = normalizePopupText(row.querySelector('.prt-flees-in')?.textContent || '');
      signature += `${row.dataset.raidId || ''}:${hp}:${people}|`;
    }
    return signature;
  }

  async function waitRandomized(baseSec, jitterSec, signal) {
    const base = Math.max(0, finite(baseSec, 0));
    const jitter = Math.max(0, finite(jitterSec, 0));
    const actual = Math.max(0, base + randomUniform(-jitter, jitter));
    await abortableDelay(actual * 1000, signal);
  }

  async function runAssistListTransition(beforeList, config, signal, action, {
    expectedSlot = null,
    description = '救援一覧切替完了待ち',
    cancelMessage = '救援一覧切替監視を解除しました'
  } = {}) {
    const beforeSignature = assistListSignature(beforeList);
    const observationRoot = beforeList.parentElement || beforeList;
    let sawMutation = false;
    let sawLoading = false;
    let loadingEnded = false;
    let slotActiveSince = null;
    const observer = new MutationObserver(() => { sawMutation = true; });
    if (!lightweightMode) {
      observer.observe(observationRoot, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
        characterData: true
      });
    }
    try {
      return await runObservedAction(
        waitSignal => monitorFrame(() => {
          const docNow = frameDocument();
          const listNow = docNow.querySelector(SELECTORS.assistList);
          const loadingVisible = !hiddenOrAbsent(docNow, '#loading') || !hiddenOrAbsent(docNow, '#ready');
          if (loadingVisible) sawLoading = true;
          if (sawLoading && !loadingVisible) loadingEnded = true;
          const reconstructed = Boolean(listNow && listNow !== beforeList);
          const changedSignature = Boolean(!sawMutation && listNow && assistListSignature(listNow) !== beforeSignature);
          const slotReady = expectedSlot == null || activeAssistSlot(docNow) === expectedSlot;
          if (!slotReady || loadingVisible) slotActiveSince = null;
          else if (slotActiveSince == null) slotActiveSince = performance.now();
          // 切替先の救援番号にも一覧にも1件も救援が無いと、DOMは何も変化しないため
          // 「タブが切り替わって読込も終わった」状態が続いたら完了とみなす。
          const slotSettled = Boolean(expectedSlot != null && slotActiveSince != null
            && performance.now() - slotActiveSince >= ASSIST_SLOT_SETTLE_MS);
          const completed = reconstructed || changedSignature || loadingEnded || sawMutation || slotSettled;
          if (!slotReady || !completed || !listNow || loadingVisible) return false;
          return { list: listNow, reconstructed, changedSignature, loadingEnded, sawMutation, slotSettled };
        }, {
          signal: waitSignal,
          timeoutMs: config.timeoutSec * 1000,
          stableMs: 0,
          description,
          observeRoots: [],
          intervalMs: expectedSlot == null ? null : ASSIST_SLOT_SETTLE_POLL_MS
        }),
        action,
        { signal, cancelMessage }
      );
    } finally {
      observer.disconnect();
    }
  }

  async function refreshAssistList(config, context, { waitForCompletion = true } = {}) {
    const { signal } = context;
    await waitRandomized(config.baseDelaySec, config.jitterSec, signal);
    const doc = frameDocument();
    assertNoUnknownPopup(doc);
    if (detectScreenState(doc).type !== 'ASSIST_LIST') {
      await waitForFrameReady({ signal, timeoutMs: config.timeoutSec * 1000, expectedScreen: 'assist' });
    }
    const currentDoc = frameDocument();
    const refresh = currentDoc.querySelector(SELECTORS.assistRefresh);
    const beforeList = currentDoc.querySelector(SELECTORS.assistList);
    if (!refresh || !computedVisible(refresh)) throw new FlowError('救援一覧の更新ボタンが表示されていません', 'REFRESH_MISSING');
    if (!beforeList) throw new FlowError('救援一覧コンテナが見つかりません', 'ASSIST_LIST_MISSING');
    if (!waitForCompletion) {
      await jqTapStrict(refresh, { signal, label: '救援一覧更新', fast: true });
      return { tapped: true, waitedForCompletion: false };
    }
    const completion = await runAssistListTransition(
      beforeList,
      config,
      signal,
      () => jqTapStrict(refresh, { signal, label: '救援一覧更新', fast: true }),
      {
        description: '救援一覧更新完了待ち',
        cancelMessage: '救援一覧更新監視を解除しました'
      }
    );
    return { tapped: true, waitedForCompletion: true, completion };
  }

  async function switchAssistSlot(slot, config, context) {
    const { signal } = context;
    const normalized = int(slot, 0);
    if (normalized < 1 || normalized > 4) throw new FlowError(`救援番号が不正です: ${slot}`, 'INVALID_ASSIST_SLOT');
    await waitRandomized(config.baseDelaySec, config.jitterSec, signal);
    const doc = frameDocument();
    assertNoUnknownPopup(doc);
    if (detectScreenState(doc).type !== 'ASSIST_LIST') {
      await waitForFrameReady({ signal, timeoutMs: config.timeoutSec * 1000, expectedScreen: 'assist' });
    }
    const currentDoc = frameDocument();
    const button = currentDoc.querySelector(`${SELECTORS.assistSlot}[data-slot="${normalized}"]`);
    const beforeList = currentDoc.querySelector(SELECTORS.assistList);
    const beforeActive = activeAssistSlot(currentDoc);
    if (!button || !computedVisible(button)) throw new FlowError(`救援番号${normalized}が表示されていません`, 'ASSIST_SLOT_MISSING');
    if (!beforeList) throw new FlowError('救援一覧コンテナが見つかりません', 'ASSIST_LIST_MISSING');
    if (beforeActive === normalized) return { tapped: false, slot: normalized, alreadyActive: true };
    const completion = await runAssistListTransition(
      beforeList,
      config,
      signal,
      () => jqTapStrict(button, { signal, label: `救援番号${normalized}`, fast: true }),
      {
        expectedSlot: normalized,
        description: `救援番号${normalized}切替完了待ち`,
        cancelMessage: `救援番号${normalized}切替監視を解除しました`
      }
    );
    return { tapped: true, slot: normalized, completion };
  }

  function activeAssistSlot(doc = frameDocument()) {
    const active = doc.querySelector(`${SELECTORS.assistSlot}.active[data-slot]`);
    const slot = Number.parseInt(active?.dataset.slot || '', 10);
    return Number.isInteger(slot) ? slot : null;
  }

  function visibleSupporterRows(doc = frameDocument()) {
    return [...doc.querySelectorAll(SELECTORS.supporterRows)].filter(computedVisible);
  }

  function parseSupporterRow(row, index = 0) {
    const name = String(row.querySelector('.js-summon-name')?.textContent || '').trim();
    const levelText = String(row.querySelector('.txt-summon-level')?.textContent || '').trim();
    const match = levelText.match(/Lv\s*(\d+)/i);
    const level = match ? Number.parseInt(match[1], 10) : Number.NaN;
    const friend = Boolean(row.querySelector('.prt-supporter-name.ico-friend'));
    return { row, index, name, level, friend, valid: Boolean(name) && Number.isInteger(level) };
  }

  function chooseSupporter(rows, candidates, random = Math.random) {
    const parsed = [...rows].map(parseSupporterRow).filter(item => item.valid && computedVisible(item.row));
    for (const candidate of normalizeCandidates(candidates)) {
      if (!candidate.name) continue;
      const matches = parsed.filter(item => item.name === candidate.name && item.level >= candidate.minimumLevel);
      const friends = matches.filter(item => item.friend);
      if (friends.length) return friends[0];
      if (matches.length) {
        const maxLevel = Math.max(...matches.map(item => item.level));
        return matches.find(item => item.level === maxLevel) || null;
      }
    }
    if (!parsed.length) return null;
    const maxLevel = Math.max(...parsed.map(item => item.level));
    const highest = parsed.filter(item => item.level === maxLevel);
    if (highest.length === 1) return highest[0];
    const index = Math.min(highest.length - 1, Math.floor(random() * highest.length));
    return highest[index];
  }

  async function waitForSupporterRows(config, context) {
    return monitorFrame(() => {
      const doc = frameDocument();
      const deckOk = doc.querySelector(SELECTORS.deckOk);
      if (deckOk && computedVisible(deckOk)) return { deckOk, rows: [] };
      const rows = visibleSupporterRows(doc).filter(row => parseSupporterRow(row).valid);
      return rows.length ? { rows } : false;
    }, {
      signal: context.signal,
      timeoutMs: config.timeoutSec * 1000,
      stableMs: config.fastTap ? 0 : 80,
      description: 'サポーター候補待ち',
      intervalMs: config.fastTap ? ASSIST_HANDOFF_POLL_MS : null
    });
  }

  async function selectSupporterConditional(config, context) {
    const { signal } = context;
    const doc = frameDocument();
    assertNoUnknownPopup(doc);
    const deckOk = doc.querySelector(SELECTORS.deckOk);
    if (deckOk && computedVisible(deckOk)) return { alreadySelected: true, deckOk };
    const result = await waitForSupporterRows(config, context);
    if (result.deckOk) return { alreadySelected: true, deckOk: result.deckOk };
    const selected = chooseSupporter(result.rows, config.supporterCandidates);
    if (!selected) throw new FlowError('有効なサポーター行または召喚石レベルを取得できません', 'SUPPORTER_NOT_FOUND');
    const next = await runObservedAction(
      waitSignal => waitForGbfState(['DECK_CONFIRM', 'MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR'], {
        signal: waitSignal,
        timeoutMs: config.timeoutSec * 1000,
        description: 'サポーター選択後待ち',
        intervalMs: config.fastTap ? ASSIST_HANDOFF_POLL_MS : null
      }),
      () => jqTapStrict(selected.row, {
        signal,
        label: `サポーター ${selected.name}`,
        fast: Boolean(config.fastTap),
        handoff: Boolean(config.fastTap)
      }),
      { signal, cancelMessage: 'サポーター選択監視を解除しました' }
    );
    if (next.type === 'UNKNOWN_ERROR') assertNoUnknownPopup();
    return { selected, next };
  }

  async function selectSupporterAuto(config, context) {
    const { signal } = context;
    const doc = frameDocument();
    assertNoUnknownPopup(doc);
    const deckOk = doc.querySelector(SELECTORS.deckOk);
    if (deckOk && computedVisible(deckOk)) return { alreadySelected: true, deckOk };
    const auto = doc.querySelector(SELECTORS.supporterAuto);
    if (!auto || !computedVisible(auto)) throw new FlowError('サポーター自動選択ボタンが表示されていません', 'SUPPORTER_AUTO_MISSING');
    return runObservedAction(
      waitSignal => waitForGbfState(['DECK_CONFIRM', 'MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR'], {
        signal: waitSignal,
        timeoutMs: config.timeoutSec * 1000,
        description: 'サポーター自動選択後待ち',
        intervalMs: config.fastTap ? ASSIST_HANDOFF_POLL_MS : null
      }),
      () => jqTapStrict(auto, {
        signal,
        label: 'サポーター自動選択',
        fast: Boolean(config.fastTap),
        handoff: Boolean(config.fastTap)
      }),
      { signal, cancelMessage: 'サポーター自動選択監視を解除しました' }
    );
  }

  async function returnToAssistFromUnclaimed(config, context) {
    const { signal } = context;
    const doc = frameDocument();
    const returnButton = doc.querySelector(SELECTORS.assistReturn);
    if (returnButton && computedVisible(returnButton)) {
      const before = captureFrameState({ includeDocument: true });
      return runObservedAction(
        waitSignal => waitForFrameReady({
          signal: waitSignal,
          timeoutMs: config.timeoutSec * 1000,
          expectedScreen: 'assist',
          before,
          requireChange: true
        }),
        () => jqTapStrict(returnButton, { signal, label: '救援一覧へ戻る' }),
        { signal, cancelMessage: '救援一覧復帰監視を解除しました' }
      );
    }
    return performFrameOperation(() => {
      frameWindow().location.href = gameRouteUrl('#quest/assist/multi/0');
    }, { signal, timeoutMs: config.timeoutSec * 1000, expectedScreen: 'assist', requireChange: true });
  }

  async function confirmAllUnclaimed(config, context) {
    const { signal } = context;
    await waitForFrameReady({ signal, timeoutMs: config.timeoutSec * 1000, expectedScreen: 'unclaimed' });
    let processed = 0;
    while (true) {
      throwIfAborted(signal);
      const doc = frameDocument();
      assertNoUnknownPopup(doc);
      const topRow = doc.querySelector(SELECTORS.unclaimedRows);
      if (!topRow) break;
      if (processed >= config.maxItems) throw new FlowError('未確認バトル処理が安全上限件数を超えました', 'UNCLAIMED_LIMIT');
      const href = String(topRow.dataset.href || '');
      const before = captureFrameState({ includeDocument: true });
      await runObservedAction(
        waitSignal => monitorFrame(() => {
          const url = currentFrameUrl();
          const docNow = frameDocument();
          if (!pageBaseReady(docNow)) return false;
          const changed = docNow !== before.doc || url !== before.href || url.includes('result_multi/') || !docNow.querySelector(SELECTORS.unclaimedList);
          return changed ? { url } : false;
        }, {
          signal: waitSignal,
          timeoutMs: config.timeoutSec * 1000,
          stableMs: DEFAULT_STABLE_MS,
          description: '未確認結果画面待ち',
          observeRoots: gbfStateObservationRoots
        }),
        () => jqTapStrict(topRow, { signal, label: `未確認バトル ${href}` }),
        { signal, cancelMessage: '未確認結果画面監視を解除しました' }
      );
      processed += 1;
      await performFrameOperation(() => {
        frameWindow().location.href = gameRouteUrl('#quest/assist/unclaimed/0/0');
      }, { signal, timeoutMs: config.timeoutSec * 1000, expectedScreen: 'unclaimed', requireChange: true });
    }
    await returnToAssistFromUnclaimed(config, context);
    return { processed };
  }

  function runtimeFlagEnabled(value) {
    return value === true || value === 1 || value === '1';
  }

  function battleRuntimeState(doc = frameDocument()) {
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

  function resetBattleEndDetection({ expectedRaidId = '' } = {}) {
    state.battleEndArmed = false;
    state.battleEndArmedAt = 0;
    state.activeBattleDocument = null;
    state.activeBattleStatus = null;
    state.expectedBattleRaidId = String(expectedRaidId || '');
  }

  function battleControlReady(doc, runtime = battleRuntimeState(doc)) {
    if (runtime?.expectedRaidId && !runtime.matchesExpectedBattle) return false;
    if (runtime?.status) {
      if (runtime.finished) return false;
      return Boolean(
        runtime.autoButtonEnabled
        || runtime.autoAttack
        || runtime.attacking
        || runtime.attackButtonPushed
      );
    }
    if (!pageBaseReady(doc) || !doc.querySelector(SELECTORS.battleScreen)) return false;
    return computedVisible(doc.querySelector(SELECTORS.fullAuto))
      || computedVisible(doc.querySelector(SELECTORS.attackStart));
  }

  function armBattleEndDetection(doc = frameDocument(), runtime = battleRuntimeState(doc)) {
    if (!battleControlReady(doc, runtime)) return false;
    const sameSession = state.battleEndArmed
      && state.activeBattleDocument === doc
      && (!state.activeBattleStatus || !runtime.status || state.activeBattleStatus === runtime.status)
      && (!state.expectedBattleRaidId || !runtime.raidId || state.expectedBattleRaidId === runtime.raidId);
    if (!sameSession) {
      state.battleEndArmed = true;
      state.battleEndArmedAt = performance.now();
      state.activeBattleDocument = doc;
    }
    if (runtime.status) state.activeBattleStatus = runtime.status;
    if (!state.expectedBattleRaidId && runtime.raidId) state.expectedBattleRaidId = runtime.raidId;
    if (runtime.raidId) rememberRecentRaidId(state.running, runtime.raidId);
    return true;
  }

  function battleEndDetectionMatches(runtime) {
    if (!state.battleEndArmed) return false;
    if (state.expectedBattleRaidId && runtime?.raidId && runtime.raidId !== state.expectedBattleRaidId) return false;
    if (state.activeBattleStatus && runtime?.status && runtime.status !== state.activeBattleStatus) return false;
    return true;
  }

  function fullAutoState(doc = frameDocument()) {
    const button = doc.querySelector(SELECTORS.fullAuto);
    const runtime = battleRuntimeState(doc);
    const visible = runtime.available ? elementDisplayOn(button) : computedVisible(button);
    return {
      button,
      exists: Boolean(button),
      visible,
      enabled: runtime.available ? runtime.autoButtonEnabled : visible,
      on: runtime.available ? runtime.autoAttack : Boolean(button?.classList.contains('on')),
      runtime
    };
  }

  function battleObservationRoots(doc = frameDocument()) {
    const essential = [
      doc.querySelector(SELECTORS.fullAuto),
      doc.querySelector(SELECTORS.attackStart),
      doc.querySelector(SELECTORS.attackDummy),
      doc.querySelector(SELECTORS.attackCancel),
      doc.querySelector('.prt-command-end'),
      doc.querySelector('#pop'),
      doc.querySelector('#pop-force')
    ];
    if (!lightweightMode) {
      essential.push(
        doc.querySelector('#cnt-raid-information'),
        doc.querySelector('.prt-command .prt-member'),
        doc.querySelector('.prt-gauge-area'),
        doc.querySelector(SELECTORS.turn)
      );
    }
    return essential.filter(Boolean);
  }

  function detectBattleEndState(doc = frameDocument()) {
    const runtime = battleRuntimeState(doc);
    armBattleEndDetection(doc, runtime);
    if (!battleEndDetectionMatches(runtime)) return null;

    const url = currentFrameUrl();
    if (isBattleResultUrl(url)) return { type: 'RESULT', reason: 'リザルト画面を検出', url };

    if (
      runtime.finished
      && runtime.status
      && (!state.activeBattleStatus || runtime.status === state.activeBattleStatus)
    ) {
      return { type: 'RUNTIME_FINISHED', reason: '起動確認済みの現戦闘終了状態を検出', runtime };
    }

    if (doc !== state.activeBattleDocument) return null;
    if (performance.now() - state.battleEndArmedAt < DEFAULT_STABLE_MS) return null;

    const notice = doc.querySelector(SELECTORS.battleEndNotice);
    const noticeContainer = notice?.closest?.('#pop, #pop-force');
    const noticeVisible = Boolean(
      notice
      && computedVisible(notice)
      && (!noticeContainer || computedVisible(noticeContainer))
    );
    if (noticeVisible) {
      const text = normalizePopupText(notice.textContent || '');
      const expectedText = normalizePopupText(BATTLE_END_MESSAGE);
      if (text.includes(expectedText)) {
        return { type: 'REMATCH_FAIL', reason: text };
      }
    }

    const resultButton = doc.querySelector(SELECTORS.battleResult);
    const resultContainer = resultButton?.closest?.('.prt-command-end');
    const resultVisible = Boolean(
      resultButton
      && computedVisible(resultButton)
      && (!resultContainer || computedVisible(resultContainer))
    );
    if (resultVisible) {
      return { type: 'RESULT_BUTTON', reason: '起動確認済みの現戦闘で終了ボタンを検出' };
    }
    return null;
  }

  function safeBattleEndState() {
    try { return detectBattleEndState(); } catch { return null; }
  }

  function recoverableBattleEndState() {
    const detected = safeBattleEndState();
    if (detected) return detected;
    const hasBattleIdentity = state.battleEndArmed
      || Boolean(state.expectedBattleRaidId)
      || Boolean(state.activeBattleStatus);
    if (!hasBattleIdentity) return null;
    try {
      const url = currentFrameUrl();
      if (isBattleResultUrl(url)) {
        return { type: 'RESULT', reason: '戦闘後のリザルト画面を検出', url };
      }
      const screen = safeDetectScreenState();
      if (screen?.type === 'RESULT') {
        return { type: 'RESULT', reason: '戦闘後の結果画面を検出', url };
      }
    } catch {}
    return null;
  }

  function rememberBattleRecoveryConfig(config) {
    if (!state.running || !config) return;
    state.running.battleRecoveryConfig = {
      timeoutSec: clamp(finite(config.timeoutSec, 15), 1, 600),
      battleEndRoute: String(config.battleEndRoute || '#quest/assist/multi/0').trim() || '#quest/assist/multi/0',
      battleEndExpectedScreen: normalizeExpectedScreen(config.battleEndExpectedScreen || 'assist'),
      memoryReliefEveryBattles: clamp(int(config.memoryReliefEveryBattles, 3), 0, 100),
      memoryReliefSettleSec: clamp(finite(config.memoryReliefSettleSec, 1.5), 0, 30)
    };
  }

  function visibleMyPageButton(doc = frameDocument()) {
    for (const selector of MY_PAGE_BUTTON_SELECTORS) {
      const button = doc.querySelector(selector);
      if (button && computedVisible(button)) return button;
    }
    return null;
  }

  async function navigateToGranblueMyPage(config, context) {
    throwIfAborted(context.signal);
    clearPendingAutoAttack('MyPageへ移動するため攻撃監視を解除しました');
    const timeoutMs = clamp(finite(config.timeoutSec, 45), 1, 600) * 1000;
    const before = captureFrameState({ includeDocument: false });
    let button = visibleMyPageButton();
    let usedButton = false;
    context.setProgress?.(button ? 'MyPageボタンで完全再読込中' : 'MyPageを再構築中');

    if (button) {
      try {
        await runObservedAction(
          waitSignal => waitForFrameReady({
            signal: waitSignal,
            timeoutMs,
            expectedScreen: 'mypage',
            before,
            requireChange: true
          }),
          () => {
            const tapTarget = button;
            button = null;
            return jqTapStrict(tapTarget, { signal: context.signal, label: 'MyPage', fast: true });
          },
          { signal: context.signal, cancelMessage: 'MyPage読込監視を解除しました' }
        );
        usedButton = true;
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        const fallbackBefore = captureFrameState({ includeDocument: false });
        await replaceFrame(gameRouteUrl('#mypage'));
        await waitForFrameReady({
          signal: context.signal,
          timeoutMs,
          expectedScreen: 'mypage',
          before: fallbackBefore,
          requireChange: true
        });
      }
    } else {
      await replaceFrame(gameRouteUrl('#mypage'));
      await waitForFrameReady({
        signal: context.signal,
        timeoutMs,
        expectedScreen: 'mypage',
        before,
        requireChange: true
      });
    }

    const settleMs = clamp(finite(config.settleSec, 1.5), 0, 30) * 1000;
    if (settleMs > 0) {
      context.setProgress?.('Safariのリソース解放待ち');
      await abortableDelay(settleMs, context.signal);
    }
    return { state: 'MYPAGE', usedButton };
  }

  async function hardNavigateAfterRelief(targetUrl, expectedScreen, config, context) {
    const before = captureFrameState({ includeDocument: false });
    context.setProgress?.('軽量化後の画面を再構築中');
    await replaceFrame(targetUrl);
    return waitForFrameReady({
      signal: context.signal,
      timeoutMs: clamp(finite(config.timeoutSec, 45), 1, 600) * 1000,
      expectedScreen,
      before,
      requireChange: true
    });
  }

  async function releaseGranblueResources(config, context) {
    const currentUrl = currentFrameUrl();
    await navigateToGranblueMyPage(config, context);
    if (config.destination === 'mypage') {
      return hardNavigateAfterRelief(gameRouteUrl('#mypage'), 'mypage', config, context);
    }
    const targetUrl = config.destination === 'current'
      ? currentUrl
      : gameRouteUrl('#quest/assist/multi/0');
    const expectedScreen = config.destination === 'assist' ? 'assist' : 'auto';
    return hardNavigateAfterRelief(targetUrl, expectedScreen, config, context);
  }

  async function reloadForBattleEndProbe(config, context) {
    const timeoutMs = Math.max(1000, finite(config.timeoutSec, 15) * 1000);
    clearPendingAutoAttack('敵撃破判定のため再読み込みします');
    let reloadError = null;
    try {
      const before = captureFrameState();
      await replaceFrame(currentFrameUrl());
      await waitForFrameReady({
        signal: context.signal,
        timeoutMs,
        expectedScreen: 'auto',
        before,
        requireChange: true
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw error;
      } else {
        try {
          await performFrameOperation(() => frameWindow().location.reload(), {
            signal: context.signal,
            timeoutMs,
            expectedScreen: 'auto',
            requireChange: true
          });
        } catch (fallbackError) {
          if (fallbackError?.name === 'AbortError') throw fallbackError;
          reloadError = fallbackError;
        }
      }
    }
    return { endState: recoverableBattleEndState(), state: safeDetectScreenState(), reloadError };
  }

  async function restartWorkflowAfterBattleEnd(config, context, endState) {
    clearPendingAutoAttack('敵撃破を検出しました');
    rememberRecentRaidId(context, endState?.runtime?.raidId || state.expectedBattleRaidId);
    resetBattleEndDetection();
    const route = String(config.battleEndRoute || '#quest/assist/multi/0').trim() || '#quest/assist/multi/0';
    const expectedScreen = normalizeExpectedScreen(config.battleEndExpectedScreen || 'assist');
    const timeoutMs = Math.max(1000, finite(config.timeoutSec, 15) * 1000);
    const targetUrl = gameRouteUrl(route);
    context.completedBattles = int(context.completedBattles, 0) + 1;
    const reliefEvery = clamp(int(config.memoryReliefEveryBattles, 3), 0, 100);
    const shouldRelieve = reliefEvery > 0 && context.completedBattles % reliefEvery === 0;
    context.setProgress?.('敵撃破を検出・復帰中');

    if (shouldRelieve) {
      await navigateToGranblueMyPage({
        timeoutSec: Math.max(45, finite(config.timeoutSec, 15)),
        settleSec: clamp(finite(config.memoryReliefSettleSec, 1.5), 0, 30)
      }, context);
      await hardNavigateAfterRelief(targetUrl, expectedScreen, {
        timeoutSec: Math.max(45, finite(config.timeoutSec, 15))
      }, context);
      throw new FlowRestart(`${context.completedBattles}戦完了・MyPage経由で軽量化して先頭へ戻ります`, {
        route, expectedScreen, endState, completedBattles: context.completedBattles, memoryRelief: true
      });
    }

    let alreadyReady = false;
    try {
      const doc = frameDocument();
      alreadyReady = currentFrameUrl() === targetUrl && pageBaseReady(doc) && expectedScreenMatches(expectedScreen, doc);
    } catch {}

    if (alreadyReady) {
      await waitForFrameReady({ signal: context.signal, timeoutMs, expectedScreen, requireChange: false });
    } else {
      const before = captureFrameState();
      await replaceFrame(targetUrl);
      await waitForFrameReady({
        signal: context.signal,
        timeoutMs,
        expectedScreen,
        before,
        requireChange: true
      });
    }

    throw new FlowRestart('敵撃破を検出したため指定ページから先頭ブロックへ戻ります', { route, expectedScreen, endState });
  }

  async function ensureFullAuto(config, context, { allowReloadProbe = true } = {}) {
    const { signal } = context;
    rememberBattleRecoveryConfig(config);
    try {
      const existingEnd = recoverableBattleEndState();
      if (existingEnd) return restartWorkflowAfterBattleEnd(config, context, existingEnd);
      await waitForFrameReady({
        signal,
        timeoutMs: config.timeoutSec * 1000,
        expectedScreen: 'battle',
        stableMs: 0
      });
      const found = await monitorFrame(() => {
        const doc = frameDocument();
        const observed = fullAutoState(doc);
        const attack = attackSnapshot(doc);
        armBattleEndDetection(doc, observed.runtime);

        const battleEnd = detectBattleEndState(doc);
        if (battleEnd) return { battleEnd };

        if (observed.on) return observed;
        if (!observed.exists || !observed.visible || !observed.enabled) return false;

        const attackReady = Boolean(
          attack.start
          && attack.start.classList.contains('display-on')
          && !attack.start.classList.contains('display-off')
          && attack.startVisible
          && !attack.dummyVisible
          && !attack.cancelVisible
          && !attack.actorAttacking
        );
        return attackReady ? observed : false;
      }, {
        signal,
        timeoutMs: config.timeoutSec * 1000,
        stableMs: 0,
        description: 'フルオート操作可能状態待ち',
        observeRoots: battleObservationRoots,
        observeCharacterData: false,
        intervalMs: 80
      });

      if (found.battleEnd) return restartWorkflowAfterBattleEnd(config, context, found.battleEnd);
      if (found.on) return { changed: false };
      const pending = armPendingAutoAttack(config.timeoutSec * 1000, signal);
      try {
        await jqTapStrict(found.button, { signal, label: 'フルオート', fast: true });
      } catch (error) {
        if (state.pendingAutoAttack === pending) clearPendingAutoAttack('フルオート押下に失敗しました');
        throw error;
      }
      return { changed: true };
    } catch (error) {
      if (error instanceof FlowRestart || error?.name === 'AbortError') throw error;
      const navigatedEnd = recoverableBattleEndState();
      if (navigatedEnd) return restartWorkflowAfterBattleEnd(config, context, navigatedEnd);
      if (error?.code === 'TIMEOUT' && allowReloadProbe) {
        const visibleEnd = recoverableBattleEndState();
        if (visibleEnd) return restartWorkflowAfterBattleEnd(config, context, visibleEnd);
        const probe = await reloadForBattleEndProbe(config, context);
        if (probe.endState) return restartWorkflowAfterBattleEnd(config, context, probe.endState);
        if (!probe.reloadError && probe.state?.type === 'BATTLE') {
          return ensureFullAuto(config, context, { allowReloadProbe: false });
        }
      }
      throw error;
    }
  }

  function elementDisplayOn(element) {
    if (!element || !element.isConnected || element.hidden) return false;
    if (element.classList.contains('display-off')) return false;
    if (element.classList.contains('display-on')) return true;
    const style = element.style;
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.visibility !== 'collapse'
      && (style.opacity === '' || Number(style.opacity) !== 0);
  }

  function turnSignature(doc = frameDocument()) {
    const turn = doc.querySelector(SELECTORS.turn);
    if (!turn) return '';
    const structure = Array.from(turn.children, child =>
      `${child.tagName}:${String(child.className || '')}:${child.getAttribute('style') || ''}`
    ).join('|');
    return `${normalizePopupText(turn.textContent || '')}|${structure}`;
  }

  const battleProgressCache = new WeakMap();

  function battleProgressSignature(doc = frameDocument(), turn = turnSignature(doc)) {
    if (lightweightMode) {
      const cached = battleProgressCache.get(doc);
      if (cached && performance.now() - cached.at < 350) return cached.value;
    }
    const enemyHp = Array.from(doc.querySelectorAll('[id^="enemy-hp"]'), element =>
      normalizePopupText(element.textContent || '')
    ).join(',');
    const memberHp = Array.from(doc.querySelectorAll('.prt-command .prt-member .txt-hp-value'), element =>
      normalizePopupText(element.textContent || '')
    ).join(',');
    const memberGauge = Array.from(doc.querySelectorAll('.prt-command .prt-member .prt-gauge-special-inner'), element =>
      element.style.width || element.getAttribute('style') || ''
    ).join(',');
    const value = `${turn}|${enemyHp}|${memberHp}|${memberGauge}`;
    if (lightweightMode) battleProgressCache.set(doc, { at: performance.now(), value });
    return value;
  }

  function attackSnapshot(doc = frameDocument()) {
    const runtime = battleRuntimeState(doc);
    const useDomFallback = !runtime.available;
    const start = doc.querySelector(SELECTORS.attackStart);
    const dummy = doc.querySelector(SELECTORS.attackDummy);
    const cancel = doc.querySelector(SELECTORS.attackCancel);
    const turn = useDomFallback ? turnSignature(doc) : '';
    const domActorAttacking = useDomFallback && Boolean(doc.querySelector(SELECTORS.attackActor));
    return {
      start,
      dummy,
      cancel,
      startVisible: elementDisplayOn(start),
      dummyVisible: elementDisplayOn(dummy),
      cancelVisible: elementDisplayOn(cancel),
      runtime,
      runtimeAttacking: runtime.attacking,
      attackButtonPushed: runtime.attackButtonPushed,
      actorAttacking: runtime.attacking || runtime.attackButtonPushed || domActorAttacking,
      turn,
      progress: useDomFallback ? battleProgressSignature(doc, turn) : ''
    };
  }

  function isAttackInProgress(snapshot) {
    return Boolean(
      snapshot.runtimeAttacking
      || snapshot.attackButtonPushed
      || snapshot.cancelVisible
      || snapshot.dummyVisible
      || snapshot.actorAttacking
    );
  }

  function attackTransitionFromBaseline(baseline, current) {
    const startReplaced = Boolean(baseline.start && current.start && baseline.start !== current.start);
    const startBecameHidden = Boolean(baseline.startVisible && !current.startVisible);
    const turnChanged = Boolean(baseline.turn && current.turn && baseline.turn !== current.turn);
    const progressChanged = Boolean(baseline.progress && current.progress && baseline.progress !== current.progress);
    const started = isAttackInProgress(current) || startReplaced || startBecameHidden || turnChanged || progressChanged;
    return started ? { current, startReplaced, startBecameHidden, turnChanged, progressChanged } : false;
  }

  function clearPendingAutoAttack(reason = 'フルオート攻撃監視を解除しました') {
    const pending = state.pendingAutoAttack;
    state.pendingAutoAttack = null;
    if (!pending || pending.controller.signal.aborted) return;
    pending.controller.abort(new DOMException(reason, 'AbortError'));
  }

  function armPendingAutoAttack(timeoutMs, parentSignal) {
    clearPendingAutoAttack();
    const controller = new AbortController();
    const onParentAbort = () => controller.abort(abortException(parentSignal));
    parentSignal?.addEventListener('abort', onParentAbort, { once: true });
    const baseline = attackSnapshot();
    const promise = monitorFrame(() => {
      const doc = frameDocument();
      const battleEnd = detectBattleEndState(doc);
      if (battleEnd) return { battleEnd };
      const current = attackSnapshot(doc);
      const transition = attackTransitionFromBaseline(baseline, current);
      if (!transition) return false;
      const auto = fullAutoState(doc);
      return auto.on || isAttackInProgress(current) ? transition : false;
    }, {
      signal: controller.signal,
      timeoutMs,
      stableMs: 0,
      description: 'フルオート押下後の攻撃開始待ち',
      observeRoots: battleObservationRoots,
      observeOnLightweight: false,
      observeCharacterData: false,
      intervalMs: 160
    }).then(
      result => ({ ok: true, result }),
      error => ({ ok: false, error })
    ).finally(() => parentSignal?.removeEventListener('abort', onParentAbort));
    const pending = { controller, promise, baseline, createdAt: performance.now(), timeoutMs };
    state.pendingAutoAttack = pending;
    return pending;
  }

  async function consumePendingAutoAttack(timeoutMs) {
    const pending = state.pendingAutoAttack;
    if (!pending) return null;
    state.pendingAutoAttack = null;
    if (performance.now() - pending.createdAt > Math.max(timeoutMs, pending.timeoutMs)) {
      if (!pending.controller.signal.aborted) pending.controller.abort(new DOMException('フルオート攻撃監視が期限切れです', 'AbortError'));
      return null;
    }
    const outcome = await pending.promise;
    if (!outcome.ok) throw outcome.error;
    return { ...outcome.result, triggeredByFullAutoToggle: true };
  }

  async function waitForAutoAttack(config, context) {
    const { signal } = context;
    const timeoutMs = config.timeoutSec * 1000;
    rememberBattleRecoveryConfig(config);
    try {
      const existingEnd = recoverableBattleEndState();
      if (existingEnd) return restartWorkflowAfterBattleEnd(config, context, existingEnd);
      await waitForFrameReady({ signal, timeoutMs, expectedScreen: 'battle' });
      const startupDoc = frameDocument();
      const startupRuntime = battleRuntimeState(startupDoc);
      armBattleEndDetection(startupDoc, startupRuntime);
      const initialEnd = safeBattleEndState();
      if (initialEnd) return restartWorkflowAfterBattleEnd(config, context, initialEnd);

      const pendingAttack = await consumePendingAutoAttack(timeoutMs);
      if (pendingAttack?.battleEnd) return restartWorkflowAfterBattleEnd(config, context, pendingAttack.battleEnd);
      if (pendingAttack) return pendingAttack;

      const initial = attackSnapshot();
      if (isAttackInProgress(initial)) return { alreadyAttacking: true, snapshot: initial };

      const auto = fullAutoState();
      if (!auto.on) {
        await ensureFullAuto(config, context);
        const enabledByThisBlock = await consumePendingAutoAttack(timeoutMs);
        if (enabledByThisBlock?.battleEnd) return restartWorkflowAfterBattleEnd(config, context, enabledByThisBlock.battleEnd);
        if (enabledByThisBlock) return enabledByThisBlock;
      }

      const armed = await monitorFrame(() => {
        const doc = frameDocument();
        const battleEnd = detectBattleEndState(doc);
        if (battleEnd) return { battleEnd };
        const snapshot = attackSnapshot(doc);
        const transition = attackTransitionFromBaseline(initial, snapshot);
        if (transition) return { snapshot, alreadyAttacking: true, transition };
        if (isAttackInProgress(snapshot)) return { snapshot, alreadyAttacking: true };
        const attackReady = snapshot.startVisible && !snapshot.cancelVisible && !snapshot.dummyVisible;
        return attackReady ? { snapshot, alreadyAttacking: false } : false;
      }, {
        signal,
        timeoutMs,
        stableMs: 0,
        description: 'フルオート攻撃受付待ち',
        observeRoots: battleObservationRoots,
        observeOnLightweight: false,
        observeCharacterData: false,
        intervalMs: 160
      });
      if (armed.battleEnd) return restartWorkflowAfterBattleEnd(config, context, armed.battleEnd);
      if (armed.alreadyAttacking) return armed;

      const baseline = armed.snapshot;
      const transition = await monitorFrame(() => {
        const doc = frameDocument();
        const battleEnd = detectBattleEndState(doc);
        if (battleEnd) return { battleEnd };
        return attackTransitionFromBaseline(baseline, attackSnapshot(doc));
      }, {
        signal,
        timeoutMs,
        stableMs: 0,
        description: 'フルオート攻撃開始待ち',
        observeRoots: battleObservationRoots,
        observeOnLightweight: false,
        observeCharacterData: false,
        intervalMs: 160
      });
      if (transition.battleEnd) return restartWorkflowAfterBattleEnd(config, context, transition.battleEnd);
      return transition;
    } catch (error) {
      if (error instanceof FlowRestart || error?.name === 'AbortError') throw error;
      const navigatedEnd = recoverableBattleEndState();
      if (navigatedEnd) return restartWorkflowAfterBattleEnd(config, context, navigatedEnd);
      if (error?.code === 'TIMEOUT') {
        const visibleEnd = recoverableBattleEndState();
        if (visibleEnd) return restartWorkflowAfterBattleEnd(config, context, visibleEnd);
        const probe = await reloadForBattleEndProbe(config, context);
        if (probe.endState) return restartWorkflowAfterBattleEnd(config, context, probe.endState);
      }
      throw error;
    }
  }

  async function recoverKnownPopup(stateInfo, refreshConfig, context) {
    if (stateInfo.type === 'UNKNOWN_ERROR') assertNoUnknownPopup();
    if (!['MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR'].includes(stateInfo.type)) {
      throw new FlowError(`処理できない画面状態です: ${stateInfo.type}`, 'UNEXPECTED_STATE');
    }
    if (stateInfo.type === 'UNCLAIMED_ERROR') {
      await tapPopupOk(stateInfo, { signal: context.signal, timeoutMs: refreshConfig.timeoutSec * 1000, expected: ['UNCLAIMED_LIST'] });
      await confirmAllUnclaimed({ timeoutSec: refreshConfig.timeoutSec, maxItems: 10000 }, context);
      return { retry: true, reason: '未確認バトルを処理しました' };
    }
    await tapPopupOk(stateInfo, { signal: context.signal, timeoutMs: refreshConfig.timeoutSec * 1000, expected: ['ASSIST_LIST'] });
    if (stateInfo.type === 'MAX_ASSIST_ERROR') {
      const doc = frameDocument();
      const attention = doc.querySelector(SELECTORS.unclaimedAttention);
      if (attention && computedVisible(attention)) {
        await performFrameOperation(() => {
          frameWindow().location.href = gameRouteUrl('#quest/assist/unclaimed/0/0');
        }, {
          signal: context.signal,
          timeoutMs: refreshConfig.timeoutSec * 1000,
          expectedScreen: 'unclaimed',
          requireChange: true
        });
        const result = await confirmAllUnclaimed({ timeoutSec: refreshConfig.timeoutSec, maxItems: 10000 }, context);
        return { retry: true, reason: `最大3件エラー後に未確認バトルを${result.processed}件処理しました` };
      }
    }
    await refreshAssistList(refreshConfig, context);
    return { retry: true, reason: stateInfo.type === 'MAX_ASSIST_ERROR' ? '最大3件エラーから再試行' : '参戦人数上限から再試行' };
  }

  async function pressDeckConfirm(config, context) {
    const { signal } = context;
    const current = detectScreenState();
    if (current.type.endsWith('_ERROR')) return recoverKnownPopup(current, {
      baseDelaySec: config.refreshBaseDelaySec ?? 0.6,
      jitterSec: config.refreshJitterSec ?? 0,
      timeoutSec: config.timeoutSec
    }, context);
    if (current.type === 'BATTLE') return { battle: true };
    const doc = frameDocument();
    const button = doc.querySelector(SELECTORS.deckOk);
    if (!button || !computedVisible(button)) throw new FlowError('編成確認OKが表示されていません', 'DECK_OK_MISSING');
    const next = await runObservedAction(
      waitSignal => waitForGbfState(['BATTLE', 'MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR'], {
        signal: waitSignal,
        timeoutMs: config.timeoutSec * 1000,
        description: '編成確認後待ち',
        intervalMs: config.fastTap ? ASSIST_HANDOFF_POLL_MS : null
      }),
      () => jqTapStrict(button, {
        signal,
        label: '編成確認OK',
        fast: Boolean(config.fastTap),
        handoff: Boolean(config.fastTap)
      }),
      { signal, cancelMessage: '編成確認後監視を解除しました' }
    );
    if (next.type === 'BATTLE') return { battle: true };
    return recoverKnownPopup(next, {
      baseDelaySec: config.refreshBaseDelaySec ?? 0.6,
      jitterSec: config.refreshJitterSec ?? 0,
      timeoutSec: config.timeoutSec
    }, context);
  }

  async function assistSelectFullFlow(config, context, hpComparison = 'atLeast') {
    const { signal } = context;
    const refreshConfig = { baseDelaySec: config.baseDelaySec, jitterSec: config.jitterSec, timeoutSec: config.timeoutSec };
    const hpThreshold = hpComparison === 'atMost' ? config.maximumHp : config.minimumHp;
    const selectedSlots = normalizeAssistSlots(config.assistSlots);
    const cyclesAssistSlots = selectedSlots.length > 1;
    let slotCursor = 0;
    let consecutiveReloads = 0;
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      throwIfAborted(signal);
      context.setProgress(`${attempt}回目`);
      try {
        const result = await runAssistSelectAttempt(attempt);
        consecutiveReloads = 0;
        if (result) return { ...result, attempts: attempt };
      } catch (error) {
        if (!isRecoverableAssistError(error)) throw error;
        if (consecutiveReloads >= MAX_ASSIST_RECOVERY_RELOADS) throw error;
        consecutiveReloads += 1;
        if (!await reloadAssistListForRetry(config, context, error)) consecutiveReloads = 0;
      }
    }
    throw new FlowError('救援参加の最大再試行回数に達しました', 'ASSIST_MAX_ATTEMPTS');

    // 1回分の試行。参戦できたときだけ結果を返し、やり直したいときは null を返す。
    async function runAssistSelectAttempt(attempt) {
      const current = detectScreenState();
      if (current.type === 'UNKNOWN_ERROR') assertNoUnknownPopup();
      if (['MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR'].includes(current.type)) {
        await recoverKnownPopup(current, refreshConfig, context);
        return null;
      }
      if (current.type === 'UNCLAIMED_LIST') {
        await confirmAllUnclaimed({ timeoutSec: config.timeoutSec, maxItems: 10000 }, context);
        return null;
      }
      if (current.type === 'BATTLE') {
        const runtime = battleRuntimeState();
        rememberRecentRaidId(context, runtime.raidId || state.expectedBattleRaidId);
        return { alreadyInBattle: true };
      }
      if (current.type !== 'ASSIST_LIST') {
        await waitForFrameReady({ signal, timeoutMs: config.timeoutSec * 1000, expectedScreen: 'assist' });
      }

      const doc = frameDocument();
      assertNoUnknownPopup(doc);
      const rows = [...doc.querySelectorAll(SELECTORS.assistRows)];
      const ranked = rankAssistRows(rows, hpThreshold, hpComparison)
        .filter(item => !wasRecentRaidId(context, item.raidId));
      const activeSlot = activeAssistSlot(doc);
      // 再読み込み直後などで選択外の救援番号が開いていたら、まず選んだ番号へ戻す。
      const needsSlotCorrection = activeSlot == null ? cyclesAssistSlots : !selectedSlots.includes(activeSlot);
      if (needsSlotCorrection) {
        const slot = selectedSlots[slotCursor % selectedSlots.length];
        slotCursor = (slotCursor + 1) % selectedSlots.length;
        context.setProgress(`${attempt}回目・救援${slot}へ切替`);
        await switchAssistSlot(slot, refreshConfig, context);
        return null;
      }
      if (!ranked.length) {
        if (cyclesAssistSlots) {
          let slot = selectedSlots[slotCursor % selectedSlots.length];
          if (slot === activeSlot) {
            slotCursor = (slotCursor + 1) % selectedSlots.length;
            slot = selectedSlots[slotCursor % selectedSlots.length];
          }
          slotCursor = (slotCursor + 1) % selectedSlots.length;
          context.setProgress(`${attempt}回目・救援${slot}へ切替`);
          const switched = await switchAssistSlot(slot, refreshConfig, context);
          // 切替先が現在地と同じで一度も押せなかったときは、一覧更新で必ず前進させる。
          if (switched.alreadyActive) await refreshAssistList(refreshConfig, context, { waitForCompletion: false });
        } else {
          await refreshAssistList(refreshConfig, context, { waitForCompletion: false });
        }
        return null;
      }

      const selected = cyclesAssistSlots
        ? [...ranked].sort((a, b) => a.index - b.index)[0]
        : ranked[0];
      const tapped = await tapCurrentAssistRow(selected, context, { fast: true, handoff: true });
      if (!tapped) return null;

      let next = await waitForGbfState([
        'MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR',
        'DECK_CONFIRM', 'SUPPORTER', 'UNCLAIMED_LIST', 'BATTLE'
      ], {
        signal,
        timeoutMs: config.timeoutSec * 1000,
        description: '救援選択後待ち',
        intervalMs: ASSIST_HANDOFF_POLL_MS
      });
      if (next.type === 'UNKNOWN_ERROR') assertNoUnknownPopup();
      if (['MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR'].includes(next.type)) {
        await recoverKnownPopup(next, refreshConfig, context);
        return null;
      }
      if (next.type === 'UNCLAIMED_LIST') {
        await confirmAllUnclaimed({ timeoutSec: config.timeoutSec, maxItems: 10000 }, context);
        return null;
      }
      if (next.type === 'BATTLE') {
        rememberRecentRaidId(context, selected.raidId);
        return {};
      }

      if (next.type === 'SUPPORTER') {
        const supporterResult = await selectSupporterConditional({
          timeoutSec: config.timeoutSec,
          supporterCandidates: config.supporterCandidates,
          fastTap: true
        }, context);
        next = supporterResult.next || { type: 'DECK_CONFIRM' };
        if (next.type === 'UNKNOWN_ERROR') assertNoUnknownPopup();
        if (['MAX_ASSIST_ERROR', 'UNCLAIMED_ERROR', 'RAID_FULL_ERROR'].includes(next.type)) {
          await recoverKnownPopup(next, refreshConfig, context);
          return null;
        }
      }

      if (next.type === 'DECK_CONFIRM' || detectScreenState().type === 'DECK_CONFIRM') {
        const deckResult = await pressDeckConfirm({
          timeoutSec: config.timeoutSec,
          refreshBaseDelaySec: config.baseDelaySec,
          refreshJitterSec: config.jitterSec,
          fastTap: true
        }, context);
        if (deckResult.retry) return null;
        if (deckResult.battle) {
          rememberRecentRaidId(context, selected.raidId);
          return {};
        }
      }
      return null;
    }
  }

  function isRecoverableAssistError(error) {
    if (!error || error instanceof FlowRestart || error instanceof FlowStop) return false;
    if (error.name === 'AbortError') return false;
    return ASSIST_RECOVERABLE_CODES.includes(error.code);
  }

  // 一覧の取り違え・ガウス座標の遮蔽・切替待ちのタイムアウトなどで止まらないよう、
  // 救援一覧を読み込み直してこのブロックの先頭から再開する。
  async function reloadAssistListForRetry(config, context, error) {
    const screen = safeDetectScreenState();
    if (screen.type === 'BATTLE') return false;
    appendLog(`${error.message} のため救援一覧を読み込み直して再開します`, 'warn', '救援評価');
    context.setProgress('再読み込みして再開');
    const before = captureFrameState({ includeDocument: false });
    await replaceFrame(gameRouteUrl(ASSIST_RETRY_ROUTE));
    await waitForFrameReady({
      signal: context.signal,
      timeoutMs: config.timeoutSec * 1000,
      expectedScreen: 'any',
      before,
      requireChange: true
    });
    return true;
  }

  function evaluateWorkflowCondition(condition) {
    const config = normalizeConditionConfig(condition);
    const doc = frameDocument();
    const popup = popupInfo(doc);
    if (popup?.type === 'UNKNOWN_ERROR') assertNoUnknownPopup(doc);
    const screen = detectScreenState(doc).type;
    switch (config.type) {
      case 'gbfFullAutoOn':
        return fullAutoState(doc).on;
      case 'gbfFullAutoOff': {
        const auto = fullAutoState(doc);
        return auto.exists && !auto.on;
      }
      case 'gbfAttacking':
        return screen === 'BATTLE' && isAttackInProgress(attackSnapshot(doc));
      case 'gbfAttackWaiting': {
        if (screen !== 'BATTLE') return false;
        const attack = attackSnapshot(doc);
        return attack.startVisible && !isAttackInProgress(attack);
      }
      case 'gbfBattleEnded':
        return Boolean(detectBattleEndState(doc));
      case 'gbfBattle':
        return screen === 'BATTLE';
      case 'gbfAssist':
        return screen === 'ASSIST_LIST';
      case 'gbfUnclaimedEmpty':
        return Boolean(doc.querySelector(SELECTORS.unclaimedList)) && !doc.querySelector(SELECTORS.unclaimedRows);
      case 'selectorVisible': {
        if (!config.selector) throw new FlowError('監視セレクタが空です', 'INVALID_SELECTOR');
        let element;
        try { element = doc.querySelector(config.selector); } catch { throw new FlowError('監視セレクタの書式が不正です', 'INVALID_SELECTOR'); }
        return computedVisible(element);
      }
      case 'selectorHidden': {
        if (!config.selector) throw new FlowError('監視セレクタが空です', 'INVALID_SELECTOR');
        let element;
        try { element = doc.querySelector(config.selector); } catch { throw new FlowError('監視セレクタの書式が不正です', 'INVALID_SELECTOR'); }
        return !element || !computedVisible(element);
      }
      case 'selectorExists': {
        if (!config.selector) throw new FlowError('監視セレクタが空です', 'INVALID_SELECTOR');
        try { return Boolean(doc.querySelector(config.selector)); } catch { throw new FlowError('監視セレクタの書式が不正です', 'INVALID_SELECTOR'); }
      }
      case 'selectorMissing': {
        if (!config.selector) throw new FlowError('監視セレクタが空です', 'INVALID_SELECTOR');
        try { return !doc.querySelector(config.selector); } catch { throw new FlowError('監視セレクタの書式が不正です', 'INVALID_SELECTOR'); }
      }
      case 'pageReady':
        return pageBaseReady(doc);
      case 'urlContains':
        return currentFrameUrl().includes(config.value);
      default:
        return false;
    }
  }

  async function waitForWorkflowCondition(config, context, { timeoutSec = 30, stableMs = 0 } = {}) {
    return monitorFrame(() => evaluateWorkflowCondition(config) ? { matched: true } : false, {
      signal: context.signal,
      timeoutMs: Math.max(0, finite(timeoutSec, 30)) * 1000,
      stableMs: Math.max(0, int(stableMs, 0)),
      description: '条件成立待ち'
    });
  }

  function blockCardById(blockId) {
    const escapedId = window.CSS?.escape ? window.CSS.escape(blockId) : String(blockId).replace(/["\\]/g, '\\$&');
    return shadow.querySelector(`.blockCard[data-block-id="${escapedId}"]`);
  }

  function clearRunningBlockUi() {
    state.runningCard?.classList.remove('running');
    state.runningCard?.removeAttribute('aria-current');
    state.runningBadge?.remove();
    state.runningCard = null;
    state.runningBadge = null;
  }

  function blockBadgeHost(card) {
    if (!card) return null;
    let host = card.querySelector('.blockBadges');
    if (!host) {
      host = element('div', { className: 'blockBadges' });
      card.querySelector('.blockName')?.append(host);
    }
    return host;
  }

  function setRunningBlock(context, block, progress = '') {
    context.currentBlockId = block?.id || null;
    if (lightweightMode) return;
    state.blockProgress.clear();
    clearRunningBlockUi();
    if (!block) return;
    if (progress) state.blockProgress.set(block.id, progress);
    const card = blockCardById(block.id);
    state.runningCard = card;
    card?.classList.add('running');
    card?.setAttribute('aria-current', 'step');
    if (card && progress) {
      const badge = element('span', { className: 'progressBadge', text: progress });
      blockBadgeHost(card)?.append(badge);
      state.runningBadge = badge;
    }
  }

  function updateBlockProgress(context, block, progress) {
    context.currentBlockId = block.id;
    if (lightweightMode) return;
    const text = String(progress ?? '');
    state.blockProgress.set(block.id, text);
    let card = state.runningCard;
    if (!card || !card.isConnected || card.dataset.blockId !== block.id) {
      clearRunningBlockUi();
      card = blockCardById(block.id);
      state.runningCard = card;
      card?.classList.add('running');
      card?.setAttribute('aria-current', 'step');
    }
    if (!card) return;
    let badge = state.runningBadge;
    if (!badge || !badge.isConnected) {
      badge = card.querySelector('.progressBadge') || element('span', { className: 'progressBadge' });
      if (!badge.isConnected) blockBadgeHost(card)?.append(badge);
      state.runningBadge = badge;
    }
    if (badge.textContent !== text) badge.textContent = text;
  }

  function createWorkflowExecutionState(value = null) {
    const stateValue = value && typeof value === 'object' ? value : {};
    const listFrames = Object.create(null);
    const controlFrames = Object.create(null);
    for (const [key, frame] of Object.entries(stateValue.listFrames || {})) {
      if (!key || !frame || typeof frame !== 'object') continue;
      listFrames[key] = { index: Math.max(0, int(frame.index, 0)) };
    }
    for (const [key, frame] of Object.entries(stateValue.controlFrames || {})) {
      if (!key || !frame || typeof frame !== 'object') continue;
      controlFrames[key] = deepClone(frame);
    }
    return { listFrames, controlFrames };
  }

  function executionListFrame(context, key) {
    const frames = context.executionState.listFrames;
    if (!frames[key]) frames[key] = { index: 0 };
    return frames[key];
  }

  function executionControlFrame(context, key, factory) {
    const frames = context.executionState.controlFrames;
    if (!frames[key]) frames[key] = factory();
    return frames[key];
  }

  function removeExecutionControlFrame(context, key) {
    delete context.executionState.controlFrames[key];
  }

  function workflowParentUrl() {
    const url = new URL('/', location.origin);
    url.hash = 'mypage';
    return url.href;
  }

  function readWorkflowHandoff() {
    try {
      const value = JSON.parse(localStorage.getItem(WORKFLOW_HANDOFF_KEY) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  }

  function writeWorkflowHandoff(value) {
    try {
      localStorage.setItem(WORKFLOW_HANDOFF_KEY, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function clearWorkflowHandoff(id = null) {
    try {
      const current = readWorkflowHandoff();
      if (!id || current?.id === id) localStorage.removeItem(WORKFLOW_HANDOFF_KEY);
    } catch {}
  }

  function validWorkflowHandoff(value) {
    if (!value || value.schemaVersion !== WORKFLOW_HANDOFF_SCHEMA_VERSION || value.appVersion !== APP_VERSION) return false;
    if (!value.id || !value.targetName || !value.workflow || !value.runtime) return false;
    if (!Number.isFinite(value.createdAt) || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) return false;
    try {
      if (JSON.stringify(value).length > MAX_IMPORT_BYTES) return false;
      const workflow = normalizeWorkflow(value.workflow);
      return !validateWorkflowDefinition(workflow).some(issue => issue.severity === 'error');
    } catch {
      return false;
    }
  }

  const SOFT_HANDOFF_FAILURE_CODES = Object.freeze([
    'HANDOFF_INVALID', 'HANDOFF_CLAIM_LOST', 'HANDOFF_LOST',
    'HANDOFF_COMMIT_TIMEOUT', 'HANDOFF_WORKFLOW_INVALID'
  ]);

  function reportWorkflowHandoffFailure(error) {
    if (SOFT_HANDOFF_FAILURE_CODES.includes(error?.code)) {
      appendLog(`保存済みの進行は復元しませんでした（${error.message}）`, 'warn', '進行復元');
      setStatus('準備完了');
      return;
    }
    showWorkflowError(error, null);
    setStatus('進行復元に失敗');
  }

  function abandonWorkflowHandoffResume(reason) {
    if (!state.handoffResumeId || state.handoffResumeAbandoned) return false;
    state.handoffResumeAbandoned = true;
    clearWorkflowHandoff(state.handoffResumeId);
    window.name = '';
    if (reason) appendLog(reason, '', '進行復元');
    return true;
  }

  function workflowHandoffResumeAbandoned() {
    return state.handoffResumeAbandoned || Boolean(state.running) || Boolean(state.legacyRunning);
  }

  function claimPendingWorkflowHandoff() {
    const handoff = readWorkflowHandoff();
    if (!handoff) return null;
    if (!validWorkflowHandoff(handoff)) {
      clearWorkflowHandoff(handoff.id);
      return null;
    }
    if (window.name !== handoff.targetName) return null;
    const sameTabCommitted = handoff.phase === 'committed' && handoff.mode === 'same-tab';
    if (handoff.claimedBy && handoff.claimedBy !== instanceId && !sameTabCommitted) return null;
    const claimed = {
      ...handoff,
      phase: handoff.phase === 'committed' ? 'committed' : 'claimed',
      claimedBy: instanceId,
      claimedAt: Date.now()
    };
    if (!writeWorkflowHandoff(claimed)) return null;
    const confirmed = readWorkflowHandoff();
    return confirmed?.id === claimed.id && confirmed.claimedBy === instanceId ? confirmed : null;
  }

  function handoffFrameUrl() {
    const candidate = currentFrameUrl();
    try {
      const url = new URL(candidate, location.href);
      if (/^https?:$/.test(url.protocol) && url.origin === location.origin) return url.href;
    } catch {}
    return normalizeInitialUrl();
  }

  function createWorkflowHandoff(context) {
    const id = nowId('handoff');
    const createdAt = Date.now();
    return {
      schemaVersion: WORKFLOW_HANDOFF_SCHEMA_VERSION,
      appVersion: APP_VERSION,
      id,
      targetName: `autoflow-handoff-${id}`,
      phase: 'offered',
      ownerInstanceId: instanceId,
      createdAt,
      expiresAt: createdAt + WORKFLOW_HANDOFF_TTL_MS,
      parentUrl: workflowParentUrl(),
      iframeUrl: handoffFrameUrl(),
      workflow: deepClone(context.workflow),
      runtime: {
        cycle: context.cycle,
        totalCycles: context.totalCycles,
        restartCount: context.restartCount,
        completedBattles: context.completedBattles,
        recentRaidIds: Array.from(context.recentRaidIds || []),
        battleRecoveryConfig: context.battleRecoveryConfig ? deepClone(context.battleRecoveryConfig) : null,
        executionState: deepClone(context.executionState)
      }
    };
  }

  async function continueWorkflowInCurrentTab(handoff, reason, sourceError = null) {
    const fallback = {
      ...handoff,
      targetName: `${handoff.targetName}-same-${nowId('tab')}`,
      phase: 'committed',
      mode: 'same-tab',
      committedAt: Date.now()
    };
    if (!writeWorkflowHandoff(fallback)) {
      clearWorkflowHandoff(handoff.id);
      const detail = sourceError?.message ? `: ${sourceError.message}` : '';
      throw new FlowError(`同一タブ用の進行内容を保存できませんでした${detail}`, 'HANDOFF_FALLBACK_SAVE_FAILED');
    }
    window.name = fallback.targetName;
    appendLog(reason, 'warn', '親ページ再起動');
    setStatus('進行を保存して親ページを再起動');
    try { location.replace(fallback.parentUrl); }
    catch (error) {
      clearWorkflowHandoff(handoff.id);
      window.name = '';
      throw new FlowError(`親ページを再起動できませんでした: ${error.message}`, 'HANDOFF_NAVIGATION_FAILED');
    }
    return new Promise(() => {});
  }

  async function beginWorkflowParentRestart(context) {
    throwIfAborted(context.signal);
    commitActiveEditorInput();
    flushWorkflowStore();
    saveLegacyState();
    clearPendingAutoAttack('親ページの引継ぎを開始します');
    const handoff = createWorkflowHandoff(context);
    if (!writeWorkflowHandoff(handoff)) {
      throw new FlowError('進行内容を保存できないため、親ページを再起動しませんでした', 'HANDOFF_SAVE_FAILED');
    }

    let opened = null;
    try { opened = window.open(handoff.parentUrl, handoff.targetName); } catch {}
    if (!opened) {
      return continueWorkflowInCurrentTab(
        handoff,
        '新規タブが拒否されたため、同じタブを完全再起動します'
      );
    }

    appendLog('新しい親タブへ進行内容を移譲しています', '', '親ページ再起動');
    setStatus('新しい親タブの準備待ち');
    const deadline = Date.now() + WORKFLOW_HANDOFF_READY_TIMEOUT_MS;
    try {
      while (Date.now() < deadline) {
        throwIfAborted(context.signal);
        let closed = false;
        try { closed = opened.closed; } catch {}
        if (closed) throw new FlowError('新しい親タブが準備完了前に閉じられました', 'HANDOFF_TARGET_CLOSED');
        const current = readWorkflowHandoff();
        if (current?.id !== handoff.id) {
          throw new FlowError('進行引継ぎデータが別の処理に置き換えられました', 'HANDOFF_REPLACED');
        }
        if (current.phase === 'failed') {
          throw new FlowError(current.error || '新しい親タブの初期化に失敗しました', 'HANDOFF_TARGET_FAILED');
        }
        if (current.phase === 'ready' && current.claimedBy && current.claimedBy !== instanceId) {
          const committed = { ...current, phase: 'committed', committedAt: Date.now() };
          if (!writeWorkflowHandoff(committed)) {
            throw new FlowError('引継ぎ確定状態を保存できませんでした', 'HANDOFF_COMMIT_FAILED');
          }
          appendLog('進行内容の移譲が完了しました', 'success', '親ページ再起動');
          setStatus('新しい親タブへ移行しました');
          try { window.close(); } catch {}
          setTimeout(() => {
            try {
              if (!window.closed) location.replace('about:blank');
            } catch {}
          }, 80);
          return new Promise(() => {});
        }
        await new Promise(resolve => setTimeout(resolve, WORKFLOW_HANDOFF_POLL_MS));
      }
      throw new FlowError('新しい親タブの準備がタイムアウトしました', 'HANDOFF_READY_TIMEOUT');
    } catch (error) {
      try { opened.close(); } catch {}
      if (error?.name === 'AbortError') {
        clearWorkflowHandoff(handoff.id);
        throw error;
      }
      const current = readWorkflowHandoff();
      if (current && current.id !== handoff.id) throw error;
      return continueWorkflowInCurrentTab(
        handoff,
        `新しい親タブへの移譲に失敗したため、同じタブを完全再起動します（${error.message}）`,
        error
      );
    }
  }

  async function resumeClaimedWorkflowHandoff(handoff) {
    state.handoffResumeId = handoff.id;
    state.handoffResumeAbandoned = false;
    try {
      setStatus('保存した画面を復元中');
      await waitForFrameReady({
        timeoutMs: WORKFLOW_HANDOFF_READY_TIMEOUT_MS,
        expectedScreen: 'auto',
        requireChange: false
      });
      if (workflowHandoffResumeAbandoned()) return;
      let current = readWorkflowHandoff();
      if (current?.id !== handoff.id || current.claimedBy !== instanceId) {
        throw new FlowError('進行引継ぎの所有権を確認できませんでした', 'HANDOFF_CLAIM_LOST');
      }
      if (current.phase !== 'committed') {
        current = { ...current, phase: 'ready', readyAt: Date.now() };
        if (!writeWorkflowHandoff(current)) throw new FlowError('準備完了状態を保存できませんでした', 'HANDOFF_READY_SAVE_FAILED');
        setStatus('旧タブの終了待ち');
        while (Date.now() < current.expiresAt) {
          await new Promise(resolve => setTimeout(resolve, WORKFLOW_HANDOFF_POLL_MS));
          if (workflowHandoffResumeAbandoned()) return;
          const next = readWorkflowHandoff();
          if (next?.id !== handoff.id || next.claimedBy !== instanceId) {
            throw new FlowError('進行引継ぎデータが失われました', 'HANDOFF_LOST');
          }
          if (next.phase === 'committed') {
            current = next;
            break;
          }
          if (next.phase === 'failed') throw new FlowError(next.error || '進行引継ぎに失敗しました', 'HANDOFF_FAILED');
        }
      }
      if (current.phase !== 'committed') throw new FlowError('旧タブから引継ぎ確定を受信できませんでした', 'HANDOFF_COMMIT_TIMEOUT');
      if (workflowHandoffResumeAbandoned()) return;
      window.name = '';
      state.handoffResumeId = null;
      const runPromise = startWorkflow(current);
      if (state.running) clearWorkflowHandoff(current.id);
      await runPromise;
    } catch (error) {
      const current = readWorkflowHandoff();
      if (current?.id === handoff.id && current.claimedBy === instanceId && current.phase !== 'committed') {
        writeWorkflowHandoff({ ...current, phase: 'failed', error: error.message, failedAt: Date.now() });
      }
      window.name = '';
      if (workflowHandoffResumeAbandoned()) {
        appendLog(`自動復元を中止しました（${error.message}）`, '', '進行復元');
        return;
      }
      reportWorkflowHandoffFailure(error);
    } finally {
      if (state.handoffResumeId === handoff.id) state.handoffResumeId = null;
      state.handoffResumeAbandoned = false;
    }
  }

  async function runBlockList(blocks, context, listKey = 'root') {
    const frame = executionListFrame(context, listKey);
    while (frame.index < blocks.length) {
      throwIfAborted(context.signal);
      const index = frame.index;
      const block = blocks[index];
      const definition = BLOCK_DEFINITIONS[block.type];
      const execution = { listKey, blockKey: `${listKey}/${index}:${block.id}` };
      if (!definition?.container) frame.index = index + 1;
      await executeWorkflowBlock(block, context, execution);
      if (definition?.container) frame.index = index + 1;
    }
    if (listKey !== 'root') delete context.executionState.listFrames[listKey];
  }

  async function executeWorkflowBlock(block, context, execution = { listKey: 'root', blockKey: `root/${block.id}` }) {
    const definition = BLOCK_DEFINITIONS[block.type];
    if (!definition) throw new FlowError(`未対応ブロックです: ${block.type}`, 'UNKNOWN_BLOCK');
    setRunningBlock(context, block);
    setStatus(definition.label);
    appendLog('開始', '', definition.label);
    const blockContext = {
      ...context,
      setProgress: progress => updateBlockProgress(context, block, progress)
    };
    try {
      switch (block.type) {
        case 'gbfAssistSelect':
          await assistSelectFullFlow(block.config, blockContext, 'atLeast');
          break;
        case 'gbfAssistSelectBelow':
          await assistSelectFullFlow(block.config, blockContext, 'atMost');
          break;
        case 'gbfSupporterAuto': {
          const result = await selectSupporterAuto(block.config, blockContext);
          if (result.type && result.type !== 'DECK_CONFIRM') {
            if (result.type === 'UNKNOWN_ERROR') assertNoUnknownPopup();
            throw new FlowError(`サポーター自動選択後に${result.type}を検出しました`, 'SUPPORTER_AUTO_ERROR');
          }
          break;
        }
        case 'gbfSupporterConditional': {
          const result = await selectSupporterConditional(block.config, blockContext);
          if (result.next && result.next.type !== 'DECK_CONFIRM') {
            if (result.next.type === 'UNKNOWN_ERROR') assertNoUnknownPopup();
            throw new FlowError(`サポーター選択後に${result.next.type}を検出しました`, 'SUPPORTER_SELECT_ERROR');
          }
          break;
        }
        case 'gbfDeckConfirm':
          await pressDeckConfirm(block.config, blockContext);
          break;
        case 'gbfUnclaimedAll':
          await confirmAllUnclaimed(block.config, blockContext);
          break;
        case 'gbfEnsureFullAuto':
          await ensureFullAuto(block.config, blockContext);
          break;
        case 'gbfWaitAutoAttack':
          await waitForAutoAttack(block.config, blockContext);
          break;
        case 'gbfRefreshAssist':
          await refreshAssistList(block.config, blockContext);
          break;
        case 'gbfMyPage':
          await navigateToGranblueMyPage(block.config, blockContext);
          break;
        case 'gbfReleaseResources':
          await releaseGranblueResources(block.config, blockContext);
          break;
        case 'parentTabRestart':
          await beginWorkflowParentRestart(context);
          break;
        case 'repeat': {
          const count = clamp(int(block.config.count, 0), 0, MAX_REPEAT_COUNT);
          const controlKey = `${execution.blockKey}/repeat`;
          const childKey = `${execution.blockKey}/children`;
          const control = executionControlFrame(context, controlKey, () => ({ kind: 'repeat', iteration: 0 }));
          while (control.iteration < count) {
            throwIfAborted(context.signal);
            updateBlockProgress(context, block, `${control.iteration + 1} / ${count}回目`);
            await runBlockList(block.children, context, childKey);
            control.iteration += 1;
            if (control.iteration % WORKFLOW_YIELD_INTERVAL === 0) await abortableDelay(0, context.signal);
          }
          removeExecutionControlFrame(context, controlKey);
          break;
        }
        case 'repeatUntil': {
          const maxIterations = clamp(int(block.config.maxIterations, MAX_CONDITION_ITERATIONS), 1, 100000);
          const maxDurationMs = clamp(finite(block.config.maxDurationSec, 600), 1, 86400) * 1000;
          const controlKey = `${execution.blockKey}/repeatUntil`;
          const childKey = `${execution.blockKey}/children`;
          const control = executionControlFrame(context, controlKey, () => ({
            kind: 'repeatUntil',
            iteration: 0,
            startedAt: Date.now(),
            inIteration: false
          }));
          while (true) {
            throwIfAborted(context.signal);
            if (!control.inIteration) {
              if (evaluateWorkflowCondition(block.config.condition)) break;
              if (control.iteration >= maxIterations) throw new FlowError('条件ループの最大反復回数に達しました', 'LOOP_ITERATION_LIMIT');
              if (Date.now() - finite(control.startedAt, Date.now()) >= maxDurationMs) throw new FlowError('条件ループの最大実行時間に達しました', 'LOOP_DURATION_LIMIT');
              control.iteration += 1;
              control.inIteration = true;
            }
            updateBlockProgress(context, block, `${control.iteration}回目`);
            await runBlockList(block.children, context, childKey);
            control.inIteration = false;
            if (control.iteration % WORKFLOW_YIELD_INTERVAL === 0) await abortableDelay(0, context.signal);
          }
          removeExecutionControlFrame(context, controlKey);
          break;
        }
        case 'if': {
          const controlKey = `${execution.blockKey}/if`;
          const control = executionControlFrame(context, controlKey, () => ({
            kind: 'if',
            branch: evaluateWorkflowCondition(block.config.condition) ? 'children' : 'elseChildren'
          }));
          const branch = control.branch === 'elseChildren' ? 'elseChildren' : 'children';
          await runBlockList(block[branch], context, `${execution.blockKey}/${branch}`);
          removeExecutionControlFrame(context, controlKey);
          break;
        }
        case 'stop':
          throw new FlowStop(block.config.reason);
        case 'fixedWait':
          await abortableDelay(block.config.seconds * 1000, context.signal);
          break;
        case 'randomWait':
          await abortableDelay(randomUniform(block.config.minSeconds, block.config.maxSeconds) * 1000, context.signal);
          break;
        case 'watch':
          await waitForWorkflowCondition(block.config.condition, blockContext, { timeoutSec: block.config.timeoutSec, stableMs: block.config.stableMs });
          break;
        case 'iframeTapElement':
          await tapConfiguredElement(block.config, blockContext);
          break;
        case 'iframeReload':
          {
            const before = captureFrameState({ includeDocument: false });
            const recoveryConfig = context.battleRecoveryConfig || state.running?.battleRecoveryConfig || null;
            try {
              await replaceFrame(currentFrameUrl());
              await waitForFrameReady({
                signal: context.signal,
                timeoutMs: block.config.timeoutSec * 1000,
                expectedScreen: 'any',
                before,
                requireChange: true
              });
            } catch (error) {
              if (error instanceof FlowRestart || error?.name === 'AbortError') throw error;
              const battleEnd = recoverableBattleEndState();
              if (battleEnd && recoveryConfig) {
                return restartWorkflowAfterBattleEnd(recoveryConfig, context, battleEnd);
              }
              throw error;
            }
            const battleEnd = recoverableBattleEndState();
            if (battleEnd && recoveryConfig) {
              return restartWorkflowAfterBattleEnd(recoveryConfig, context, battleEnd);
            }
          }
          break;
        case 'iframeBack':
          if (frameWindow().history.length <= 1) throw new FlowError('iframeに戻れる履歴がありません', 'NO_HISTORY');
          await performFrameOperation(() => frameWindow().history.back(), {
            signal: context.signal,
            timeoutMs: block.config.timeoutSec * 1000,
            expectedScreen: 'any',
            requireChange: true
          });
          break;
        case 'iframeRoute': {
          const before = captureFrameState();
          await replaceFrame(gameRouteUrl(block.config.route));
          await waitForFrameReady({
            signal: context.signal,
            timeoutMs: block.config.timeoutSec * 1000,
            expectedScreen: 'any',
            before,
            requireChange: true
          });
          break;
        }
        case 'iframeReady':
          await waitForFrameReady({
            signal: context.signal,
            timeoutMs: block.config.timeoutSec * 1000,
            expectedScreen: 'any',
            requireChange: false
          });
          break;
      }
      appendLog('完了', 'success', definition.label);
    } catch (error) {
      error.block = error.block || block;
      throw error;
    }
  }

  async function startWorkflow(resumeHandoff = null) {
    if (state.running || state.legacyRunning || state.elementPicker) return;
    if (!resumeHandoff) abandonWorkflowHandoffResume('手動実行のため保存済み進行の自動復元を取りやめました');
    const restoreRunFocus = !resumeHandoff && (shadow.activeElement === byId('compactRun') || byId('page-workflow').contains(shadow.activeElement));
    let workflow;
    let resumeRuntime = null;
    if (resumeHandoff) {
      try {
        if (!validWorkflowHandoff(resumeHandoff) || resumeHandoff.phase !== 'committed') {
          throw new FlowError('保存された進行内容が無効または期限切れです', 'HANDOFF_INVALID');
        }
        workflow = normalizeWorkflow(deepClone(resumeHandoff.workflow));
        const errors = validateWorkflowDefinition(workflow).filter(issue => issue.severity === 'error');
        if (errors.length) throw new FlowError(errors[0].message, 'HANDOFF_WORKFLOW_INVALID');
        resumeRuntime = resumeHandoff.runtime;
      } catch (error) {
        clearWorkflowHandoff(resumeHandoff?.id);
        reportWorkflowHandoffFailure(error);
        return;
      }
    } else {
      workflow = prepareWorkflowRun();
      if (!workflow) return;
    }
    clearWorkflowError();
    const controller = new AbortController();
    const context = {
      controller,
      signal: controller.signal,
      workflow,
      currentBlockId: null,
      startedAt: performance.now(),
      cycle: resumeRuntime ? Math.max(1, int(resumeRuntime.cycle, 1)) : 0,
      totalCycles: resumeRuntime?.totalCycles ?? null,
      restartCount: Math.max(0, int(resumeRuntime?.restartCount, 0)),
      completedBattles: Math.max(0, int(resumeRuntime?.completedBattles, 0)),
      recentRaidIds: new Set(),
      battleRecoveryConfig: resumeRuntime?.battleRecoveryConfig && typeof resumeRuntime.battleRecoveryConfig === 'object'
        ? deepClone(resumeRuntime.battleRecoveryConfig)
        : null,
      executionState: createWorkflowExecutionState(resumeRuntime?.executionState)
    };
    if (Array.isArray(resumeRuntime?.recentRaidIds)) {
      for (const raidId of resumeRuntime.recentRaidIds) context.recentRaidIds.add(String(raidId));
    }
    state.running = context;
    resetBattleEndDetection();
    const restoreExpandedDock = enterRuntimeCompactMode();
    syncRunControls();
    if (!lightweightMode) {
      renderPalette();
      renderWorkflowEditor();
    }
    if (restoreRunFocus) requestAnimationFrame(() => (lightweightMode ? byId('compactRun') : ui.stopWorkflow).focus({ preventScroll: true }));
    appendLog(resumeHandoff
      ? `ワークフロー「${workflow.name}」を保存位置から再開`
      : `ワークフロー「${workflow.name}」を開始`);
    try {
      const loopCount = clamp(int(workflow.loopCount, 1), 1, MAX_WORKFLOW_LOOP_COUNT);
      const loopInfinite = Boolean(workflow.loopInfinite);
      let cycle = resumeRuntime ? Math.max(0, int(resumeRuntime.cycle, 1) - 1) : 0;
      if (!loopInfinite) cycle = Math.min(cycle, Math.max(0, loopCount - 1));
      let resumeCurrentCycle = Boolean(resumeRuntime);
      while (!controller.signal.aborted && (loopInfinite || cycle < loopCount)) {
        clearPendingAutoAttack('次のワークフロー周回を開始します');
        if (resumeCurrentCycle) {
          resumeCurrentCycle = false;
          cycle += 1;
          context.cycle = cycle;
          context.totalCycles = loopInfinite ? null : loopCount;
          const cycleLabel = loopInfinite ? `${cycle}周目` : `${cycle} / ${loopCount}周目`;
          appendLog(`${cycleLabel}を保存位置から再開`, '', workflow.name);
          setStatus(`${workflow.name} · ${cycleLabel}を再開`);
        } else {
          cycle += 1;
          context.cycle = cycle;
          context.totalCycles = loopInfinite ? null : loopCount;
          context.executionState = createWorkflowExecutionState();
          const cycleLabel = loopInfinite ? `${cycle}周目` : `${cycle} / ${loopCount}周目`;
          appendLog(`${cycleLabel}を開始`, '', workflow.name);
          setStatus(`${workflow.name} · ${cycleLabel}`);
        }

        while (!controller.signal.aborted) {
          try {
            await runBlockList(workflow.blocks, context);
            break;
          } catch (error) {
            if (!(error instanceof FlowRestart)) throw error;
            context.restartCount += 1;
            if (context.restartCount > MAX_WORKFLOW_RESTARTS) {
              throw new FlowError('敵撃破後の自動再開回数が安全上限に達しました', 'WORKFLOW_RESTART_LIMIT');
            }
            context.executionState = createWorkflowExecutionState();
            clearPendingAutoAttack('ワークフロー先頭から再開します');
            setRunningBlock(context, null);
            appendLog(error.message, 'warn', '自動復帰');
            setStatus(`${workflow.name} · 先頭から再開`);
          }
        }
        context.executionState = createWorkflowExecutionState();
      }
      appendLog(`ワークフロー「${workflow.name}」が${cycle}周完了`, 'success');
      setStatus('ワークフロー完了');
    } catch (error) {
      if (error?.name === 'AbortError' && (controller.signal.aborted || state.destroyed)) {
        appendLog('ユーザー操作で停止', 'warn');
        setStatus('停止しました');
      } else if (error instanceof FlowStop) {
        appendLog(error.message, 'warn', '停止');
        setStatus(error.message);
      } else {
        showWorkflowError(error, error.block || null);
        setStatus('エラーで停止');
      }
    } finally {
      clearPendingAutoAttack('ワークフローを終了しました');
      resetBattleEndDetection();
      if (state.running === context) state.running = null;
      leaveRuntimeCompactMode(restoreExpandedDock);
      state.blockProgress.clear();
      syncRunControls();
      renderPalette();
      renderWorkflowEditor();
      if (restoreRunFocus) requestAnimationFrame(() => ui.runWorkflow.focus({ preventScroll: true }));
    }
  }

  function stopWorkflow(reason = '停止ボタン') {
    abandonWorkflowHandoffResume('手動停止のため保存済み進行の自動復元を取りやめました');
    if (!state.running) return;
    state.running.controller.abort(new DOMException(reason, 'AbortError'));
  }

  const LEGACY_CONDITION_TYPES = new Set([
    'exists', 'missing', 'visible', 'hidden', 'state_on', 'state_off', 'enabled', 'disabled',
    'gbf_full_auto_on', 'gbf_full_auto_off', 'gbf_attack_ready', 'gbf_attack_not_ready',
    'class_has', 'class_missing', 'value_true', 'value_false', 'value_equals', 'value_not_equals',
    'text_contains', 'text_not_contains', 'page_ready', 'url_contains', 'url_not_contains'
  ]);

  function normalizeLegacyCondition(raw, actionType = 'click') {
    const value = raw && typeof raw === 'object' ? raw : {};
    let target = value.target === 'point' ? 'action' : value.target;
    if (!['action', 'selector', 'page'].includes(target)) target = actionType === 'click' ? 'action' : 'selector';
    let type = value.type === 'gbf_attack_on' ? 'gbf_attack_ready' : value.type === 'gbf_attack_off' ? 'gbf_attack_not_ready' : value.type;
    if (!LEGACY_CONDITION_TYPES.has(type)) type = 'exists';
    return {
      enabled: actionType === 'wait' ? value.enabled !== false : Boolean(value.enabled),
      mode: value.mode === 'check' ? 'check' : 'wait',
      target,
      selector: String(value.selector || '').trim(),
      type,
      className: String(value.className || ''),
      valueName: String(value.valueName || 'aria-pressed'),
      expected: String(value.expected ?? 'false'),
      text: String(value.text || ''),
      timeoutMs: clamp(int(value.timeoutMs, 30_000), 0, 600_000),
      timeoutAction: ['skip', 'execute'].includes(value.timeoutAction) ? value.timeoutAction : 'stop',
      stableMs: clamp(int(value.stableMs, 80), 0, 5000)
    };
  }

  function defaultLegacyState() {
    return {
      version: 12,
      markerHitSize: 48,
      url: '',
      actions: [],
      selectedId: null,
      nextId: 1,
      method: 'tap',
      count: 1,
      loop: false,
      timeRandomEnabled: true,
      timeJitterMs: 100,
      positionRandomEnabled: true,
      positionJitterPx: 2,
      recordMode: 'replace',
      settingsOpen: true,
      browserHidden: false,
      compact: false,
      dockX: null,
      dockY: null,
      dockWidth: null,
      dockHeight: null
    };
  }

  function normalizeLegacyState(raw, legacyKey = '') {
    const source = raw && typeof raw === 'object' ? raw : defaultLegacyState();
    const version = clamp(int(source.version, legacyKey.includes('v11') ? 11 : legacyKey.includes('v10') ? 10 : 1), 1, 12);
    const sourceSize = finite(source.markerHitSize, version <= 1 ? 64 : version <= 3 ? 46 : 44);
    const sourceActions = Array.isArray(source.actions) ? source.actions : Array.isArray(source.points) ? source.points : [];
    const usedActionIds = new Set();
    let generatedActionId = 1;
    const uniqueActionId = candidate => {
      const preferred = int(candidate, 0);
      if (preferred > 0 && preferred <= 2_000_000_000 && Number.isSafeInteger(preferred) && !usedActionIds.has(preferred)) {
        usedActionIds.add(preferred);
        generatedActionId = Math.max(generatedActionId, preferred + 1);
        return preferred;
      }
      while (usedActionIds.has(generatedActionId)) generatedActionId += 1;
      const id = generatedActionId++;
      usedActionIds.add(id);
      return id;
    };
    const actions = sourceActions.map((item, index) => {
      const id = uniqueActionId(item.id ?? index + 1);
      const type = item.type === 'navigate' ? 'navigate' : item.type === 'wait' ? 'wait' : 'click';
      const common = {
        id,
        type,
        enabled: item.enabled !== false,
        delayMs: clamp(int(item.delayMs, index === 0 ? 0 : int(source.interval, 1000)), 0, 600_000),
        condition: normalizeLegacyCondition(item.condition, type)
      };
      if (type === 'navigate') {
        return {
          ...common,
          url: String(item.url || ''),
          waitForLoad: item.waitForLoad !== false,
          loadTimeoutMs: clamp(int(item.loadTimeoutMs, 15_000), 1000, 120_000),
          failureMode: item.failureMode === 'continue' ? 'continue' : 'stop'
        };
      }
      if (type === 'wait') return common;
      let cx;
      let cy;
      if (item.cx != null || item.cy != null) {
        cx = finite(item.cx, window.innerWidth / 2);
        cy = finite(item.cy, window.innerHeight / 2);
      } else if (version >= 4) {
        cx = finite(item.x, window.innerWidth / 2);
        cy = finite(item.y, window.innerHeight / 2);
      } else {
        cx = finite(item.x, window.innerWidth / 2) + sourceSize / 2;
        cy = finite(item.y, window.innerHeight / 2) + sourceSize / 2;
      }
      return {
        ...common,
        cx: clamp(cx, 0, window.innerWidth),
        cy: clamp(cy, 0, window.innerHeight),
        holdMs: clamp(int(item.holdMs, 55), 0, 5000),
        targetMode: item.targetMode === 'selector' ? 'selector' : 'point',
        selector: String(item.selector || '').trim(),
        waitForTarget: item.waitForTarget !== false,
        targetTimeoutMs: clamp(int(item.targetTimeoutMs, 15_000), 0, 120_000),
        targetFailureMode: ['skip', 'point'].includes(item.targetFailureMode) ? item.targetFailureMode : 'stop',
        scrollTarget: item.scrollTarget !== false,
        targetLabel: String(item.targetLabel || '')
      };
    });
    const nextId = Math.max(int(source.nextId, 1), ...actions.map(action => action.id + 1), 1);
    return {
      ...defaultLegacyState(),
      version: 12,
      url: String(source.url || ''),
      actions,
      selectedId: actions.some(action => action.id === int(source.selectedId)) ? int(source.selectedId) : actions[0]?.id ?? null,
      nextId,
      method: 'tap',
      count: clamp(int(source.count, 1), 1, 999_999),
      loop: Boolean(source.loop),
      timeRandomEnabled: source.timeRandomEnabled ?? source.randomEnabled ?? true,
      timeJitterMs: clamp(int(source.timeJitterMs ?? source.jitterMs, 100), 0, 5000),
      positionRandomEnabled: source.positionRandomEnabled !== false,
      positionJitterPx: clamp(finite(source.positionJitterPx, 2), 0, 30),
      recordMode: ['replace', 'append'].includes(source.recordMode) ? source.recordMode : 'replace',
      settingsOpen: source.settingsOpen !== false,
      browserHidden: Boolean(source.browserHidden),
      compact: Boolean(source.compact),
      dockX: source.dockX != null && Number.isFinite(Number(source.dockX)) ? Number(source.dockX) : null,
      dockY: source.dockY != null && Number.isFinite(Number(source.dockY)) ? Number(source.dockY) : null,
      dockWidth: source.dockWidth != null && Number.isFinite(Number(source.dockWidth)) ? Number(source.dockWidth) : null,
      dockHeight: source.dockHeight != null && Number.isFinite(Number(source.dockHeight)) ? Number(source.dockHeight) : null
    };
  }

  function findLegacySaved() {
    const current = readJson(LEGACY_STORAGE_KEY);
    if (current) return { data: current, key: LEGACY_STORAGE_KEY };
    for (const key of LEGACY_STORAGE_KEYS) {
      const data = readJson(key);
      if (data) return { data, key };
    }
    return null;
  }

  function loadLegacyState() {
    const saved = findLegacySaved();
    state.legacy = normalizeLegacyState(saved?.data, saved?.key || '');
    state.selectedLegacyId = state.legacy.selectedId;
    state.nextLegacyId = state.legacy.nextId;
    ui.legacyCount.value = state.legacy.count;
    ui.legacyJitter.value = state.legacy.timeJitterMs;
    ui.legacyPositionJitter.value = state.legacy.positionJitterPx;
    if (Number.isFinite(state.legacy.dockX)) state.dockX = state.legacy.dockX;
    if (Number.isFinite(state.legacy.dockY)) state.dockY = state.legacy.dockY;
    if (Number.isFinite(state.legacy.dockWidth)) state.dockWidth = state.legacy.dockWidth;
    if (Number.isFinite(state.legacy.dockHeight)) state.dockHeight = state.legacy.dockHeight;
  }

  function legacySnapshot() {
    return {
      version: 12,
      markerHitSize: 48,
      url: urlInput.value,
      actions: state.legacy.actions.map(action => deepClone(action)),
      selectedId: state.selectedLegacyId,
      nextId: state.nextLegacyId,
      method: 'tap',
      count: clamp(int(ui.legacyCount.value, 1), 1, 999_999),
      loop: Boolean(state.legacy.loop),
      timeRandomEnabled: state.legacy.timeRandomEnabled !== false,
      timeJitterMs: clamp(int(ui.legacyJitter.value, 100), 0, 5000),
      positionRandomEnabled: state.legacy.positionRandomEnabled !== false,
      positionJitterPx: clamp(finite(ui.legacyPositionJitter.value, 2), 0, 30),
      recordMode: state.legacy.recordMode || 'replace',
      settingsOpen: true,
      browserHidden: ui.browserBar.classList.contains('hidden'),
      compact: dock.classList.contains('compact'),
      dockX: state.dockX,
      dockY: state.dockY,
      dockWidth: state.dockWidth,
      dockHeight: state.dockHeight
    };
  }

  function saveLegacyState() {
    if (!state.legacy) return;
    const snapshot = legacySnapshot();
    const normalized = normalizeLegacyState(snapshot);
    const liveActions = new Map(state.legacy.actions.map(action => [action.id, action]));
    normalized.actions = normalized.actions.map(action => {
      const live = liveActions.get(action.id);
      if (!live) return action;
      Object.assign(live, action);
      return live;
    });
    Object.assign(state.legacy, normalized);
    state.selectedLegacyId = state.legacy.selectedId;
    state.nextLegacyId = state.legacy.nextId;
    try {
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      appendLog(`旧マクロ保存失敗: ${error.message}`, 'error');
    }
  }

  function legacyActionName(action, index = state.legacy.actions.indexOf(action)) {
    if (action.type === 'navigate') return `URL移動 ${index + 1}`;
    if (action.type === 'wait') return `条件待ち ${index + 1}`;
    return `クリック ${index + 1}`;
  }

  function addLegacyAction(type) {
    if (state.legacyRunning || state.recording) return;
    const index = state.legacy.actions.length;
    let action;
    if (type === 'navigate') {
      action = {
        id: state.nextLegacyId++, type: 'navigate', enabled: true, delayMs: index ? 1000 : 0,
        url: currentFrameUrl(), waitForLoad: true, loadTimeoutMs: 15_000, failureMode: 'stop',
        condition: normalizeLegacyCondition({}, 'navigate')
      };
    } else if (type === 'wait') {
      action = {
        id: state.nextLegacyId++, type: 'wait', enabled: true, delayMs: index ? 1000 : 0,
        condition: normalizeLegacyCondition({ enabled: true, target: 'selector', selector: '', type: 'visible' }, 'wait')
      };
    } else {
      action = {
        id: state.nextLegacyId++, type: 'click', enabled: true, delayMs: index ? 1000 : 0,
        cx: window.innerWidth / 2, cy: window.innerHeight / 2, holdMs: 55,
        targetMode: 'point', selector: '', waitForTarget: true, targetTimeoutMs: 15_000,
        targetFailureMode: 'stop', scrollTarget: true, targetLabel: '', condition: normalizeLegacyCondition({}, 'click')
      };
    }
    state.legacy.actions.push(action);
    state.selectedLegacyId = action.id;
    state.legacy.selectedId = action.id;
    renderLegacy();
    saveLegacyState();
  }

  function updateLegacyAction(action, updater) {
    updater(action);
    const normalized = normalizeLegacyState({ ...legacySnapshot(), actions: state.legacy.actions });
    const replacement = normalized.actions.find(item => item.id === action.id);
    if (replacement) Object.assign(action, replacement);
    renderLegacyMarkers();
    saveLegacyState();
  }

  function moveLegacyAction(action, direction) {
    const index = state.legacy.actions.indexOf(action);
    const next = index + direction;
    if (next < 0 || next >= state.legacy.actions.length) return;
    [state.legacy.actions[index], state.legacy.actions[next]] = [state.legacy.actions[next], state.legacy.actions[index]];
    renderLegacy();
    saveLegacyState();
    return action.id;
  }

  function removeLegacyAction(action) {
    const index = state.legacy.actions.indexOf(action);
    if (index < 0) return;
    state.legacy.actions.splice(index, 1);
    state.selectedLegacyId = (state.legacy.actions[index] || state.legacy.actions[index - 1])?.id ?? null;
    state.legacy.selectedId = state.selectedLegacyId;
    renderLegacy();
    saveLegacyState();
    return state.selectedLegacyId;
  }

  function duplicateLegacyAction(action) {
    const index = state.legacy.actions.indexOf(action);
    if (index < 0) return;
    const copy = deepClone(action);
    copy.id = state.nextLegacyId++;
    if (copy.type === 'click') {
      copy.cx = clamp(copy.cx + 14, 0, window.innerWidth);
      copy.cy = clamp(copy.cy + 14, 0, window.innerHeight);
    }
    state.legacy.actions.splice(index + 1, 0, copy);
    state.selectedLegacyId = copy.id;
    state.legacy.selectedId = copy.id;
    renderLegacy();
    saveLegacyState();
    return copy.id;
  }

  function legacyConditionEditor(action) {
    const condition = normalizeLegacyCondition(action.condition, action.type);
    const grid = element('div', { className: 'grid2' });
    const enabled = element('input', { type: 'checkbox' });
    enabled.checked = condition.enabled;
    enabled.addEventListener('change', () => updateLegacyAction(action, target => { target.condition.enabled = enabled.checked; }));
    const target = selectInput(condition.target, [['action', 'この動作の対象'], ['selector', 'セレクタ'], ['page', 'ページ全体']], input => updateLegacyAction(action, targetAction => { targetAction.condition.target = input.value; }));
    const type = selectInput(condition.type, [
      ['exists', '要素が存在'], ['missing', '要素が消失'], ['visible', '要素が表示'], ['hidden', '要素が非表示'],
      ['state_on', 'ON'], ['state_off', 'OFF'], ['enabled', '操作可能'], ['disabled', '操作不可'],
      ['gbf_full_auto_on', 'フルオートON'], ['gbf_full_auto_off', 'フルオートOFF'],
      ['gbf_attack_ready', '攻撃可能'], ['gbf_attack_not_ready', '攻撃不可'],
      ['page_ready', 'ページ読込完了'], ['url_contains', 'URLに文字を含む'], ['text_contains', '本文に文字を含む']
    ], input => updateLegacyAction(action, targetAction => { targetAction.condition.type = input.value; }));
    const selector = textInput(condition.selector, input => updateLegacyAction(action, targetAction => { targetAction.condition.selector = input.value; }), '.btn-auto');
    const text = textInput(condition.text, input => updateLegacyAction(action, targetAction => { targetAction.condition.text = input.value; }), '文字列');
    const timeout = numberInput(condition.timeoutMs, 0, 600_000, 500, input => updateLegacyAction(action, targetAction => { targetAction.condition.timeoutMs = input.value; }));
    grid.append(field('条件を使う', enabled), field('監視対象', target), field('成立条件', type), field('セレクタ', selector), field('文字/URL', text), field('タイムアウトms', timeout));
    return grid;
  }

  function focusLegacyControl(actionId, actionName = 'select', message = '') {
    requestAnimationFrame(() => {
      const row = Array.from(shadow.querySelectorAll('.legacyRow')).find(candidate => candidate.dataset.actionId === String(actionId));
      const preferred = row?.querySelector(`[data-action="${actionName}"]`);
      const control = preferred && !preferred.disabled ? preferred : row?.querySelector('.legacySelect') || byId('legacyAddClick');
      control?.focus({ preventScroll: true });
      if (message) announce(message);
    });
  }

  function renderLegacyAction(action, index) {
    const row = element('div', {
      className: 'legacyRow',
      dataset: { actionId: String(action.id) },
      attrs: { role: 'group', 'aria-label': legacyActionName(action, index) }
    });
    row.classList.toggle('selected', action.id === state.selectedLegacyId);
    const title = element('button', {
      className: 'legacySelect',
      text: legacyActionName(action, index),
      dataset: { action: 'select' },
      attrs: { 'aria-pressed': String(action.id === state.selectedLegacyId) }
    });
    title.addEventListener('click', () => {
      state.selectedLegacyId = action.id;
      state.legacy.selectedId = action.id;
      shadow.querySelectorAll('.legacyRow').forEach(candidate => {
        const selected = candidate.dataset.actionId === String(action.id);
        candidate.classList.toggle('selected', selected);
        candidate.querySelector('.legacySelect')?.setAttribute('aria-pressed', String(selected));
      });
      renderLegacyMarkers();
      saveLegacyState();
      announce(`${legacyActionName(action, index)}を選択しました`);
    });
    const tools = element('div', { className: 'legacyTools' });
    const tool = (text, label, actionName, handler, disabled = false) => {
      const button = element('button', {
        text,
        title: label,
        dataset: { action: actionName },
        attrs: { 'aria-label': `${legacyActionName(action, index)}：${label}` }
      });
      button.disabled = Boolean(state.legacyRunning || state.recording || disabled);
      button.addEventListener('click', () => {
        const focusId = handler();
        focusLegacyControl(focusId ?? action.id, actionName, label);
      });
      tools.append(button);
    };
    tool('↑', 'ひとつ上へ移動', 'move-up', () => moveLegacyAction(action, -1), index === 0);
    tool('↓', 'ひとつ下へ移動', 'move-down', () => moveLegacyAction(action, 1), index === state.legacy.actions.length - 1);
    tool('⧉', '複製', 'duplicate', () => duplicateLegacyAction(action));
    tool('×', '削除', 'delete', () => removeLegacyAction(action));
    const head = element('div', { className: 'legacyHead' }, [title, tools]);
    row.append(head);
    const common = element('div', { className: 'grid2' });
    const enabled = element('input', { type: 'checkbox' });
    enabled.checked = action.enabled !== false;
    enabled.addEventListener('change', () => updateLegacyAction(action, target => { target.enabled = enabled.checked; }));
    const delay = numberInput(action.delayMs, 0, 600_000, 10, input => updateLegacyAction(action, target => { target.delayMs = input.value; }));
    common.append(field('使う', enabled), field('実行前待機ms', delay));
    row.append(common);

    if (action.type === 'click') {
      const grid = element('div', { className: 'grid2' });
      const mode = selectInput(action.targetMode, [['point', '保存位置'], ['selector', 'セレクタ追跡']], input => updateLegacyAction(action, target => { target.targetMode = input.value; }));
      const selector = textInput(action.selector, input => updateLegacyAction(action, target => { target.selector = input.value; }), '.btn-auto');
      const x = numberInput(action.cx, 0, Math.max(1, window.innerWidth), 1, input => updateLegacyAction(action, target => { target.cx = input.value; }));
      const y = numberInput(action.cy, 0, Math.max(1, window.innerHeight), 1, input => updateLegacyAction(action, target => { target.cy = input.value; }));
      const timeout = numberInput(action.targetTimeoutMs, 0, 120_000, 500, input => updateLegacyAction(action, target => { target.targetTimeoutMs = input.value; }));
      grid.append(field('対象', mode), field('セレクタ', selector), field('X', x), field('Y', y), field('対象待機ms', timeout));
      row.append(grid);
    } else if (action.type === 'navigate') {
      const grid = element('div', { className: 'grid2' });
      const url = textInput(action.url, input => updateLegacyAction(action, target => { target.url = input.value; }), 'https://...');
      const timeout = numberInput(action.loadTimeoutMs, 1000, 120_000, 500, input => updateLegacyAction(action, target => { target.loadTimeoutMs = input.value; }));
      grid.append(field('移動先URL', url), field('読込待機ms', timeout));
      row.append(grid);
    }
    row.append(legacyConditionEditor(action));
    row.querySelectorAll('input,select,button').forEach(control => {
      if (state.legacyRunning || state.recording) control.disabled = true;
    });
    return row;
  }

  function clearLegacyMarkers() {
    markerLayer.textContent = '';
  }

  function renderLegacyMarkers() {
    clearLegacyMarkers();
    if (state.page !== 'legacy' || state.recording) return;
    state.legacy.actions.forEach((action, index) => {
      if (action.type !== 'click' || action.targetMode !== 'point') return;
      const markerLabel = () => `動作${index + 1}の保存位置、X ${Math.round(action.cx)}、Y ${Math.round(action.cy)}`;
      const marker = element('div', {
        className: 'marker',
        text: String(index + 1),
        title: markerLabel(),
        dataset: { actionId: String(action.id) },
        attrs: {
          tabindex: '0',
          role: 'button',
          'aria-label': markerLabel(),
          'aria-pressed': String(action.id === state.selectedLegacyId)
        }
      });
      marker.classList.toggle('selected', action.id === state.selectedLegacyId);
      marker.style.left = `${action.cx}px`;
      marker.style.top = `${action.cy}px`;
      const selectMarker = () => {
        state.selectedLegacyId = action.id;
        state.legacy.selectedId = action.id;
        shadow.querySelectorAll('.legacyRow').forEach(candidate => {
          const selected = candidate.dataset.actionId === String(action.id);
          candidate.classList.toggle('selected', selected);
          candidate.querySelector('.legacySelect')?.setAttribute('aria-pressed', String(selected));
        });
        renderLegacyMarkers();
        saveLegacyState();
        requestAnimationFrame(() => {
          const nextMarker = Array.from(markerLayer.children).find(candidate => candidate.dataset.actionId === String(action.id));
          nextMarker?.focus({ preventScroll: true });
        });
      };
      marker.addEventListener('click', selectMarker);
      const drag = {
        active: false, id: null, startX: 0, startY: 0,
        baseX: 0, baseY: 0, moved: false, threshold: 3
      };
      const detach = () => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', finish, true);
        window.removeEventListener('pointercancel', finish, true);
      };
      const move = event => {
        if (!drag.active || event.pointerId !== drag.id) return;
        consumeDragEvent(event, true);
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (!drag.moved && Math.hypot(dx, dy) < drag.threshold) return;
        drag.moved = true;
        action.cx = clamp(drag.baseX + dx, 0, window.innerWidth);
        action.cy = clamp(drag.baseY + dy, 0, window.innerHeight);
        marker.style.left = `${action.cx}px`;
        marker.style.top = `${action.cy}px`;
      };
      const cancel = () => {
        if (!drag.active) return;
        drag.active = false;
        action.cx = drag.baseX;
        action.cy = drag.baseY;
        marker.style.left = `${action.cx}px`;
        marker.style.top = `${action.cy}px`;
        detach();
        releaseDragLock(null, marker);
        saveLegacyState();
        renderLegacyListOnly();
      };
      const finish = event => {
        if (!drag.active || event.pointerId !== drag.id) return;
        consumeDragEvent(event, true);
        if (event.type === 'pointercancel') return cancel();
        drag.active = false;
        releaseDragLock(event, marker);
        detach();
        saveLegacyState();
        renderLegacyListOnly();
        if (!drag.moved) selectMarker();
      };
      marker.addEventListener('pointerdown', event => {
        if (state.legacyRunning || state.recording || event.button !== 0) return;
        cancelActiveDrag('replaced');
        drag.active = true;
        drag.id = event.pointerId;
        drag.startX = event.clientX;
        drag.startY = event.clientY;
        drag.baseX = action.cx;
        drag.baseY = action.cy;
        drag.moved = false;
        drag.threshold = pointerDragThreshold(event);
        acquireDragLock(event, marker, cancel);
        window.addEventListener('pointermove', move, { capture: true, passive: false });
        window.addEventListener('pointerup', finish, { capture: true, passive: false });
        window.addEventListener('pointercancel', finish, { capture: true, passive: false });
      }, { passive: false });
      marker.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          marker.click();
          return;
        }
        const amount = event.shiftKey ? 10 : 1;
        const delta = { ArrowLeft: [-amount, 0], ArrowRight: [amount, 0], ArrowUp: [0, -amount], ArrowDown: [0, amount] }[event.key];
        if (!delta) return;
        event.preventDefault();
        action.cx = clamp(action.cx + delta[0], 0, window.innerWidth);
        action.cy = clamp(action.cy + delta[1], 0, window.innerHeight);
        marker.style.left = `${action.cx}px`;
        marker.style.top = `${action.cy}px`;
        marker.title = markerLabel();
        marker.setAttribute('aria-label', markerLabel());
        saveLegacyState();
        renderLegacyListOnly();
        announce(markerLabel());
      });
      markerLayer.append(marker);
    });
  }

  function renderLegacyListOnly() {
    ui.legacyList.textContent = '';
    if (!state.legacy.actions.length) ui.legacyList.append(element('div', { className: 'empty', text: '旧マクロの動作はありません。上のボタンから追加できます。' }));
    else state.legacy.actions.forEach((action, index) => ui.legacyList.append(renderLegacyAction(action, index)));
  }

  function renderLegacy() {
    ui.legacyCount.value = clamp(int(ui.legacyCount.value || state.legacy.count, 1), 1, 999_999);
    ui.legacyJitter.value = clamp(int(ui.legacyJitter.value || state.legacy.timeJitterMs, 100), 0, 5000);
    ui.legacyPositionJitter.value = clamp(finite(ui.legacyPositionJitter.value || state.legacy.positionJitterPx, 2), 0, 30);
    renderLegacyListOnly();
    renderLegacyMarkers();
    const busy = Boolean(state.running || state.legacyRunning || state.recording);
    ui.legacyRun.disabled = busy || !state.legacy.actions.length;
    ui.legacyStop.disabled = !state.legacyRunning;
  }

  function legacyElementTarget(action) {
    const doc = frameDocument();
    if (action.targetMode === 'selector') {
      let target;
      try { target = doc.querySelector(action.selector); }
      catch { throw new FlowError('旧マクロのセレクタが不正です', 'INVALID_SELECTOR'); }
      if (!target) return null;
      return target.closest?.('button,a,[role="button"],.btn-usual-ok,.btn-multi-raid,.btn-supporter') || target;
    }
    const frameRect = iframe.getBoundingClientRect();
    const x = action.cx - frameRect.left;
    const y = action.cy - frameRect.top;
    if (x < 0 || y < 0 || x > frameRect.width || y > frameRect.height) throw new FlowError('旧マクロの保存位置がiframe外です', 'POINT_OUTSIDE_FRAME');
    return doc.elementFromPoint(x, y);
  }

  function legacyPositionWithJitter(action, runSettings = state.legacy) {
    if (!runSettings.positionRandomEnabled) return { x: action.cx, y: action.cy };
    const radius = clamp(finite(runSettings.positionJitterPx, 2), 0, 30);
    if (!radius) return { x: action.cx, y: action.cy };
    const angle = Math.random() * Math.PI * 2;
    const length = Math.sqrt(Math.random()) * radius;
    return {
      x: clamp(action.cx + Math.cos(angle) * length, 0, window.innerWidth),
      y: clamp(action.cy + Math.sin(angle) * length, 0, window.innerHeight)
    };
  }

  function legacyBooleanState(target) {
    if (!target) return null;
    if (target.classList?.contains('on') || target.classList?.contains('active') || target.getAttribute?.('aria-pressed') === 'true') return true;
    if (target.classList?.contains('off') || target.classList?.contains('inactive') || target.getAttribute?.('aria-pressed') === 'false') return false;
    return null;
  }

  function legacyConditionTarget(action, condition) {
    const doc = frameDocument();
    if (condition.target === 'page') return { document: doc, page: true };
    if (condition.target === 'action' && action.type === 'click') return { element: legacyElementTarget(action) };
    if (!condition.selector) return { element: null };
    try { return { element: doc.querySelector(condition.selector) }; }
    catch { throw new FlowError('旧マクロ条件のセレクタが不正です', 'INVALID_SELECTOR'); }
  }

  function evaluateLegacyCondition(action) {
    const condition = normalizeLegacyCondition(action.condition, action.type);
    if (!condition.enabled) return { matched: true };
    if (condition.type === 'gbf_full_auto_on') return { matched: fullAutoState().on };
    if (condition.type === 'gbf_full_auto_off') {
      const auto = fullAutoState();
      return { matched: auto.exists && !auto.on };
    }
    if (condition.type === 'gbf_attack_ready' || condition.type === 'gbf_attack_not_ready') {
      const snapshot = attackSnapshot();
      const ready = snapshot.startVisible && !snapshot.cancelVisible && !snapshot.dummyVisible;
      return { matched: condition.type === 'gbf_attack_ready' ? ready : !ready };
    }
    const target = legacyConditionTarget(action, condition);
    if (target.page) {
      if (condition.type === 'page_ready') return { matched: pageBaseReady(target.document) };
      if (condition.type === 'url_contains') return { matched: currentFrameUrl().includes(condition.text) };
      if (condition.type === 'url_not_contains') return { matched: !currentFrameUrl().includes(condition.text) };
      return { matched: false };
    }
    const elementTarget = target.element;
    const visible = computedVisible(elementTarget);
    const disabled = Boolean(elementTarget && ('disabled' in elementTarget && elementTarget.disabled || elementTarget.getAttribute?.('aria-disabled') === 'true'));
    switch (condition.type) {
      case 'exists': return { matched: Boolean(elementTarget) };
      case 'missing': return { matched: !elementTarget };
      case 'visible': return { matched: visible };
      case 'hidden': return { matched: !elementTarget || !visible };
      case 'enabled': return { matched: Boolean(elementTarget) && !disabled };
      case 'disabled': return { matched: Boolean(elementTarget) && disabled };
      case 'state_on': return { matched: legacyBooleanState(elementTarget) === true };
      case 'state_off': return { matched: legacyBooleanState(elementTarget) === false };
      case 'class_has': return { matched: Boolean(elementTarget) && String(condition.className).trim().split(/\s+/).filter(Boolean).every(name => elementTarget.classList.contains(name)) };
      case 'class_missing': return { matched: !elementTarget || String(condition.className).trim().split(/\s+/).filter(Boolean).some(name => !elementTarget.classList.contains(name)) };
      case 'text_contains': return { matched: Boolean(elementTarget) && String(elementTarget.textContent || '').includes(condition.text) };
      case 'text_not_contains': return { matched: !elementTarget || !String(elementTarget.textContent || '').includes(condition.text) };
      default: return { matched: false };
    }
  }

  async function waitForLegacyCondition(action, signal) {
    const condition = normalizeLegacyCondition(action.condition, action.type);
    if (!condition.enabled) return 'execute';
    const initial = evaluateLegacyCondition(action);
    if (condition.mode === 'check') return initial.matched ? 'execute' : 'skip';
    try {
      await monitorFrame(() => evaluateLegacyCondition(action).matched, {
        signal,
        timeoutMs: condition.timeoutMs,
        stableMs: condition.stableMs,
        description: `${legacyActionName(action)}の条件待ち`
      });
      return 'execute';
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      if (condition.timeoutAction === 'skip') return 'skip';
      if (condition.timeoutAction === 'execute') return 'execute';
      throw error;
    }
  }

  async function waitForLegacyTarget(action, signal) {
    let immediate = legacyElementTarget(action);
    if (immediate && computedVisible(immediate)) return immediate;
    if (action.targetMode !== 'selector' || !action.waitForTarget) return immediate;
    return monitorFrame(() => {
      const target = legacyElementTarget(action);
      return target && computedVisible(target) ? target : false;
    }, { signal, timeoutMs: action.targetTimeoutMs, stableMs: 30, description: `${legacyActionName(action)}の対象待ち` });
  }

  async function executeLegacyClick(action, signal, runSettings = state.legacy) {
    let target;
    try {
      target = await waitForLegacyTarget(action, signal);
    } catch (error) {
      if (action.targetFailureMode === 'skip' && error?.code === 'TIMEOUT') return { skipped: true };
      if (action.targetFailureMode !== 'point') throw error;
    }
    if (!target && action.targetFailureMode === 'point') {
      const point = legacyPositionWithJitter(action, runSettings);
      const frameRect = iframe.getBoundingClientRect();
      target = frameDocument().elementFromPoint(point.x - frameRect.left, point.y - frameRect.top);
    }
    if (!target) {
      if (action.targetFailureMode === 'skip') return { skipped: true };
      throw new FlowError('旧マクロの押下対象が見つかりません', 'TARGET_MISSING');
    }
    if (!computedVisible(target)) throw new FlowError('旧マクロの押下対象が非表示です', 'TARGET_HIDDEN');
    await jqTapStrict(target, { signal, label: legacyActionName(action) });
    return { ok: true };
  }

  async function executeLegacyAction(action, signal, index, runSettings = state.legacy) {
    if (action.enabled === false) return 'skip';
    const jitter = runSettings.timeRandomEnabled && index > 0
      ? randomUniform(-finite(runSettings.timeJitterMs, 100), finite(runSettings.timeJitterMs, 100))
      : 0;
    await abortableDelay(Math.max(0, action.delayMs + jitter), signal);
    const conditionResult = await waitForLegacyCondition(action, signal);
    if (conditionResult === 'skip') return 'skip';
    if (action.type === 'wait') return 'ok';
    if (action.type === 'navigate') {
      const destination = String(action.url || '').trim();
      if (!destination) throw new FlowError('旧マクロのURLが空です', 'INVALID_URL');
      const normalized = navigableHttpUrl(destination);
      if (action.waitForLoad) {
        await performFrameOperation(() => {
          urlInput.value = normalized;
          iframe.contentWindow.location.href = normalized;
        }, { signal, timeoutMs: action.loadTimeoutMs, expectedScreen: 'auto', requireChange: true });
      } else {
        iframe.contentWindow.location.href = normalized;
      }
      return 'ok';
    }
    const result = await executeLegacyClick(action, signal, runSettings);
    return result.skipped ? 'skip' : 'ok';
  }

  function validateLegacyConfiguration(runState) {
    if (!runState.actions.some(action => action.enabled !== false)) {
      return { action: null, message: '有効なマクロ動作がありません' };
    }
    for (const action of runState.actions) {
      if (action.enabled === false) continue;
      if (action.type === 'navigate') {
        if (!String(action.url || '').trim()) return { action, message: 'URL移動のURLが空です' };
        try { navigableHttpUrl(action.url); }
        catch (error) { return { action, message: error.message }; }
      }
      if (action.type === 'click' && action.targetMode === 'selector') {
        if (!action.selector) return { action, message: 'クリック対象のセレクタが空です' };
        const syntaxError = selectorSyntaxError(action.selector);
        if (syntaxError) return { action, message: syntaxError };
      }
      const condition = normalizeLegacyCondition(action.condition, action.type);
      if (condition.enabled && condition.target === 'selector') {
        if (!condition.selector) return { action, message: '条件監視のセレクタが空です' };
        const syntaxError = selectorSyntaxError(condition.selector);
        if (syntaxError) return { action, message: syntaxError };
      }
    }
    return null;
  }

  async function startLegacy() {
    if (state.legacyRunning || state.running || state.recording || state.elementPicker || !state.legacy.actions.length) return;
    const restoreRunFocus = shadow.activeElement === byId('compactRun') || byId('page-legacy').contains(shadow.activeElement);
    commitActiveEditorInput();
    saveLegacyState();
    const runState = normalizeLegacyState(legacySnapshot());
    const validationIssue = validateLegacyConfiguration(runState);
    if (validationIssue) {
      if (validationIssue.action) {
        state.selectedLegacyId = validationIssue.action.id;
        state.legacy.selectedId = validationIssue.action.id;
        renderLegacy();
        focusLegacyControl(validationIssue.action.id, 'select', validationIssue.message);
      } else {
        ui.legacyRun.focus({ preventScroll: true });
        announce(validationIssue.message);
      }
      return toast(validationIssue.message);
    }
    const controller = new AbortController();
    const token = { controller, signal: controller.signal, runState };
    state.legacyRunning = token;
    const restoreExpandedDock = enterRuntimeCompactMode();
    syncRunControls();
    if (!lightweightMode) renderLegacy();
    if (restoreRunFocus) requestAnimationFrame(() => (lightweightMode ? byId('compactRun') : ui.legacyStop).focus({ preventScroll: true }));
    appendLog('旧マクロを開始');
    try {
      const count = runState.count;
      let cycle = 0;
      while (!controller.signal.aborted && (runState.loop || cycle < count)) {
        for (let index = 0; index < runState.actions.length; index++) {
          throwIfAborted(controller.signal);
          const action = runState.actions[index];
          setStatus(`${cycle + 1}周目 · ${legacyActionName(action, index)}`);
          const result = await executeLegacyAction(action, controller.signal, index, runState);
          appendLog(`${legacyActionName(action, index)}: ${result === 'skip' ? 'スキップ' : '完了'}`, result === 'skip' ? 'warn' : 'success', '旧マクロ');
        }
        cycle += 1;
      }
      appendLog(`旧マクロ ${cycle}周完了`, 'success');
      setStatus('旧マクロ完了');
    } catch (error) {
      if (error?.name === 'AbortError') {
        appendLog('旧マクロを停止', 'warn');
        setStatus('旧マクロ停止');
      } else {
        appendLog(`旧マクロエラー: ${error.message}`, 'error');
        setStatus(`旧マクロ停止: ${error.message}`);
      }
    } finally {
      if (state.legacyRunning === token) state.legacyRunning = null;
      leaveRuntimeCompactMode(restoreExpandedDock);
      syncRunControls();
      renderLegacy();
      if (restoreRunFocus) requestAnimationFrame(() => ui.legacyRun.focus({ preventScroll: true }));
    }
  }

  function stopLegacy(reason = '停止ボタン') {
    state.legacyRunning?.controller.abort(new DOMException(reason, 'AbortError'));
  }

  function legacyPresetKey(slot) {
    return `${LEGACY_PRESET_PREFIX}_${slot}`;
  }

  function readLegacyPreset(slot) {
    let data = readJson(legacyPresetKey(slot));
    if (data) return data;
    for (const prefix of LEGACY_PRESET_PREFIXES) {
      data = readJson(`${prefix}_${slot}`);
      if (data) return data;
    }
    return null;
  }

  function refreshLegacyPresets() {
    const selected = ui.legacyPresetSlot.value || '1';
    ui.legacyPresetSlot.textContent = '';
    for (let slot = 1; slot <= 8; slot++) {
      const data = readLegacyPreset(slot);
      const name = String(data?.presetMeta?.name || `保存 ${slot}`);
      ui.legacyPresetSlot.append(element('option', { value: String(slot), text: `${name}${data ? ' ✓' : ''}` }));
    }
    ui.legacyPresetSlot.value = selected;
    const current = readLegacyPreset(selected);
    ui.legacyPresetName.value = String(current?.presetMeta?.name || '');
  }

  function saveLegacyPreset() {
    const slot = ui.legacyPresetSlot.value || '1';
    const name = String(ui.legacyPresetName.value || '').trim() || `保存 ${slot}`;
    const snapshot = { ...legacySnapshot(), presetMeta: { name, savedAt: Date.now() } };
    try {
      localStorage.setItem(legacyPresetKey(slot), JSON.stringify(snapshot));
      refreshLegacyPresets();
      ui.legacyPresetSlot.value = slot;
      ui.legacyPresetName.value = name;
      toast(`「${name}」を保存しました`);
    } catch (error) {
      toast(`保存失敗: ${error.message}`);
    }
  }

  function loadLegacyPreset() {
    const slot = ui.legacyPresetSlot.value || '1';
    const data = readLegacyPreset(slot);
    if (!data) return toast('このスロットは空です');
    const normalized = normalizeLegacyState(data);
    let safeUrl = '';
    let unsafeUrl = false;
    if (normalized.url) {
      try { safeUrl = navigableHttpUrl(normalized.url); }
      catch {
        normalized.url = '';
        unsafeUrl = true;
      }
    }
    state.legacy = normalized;
    state.selectedLegacyId = state.legacy.selectedId;
    state.nextLegacyId = state.legacy.nextId;
    ui.legacyCount.value = state.legacy.count;
    ui.legacyJitter.value = state.legacy.timeJitterMs;
    ui.legacyPositionJitter.value = state.legacy.positionJitterPx;
    if (safeUrl) {
      urlInput.value = safeUrl;
      iframe.src = safeUrl;
    }
    renderLegacy();
    saveLegacyState();
    toast(unsafeUrl
      ? 'プリセットを読み込みました。安全でないURLは削除しました'
      : `「${data.presetMeta?.name || `保存 ${slot}`}」を読み込みました`);
  }

  function deleteLegacyPreset() {
    const slot = ui.legacyPresetSlot.value || '1';
    const data = readLegacyPreset(slot);
    if (!data) return toast('このスロットは空です');
    if (!confirm(`「${data.presetMeta?.name || `保存 ${slot}`}」を削除しますか？`)) return;
    localStorage.removeItem(legacyPresetKey(slot));
    for (const prefix of LEGACY_PRESET_PREFIXES) localStorage.removeItem(`${prefix}_${slot}`);
    refreshLegacyPresets();
    toast('削除しました');
  }

  function createRecordDot(x, y, number) {
    const dot = element('div', { className: 'recordDot', text: String(number) });
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    recordLayer.append(dot);
    return dot;
  }

  function startLegacyRecording() {
    if (state.recording || state.running || state.legacyRunning) return;
    state.recordReturnFocus = shadow.activeElement;
    state.recording = true;
    state.recordedPoints = [];
    state.activeRecordPointers.clear();
    state.recordStartedAt = performance.now();
    recordLayer.textContent = '';
    recordLayer.classList.add('active');
    ui.recordCount.textContent = '0件';
    ui.recordToolbar.hidden = false;
    clearLegacyMarkers();
    setStatus('タッチ記録中');
    toast('画面をタッチして記録します');
    requestAnimationFrame(() => byId('recordFinish').focus());
  }

  function finishLegacyRecording({ apply = true } = {}) {
    if (!state.recording) return;
    state.recording = false;
    recordLayer.classList.remove('active');
    ui.recordToolbar.hidden = true;
    state.activeRecordPointers.clear();
    if (apply && state.recordedPoints.length) {
      if (state.legacy.recordMode !== 'append') state.legacy.actions = state.legacy.actions.filter(action => action.type !== 'click');
      const records = state.recordedPoints.slice().sort((a, b) => a.startedAt - b.startedAt);
      let previous = 0;
      records.forEach((record, index) => {
        const delayMs = index === 0 ? record.startedAt : record.startedAt - previous;
        previous = record.startedAt;
        state.legacy.actions.push({
          id: state.nextLegacyId++, type: 'click', enabled: true, delayMs: Math.max(0, int(delayMs, 0)),
          cx: record.x, cy: record.y, holdMs: clamp(int(record.holdMs, 55), 0, 5000),
          targetMode: 'point', selector: '', waitForTarget: true, targetTimeoutMs: 15_000,
          targetFailureMode: 'stop', scrollTarget: true, targetLabel: '', condition: normalizeLegacyCondition({}, 'click')
        });
      });
      state.selectedLegacyId = state.legacy.actions.at(-1)?.id ?? null;
      state.legacy.selectedId = state.selectedLegacyId;
      toast(`${records.length}件を追加しました`);
    }
    state.recordedPoints = [];
    recordLayer.textContent = '';
    renderLegacy();
    saveLegacyState();
    setStatus('記録終了');
    const returnFocus = state.recordReturnFocus;
    state.recordReturnFocus = null;
    requestAnimationFrame(() => {
      if (returnFocus?.isConnected) returnFocus.focus();
      else byId('legacyRecord').focus();
    });
  }

  function recordPointerDown(event) {
    if (!state.recording) return;
    event.preventDefault();
    const started = performance.now();
    const item = {
      pointerId: event.pointerId,
      absoluteStart: started,
      startedAt: started - state.recordStartedAt,
      x: event.clientX,
      y: event.clientY,
      dot: createRecordDot(event.clientX, event.clientY, state.recordedPoints.length + state.activeRecordPointers.size + 1)
    };
    state.activeRecordPointers.set(event.pointerId, item);
  }

  function recordPointerMove(event) {
    const item = state.activeRecordPointers.get(event.pointerId);
    if (!item) return;
    event.preventDefault();
    item.x = event.clientX;
    item.y = event.clientY;
    item.dot.style.left = `${item.x}px`;
    item.dot.style.top = `${item.y}px`;
  }

  function recordPointerEnd(event) {
    const item = state.activeRecordPointers.get(event.pointerId);
    if (!item) return;
    event.preventDefault();
    recordPointerMove(event);
    state.activeRecordPointers.delete(event.pointerId);
    state.recordedPoints.push({ startedAt: item.startedAt, x: item.x, y: item.y, holdMs: performance.now() - item.absoluteStart });
    item.dot.textContent = String(state.recordedPoints.length);
    ui.recordCount.textContent = `${state.recordedPoints.length}件`;
  }

  function recordPointerCancel(event) {
    const item = state.activeRecordPointers.get(event.pointerId);
    if (!item) return;
    event.preventDefault();
    state.activeRecordPointers.delete(event.pointerId);
    item.dot.remove();
    ui.recordCount.textContent = `${state.recordedPoints.length}件`;
  }

  function cancelActiveRecordPointers() {
    for (const item of state.activeRecordPointers.values()) item.dot.remove();
    state.activeRecordPointers.clear();
    if (state.recording) ui.recordCount.textContent = `${state.recordedPoints.length}件`;
  }

  function selectWorkflow(id) {
    if (!state.workflows.workflows.some(workflow => workflow.id === id)) return;
    state.selectedWorkflowId = id;
    state.workflows.currentId = id;
    resetInsertion();
    invalidateWorkflowValidation();
    saveWorkflowStore({ immediate: true });
    renderWorkflowSelect();
  }

  function createNewWorkflow() {
    if (state.running) return;
    const workflow = normalizeWorkflow({ name: `ワークフロー ${state.workflows.workflows.length + 1}`, blocks: [] });
    commitWorkflowMutation('ワークフローの新規作成', () => {
      state.workflows.workflows.push(workflow);
      state.selectedWorkflowId = workflow.id;
      state.workflows.currentId = workflow.id;
      resetInsertion();
    });
    const saved = saveWorkflowStore({ immediate: true });
    renderWorkflowSelect();
    toast(saved ? '新しいワークフローを作成しました' : '作成しましたが保存に失敗しました。バックアップを取得してください');
  }

  function renameCurrentWorkflow() {
    const workflow = currentWorkflow();
    if (!workflow || state.running) return;
    const name = String(ui.workflowName.value || '').trim().slice(0, 60);
    if (!name) {
      ui.workflowName.setAttribute('aria-invalid', 'true');
      ui.workflowName.focus();
      return toast('ワークフロー名を入力してください');
    }
    ui.workflowName.removeAttribute('aria-invalid');
    if (workflow.name === name) return toast('名前は変更されていません');
    commitWorkflowMutation('ワークフロー名の変更', () => {
      workflow.name = name;
      workflow.updatedAt = Date.now();
    });
    const saved = saveWorkflowStore({ immediate: true });
    renderWorkflowSelect();
    toast(saved ? '名前を変更しました' : '名前を変更しましたが保存に失敗しました');
  }

  function duplicateCurrentWorkflow() {
    const current = currentWorkflow();
    if (!current || state.running) return;
    const workflow = normalizeWorkflow(deepClone(current));
    workflow.id = nowId('workflow');
    workflow.name = `${current.name} のコピー`.slice(0, 60);
    workflow.blocks.forEach(regenerateBlockIds);
    workflow.createdAt = Date.now();
    workflow.updatedAt = Date.now();
    commitWorkflowMutation('ワークフローの複製', () => {
      state.workflows.workflows.push(workflow);
      state.selectedWorkflowId = workflow.id;
      state.workflows.currentId = workflow.id;
      resetInsertion();
    });
    const saved = saveWorkflowStore({ immediate: true });
    renderWorkflowSelect();
    toast(saved ? 'ワークフローを複製しました' : '複製しましたが保存に失敗しました');
  }

  function deleteCurrentWorkflow() {
    const workflow = currentWorkflow();
    if (!workflow || state.running) return;
    if (state.workflows.workflows.length === 1) return toast('最後のワークフローは削除できません');
    if (!confirm(`「${workflow.name}」を削除しますか？`)) return;
    saveWorkflowCheckpoint(`「${workflow.name}」の削除前`);
    const index = state.workflows.workflows.indexOf(workflow);
    commitWorkflowMutation('ワークフローの削除', () => {
      state.workflows.workflows.splice(index, 1);
      const next = state.workflows.workflows[index] || state.workflows.workflows[index - 1];
      state.selectedWorkflowId = next.id;
      state.workflows.currentId = next.id;
      resetInsertion();
    });
    const saved = saveWorkflowStore({ immediate: true });
    renderWorkflowSelect();
    toast(saved ? 'ワークフローを削除しました。元に戻すこともできます' : '削除しましたが保存に失敗しました');
  }

  function applyTemplate(mode) {
    const workflow = currentWorkflow();
    if (!workflow || state.running) return;
    const template = findTemplate(ui.templateSelect.value);
    if (mode === 'replace' && workflow.blocks.length && !confirm(`現在の${workflow.blocks.length}ブロックを「${template[1]}」で置換しますか？`)) return;
    if (mode === 'replace') saveWorkflowCheckpoint(`テンプレート「${template[1]}」適用前`);
    const blocks = template[2]().map(normalizeBlock);
    commitWorkflowMutation(mode === 'replace' ? 'テンプレートで置換' : 'テンプレートを追加', () => {
      if (mode === 'replace') workflow.blocks = blocks;
      else workflow.blocks.push(...blocks);
      workflow.updatedAt = Date.now();
      resetInsertion();
    });
    const saved = saveWorkflowStore({ immediate: true });
    renderWorkflowEditor();
    toast(saved
      ? `「${template[1]}」を${mode === 'replace' ? '読み込み' : '追加'}しました`
      : 'テンプレートを適用しましたが保存に失敗しました');
  }

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  function exportCurrentWorkflow() {
    const workflow = currentWorkflow();
    if (!workflow) return;
    const safeName = workflow.name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 50) || 'workflow';
    downloadJson(normalizeWorkflow(workflow), `${safeName}.autoflow.json`);
    toast('JSONを書き出しました');
  }

  function exportAllWorkflows() {
    const snapshot = workflowStateSnapshot();
    downloadJson({
      format: 'autoflow-workflows',
      schemaVersion: 1,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      ...snapshot
    }, `autoflow-workflows-${new Date().toISOString().slice(0, 10)}.json`);
    toast(`${snapshot.workflows.length}件のワークフローを書き出しました`);
  }

  let importPurpose = null;
  function chooseImportFile(purpose) {
    importPurpose = purpose;
    if (typeof importFile.showPicker === 'function') importFile.showPicker();
    else importFile.click();
  }

  function inspectWorkflowImport(data) {
    let serialized;
    try { serialized = JSON.stringify(data); }
    catch { throw new Error('JSONデータを解析できません'); }
    if (serialized.length > MAX_IMPORT_BYTES) throw new Error(`JSONデータは${Math.round(MAX_IMPORT_BYTES / 1_000_000)}MBまでです`);
    const candidate = data?.workflow || data;
    let rawWorkflows;
    if (Array.isArray(candidate?.workflows)) rawWorkflows = candidate.workflows;
    else if (Array.isArray(candidate)) rawWorkflows = candidate;
    else if (candidate && Array.isArray(candidate.blocks)) rawWorkflows = [candidate];
    else throw new Error('ワークフローAST形式ではありません');
    if (!rawWorkflows.length) throw new Error('ワークフローが空です');
    if (rawWorkflows.length > MAX_IMPORTED_WORKFLOWS) {
      throw new Error(`一度に読み込めるワークフローは${MAX_IMPORTED_WORKFLOWS}件までです`);
    }
    let blockCount = 0;
    const visitBlocks = (blocks, depth = 0) => {
      if (!Array.isArray(blocks)) throw new Error('ブロック一覧の形式が正しくありません');
      if (depth > MAX_IMPORTED_DEPTH) throw new Error(`入れ子は${MAX_IMPORTED_DEPTH}階層までです`);
      for (const block of blocks) {
        if (!block || typeof block !== 'object' || Array.isArray(block)) throw new Error('不正なブロックが含まれています');
        const definition = BLOCK_DEFINITIONS[block.type];
        if (!definition) throw new Error(`未対応のブロック種別です: ${String(block.type || '空')}`);
        if (block.config != null && (typeof block.config !== 'object' || Array.isArray(block.config))) {
          throw new Error('ブロック設定の形式が正しくありません');
        }
        blockCount += 1;
        if (blockCount > MAX_IMPORTED_BLOCKS) throw new Error(`一度に読み込めるブロックは${MAX_IMPORTED_BLOCKS}件までです`);
        if (block.children != null && !Array.isArray(block.children)) throw new Error('子ブロックの形式が正しくありません');
        if (block.elseChildren != null && !Array.isArray(block.elseChildren)) throw new Error('elseブロックの形式が正しくありません');
        if (!definition.container && block.children?.length) throw new Error(`${definition.label}は子ブロックを持てません`);
        if (!definition.elseBranch && block.elseChildren?.length) throw new Error(`${definition.label}はelseブロックを持てません`);
        if (Array.isArray(block.children)) visitBlocks(block.children, depth + 1);
        if (Array.isArray(block.elseChildren)) visitBlocks(block.elseChildren, depth + 1);
      }
    };
    rawWorkflows.forEach((workflow, index) => {
      if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow) || !Array.isArray(workflow.blocks)) {
        throw new Error(`${index + 1}件目のワークフロー形式が正しくありません`);
      }
      visitBlocks(workflow.blocks);
    });
    return { rawWorkflows, blockCount };
  }

  function importWorkflowData(data, fileName = 'JSON') {
    if (state.running || state.legacyRunning) throw new Error('実行中はワークフローを読み込めません');
    const inspected = inspectWorkflowImport(data);
    const workflows = inspected.rawWorkflows.map(normalizeWorkflow);
    for (const workflow of workflows) {
      workflow.id = nowId('workflow');
      workflow.blocks.forEach(regenerateBlockIds);
    }
    if (!confirm(`${workflows.length}件のワークフロー（合計${inspected.blockCount}ブロック）を追加しますか？`)) return false;
    saveWorkflowCheckpoint(`${fileName}の読込前`);
    commitWorkflowMutation('ワークフローのインポート', () => {
      state.workflows.workflows.push(...workflows);
      state.selectedWorkflowId = workflows.at(-1).id;
      state.workflows.currentId = state.selectedWorkflowId;
      resetInsertion();
    });
    const saved = saveWorkflowStore({ immediate: true });
    renderWorkflowSelect();
    toast(saved ? `${fileName}を読み込みました` : '読み込みましたが保存に失敗しました');
    return true;
  }

  function setPage(page) {
    const focusedPage = shadow.activeElement?.closest?.('.page');
    state.page = ['workflow', 'legacy', 'logs', 'settings'].includes(page) ? page : 'workflow';
    shadow.querySelectorAll('.mainTab').forEach(button => {
      const active = button.dataset.page === state.page;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    shadow.querySelectorAll('.page').forEach(section => {
      const active = section.id === `page-${state.page}`;
      section.classList.toggle('active', active);
      section.hidden = !active;
    });
    if (state.page === 'logs') renderLogs();
    renderLegacyMarkers();
    if (focusedPage && focusedPage.id !== `page-${state.page}`) {
      requestAnimationFrame(() => byId(`tab-${state.page}`).focus({ preventScroll: true }));
    }
  }

  function setBrowserHidden(hidden) {
    const hadFocus = ui.browserBar.contains(shadow.activeElement);
    const handleHadFocus = shadow.activeElement === ui.browserHandle;
    ui.browserBar.classList.toggle('hidden', hidden);
    ui.browserHandle.classList.toggle('visible', hidden);
    if (hadFocus && hidden) requestAnimationFrame(() => ui.browserHandle.focus({ preventScroll: true }));
    if (handleHadFocus && !hidden) requestAnimationFrame(() => urlInput.focus({ preventScroll: true }));
    saveLegacyState();
  }

  const RUN_LOCKED_CONTROL_IDS = Object.freeze([
    'workflowSelect', 'workflowName', 'newWorkflow', 'renameWorkflow', 'duplicateWorkflow', 'deleteWorkflow',
    'importWorkflow', 'templateSelect', 'replaceTemplate', 'appendTemplate', 'legacyAddClick', 'legacyAddNavigate',
    'legacyAddWait', 'legacyRecord', 'legacyCount', 'legacyJitter', 'legacyPositionJitter', 'legacyPresetSlot',
    'legacyPresetName', 'legacySavePreset', 'legacyLoadPreset', 'legacyDeletePreset', 'paletteSearch',
    'clearInsertion', 'expandAllBlocks', 'collapseAllBlocks', 'undoWorkflow', 'redoWorkflow',
    'restoreCheckpoint', 'validateWorkflow', 'validationFocus', 'loadExternalWorkflows', 'keepLocalWorkflows'
  ]);

  function syncRunControls() {
    const workflowRunning = Boolean(state.running);
    const legacyRunning = Boolean(state.legacyRunning);
    const isRunning = workflowRunning || legacyRunning;
    ui.runWorkflow.disabled = isRunning;
    ui.stopWorkflow.disabled = !workflowRunning;
    ui.legacyRun.disabled = isRunning || state.recording || !state.legacy?.actions?.length;
    ui.legacyStop.disabled = !legacyRunning;
    ui.workflowLoopMode.disabled = isRunning;
    ui.workflowLoopCount.disabled = isRunning || Boolean(currentWorkflow()?.loopInfinite);
    for (const id of RUN_LOCKED_CONTROL_IDS) {
      const control = byId(id);
      if (control) control.disabled = isRunning;
    }
    shadow.querySelectorAll('#workflowEditor input,#workflowEditor select,#workflowEditor textarea,#workflowEditor button,.paletteButton').forEach(control => {
      if (isRunning) {
        if (control.dataset.runLockDisabled == null) control.dataset.runLockDisabled = String(control.disabled);
        control.disabled = true;
      } else if (control.dataset.runLockDisabled != null) {
        control.disabled = control.dataset.runLockDisabled === 'true';
        delete control.dataset.runLockDisabled;
      }
    });
    shadow.querySelectorAll('.blockCard').forEach(card => {
      if (isRunning) {
        if (card.dataset.runLockDraggable == null) card.dataset.runLockDraggable = String(card.draggable);
        card.draggable = false;
      } else if (card.dataset.runLockDraggable != null) {
        card.draggable = card.dataset.runLockDraggable === 'true';
        delete card.dataset.runLockDraggable;
      }
    });
    shadow.querySelectorAll('.paletteFilter').forEach(control => { control.disabled = isRunning; });
    const compactRun = byId('compactRun');
    compactRun.textContent = isRunning ? '■' : '▶';
    compactRun.classList.toggle('is-stop', isRunning);
    compactRun.setAttribute('aria-label', isRunning ? '実行を停止' : '実行');
    compactRun.title = isRunning ? '実行を停止' : '実行';
    dock.classList.toggle('is-running', isRunning);
    dock.setAttribute('aria-busy', String(isRunning));
    if (isRunning) ui.status.dataset.tone = 'running';
    syncWorkflowHistoryControls();
    syncWorkflowCheckpointControl();
  }

  function enterRuntimeCompactMode() {
    if (!lightweightMode || dock.classList.contains('compact')) return false;
    dock.classList.add('compact');
    byId('toggleCompact').textContent = '□';
    byId('toggleCompact').setAttribute('aria-expanded', 'false');
    byId('compactGrip').setAttribute('aria-expanded', 'false');
    requestAnimationFrame(() => {
      positionDock();
      byId('compactRun').focus({ preventScroll: true });
    });
    return true;
  }

  function leaveRuntimeCompactMode(restoreExpandedDock) {
    if (!restoreExpandedDock) return;
    dock.classList.remove('compact');
    byId('toggleCompact').textContent = '—';
    byId('toggleCompact').setAttribute('aria-expanded', 'true');
    byId('compactGrip').setAttribute('aria-expanded', 'true');
    requestAnimationFrame(positionDock);
  }

  function setCompact(compact) {
    const focusMoves = dock.contains(shadow.activeElement);
    dock.classList.toggle('compact', compact);
    byId('toggleCompact').textContent = compact ? '□' : '—';
    byId('toggleCompact').setAttribute('aria-expanded', String(!compact));
    byId('compactGrip').setAttribute('aria-expanded', String(!compact));
    requestAnimationFrame(() => {
      positionDock();
      if (focusMoves) (compact ? byId('compactGrip') : byId(`tab-${state.page}`)).focus({ preventScroll: true });
    });
    saveLegacyState();
  }

  function narrowDockDefaultSize() {
    const viewport = window.visualViewport;
    const viewportWidth = finite(viewport?.width, window.innerWidth);
    const viewportHeight = finite(viewport?.height, window.innerHeight);
    if (isAndroidPhone()) {
      return { width: viewportWidth * 0.72, height: viewportHeight * 0.38 };
    }
    return {
      width: Math.max(260, Math.min(380, viewportWidth * 0.82)),
      height: Math.max(260, Math.min(500, viewportHeight * 0.46))
    };
  }

  function normalizeNarrowDockSize() {
    if (!dock.classList.contains('narrowViewport')) return false;
    const size = narrowDockDefaultSize();
    let changed = false;
    if (Number.isFinite(state.dockWidth) && state.dockWidth > size.width) {
      state.dockWidth = size.width;
      changed = true;
    }
    if (Number.isFinite(state.dockHeight) && state.dockHeight > size.height) {
      state.dockHeight = size.height;
      changed = true;
    }
    return changed;
  }

  function positionDock() {
    const viewport = window.visualViewport;
    const viewportLeft = finite(viewport?.offsetLeft, 0);
    const viewportTop = finite(viewport?.offsetTop, 0);
    const viewportWidth = finite(viewport?.width, window.innerWidth);
    const viewportHeight = finite(viewport?.height, window.innerHeight);
    if (Number.isFinite(state.dockWidth)) dock.style.setProperty('--dock-width', `${state.dockWidth}px`);
    else dock.style.removeProperty('--dock-width');
    if (Number.isFinite(state.dockHeight)) dock.style.setProperty('--dock-height', `${state.dockHeight}px`);
    else dock.style.removeProperty('--dock-height');
    const rect = dock.getBoundingClientRect();
    const width = rect.width || 780;
    const height = rect.height || 600;
    const minX = viewportLeft + 4;
    const minY = viewportTop + 4;
    const maxX = Math.max(minX, viewportLeft + viewportWidth - width - 4);
    const maxY = Math.max(minY, viewportTop + viewportHeight - height - 4);
    if (!Number.isFinite(state.dockX)) state.dockX = viewportLeft + 8;
    if (!Number.isFinite(state.dockY)) state.dockY = Math.max(minY, viewportTop + viewportHeight - height - 8);
    state.dockX = clamp(state.dockX, minX, maxX);
    state.dockY = clamp(state.dockY, minY, maxY);
    dock.style.left = `${state.dockX}px`;
    dock.style.top = `${state.dockY}px`;
    dock.style.bottom = 'auto';
  }

  function installDockDrag(handle) {
    const drag = {
      active: false, id: null, startX: 0, startY: 0,
      baseX: 0, baseY: 0, moved: false, threshold: 3
    };
    const detach = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
    };
    const move = event => {
      if (!drag.active || event.pointerId !== drag.id) return;
      consumeDragEvent(event, true);
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < drag.threshold) return;
      drag.moved = true;
      state.dockX = drag.baseX + dx;
      state.dockY = drag.baseY + dy;
      positionDock();
    };
    const cancel = () => {
      if (!drag.active) return;
      drag.active = false;
      state.dockX = drag.baseX;
      state.dockY = drag.baseY;
      positionDock();
      detach();
      releaseDragLock(null, handle);
      saveLegacyState();
    };
    const finish = event => {
      if (!drag.active || event.pointerId !== drag.id) return;
      consumeDragEvent(event, true);
      if (event.type === 'pointercancel') return cancel();
      drag.active = false;
      releaseDragLock(event, handle);
      detach();
      if (!drag.moved && handle.id === 'compactGrip') setCompact(false);
      saveLegacyState();
    };
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      cancelActiveDrag('replaced');
      const rect = dock.getBoundingClientRect();
      drag.active = true;
      drag.id = event.pointerId;
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      drag.baseX = rect.left;
      drag.baseY = rect.top;
      drag.moved = false;
      drag.threshold = pointerDragThreshold(event);
      acquireDragLock(event, handle, cancel);
      window.addEventListener('pointermove', move, { capture: true, passive: false });
      window.addEventListener('pointerup', finish, { capture: true, passive: false });
      window.addEventListener('pointercancel', finish, { capture: true, passive: false });
    }, { passive: false });
    const keyMove = event => {
      if (handle.id === 'compactGrip' && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        setCompact(false);
        byId('tab-workflow').focus({ preventScroll: true });
        return;
      }
      const amount = event.shiftKey ? 24 : 8;
      const delta = {
        ArrowLeft: [-amount, 0], ArrowRight: [amount, 0], ArrowUp: [0, -amount], ArrowDown: [0, amount]
      }[event.key];
      if (!delta) return;
      event.preventDefault();
      const rect = dock.getBoundingClientRect();
      state.dockX = rect.left + delta[0];
      state.dockY = rect.top + delta[1];
      positionDock();
      saveLegacyState();
    };
    handle.addEventListener('keydown', keyMove);
    addCleanup(() => {
      if (drag.active) cancel();
      detach();
      handle.removeEventListener('keydown', keyMove);
    });
  }

  function installDockHeaderDrag(header) {
    const drag = {
      active: false, id: null, startX: 0, startY: 0,
      baseX: 0, baseY: 0, moved: false, threshold: 3
    };
    const detach = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
    };
    const move = event => {
      if (!drag.active || event.pointerId !== drag.id) return;
      consumeDragEvent(event, true);
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < drag.threshold) return;
      drag.moved = true;
      state.dockX = drag.baseX + dx;
      state.dockY = drag.baseY + dy;
      positionDock();
    };
    const cancel = () => {
      if (!drag.active) return;
      drag.active = false;
      state.dockX = drag.baseX;
      state.dockY = drag.baseY;
      positionDock();
      detach();
      releaseDragLock(null, header);
      saveLegacyState();
    };
    const finish = event => {
      if (!drag.active || event.pointerId !== drag.id) return;
      consumeDragEvent(event, true);
      if (event.type === 'pointercancel') return cancel();
      drag.active = false;
      releaseDragLock(event, header);
      detach();
      saveLegacyState();
    };
    const start = event => {
      if (event.button !== 0 || event.target.closest?.('button,input,select,textarea,a')) return;
      cancelActiveDrag('replaced');
      const rect = dock.getBoundingClientRect();
      drag.active = true;
      drag.id = event.pointerId;
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      drag.baseX = rect.left;
      drag.baseY = rect.top;
      drag.moved = false;
      drag.threshold = pointerDragThreshold(event);
      acquireDragLock(event, header, cancel);
      window.addEventListener('pointermove', move, { capture: true, passive: false });
      window.addEventListener('pointerup', finish, { capture: true, passive: false });
      window.addEventListener('pointercancel', finish, { capture: true, passive: false });
    };
    header.addEventListener('pointerdown', start, { passive: false });
    addCleanup(() => {
      if (drag.active) cancel();
      header.removeEventListener('pointerdown', start);
      detach();
    });
  }

  function installDockResize(handle, side) {
    const drag = {
      active: false, id: null, startX: 0, startY: 0,
      baseLeft: 0, baseTop: 0, baseWidth: 0, baseHeight: 0, baseRight: 0,
      initialX: null, initialY: null, initialWidth: null, initialHeight: null,
      moved: false, threshold: 3
    };
    const detach = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
    };
    const resizeTo = (desiredWidth, desiredHeight) => {
      const viewport = window.visualViewport;
      const viewportLeft = finite(viewport?.offsetLeft, 0);
      const viewportTop = finite(viewport?.offsetTop, 0);
      const viewportWidth = finite(viewport?.width, window.innerWidth);
      const viewportHeight = finite(viewport?.height, window.innerHeight);
      const viewportRight = viewportLeft + viewportWidth;
      const viewportBottom = viewportTop + viewportHeight;
      const maxWidth = Math.max(160, side === 'left'
        ? drag.baseRight - viewportLeft - 4
        : viewportRight - drag.baseLeft - 4);
      const maxHeight = Math.max(180, viewportBottom - drag.baseTop - 4);
      const minWidth = Math.min(260, maxWidth);
      const minHeight = Math.min(260, maxHeight);
      state.dockWidth = clamp(desiredWidth, minWidth, maxWidth);
      state.dockHeight = clamp(desiredHeight, minHeight, maxHeight);
      state.dockX = side === 'left' ? drag.baseRight - state.dockWidth : drag.baseLeft;
      state.dockY = drag.baseTop;
      positionDock();
    };
    const move = event => {
      if (!drag.active || event.pointerId !== drag.id) return;
      consumeDragEvent(event, true);
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < drag.threshold) return;
      drag.moved = true;
      resizeTo(drag.baseWidth + (side === 'left' ? -dx : dx), drag.baseHeight + dy);
    };
    const cancel = () => {
      if (!drag.active) return;
      drag.active = false;
      state.dockX = drag.initialX;
      state.dockY = drag.initialY;
      state.dockWidth = drag.initialWidth;
      state.dockHeight = drag.initialHeight;
      positionDock();
      detach();
      releaseDragLock(null, handle);
      saveLegacyState();
    };
    const finish = event => {
      if (!drag.active || event.pointerId !== drag.id) return;
      consumeDragEvent(event, true);
      if (event.type === 'pointercancel') return cancel();
      drag.active = false;
      releaseDragLock(event, handle);
      detach();
      saveLegacyState();
      announce(`パネルサイズを幅${Math.round(state.dockWidth)}、高さ${Math.round(state.dockHeight)}に変更しました`);
    };
    const start = event => {
      if (event.button !== 0 || dock.classList.contains('compact')) return;
      cancelActiveDrag('replaced');
      const rect = dock.getBoundingClientRect();
      Object.assign(drag, {
        active: true,
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        baseLeft: rect.left,
        baseTop: rect.top,
        baseWidth: rect.width,
        baseHeight: rect.height,
        baseRight: rect.right,
        initialX: state.dockX,
        initialY: state.dockY,
        initialWidth: state.dockWidth,
        initialHeight: state.dockHeight,
        moved: false,
        threshold: pointerDragThreshold(event)
      });
      acquireDragLock(event, handle, cancel);
      window.addEventListener('pointermove', move, { capture: true, passive: false });
      window.addEventListener('pointerup', finish, { capture: true, passive: false });
      window.addEventListener('pointercancel', finish, { capture: true, passive: false });
    };
    const keyResize = event => {
      const amount = event.shiftKey ? 24 : 8;
      const delta = {
        ArrowLeft: side === 'left' ? [amount, 0] : [-amount, 0],
        ArrowRight: side === 'left' ? [-amount, 0] : [amount, 0],
        ArrowUp: [0, -amount],
        ArrowDown: [0, amount]
      }[event.key];
      if (!delta || dock.classList.contains('compact')) return;
      event.preventDefault();
      const rect = dock.getBoundingClientRect();
      Object.assign(drag, {
        baseLeft: rect.left,
        baseTop: rect.top,
        baseWidth: rect.width,
        baseHeight: rect.height,
        baseRight: rect.right
      });
      resizeTo(rect.width + delta[0], rect.height + delta[1]);
      saveLegacyState();
      announce(`パネルサイズを幅${Math.round(state.dockWidth)}、高さ${Math.round(state.dockHeight)}に変更しました`);
    };
    const reset = event => {
      event.preventDefault();
      state.dockWidth = null;
      state.dockHeight = null;
      positionDock();
      saveLegacyState();
      toast('パネルサイズを初期値に戻しました');
    };
    handle.addEventListener('pointerdown', start, { passive: false });
    handle.addEventListener('keydown', keyResize);
    handle.addEventListener('dblclick', reset);
    addCleanup(() => {
      if (drag.active) cancel();
      handle.removeEventListener('pointerdown', start);
      handle.removeEventListener('keydown', keyResize);
      handle.removeEventListener('dblclick', reset);
      detach();
    });
  }

  function normalizeInitialUrl() {
    const saved = String(state.legacy.url || '').trim();
    const source = !saved || saved === 'about:blank' ? location.href : saved;
    try {
      const parsed = new URL(source, location.href);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
    } catch {}
    return /^https?:$/i.test(location.protocol) ? location.href : 'about:blank';
  }

  function navigableHttpUrl(value, base = currentFrameUrl() || location.href) {
    const parsed = new URL(String(value || '').trim(), base);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new FlowError('http / https 以外のURLは開けません', 'UNSAFE_URL_SCHEME');
    }
    return parsed.href;
  }

  async function loadUrlFromBar() {
    const raw = String(urlInput.value || '').trim();
    if (!raw) {
      urlInput.setAttribute('aria-invalid', 'true');
      urlInput.focus();
      return toast('URLを入力してください');
    }
    let destination;
    try { destination = navigableHttpUrl(raw); }
    catch (error) {
      urlInput.setAttribute('aria-invalid', 'true');
      urlInput.focus();
      return toast(error?.code === 'UNSAFE_URL_SCHEME' ? error.message : 'URLの形式を確認してください');
    }
    urlInput.removeAttribute('aria-invalid');
    urlInput.value = destination;
    saveLegacyState();
    setStatus('読込中');
    try {
      await replaceFrame(destination);
    } catch (error) {
      toast(`URL移動失敗: ${error.message}`);
    }
  }

  function stopEverything(reason = '停止') {
    stopWorkflow(reason);
    stopLegacy(reason);
  }

  function destroy({ restoreHost = true } = {}) {
    if (state.destroyed) return;
    commitActiveEditorInput();
    if (state.externalWorkflowConflict) saveWorkflowCheckpoint('別タブ競合中の最終ローカル版');
    flushWorkflowStore();
    saveLegacyState();
    state.destroyed = true;
    state.frameNavigationId += 1;
    stopEverything('終了');
    if (state.recording) finishLegacyRecording({ apply: false });
    stopElementPicker({ restoreFocus: false });
    clearTimeout(state.toastTimer);
    clearTimeout(state.autosaveTimer);
    for (const timer of state.telemetryTimers) clearTimeout(timer);
    state.telemetryTimers.clear();
    if (state.announceFrame) cancelAnimationFrame(state.announceFrame);
    clearLegacyMarkers();
    for (const callback of cleanup) {
      try { callback(); } catch {}
    }
    cleanup.clear();
    try {
      iframe.removeEventListener('load', handleFrameLoad);
      releaseFrameRuntime(iframe);
      iframe.src = 'about:blank';
    } catch {}
    root.remove();
    if (backgroundBody) {
      backgroundBody.inert = backgroundWasInert;
      if (backgroundAriaHidden == null) backgroundBody.removeAttribute('aria-hidden');
      else backgroundBody.setAttribute('aria-hidden', backgroundAriaHidden);
      if (!state.hostRuntimeReleased || restoreHost) {
        backgroundBody.style.visibility = backgroundStyle?.visibility || '';
        backgroundBody.style.contentVisibility = backgroundStyle?.contentVisibility || '';
      }
    }
    if (!backgroundWasInert && focusBeforeInstall?.isConnected) {
      requestAnimationFrame(() => focusBeforeInstall.focus?.({ preventScroll: true }));
    }
    if (window[GLOBAL_KEY]?.destroy === destroy) delete window[GLOBAL_KEY];
    if (restoreHost && state.hostRuntimeReleased) {
      setTimeout(() => window.location.reload(), 0);
    }
  }

  byId('loadUrl').addEventListener('click', loadUrlFromBar);
  urlInput.addEventListener('keydown', event => { if (event.key === 'Enter') loadUrlFromBar(); });
  byId('backFrame').addEventListener('click', () => { try { iframe.contentWindow.history.back(); } catch { toast('戻る操作に失敗しました'); } });
  byId('forwardFrame').addEventListener('click', () => { try { iframe.contentWindow.history.forward(); } catch { toast('進む操作に失敗しました'); } });
  byId('reloadFrame').addEventListener('click', async () => {
    try { await replaceFrame(currentFrameUrl()); }
    catch (error) { toast(`再読み込み失敗: ${error.message}`); }
  });
  byId('hideBrowser').addEventListener('click', () => setBrowserHidden(true));
  ui.browserHandle.addEventListener('click', () => setBrowserHidden(false));
  byId('closeApp').addEventListener('click', () => { if ((state.running || state.legacyRunning) && !confirm('実行中です。停止して終了しますか？')) return; destroy(); });
  byId('toggleCompact').addEventListener('click', () => setCompact(!dock.classList.contains('compact')));
  byId('compactRun').addEventListener('click', () => state.page === 'legacy' ? (state.legacyRunning ? stopLegacy() : startLegacy()) : (state.running ? stopWorkflow() : startWorkflow()));
  const mainTabs = Array.from(shadow.querySelectorAll('.mainTab'));
  mainTabs.forEach((button, index) => {
    button.addEventListener('click', () => setPage(button.dataset.page));
    button.addEventListener('keydown', event => {
      let nextIndex = null;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % mainTabs.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + mainTabs.length) % mainTabs.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = mainTabs.length - 1;
      if (nextIndex == null) return;
      event.preventDefault();
      setPage(mainTabs[nextIndex].dataset.page);
      mainTabs[nextIndex].focus();
    });
  });
  byId('workflowErrorRetry').addEventListener('click', () => {
    const hadFocus = ui.error.contains(shadow.activeElement);
    clearWorkflowError({ restoreFocus: false });
    startWorkflow();
    if (hadFocus) {
      requestAnimationFrame(() => (state.running ? ui.stopWorkflow : ui.runWorkflow).focus({ preventScroll: true }));
    }
  });
  byId('workflowErrorLogs').addEventListener('click', () => setPage('logs'));
  ui.battlePerformanceToggle.addEventListener('change', () => setBattlePerformanceEnabled(ui.battlePerformanceToggle.checked));
  byId('workflowErrorDismiss').addEventListener('click', clearWorkflowError);
  ui.paletteSearch.addEventListener('input', () => {
    state.paletteQuery = ui.paletteSearch.value;
    renderPalette();
  });
  ui.paletteSearch.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !ui.paletteSearch.value) return;
    event.stopPropagation();
    ui.paletteSearch.value = '';
    state.paletteQuery = '';
    renderPalette();
  });
  shadow.querySelectorAll('.paletteFilter').forEach(button => {
    button.addEventListener('click', () => {
      state.paletteCategory = button.dataset.category;
      shadow.querySelectorAll('.paletteFilter').forEach(candidate => {
        candidate.setAttribute('aria-pressed', String(candidate === button));
      });
      renderPalette();
    });
  });
  ui.clearInsertion.addEventListener('click', () => {
    resetInsertion({ notify: true });
    requestAnimationFrame(() => ui.paletteSearch.focus({ preventScroll: true }));
  });
  byId('expandAllBlocks').addEventListener('click', () => setAllBlocksCollapsed(false));
  byId('collapseAllBlocks').addEventListener('click', () => setAllBlocksCollapsed(true));

  ui.workflowSelect.addEventListener('change', () => selectWorkflow(ui.workflowSelect.value));
  ui.workflowName.addEventListener('change', renameCurrentWorkflow);
  ui.workflowLoopCount.addEventListener('change', () => {
    const workflow = currentWorkflow();
    if (!workflow || state.running) return;
    const next = clamp(int(ui.workflowLoopCount.value, 1), 1, MAX_WORKFLOW_LOOP_COUNT);
    ui.workflowLoopCount.value = String(next);
    if (workflow.loopCount === next) return;
    commitWorkflowMutation('実行回数の変更', () => { workflow.loopCount = next; });
    touchWorkflow();
    renderWorkflowEditor();
  });
  ui.workflowLoopMode.addEventListener('change', () => {
    const workflow = currentWorkflow();
    if (!workflow || state.running) return;
    const next = ui.workflowLoopMode.value === 'infinite';
    if (workflow.loopInfinite === next) return;
    commitWorkflowMutation('ループ方式の変更', () => { workflow.loopInfinite = next; });
    touchWorkflow();
    renderWorkflowEditor();
  });
  byId('newWorkflow').addEventListener('click', createNewWorkflow);
  byId('renameWorkflow').addEventListener('click', renameCurrentWorkflow);
  byId('duplicateWorkflow').addEventListener('click', duplicateCurrentWorkflow);
  byId('deleteWorkflow').addEventListener('click', deleteCurrentWorkflow);
  byId('replaceTemplate').addEventListener('click', () => applyTemplate('replace'));
  byId('appendTemplate').addEventListener('click', () => applyTemplate('append'));
  byId('exportWorkflow').addEventListener('click', exportCurrentWorkflow);
  byId('exportAllWorkflows').addEventListener('click', exportAllWorkflows);
  byId('importWorkflow').addEventListener('click', () => chooseImportFile('workflow'));
  byId('restoreCheckpoint').addEventListener('click', restoreWorkflowCheckpoint);
  byId('loadExternalWorkflows').addEventListener('click', loadExternalWorkflowVersion);
  byId('keepLocalWorkflows').addEventListener('click', keepLocalWorkflowVersion);
  byId('backupConflictWorkflows').addEventListener('click', exportAllWorkflows);
  ui.undoWorkflow.addEventListener('click', undoWorkflowChange);
  ui.redoWorkflow.addEventListener('click', redoWorkflowChange);
  ui.validateWorkflow.addEventListener('click', () => runWorkflowValidation());
  ui.validationFocus.addEventListener('click', () => focusWorkflowValidationIssue());
  ui.runWorkflow.addEventListener('click', startWorkflow);
  ui.stopWorkflow.addEventListener('click', () => stopWorkflow());

  byId('legacyAddClick').addEventListener('click', () => addLegacyAction('click'));
  byId('legacyAddNavigate').addEventListener('click', () => addLegacyAction('navigate'));
  byId('legacyAddWait').addEventListener('click', () => addLegacyAction('wait'));
  byId('legacyRecord').addEventListener('click', () => state.recording ? finishLegacyRecording({ apply: true }) : startLegacyRecording());
  byId('recordFinish').addEventListener('click', () => finishLegacyRecording({ apply: true }));
  byId('recordCancel').addEventListener('click', () => finishLegacyRecording({ apply: false }));
  ui.elementPickerCancel.addEventListener('click', () => stopElementPicker({ message: '要素選択をキャンセルしました' }));
  ui.legacyRun.addEventListener('click', startLegacy);
  ui.legacyStop.addEventListener('click', () => stopLegacy());
  for (const input of [ui.legacyCount, ui.legacyJitter, ui.legacyPositionJitter]) input.addEventListener('change', () => {
    state.legacy.count = clamp(int(ui.legacyCount.value, 1), 1, 999_999);
    state.legacy.timeJitterMs = clamp(int(ui.legacyJitter.value, 100), 0, 5000);
    state.legacy.positionJitterPx = clamp(finite(ui.legacyPositionJitter.value, 2), 0, 30);
    renderLegacy();
    saveLegacyState();
  });
  byId('legacySavePreset').addEventListener('click', saveLegacyPreset);
  byId('legacyLoadPreset').addEventListener('click', loadLegacyPreset);
  byId('legacyDeletePreset').addEventListener('click', deleteLegacyPreset);
  ui.legacyPresetSlot.addEventListener('change', () => {
    const data = readLegacyPreset(ui.legacyPresetSlot.value);
    ui.legacyPresetName.value = String(data?.presetMeta?.name || '');
  });
  byId('copyLogs').addEventListener('click', copyErrorLogs);
  byId('clearLogs').addEventListener('click', () => { state.logs = []; renderLogs(); });

  recordLayer.addEventListener('pointerdown', recordPointerDown, { passive: false });
  recordLayer.addEventListener('pointermove', recordPointerMove, { passive: false });
  recordLayer.addEventListener('pointerup', recordPointerEnd, { passive: false });
  recordLayer.addEventListener('pointercancel', recordPointerCancel, { passive: false });

  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    importFile.value = '';
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error(`JSONファイルは${Math.round(MAX_IMPORT_BYTES / 1_000_000)}MBまでです`);
      const data = JSON.parse(await file.text());
      if (state.running || state.legacyRunning) throw new Error('実行中は読み込めません');
      if (importPurpose === 'workflow') importWorkflowData(data, file.name);
    } catch (error) {
      toast(`JSON読込失敗: ${error.message}`);
    } finally {
      importPurpose = null;
    }
  });

  bindFrameLoad(iframe);

  const resizeHandler = () => {
    const wasNarrow = narrowScreen;
    narrowScreen = isNarrowViewport();
    dock.classList.toggle('narrowViewport', narrowScreen);
    if (narrowScreen && !wasNarrow) normalizeNarrowDockSize();
    positionDock();
    for (const action of state.legacy?.actions || []) {
      if (action.type === 'click') {
        action.cx = clamp(action.cx, 0, window.innerWidth);
        action.cy = clamp(action.cy, 0, window.innerHeight);
      }
    }
    renderLegacyMarkers();
  };
  window.addEventListener('resize', resizeHandler, { passive: true });
  window.visualViewport?.addEventListener('resize', resizeHandler, { passive: true });
  window.addEventListener('storage', handleExternalWorkflowUpdate);
  const pageHideHandler = () => {
    commitActiveEditorInput();
    if (state.externalWorkflowConflict) saveWorkflowCheckpoint('別タブ競合中の最終ローカル版');
    flushWorkflowStore();
    saveLegacyState();
  };
  window.addEventListener('pagehide', pageHideHandler);
  addCleanup(() => {
    window.removeEventListener('resize', resizeHandler);
    window.visualViewport?.removeEventListener('resize', resizeHandler);
    window.removeEventListener('storage', handleExternalWorkflowUpdate);
    window.removeEventListener('pagehide', pageHideHandler);
  });
  installDockDrag(byId('dockGrip'));
  installDockDrag(byId('compactGrip'));
  installDockHeaderDrag(byId('dockHeader'));
  installDockResize(byId('resizeDockLeft'), 'left');
  installDockResize(byId('resizeDockRight'), 'right');

  shadow.addEventListener('keydown', event => {
    if (event.isComposing || event.repeat) return;
    if (state.recording && event.key === 'Tab') {
      const controls = [byId('recordCancel'), byId('recordFinish')];
      const current = controls.indexOf(shadow.activeElement);
      const next = event.shiftKey
        ? controls[(current <= 0 ? controls.length : current) - 1]
        : controls[(current + 1) % controls.length];
      event.preventDefault();
      next.focus();
      return;
    }
    const modifier = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    const editable = event.target?.matches?.('input,textarea,select,[contenteditable=true]');
    const wantsUndo = modifier && key === 'z' && !event.shiftKey;
    const wantsRedo = modifier && (key === 'y' || (key === 'z' && event.shiftKey));
    if (state.page === 'workflow' && !editable && !state.running && !state.legacyRunning) {
      if (wantsUndo && state.workflowUndo.length) {
        event.preventDefault();
        undoWorkflowChange();
        return;
      }
      if (wantsRedo && state.workflowRedo.length) {
        event.preventDefault();
        redoWorkflowChange();
        return;
      }
    }
    if (event.key === 'Escape') {
      if (state.recording) finishLegacyRecording({ apply: false });
      else stopEverything('Escape');
    }
    if (modifier && event.key === 'Enter') {
      event.preventDefault();
      if (state.page === 'legacy') state.legacyRunning ? stopLegacy() : startLegacy();
      else state.running ? stopWorkflow() : startWorkflow();
    }
  });

  if (backgroundBody) {
    backgroundBody.inert = true;
    backgroundBody.setAttribute('aria-hidden', 'true');
  }
  document.documentElement.append(root);
  stopRuntimeTelemetry(window);
  loadWorkflowStore();
  loadLegacyState();
  normalizeNarrowDockSize();
  ui.battlePerformanceToggle.checked = state.battlePerformanceEnabled;
  renderTemplateSelect();
  renderWorkflowSelect();
  renderPalette();
  refreshLegacyPresets();
  renderLegacy();
  renderLogs();
  syncRunControls();
  if (state.recoveredFromCheckpoint) {
    setStatus('復旧ポイントから復元');
    toast('保存データが読めなかったため、直前の復旧ポイントを読み込みました');
  }
  byId('workflowSettingsPanel').open = !narrowScreen;
  setPage('workflow');
  setBrowserHidden(state.legacy.browserHidden || narrowScreen);
  setCompact(state.legacy.compact || narrowScreen);
  requestAnimationFrame(() => {
    positionDock();
    (dock.classList.contains('compact') ? byId('compactGrip') : byId('tab-workflow')).focus({ preventScroll: true });
  });
  const pendingWorkflowHandoff = claimPendingWorkflowHandoff();
  const initialUrl = normalizeInitialUrl();
  const requestedInitialUrl = pendingWorkflowHandoff?.iframeUrl || initialUrl;
  urlInput.value = requestedInitialUrl;
  try {
    if (new URL(requestedInitialUrl, location.href).origin === location.origin) releaseHostRuntimeOnce();
  } catch {}
  if (pendingWorkflowHandoff) iframe.src = pendingWorkflowHandoff.iframeUrl;
  else iframe.src = initialUrl;
  if (pendingWorkflowHandoff) void resumeClaimedWorkflowHandoff(pendingWorkflowHandoff);

  window.__AUTO_TEST__ = {
    APP_VERSION,
    state,
    iframe,
    normalizePopupText,
    normalizeBlock,
    normalizeWorkflow,
    migrateWorkflowStore,
    createBlock,
    rankAssistRows,
    parseAssistRow,
    randomUniform,
    chooseSupporter,
    parseSupporterRow,
    detectScreenState,
    evaluateWorkflowCondition,
    validateWorkflowDefinition,
    inspectWorkflowImport,
    normalizeLegacyState,
    legacySnapshot,
    startWorkflow,
    stopWorkflow,
    startLegacy,
    stopLegacy,
    undoWorkflowChange,
    redoWorkflowChange,
    waitForFrameReady,
    performFrameOperation,
    jqTapStrict,
    uniqueElementSelector,
    configuredElementState,
    tapConfiguredElement,
    ensureFullAuto,
    waitForAutoAttack,
    confirmAllUnclaimed,
    refreshAssistList,
    navigateToGranblueMyPage,
    releaseGranblueResources,
    beginWorkflowParentRestart,
    claimPendingWorkflowHandoff,
    createWorkflowExecutionState,
    visibleMyPageButton,
    replaceFrame,
    restartWorkflowAfterBattleEnd,
    TEMPLATES,
    BLOCK_DEFINITIONS,
    ERROR_MESSAGES,
    SELECTORS
  };
  window[GLOBAL_KEY] = {
    version: APP_VERSION,
    destroy,
    stop: stopEverything,
    save: () => { saveWorkflowStore({ immediate: true }); saveLegacyState(); },
    startWorkflow,
    startLegacy
  };
  if (typeof completion === 'function') completion({ ok: true, installed: true, version: APP_VERSION });
})();
