/*
 * AutoFlow Studio leak probe (診断専用 / 本番コードには読み込まないこと)
 *
 * 使い方 (iPad + Mac Safari Web Inspector):
 *   1. 親ページ (AutoFlow Studio を注入したグラブルのページ) のコンソールを開く
 *   2. このファイル全文を貼り付けて実行する
 *   3. __leakProbe.install()            // 計測器を親 window に取り付ける
 *   4. __leakProbe.mark('before')       // 1 戦目を始める直前
 *   5. ワークフローを N 戦実行する
 *   6. __leakProbe.mark('after')
 *   7. __leakProbe.diff('before', 'after')
 *   8. __leakProbe.gcReport()           // 旧 iframe が回収されたか
 *   9. __leakProbe.protoReport()        // prototype patch の多重化確認
 *  10. __leakProbe.uninstall()          // 計測器を外す (原状復帰)
 *
 * 重要な限界:
 *   - Safari には明示 GC API がない。gcReport() の "alive" は
 *     「まだ回収されていない」であって「リークしている」とは限らない。
 *     判定は「戦闘数に比例して alive が単調増加するか」で行うこと。
 *     数戦分の遅延回収は正常。20 戦で 20 個残るなら強参照が疑わしい。
 *   - performance.memory は Safari に無い。JS heap は Web Inspector の
 *     Timelines > JavaScript Allocations で別途取ること。
 *   - install() 自体が listener/timer を保持するので、計測中の絶対値ではなく
 *     必ず差分 (diff) を見ること。
 */
(() => {
  'use strict';

  const KEY = '__leakProbe';
  if (window[KEY]?.installed) {
    console.warn('[leakProbe] すでに install 済みです。uninstall() してから再実行してください。');
    return;
  }

  const originals = {
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    setInterval: window.setInterval,
    clearInterval: window.clearInterval,
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
    addEventListener: EventTarget.prototype.addEventListener,
    removeEventListener: EventTarget.prototype.removeEventListener,
    MutationObserver: window.MutationObserver
  };

  const live = {
    timeouts: new Map(),   // id -> {at, stack}
    intervals: new Map(),
    frames: new Map(),
    observers: new Set()   // 生きている (disconnect されていない) observer の記録
  };
  const totals = {
    timeoutsCreated: 0, timeoutsCleared: 0,
    intervalsCreated: 0, intervalsCleared: 0,
    rafCreated: 0, rafFired: 0, rafCancelled: 0,
    observersCreated: 0, observersObserved: 0, observersDisconnected: 0,
    listenersAdded: 0, listenersRemoved: 0
  };
  const listenerCounts = new Map(); // "targetKind:type" -> net count

  const targetKind = target => {
    try {
      if (target === window) return 'window';
      if (target === document) return 'document';
      if (target instanceof AbortSignal) return 'AbortSignal';
      if (target && target.nodeType === 1) {
        const doc = target.ownerDocument;
        if (doc && doc !== document) return `foreignElement<${target.tagName}>`;
        return `element<${target.tagName}>`;
      }
      if (target && target.constructor) return target.constructor.name;
    } catch {}
    return 'other';
  };
  const bump = (key, delta) => listenerCounts.set(key, (listenerCounts.get(key) || 0) + delta);
  const shortStack = () => {
    try { return (new Error().stack || '').split('\n').slice(3, 6).join(' | '); }
    catch { return ''; }
  };

  let installed = false;

  function install() {
    if (installed) return;
    installed = true;

    window.setTimeout = function (handler, delay, ...rest) {
      const wrapped = typeof handler === 'function'
        ? function (...args) { live.timeouts.delete(id); return handler.apply(this, args); }
        : handler;
      const id = originals.setTimeout.call(window, wrapped, delay, ...rest);
      totals.timeoutsCreated += 1;
      live.timeouts.set(id, { at: Date.now(), delay, stack: shortStack() });
      return id;
    };
    window.clearTimeout = function (id) {
      if (live.timeouts.delete(id)) totals.timeoutsCleared += 1;
      return originals.clearTimeout.call(window, id);
    };
    window.setInterval = function (handler, delay, ...rest) {
      const id = originals.setInterval.call(window, handler, delay, ...rest);
      totals.intervalsCreated += 1;
      live.intervals.set(id, { at: Date.now(), delay, stack: shortStack() });
      return id;
    };
    window.clearInterval = function (id) {
      if (live.intervals.delete(id)) totals.intervalsCleared += 1;
      return originals.clearInterval.call(window, id);
    };
    window.requestAnimationFrame = function (callback) {
      const wrapped = function (...args) {
        live.frames.delete(id);
        totals.rafFired += 1;
        return callback.apply(this, args);
      };
      const id = originals.requestAnimationFrame.call(window, wrapped);
      totals.rafCreated += 1;
      live.frames.set(id, { at: Date.now(), stack: shortStack() });
      return id;
    };
    window.cancelAnimationFrame = function (id) {
      if (live.frames.delete(id)) totals.rafCancelled += 1;
      return originals.cancelAnimationFrame.call(window, id);
    };

    EventTarget.prototype.addEventListener = function (type, listener, options) {
      totals.listenersAdded += 1;
      bump(`${targetKind(this)}:${type}`, 1);
      return originals.addEventListener.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      totals.listenersRemoved += 1;
      bump(`${targetKind(this)}:${type}`, -1);
      return originals.removeEventListener.call(this, type, listener, options);
    };

    const NativeMO = originals.MutationObserver;
    function ProbeMutationObserver(callback) {
      const observer = new NativeMO(callback);
      totals.observersCreated += 1;
      const record = { createdAt: Date.now(), stack: shortStack(), observed: 0, ref: new WeakRef(observer) };
      live.observers.add(record);
      const observe = observer.observe.bind(observer);
      const disconnect = observer.disconnect.bind(observer);
      observer.observe = (...args) => { totals.observersObserved += 1; record.observed += 1; return observe(...args); };
      observer.disconnect = (...args) => {
        totals.observersDisconnected += 1;
        record.observed = 0;
        live.observers.delete(record);
        return disconnect(...args);
      };
      return observer;
    }
    ProbeMutationObserver.prototype = NativeMO.prototype;
    window.MutationObserver = ProbeMutationObserver;

    console.log('[leakProbe] installed');
  }

  function uninstall() {
    if (!installed) return;
    installed = false;
    window.setTimeout = originals.setTimeout;
    window.clearTimeout = originals.clearTimeout;
    window.setInterval = originals.setInterval;
    window.clearInterval = originals.clearInterval;
    window.requestAnimationFrame = originals.requestAnimationFrame;
    window.cancelAnimationFrame = originals.cancelAnimationFrame;
    EventTarget.prototype.addEventListener = originals.addEventListener;
    EventTarget.prototype.removeEventListener = originals.removeEventListener;
    window.MutationObserver = originals.MutationObserver;
    console.log('[leakProbe] uninstalled');
  }

  // ---------------------------------------------------------------- counters

  function shadowRoots() {
    const roots = [];
    const walk = root => {
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) {
          roots.push(element.shadowRoot);
          walk(element.shadowRoot);
        }
      }
    };
    walk(document);
    return roots;
  }

  function autoFlowInternals() {
    const test = window.__AUTO_TEST__;
    const state = test?.state;
    if (!state) return { available: false };
    const size = value => (value?.size ?? value?.length ?? null);
    const internal = typeof test.diagnostics === 'function' ? test.diagnostics() : null;
    return {
      available: true,
      logs: size(state.logs),
      workflowUndo: size(state.workflowUndo),
      workflowRedo: size(state.workflowRedo),
      blockProgress: size(state.blockProgress),
      collapsed: size(state.collapsed),
      telemetryTimers: size(state.telemetryTimers),
      activeRecordPointers: size(state.activeRecordPointers),
      recordedPoints: size(state.recordedPoints),
      validationIssues: size(state.validationIssues),
      pendingAutoAttack: Boolean(state.pendingAutoAttack),
      frameGeneration: state.frameGeneration,
      frameNavigationId: state.frameNavigationId,
      hostRuntimeReleased: state.hostRuntimeReleased,
      running: Boolean(state.running),
      completedBattles: state.running?.completedBattles ?? null,
      restartCount: state.running?.restartCount ?? null,
      // a.js 側が公開していれば内部 Set のサイズも取れる
      frameLifecycleSubscribers: internal?.frameLifecycleSubscribers ?? null,
      cleanup: internal?.cleanup ?? null,
      tapQueueSettled: internal?.tapQueueSettled ?? null
    };
  }

  function countElements() {
    let total = document.querySelectorAll('*').length;
    let shadowTotal = 0;
    for (const root of shadowRoots()) {
      const n = root.querySelectorAll('*').length;
      shadowTotal += n;
      total += n;
    }
    return { total, shadowTotal };
  }

  function countIframes() {
    let inDocument = document.querySelectorAll('iframe').length;
    let inShadow = 0;
    for (const root of shadowRoots()) inShadow += root.querySelectorAll('iframe').length;
    return { inDocument, inShadow, total: inDocument + inShadow };
  }

  function snapshot(label = `t${Date.now()}`) {
    const elements = countElements();
    const data = {
      label,
      at: new Date().toISOString(),
      iframes: countIframes(),
      elements,
      styleSheets: document.styleSheets.length,
      adoptedStyleSheets: document.adoptedStyleSheets?.length ?? null,
      historyLength: history.length,
      resourceEntries: performance.getEntriesByType('resource').length,
      liveTimeouts: live.timeouts.size,
      liveIntervals: live.intervals.size,
      pendingRaf: live.frames.size,
      liveObservers: live.observers.size,
      totals: { ...totals },
      listeners: Object.fromEntries([...listenerCounts].filter(([, n]) => n !== 0).sort((a, b) => b[1] - a[1])),
      autoFlow: autoFlowInternals(),
      // Safari には無い。Chrome での参考値のみ。
      jsHeap: performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null
    };
    marks.set(label, data);
    return data;
  }

  const marks = new Map();
  const mark = label => { const s = snapshot(label); console.log(`[leakProbe] mark "${label}"`, s); return s; };

  function diff(fromLabel, toLabel) {
    const a = marks.get(fromLabel);
    const b = marks.get(toLabel);
    if (!a || !b) { console.warn('[leakProbe] mark が見つかりません', fromLabel, toLabel); return null; }
    const rows = [];
    const push = (name, before, after) => {
      if (before == null && after == null) return;
      const delta = (typeof before === 'number' && typeof after === 'number') ? after - before : '';
      rows.push({ 項目: name, before, after, delta });
    };
    push('iframe (document)', a.iframes.inDocument, b.iframes.inDocument);
    push('iframe (shadow)', a.iframes.inShadow, b.iframes.inShadow);
    push('要素数 (合計)', a.elements.total, b.elements.total);
    push('要素数 (shadow内)', a.elements.shadowTotal, b.elements.shadowTotal);
    push('styleSheets', a.styleSheets, b.styleSheets);
    push('history.length', a.historyLength, b.historyLength);
    push('resource timing 件数', a.resourceEntries, b.resourceEntries);
    push('未発火 setTimeout', a.liveTimeouts, b.liveTimeouts);
    push('生存 setInterval', a.liveIntervals, b.liveIntervals);
    push('未発火 rAF', a.pendingRaf, b.pendingRaf);
    push('未 disconnect MutationObserver', a.liveObservers, b.liveObservers);
    for (const key of Object.keys(a.totals)) push(`累計 ${key}`, a.totals[key], b.totals[key]);
    push('listener 純増 (合計)',
      Object.values(a.listeners).reduce((s, n) => s + n, 0),
      Object.values(b.listeners).reduce((s, n) => s + n, 0));
    for (const key of Object.keys(b.autoFlow)) {
      if (key === 'available') continue;
      push(`state.${key}`, a.autoFlow[key], b.autoFlow[key]);
    }
    console.table(rows);
    const listenerDelta = [];
    const keys = new Set([...Object.keys(a.listeners), ...Object.keys(b.listeners)]);
    for (const key of keys) {
      const delta = (b.listeners[key] || 0) - (a.listeners[key] || 0);
      if (delta !== 0) listenerDelta.push({ target: key, delta });
    }
    if (listenerDelta.length) {
      console.log('[leakProbe] listener 純増の内訳 (target種別:イベント名)');
      console.table(listenerDelta.sort((x, y) => y.delta - x.delta));
    }
    return rows;
  }

  // ------------------------------------------------------- 旧 iframe の GC 追跡

  const tracked = [];
  const registry = typeof FinalizationRegistry === 'function'
    ? new FinalizationRegistry(token => {
      const entry = tracked.find(item => item.token === token);
      if (entry) entry.collectedAt = Date.now();
    })
    : null;
  let trackSeq = 0;

  function currentFrame() {
    const test = window.__AUTO_TEST__;
    if (test?.iframe) return test.iframe;
    for (const root of shadowRoots()) {
      const frame = root.querySelector('iframe');
      if (frame) return frame;
    }
    return document.querySelector('iframe');
  }

  function trackFrame(note = '') {
    const frame = currentFrame();
    if (!frame) { console.warn('[leakProbe] iframe が見つかりません'); return null; }
    const token = { seq: ++trackSeq };
    const entry = {
      seq: token.seq,
      note,
      token,
      at: Date.now(),
      collectedAt: null,
      frame: new WeakRef(frame),
      win: null,
      doc: null
    };
    try { entry.win = new WeakRef(frame.contentWindow); } catch {}
    try { entry.doc = new WeakRef(frame.contentDocument); } catch {}
    registry?.register(frame, token);
    tracked.push(entry);
    return entry.seq;
  }

  // AutoFlow が iframe を差し替えるたびに自動で追跡する
  let autoTrackTimer = null;
  function autoTrack(intervalMs = 500) {
    if (autoTrackTimer != null) return;
    let last = currentFrame();
    if (last) trackFrame('auto:initial');
    autoTrackTimer = originals.setInterval.call(window, () => {
      const now = currentFrame();
      if (now && now !== last) {
        // 直前の frame は既に差し替え済み。追跡済みでなければ登録する。
        trackFrame('auto:swap');
        last = now;
      }
    }, intervalMs);
    console.log('[leakProbe] autoTrack 開始');
  }
  function stopAutoTrack() {
    if (autoTrackTimer == null) return;
    originals.clearInterval.call(window, autoTrackTimer);
    autoTrackTimer = null;
  }

  function gcReport() {
    const rows = tracked.map(entry => ({
      seq: entry.seq,
      note: entry.note,
      経過秒: Math.round((Date.now() - entry.at) / 1000),
      iframe: entry.frame.deref() ? 'alive' : '-',
      contentWindow: entry.win?.deref() ? 'alive' : '-',
      contentDocument: entry.doc?.deref() ? 'alive' : '-',
      finalized: entry.collectedAt ? 'yes' : 'no'
    }));
    console.table(rows);
    const alive = rows.filter(r => r.iframe === 'alive').length;
    console.log(`[leakProbe] 追跡 ${rows.length} 件中 ${alive} 件がまだ生存。`);
    console.log('[leakProbe] 注意: Safari に明示 GC は無い。数戦分の遅延回収は正常。');
    console.log('[leakProbe] 判定は「戦闘数に比例して alive が単調増加するか」で行うこと。');
    console.log('[leakProbe] alive が減らない場合は Web Inspector > Timelines > JavaScript Allocations で');
    console.log('[leakProbe] スナップショットを取り、Document / HTMLIFrameElement の retainer を確認すること。');
    return rows;
  }

  // -------------------------------------------------- prototype patch の検査

  const PATCH_TARGETS = [
    ['HTMLImageElement.prototype', win => win.HTMLImageElement?.prototype, 'src', 'accessor'],
    ['Element.prototype', win => win.Element?.prototype, 'setAttribute', 'method'],
    ['WebGLRenderingContext.prototype', win => win.WebGLRenderingContext?.prototype, 'drawArrays', 'method'],
    ['WebGLRenderingContext.prototype', win => win.WebGLRenderingContext?.prototype, 'drawElements', 'method'],
    ['WebGL2RenderingContext.prototype', win => win.WebGL2RenderingContext?.prototype, 'drawArrays', 'method'],
    ['WebGL2RenderingContext.prototype', win => win.WebGL2RenderingContext?.prototype, 'drawElements', 'method'],
    ['CanvasRenderingContext2D.prototype', win => win.CanvasRenderingContext2D?.prototype, 'drawImage', 'method'],
    ['createjs.LoadQueue.prototype', win => win.createjs?.LoadQueue?.prototype, 'loadManifest', 'method'],
    ['createjs.LoadQueue.prototype', win => win.createjs?.LoadQueue?.prototype, 'loadFile', 'method']
  ];
  const RENDER_MARKER = '__autoFlowBattlePerformanceRender__';
  const LOAD_QUEUE_MARKER = '__autoFlowBattlePerformanceLoadQueue__';

  function inspectRealm(win, realmName) {
    const rows = [];
    for (const [owner, resolve, name, kind] of PATCH_TARGETS) {
      let prototype;
      try { prototype = resolve(win); } catch { prototype = null; }
      if (!prototype) continue;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      const fn = kind === 'accessor' ? descriptor?.set : descriptor?.value;
      if (!fn) { rows.push({ realm: realmName, 対象: `${owner}.${name}`, 状態: '未定義' }); continue; }
      const source = String(fn);
      const nativeCode = source.includes('[native code]');
      rows.push({
        realm: realmName,
        対象: `${owner}.${name}`,
        種別: kind,
        関数名: fn.name || '(anonymous)',
        native: nativeCode ? 'yes' : 'no',
        marker: Boolean(fn[RENDER_MARKER]) || Boolean(prototype[LOAD_QUEUE_MARKER]),
        // wrapper 深度の推定: native でない = 最低 1 層。
        // 元関数を保持していないので静的には層数を数えられない。
        // rewriteAsset / battleCanvas の出現回数を手掛かりにする。
        推定層: nativeCode ? 0 : (source.match(/rewriteAsset|battleCanvas|rewriteManifest/g) || []).length || 1,
        先頭: source.slice(0, 90).replace(/\s+/g, ' ')
      });
    }
    const runtime = win['__FULLSCREEN_IFRAME_BATTLE_PERFORMANCE__'];
    rows.push({
      realm: realmName,
      対象: '__FULLSCREEN_IFRAME_BATTLE_PERFORMANCE__',
      状態: runtime ? `installed (enabled=${runtime.enabled})` : '未インストール'
    });
    return rows;
  }

  function protoReport() {
    const rows = inspectRealm(window, 'parent');
    const frame = currentFrame();
    try {
      const win = frame?.contentWindow;
      if (win && win.location.origin === location.origin) rows.push(...inspectRealm(win, 'iframe'));
      else rows.push({ realm: 'iframe', 対象: '(cross-origin または未読込)', 状態: '検査不可' });
    } catch {
      rows.push({ realm: 'iframe', 対象: '(アクセス不可)', 状態: '検査不可' });
    }
    console.table(rows);
    console.log('[leakProbe] native=no かつ marker=false の項目は「復元不能な patch」候補。');
    console.log('[leakProbe] 同じ realm で 2 回注入したあと 推定層 が増えるなら wrapper 多重化。');
    return rows;
  }

  // 同一 realm へ再注入したときに関数参照が変わるかを見る
  function reinjectDelta() {
    const frame = currentFrame();
    const win = frame?.contentWindow;
    if (!win) { console.warn('[leakProbe] iframe window がありません'); return null; }
    const read = () => ({
      setAttribute: win.Element?.prototype?.setAttribute,
      imageSrcSetter: Object.getOwnPropertyDescriptor(win.HTMLImageElement?.prototype || {}, 'src')?.set,
      drawImage: win.CanvasRenderingContext2D?.prototype?.drawImage
    });
    const before = read();
    try { window.__AUTO_TEST__ && window.__FULLSCREEN_IFRAME_AUTOCLICKER__; } catch {}
    console.log('[leakProbe] いま設定トグルを 1 往復させてから reinjectDelta.compare() を呼んでください');
    return {
      compare() {
        const after = read();
        const rows = Object.keys(before).map(key => ({
          対象: key,
          同一参照: before[key] === after[key] ? 'yes (多重化なし)' : 'NO (差し替わった = 多重化の疑い)'
        }));
        console.table(rows);
        return rows;
      }
    };
  }

  // 計測器が本当に効いているかを 1 秒で確かめる。
  // どれかが false なら、その API のフックが誰かに戻されている = 計測値は信用できない。
  function selfTest() {
    if (!installed) { console.warn('[leakProbe] install() してから実行してください'); return null; }
    const before = { ...totals };
    const timeoutId = window.setTimeout(() => {}, 60000);
    window.clearTimeout(timeoutId);
    const intervalId = window.setInterval(() => {}, 60000);
    window.clearInterval(intervalId);
    const frameId = window.requestAnimationFrame(() => {});
    window.cancelAnimationFrame(frameId);
    const probeTarget = document.createElement('div');
    const noop = () => {};
    probeTarget.addEventListener('__probe', noop);
    probeTarget.removeEventListener('__probe', noop);
    const observer = new MutationObserver(() => {});
    observer.disconnect();
    const rows = [
      { api: 'setTimeout', ok: totals.timeoutsCreated - before.timeoutsCreated === 1 },
      { api: 'setInterval', ok: totals.intervalsCreated - before.intervalsCreated === 1 },
      { api: 'requestAnimationFrame', ok: totals.rafCreated - before.rafCreated === 1 },
      { api: 'addEventListener', ok: totals.listenersAdded - before.listenersAdded === 1 },
      { api: 'MutationObserver', ok: totals.observersCreated - before.observersCreated === 1 }
    ];
    console.table(rows);
    const broken = rows.filter(row => !row.ok).map(row => row.api);
    if (broken.length) console.warn('[leakProbe] フックが効いていない API:', broken.join(', '));
    else console.log('[leakProbe] 全 API のフックが有効です');
    return rows;
  }

  // いま何が走っているのかを一目で出す。ワークフロー実行中に叩くこと。
  function runState() {
    const test = window.__AUTO_TEST__;
    const state = test?.state;
    const data = {
      appVersion: test?.APP_VERSION ?? null,
      ワークフロー実行中: Boolean(state?.running),
      レガシー実行中: Boolean(state?.legacyRunning),
      現在ブロック: state?.running?.currentBlockId ?? null,
      周回: state?.running?.cycle ?? null,
      完了戦闘数: state?.running?.completedBattles ?? null,
      再開回数: state?.running?.restartCount ?? null,
      稼働中インターバル: live.intervals.size,
      累計インターバル: totals.intervalsCreated,
      累計タイムアウト: totals.timeoutsCreated,
      累計Observer: totals.observersCreated,
      frameGeneration: state?.frameGeneration ?? null,
      lightweightMode: window.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? null
    };
    console.log(data);
    return data;
  }

  // 子 realm へのランタイム注入がなぜ失敗しているかを切り分ける。
  function injectionReport() {
    const test = window.__AUTO_TEST__;
    const frame = currentFrame();
    const win = frame?.contentWindow;
    if (!win) { console.warn('[leakProbe] iframe window がありません'); return null; }
    const attempt = fn => { try { return fn(); } catch (error) { return `ERR ${error.name}: ${error.message}`; } };
    const data = {
      appVersion: test?.APP_VERSION ?? null,
      バトル軽量化トグル: test?.state?.battlePerformanceEnabled ?? null,
      frameGeneration: test?.state?.frameGeneration ?? null,
      hostRuntimeReleased: test?.state?.hostRuntimeReleased ?? null,
      frameHref: attempt(() => win.location.href),
      sameOrigin: attempt(() => new URL(win.location.href).origin === location.origin),
      documentDomain: [document.domain, attempt(() => win.document.domain)],
      runtimeKey: attempt(() => Boolean(win['__FULLSCREEN_IFRAME_BATTLE_PERFORMANCE__'])),
      子realmでeval可能: attempt(() => typeof win.Function('return 1')()),
      子realmへ書込可能: attempt(() => { win.Function('value', 'window.__leakProbeInjected = value')('ok'); return win.__leakProbeInjected; })
    };
    console.log(data);
    return data;
  }

  window[KEY] = {
    get installed() { return installed; },
    install, uninstall, selfTest, runState, injectionReport,
    snapshot, mark, diff, marks,
    trackFrame, autoTrack, stopAutoTrack, gcReport, tracked,
    protoReport, reinjectDelta,
    live, totals, listenerCounts, originals
  };
  console.log('[leakProbe] ready. __leakProbe.install() から始めてください。');
})();
