(() => {
  'use strict';

  const ROOT_ID = '__fullscreen_iframe_autoclicker__';
  const GLOBAL_KEY = '__FULLSCREEN_IFRAME_AUTOCLICKER__';
  const STORAGE_KEY = '__fullscreen_iframe_autoclicker_state_v3__';
  const LEGACY_STORAGE_KEYS = [
    '__fullscreen_iframe_autoclicker_state_v2__',
    '__fullscreen_iframe_autoclicker_state_v1__'
  ];
  const PRESET_PREFIX = '__fullscreen_iframe_autoclicker_preset_v1__';

  const MARKER_HIT_SIZE = 46;
  const MARKER_VISUAL_SIZE = 36;
  const LEGACY_MARKER_SIZE = 64;
  const DRAG_THRESHOLD_PX = 3;
  const DEFAULT_POINT_DELAY_MS = 1000;
  const DEFAULT_JITTER_MS = 100;
  const MAX_DELAY_MS = 600000;
  const PRESET_SLOTS = 5;

  const previous = window[GLOBAL_KEY];
  if (previous?.destroy) {
    previous.destroy();
    return;
  }

  document.getElementById(ROOT_ID)?.remove();

  const root = document.createElement('div');
  root.id = ROOT_ID;
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    background: '#000',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'
  });

  const shadow = root.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      :host, * {
        box-sizing: border-box;
        -webkit-tap-highlight-color: transparent;
      }

      #frame {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
        background: #fff;
      }

      button, select, input {
        font: inherit;
      }

      button {
        border: 0;
        color: #fff;
        background: rgba(255,255,255,.13);
        cursor: pointer;
        touch-action: manipulation;
      }

      button:active {
        transform: scale(.96);
      }

      button:disabled, input:disabled, select:disabled {
        opacity: .4;
      }

      .primary { background: #087cff; }
      .success { background: #19a655; }
      .danger { background: #e83b34; }

      #browserBar {
        position: fixed;
        z-index: 120;
        top: max(8px, env(safe-area-inset-top));
        left: 50%;
        width: min(1120px, calc(100vw - 16px));
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 7px;
        border: 1px solid rgba(255,255,255,.18);
        border-radius: 14px;
        color: #fff;
        background: rgba(24,24,28,.9);
        box-shadow: 0 8px 30px rgba(0,0,0,.36);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        transition: transform .2s ease, opacity .2s ease;
      }

      #browserBar.hidden {
        transform: translate(-50%, calc(-100% - 20px));
        opacity: 0;
        pointer-events: none;
      }

      #browserBar button {
        flex: 0 0 auto;
        height: 38px;
        min-width: 38px;
        padding: 0 10px;
        border-radius: 9px;
        font-weight: 700;
      }

      #url {
        flex: 1;
        min-width: 70px;
        height: 38px;
        padding: 0 11px;
        border: 1px solid rgba(255,255,255,.16);
        border-radius: 9px;
        outline: none;
        color: #fff;
        background: rgba(255,255,255,.11);
        font-size: 15px;
      }

      #url::placeholder { color: rgba(255,255,255,.52); }

      #browserHandle {
        position: fixed;
        z-index: 119;
        top: max(7px, env(safe-area-inset-top));
        left: 50%;
        transform: translateX(-50%);
        display: none;
        width: 48px;
        height: 28px;
        border-radius: 0 0 12px 12px;
        background: rgba(24,24,28,.9);
        box-shadow: 0 5px 18px rgba(0,0,0,.28);
      }

      #browserHandle.visible { display: block; }

      #markerLayer {
        position: fixed;
        inset: 0;
        z-index: 60;
        pointer-events: none;
      }

      .marker {
        position: fixed;
        left: 0;
        top: 0;
        width: ${MARKER_HIT_SIZE}px;
        height: ${MARKER_HIT_SIZE}px;
        transform: translate3d(0,0,0);
        pointer-events: auto;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        -webkit-user-drag: none;
        cursor: grab;
        will-change: transform;
        contain: layout style;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }

      #rootShell.running .marker {
        pointer-events: none;
      }

      .markerVisual {
        position: absolute;
        left: 50%;
        top: 50%;
        width: ${MARKER_VISUAL_SIZE}px;
        height: ${MARKER_VISUAL_SIZE}px;
        transform: translate(-50%, -50%);
        border: 3px solid #ff453a;
        border-radius: 50%;
        background: rgba(255,69,58,.14);
        box-shadow:
          0 0 0 1.5px rgba(255,255,255,.96),
          0 5px 15px rgba(0,0,0,.3);
        pointer-events: none;
        transition:
          border-color .14s ease,
          background-color .14s ease,
          box-shadow .14s ease,
          filter .1s ease;
      }

      .markerVisual::before,
      .markerVisual::after {
        content: '';
        position: absolute;
        left: 50%;
        top: 50%;
        border-radius: 2px;
        background: #fff;
        transform: translate(-50%, -50%);
      }

      .markerVisual::before { width: 12px; height: 2px; }
      .markerVisual::after { width: 2px; height: 12px; }

      .marker.selected .markerVisual {
        border-color: #32d74b;
        background: rgba(50,215,75,.17);
      }

      .marker.dragging { cursor: grabbing; }

      .marker.dragging .markerVisual {
        filter: brightness(1.12);
        box-shadow:
          0 0 0 1.5px rgba(255,255,255,.98),
          0 7px 20px rgba(0,0,0,.4);
      }

      .marker.running .markerVisual {
        animation: markerPulse .24s ease-out;
      }

      .markerNumber {
        position: absolute;
        right: -4px;
        top: -5px;
        min-width: 18px;
        height: 18px;
        padding: 0 4px;
        border-radius: 9px;
        color: #fff;
        background: #111;
        font-size: 10px;
        font-weight: 800;
        line-height: 18px;
        text-align: center;
        box-shadow: 0 2px 6px rgba(0,0,0,.36);
        pointer-events: none;
      }

      .markerDelay {
        position: absolute;
        left: 50%;
        top: calc(100% + 1px);
        transform: translateX(-50%);
        max-width: 68px;
        padding: 2px 5px;
        border-radius: 6px;
        color: #fff;
        background: rgba(15,15,18,.82);
        font-size: 9px;
        font-weight: 700;
        line-height: 1.1;
        white-space: nowrap;
        box-shadow: 0 2px 7px rgba(0,0,0,.25);
        pointer-events: none;
      }

      @keyframes markerPulse {
        0% { transform: translate(-50%, -50%) scale(1); }
        45% { transform: translate(-50%, -50%) scale(.72); opacity: .68; }
        100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
      }

      #dock {
        position: fixed;
        z-index: 130;
        left: 50%;
        bottom: max(9px, env(safe-area-inset-bottom));
        width: min(760px, calc(100vw - 16px));
        transform: translateX(-50%);
        overflow: hidden;
        border: 1px solid rgba(255,255,255,.18);
        border-radius: 16px;
        color: #fff;
        background: rgba(24,24,28,.92);
        box-shadow: 0 10px 34px rgba(0,0,0,.4);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      #quickBar {
        display: grid;
        grid-template-columns: repeat(5, auto) minmax(80px, 1fr) auto;
        align-items: center;
        gap: 6px;
        padding: 7px;
      }

      #quickBar button {
        height: 40px;
        min-width: 42px;
        padding: 0 11px;
        border-radius: 10px;
        font-weight: 750;
        white-space: nowrap;
      }

      #status {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: rgba(255,255,255,.74);
        font-size: 12px;
        padding: 0 3px;
      }

      #settingsToggle.active { background: #5e5ce6; }

      #settingsPanel {
        max-height: min(58vh, 520px);
        overflow: auto;
        border-top: 1px solid rgba(255,255,255,.12);
        padding: 10px;
        transition: max-height .22s ease, padding .22s ease, opacity .18s ease;
      }

      #settingsPanel.collapsed {
        max-height: 0;
        padding-top: 0;
        padding-bottom: 0;
        border-top-color: transparent;
        opacity: 0;
        overflow: hidden;
        pointer-events: none;
      }

      .section {
        padding: 10px;
        border-radius: 12px;
        background: rgba(255,255,255,.07);
      }

      .section + .section { margin-top: 8px; }

      .sectionTitle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
        color: rgba(255,255,255,.92);
        font-size: 13px;
        font-weight: 800;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0,1fr));
        gap: 8px;
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: 5px;
        min-width: 0;
        color: rgba(255,255,255,.7);
        font-size: 11px;
      }

      .field.inline {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }

      .field input[type="number"],
      .field select {
        width: 100%;
        height: 38px;
        padding: 0 9px;
        border: 1px solid rgba(255,255,255,.13);
        border-radius: 9px;
        outline: none;
        color: #fff;
        background: rgba(255,255,255,.1);
      }

      input[type="checkbox"] {
        width: 20px;
        height: 20px;
        accent-color: #32d74b;
      }

      .smallButtons {
        display: flex;
        gap: 6px;
      }

      .smallButtons button {
        flex: 1;
        height: 36px;
        padding: 0 9px;
        border-radius: 9px;
        font-size: 12px;
        font-weight: 750;
      }

      #pointStrip {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        padding: 2px 0 6px;
        scrollbar-width: none;
      }

      #pointStrip::-webkit-scrollbar { display: none; }

      .pointChip {
        flex: 0 0 auto;
        height: 32px;
        padding: 0 10px;
        border-radius: 16px;
        color: rgba(255,255,255,.82);
        background: rgba(255,255,255,.1);
        font-size: 11px;
        font-weight: 750;
      }

      .pointChip.selected {
        color: #fff;
        background: #2f8b57;
      }

      #memoryRow {
        display: grid;
        grid-template-columns: 92px repeat(3, minmax(0,1fr));
        gap: 6px;
      }

      #memoryRow select,
      #memoryRow button {
        height: 38px;
        border-radius: 9px;
      }

      #memoryRow select {
        padding: 0 8px;
        border: 1px solid rgba(255,255,255,.13);
        color: #fff;
        background: rgba(255,255,255,.1);
      }

      #memoryRow button {
        padding: 0 8px;
        font-size: 12px;
        font-weight: 750;
      }

      .hint {
        margin-top: 7px;
        color: rgba(255,255,255,.5);
        font-size: 10px;
        line-height: 1.45;
      }

      @media (max-width: 620px) {
        #browserBar { gap: 4px; }
        #browserBar button { padding: 0 8px; }
        #quickBar {
          grid-template-columns: repeat(5, auto) minmax(45px,1fr) auto;
        }
        #quickBar button {
          min-width: 38px;
          padding: 0 8px;
          font-size: 12px;
        }
        .grid { grid-template-columns: 1fr; }
        #memoryRow { grid-template-columns: 82px repeat(3,1fr); }
      }
    </style>

    <div id="rootShell">
      <iframe
        id="frame"
        allow="fullscreen; autoplay; clipboard-read; clipboard-write"
        referrerpolicy="no-referrer-when-downgrade"
      ></iframe>

      <div id="markerLayer"></div>

      <div id="browserBar">
        <button id="back" title="戻る">←</button>
        <button id="forward" title="進む">→</button>
        <button id="reload" title="再読込">↻</button>
        <input id="url" type="text" placeholder="https://example.com"
          autocomplete="off" spellcheck="false">
        <button id="load" class="primary">表示</button>
        <button id="hideBrowser" title="URLバーを収納">⌃</button>
        <button id="close" class="danger" title="終了">×</button>
      </div>
      <button id="browserHandle" title="URLバーを表示">⌄</button>

      <div id="dock">
        <div id="quickBar">
          <button id="addPoint" class="primary" title="地点追加">＋</button>
          <button id="deletePoint" title="選択地点を削除">－</button>
          <button id="single" title="選択地点を単発実行">1回</button>
          <button id="start" class="success">▶</button>
          <button id="stop" class="danger" disabled>■</button>
          <span id="status">地点なし</span>
          <button id="settingsToggle" title="設定を開閉">⚙</button>
        </div>

        <div id="settingsPanel">
          <div class="section">
            <div class="sectionTitle">
              <span id="selectedTitle">地点設定</span>
              <span id="selectedTimingLabel">前の地点から待機</span>
            </div>
            <div id="pointStrip"></div>
            <div class="grid">
              <label class="field">
                待機時間（ミリ秒）
                <input id="pointDelay" type="number" min="0"
                  max="${MAX_DELAY_MS}" step="50" value="1000">
              </label>
              <div class="field">
                実行順
                <div class="smallButtons">
                  <button id="movePrev">← 前へ</button>
                  <button id="moveNext">後へ →</button>
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="sectionTitle">実行設定</div>
            <div class="grid">
              <label class="field">
                クリック方式
                <select id="method">
                  <option value="tap">jQuery tap</option>
                  <option value="click">click</option>
                  <option value="both">tap＋click</option>
                </select>
              </label>
              <label class="field">
                繰り返し回数
                <input id="count" type="number" min="1" max="999999"
                  step="1" value="1">
              </label>
              <label class="field inline">
                <span>無限ループ</span>
                <input id="loop" type="checkbox">
              </label>
              <label class="field inline">
                <span>ランダムずれ</span>
                <input id="randomEnabled" type="checkbox" checked>
              </label>
              <label class="field">
                1区間のずれ幅（ms）
                <input id="jitter" type="number" min="0" max="5000"
                  step="10" value="${DEFAULT_JITTER_MS}">
              </label>
            </div>
            <div class="hint">
              最初の地点を除き、各待機へ±ずれ幅を加算します。前の地点が完了してから次へ進むため、3地点目の累積ずれは初期値で最大±0.2秒です。
            </div>
          </div>

          <div class="section">
            <div class="sectionTitle">記憶スロット</div>
            <div id="memoryRow">
              <select id="presetSlot"></select>
              <button id="savePreset" class="primary">保存</button>
              <button id="loadPreset">読込</button>
              <button id="deletePreset" class="danger">消去</button>
            </div>
            <div class="hint">
              通常状態は自動保存されます。記憶スロットにはURL、地点、個別待機時間、実行設定をまとめて保存します。
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const $id = id => shadow.getElementById(id);

  const rootShell = $id('rootShell');
  const iframe = $id('frame');
  const markerLayer = $id('markerLayer');
  const browserBar = $id('browserBar');
  const browserHandle = $id('browserHandle');
  const urlInput = $id('url');
  const loadButton = $id('load');
  const backButton = $id('back');
  const forwardButton = $id('forward');
  const reloadButton = $id('reload');
  const hideBrowserButton = $id('hideBrowser');
  const closeButton = $id('close');

  const addPointButton = $id('addPoint');
  const deletePointButton = $id('deletePoint');
  const singleButton = $id('single');
  const startButton = $id('start');
  const stopButton = $id('stop');
  const status = $id('status');
  const settingsToggle = $id('settingsToggle');
  const settingsPanel = $id('settingsPanel');

  const selectedTitle = $id('selectedTitle');
  const selectedTimingLabel = $id('selectedTimingLabel');
  const pointStrip = $id('pointStrip');
  const pointDelayInput = $id('pointDelay');
  const movePrevButton = $id('movePrev');
  const moveNextButton = $id('moveNext');

  const methodSelect = $id('method');
  const countInput = $id('count');
  const loopInput = $id('loop');
  const randomEnabledInput = $id('randomEnabled');
  const jitterInput = $id('jitter');

  const presetSlotSelect = $id('presetSlot');
  const savePresetButton = $id('savePreset');
  const loadPresetButton = $id('loadPreset');
  const deletePresetButton = $id('deletePreset');

  const state = {
    points: [],
    selectedId: null,
    nextId: 1,
    running: false,
    runToken: 0,
    timer: null,
    waitResolver: null,
    settingsOpen: true,
    browserHidden: false,
    destroyed: false
  };

  const cleanupCallbacks = new Set();
  const onCleanup = callback => {
    cleanupCallbacks.add(callback);
    return callback;
  };

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeUrl(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    if (/^(https?:|about:blank)/i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  function clampPoint(point) {
    point.x = clamp(
      Number(point.x) || 0,
      0,
      Math.max(0, window.innerWidth - MARKER_HIT_SIZE)
    );
    point.y = clamp(
      Number(point.y) || 0,
      0,
      Math.max(0, window.innerHeight - MARKER_HIT_SIZE)
    );
  }

  function normalizeDelay(value, fallback = DEFAULT_POINT_DELAY_MS) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return clamp(Math.round(number), 0, MAX_DELAY_MS);
  }

  function selectedPoint() {
    return state.points.find(point => point.id === state.selectedId) || null;
  }

  function pointIndex(point) {
    return state.points.indexOf(point);
  }

  function formatDelay(ms) {
    if (ms < 1000) return `${ms}ms`;
    const seconds = ms / 1000;
    return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(2)}s`;
  }

  function signedMs(ms) {
    if (!ms) return '±0ms';
    return `${ms > 0 ? '+' : ''}${ms}ms`;
  }

  function updateStatus(message) {
    status.textContent = message;
  }

  function createSnapshot() {
    return {
      version: 3,
      markerHitSize: MARKER_HIT_SIZE,
      url: urlInput.value,
      points: state.points.map(({ id, x, y, delayMs }) => ({
        id,
        x,
        y,
        delayMs
      })),
      selectedId: state.selectedId,
      nextId: state.nextId,
      method: methodSelect.value,
      count: countInput.value,
      loop: loopInput.checked,
      randomEnabled: randomEnabledInput.checked,
      jitterMs: jitterInput.value,
      settingsOpen: state.settingsOpen,
      browserHidden: state.browserHidden
    };
  }

  function saveState() {
    if (state.destroyed) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(createSnapshot()));
    } catch (error) {
      console.warn('[Iframe AutoClicker] 自動保存失敗', error);
    }
  }

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (_) {
      return null;
    }
  }

  function findSavedState() {
    const current = readJson(STORAGE_KEY);
    if (current) return { data: current, key: STORAGE_KEY };

    for (const key of LEGACY_STORAGE_KEYS) {
      const data = readJson(key);
      if (data) return { data, key };
    }

    return null;
  }

  function applySnapshot(snapshot, { legacyKey = null } = {}) {
    if (!snapshot || typeof snapshot !== 'object') return false;

    const savedMarkerSize = Number(snapshot.markerHitSize);
    const sourceMarkerSize = Number.isFinite(savedMarkerSize)
      ? savedMarkerSize
      : legacyKey?.endsWith('_v1__')
        ? LEGACY_MARKER_SIZE
        : MARKER_HIT_SIZE;
    const centerCorrection = (sourceMarkerSize - MARKER_HIT_SIZE) / 2;
    const oldGlobalInterval = normalizeDelay(
      snapshot.interval,
      DEFAULT_POINT_DELAY_MS
    );

    if (typeof snapshot.url === 'string') {
      urlInput.value = snapshot.url;
    }

    state.points = Array.isArray(snapshot.points)
      ? snapshot.points
          .filter(point =>
            Number.isFinite(Number(point.x)) &&
            Number.isFinite(Number(point.y))
          )
          .map((point, index) => ({
            id: Number(point.id) || index + 1,
            x: Number(point.x) + centerCorrection,
            y: Number(point.y) + centerCorrection,
            delayMs: normalizeDelay(
              point.delayMs,
              index === 0 ? 0 : oldGlobalInterval
            ),
            element: null
          }))
      : [];

    state.points.forEach(clampPoint);
    state.nextId = Math.max(
      Number(snapshot.nextId) || 1,
      ...state.points.map(point => point.id + 1),
      1
    );
    state.selectedId = state.points.some(
      point => point.id === Number(snapshot.selectedId)
    )
      ? Number(snapshot.selectedId)
      : state.points[0]?.id ?? null;

    methodSelect.value = ['tap', 'click', 'both'].includes(snapshot.method)
      ? snapshot.method
      : 'tap';
    countInput.value = clamp(
      Math.floor(Number(snapshot.count) || 1),
      1,
      999999
    );
    loopInput.checked = Boolean(snapshot.loop);
    randomEnabledInput.checked = snapshot.randomEnabled !== false;
    jitterInput.value = clamp(
      Math.floor(Number(snapshot.jitterMs) || DEFAULT_JITTER_MS),
      0,
      5000
    );
    state.settingsOpen = snapshot.settingsOpen !== false;
    state.browserHidden = Boolean(snapshot.browserHidden);

    return true;
  }

  function loadInitialState() {
    const found = findSavedState();
    if (!found) return;
    if (applySnapshot(found.data, { legacyKey: found.key })) {
      saveState();
    }
  }

  function presetKey(slot) {
    return `${PRESET_PREFIX}_${slot}`;
  }

  function refreshPresetOptions() {
    const selected = presetSlotSelect.value || '1';
    presetSlotSelect.textContent = '';

    for (let slot = 1; slot <= PRESET_SLOTS; slot += 1) {
      const option = document.createElement('option');
      const exists = Boolean(readJson(presetKey(slot)));
      option.value = String(slot);
      option.textContent = `スロット${slot}${exists ? ' ●' : ''}`;
      presetSlotSelect.append(option);
    }

    presetSlotSelect.value = selected;
  }

  function savePreset() {
    const slot = presetSlotSelect.value;
    try {
      localStorage.setItem(presetKey(slot), JSON.stringify(createSnapshot()));
      refreshPresetOptions();
      presetSlotSelect.value = slot;
      updateStatus(`スロット${slot}へ保存`);
    } catch (error) {
      console.warn('[Iframe AutoClicker] スロット保存失敗', error);
      updateStatus('保存失敗');
    }
  }

  function loadPreset() {
    const slot = presetSlotSelect.value;
    const snapshot = readJson(presetKey(slot));
    if (!snapshot) {
      updateStatus(`スロット${slot}は空`);
      return;
    }

    stopSequence('読込中');
    clearMarkers();
    applySnapshot(snapshot);
    rebuildMarkers();
    applyPanelVisibility();
    updateUi();
    saveState();

    const url = normalizeUrl(urlInput.value);
    if (url) iframe.src = url;
    updateStatus(`スロット${slot}を読込`);
  }

  function deletePreset() {
    const slot = presetSlotSelect.value;
    localStorage.removeItem(presetKey(slot));
    refreshPresetOptions();
    presetSlotSelect.value = slot;
    updateStatus(`スロット${slot}を消去`);
  }

  function markerCenter(point) {
    return {
      x: point.x + MARKER_HIT_SIZE / 2,
      y: point.y + MARKER_HIT_SIZE / 2
    };
  }

  function setMarkerPosition(point) {
    if (!point.element) return;
    point.element.style.transform =
      `translate3d(${point.x}px, ${point.y}px, 0)`;
  }

  function updateMarkerMeta(point, index) {
    if (!point.element) return;
    const number = point.element.querySelector('.markerNumber');
    const delay = point.element.querySelector('.markerDelay');
    if (number) number.textContent = String(index + 1);
    if (delay) delay.textContent = formatDelay(point.delayMs);
  }

  function selectPoint(id, { persist = true, announce = true } = {}) {
    state.selectedId = id;

    state.points.forEach(point => {
      point.element?.classList.toggle('selected', point.id === id);
    });

    updateSelectedEditor();
    renderPointStrip();
    updateButtons();

    const point = selectedPoint();
    if (announce) {
      updateStatus(
        point ? `地点${pointIndex(point) + 1}を選択` : '地点なし'
      );
    }
    if (persist) saveState();
  }

  function createMarkerElement(point) {
    const marker = document.createElement('div');
    marker.className = 'marker';
    marker.innerHTML = `
      <div class="markerVisual"></div>
      <span class="markerNumber"></span>
      <span class="markerDelay"></span>
    `;
    markerLayer.append(marker);
    point.element = marker;

    const drag = {
      active: false,
      pointerId: null,
      startClientX: 0,
      startClientY: 0,
      startX: 0,
      startY: 0,
      latestClientX: 0,
      latestClientY: 0,
      moved: false,
      rafId: 0,
      suppressClickUntil: 0,
      removeWindowListeners: null
    };

    function renderLatestDrag() {
      drag.rafId = 0;
      if (!drag.active) return;

      const dx = drag.latestClientX - drag.startClientX;
      const dy = drag.latestClientY - drag.startClientY;
      if (!drag.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
        drag.moved = true;
      }
      if (!drag.moved) return;

      point.x = drag.startX + dx;
      point.y = drag.startY + dy;
      clampPoint(point);
      setMarkerPosition(point);
    }

    function queueDragRender() {
      if (!drag.rafId) {
        drag.rafId = requestAnimationFrame(renderLatestDrag);
      }
    }

    function readPointer(event) {
      const events = event.getCoalescedEvents?.();
      const latest = events?.length ? events[events.length - 1] : event;
      drag.latestClientX = latest.clientX;
      drag.latestClientY = latest.clientY;
    }

    function onPointerMove(event) {
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      readPointer(event);
      queueDragRender();
    }

    function removeWindowListeners() {
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', finishDrag, true);
      window.removeEventListener('pointercancel', finishDrag, true);
      drag.removeWindowListeners = null;
    }

    function finishDrag(event) {
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      readPointer(event);
      if (drag.rafId) {
        cancelAnimationFrame(drag.rafId);
        drag.rafId = 0;
      }
      renderLatestDrag();

      drag.active = false;
      marker.classList.remove('dragging');
      removeWindowListeners();

      try {
        marker.releasePointerCapture(event.pointerId);
      } catch (_) {}

      if (drag.moved) {
        drag.suppressClickUntil = performance.now() + 350;
        saveState();
      }
      drag.pointerId = null;
    }

    marker.addEventListener(
      'pointerdown',
      event => {
        if (state.running) return;
        if (event.button !== undefined && event.button !== 0) return;

        event.preventDefault();
        event.stopPropagation();
        selectPoint(point.id, { persist: false });

        drag.active = true;
        drag.pointerId = event.pointerId;
        drag.startClientX = event.clientX;
        drag.startClientY = event.clientY;
        drag.latestClientX = event.clientX;
        drag.latestClientY = event.clientY;
        drag.startX = point.x;
        drag.startY = point.y;
        drag.moved = false;
        marker.classList.add('dragging');

        try {
          marker.setPointerCapture(event.pointerId);
        } catch (_) {}

        window.addEventListener('pointermove', onPointerMove, {
          capture: true,
          passive: false
        });
        window.addEventListener('pointerup', finishDrag, {
          capture: true,
          passive: false
        });
        window.addEventListener('pointercancel', finishDrag, {
          capture: true,
          passive: false
        });
        drag.removeWindowListeners = removeWindowListeners;
      },
      { passive: false }
    );

    marker.addEventListener('click', event => {
      event.stopPropagation();
      if (performance.now() < drag.suppressClickUntil) return;
      selectPoint(point.id);
    });

    point.cleanup = () => {
      if (drag.rafId) cancelAnimationFrame(drag.rafId);
      drag.removeWindowListeners?.();
      drag.active = false;
    };

    setMarkerPosition(point);
    return marker;
  }

  function clearMarkers() {
    state.points.forEach(point => {
      point.cleanup?.();
      point.cleanup = null;
      point.element?.remove();
      point.element = null;
    });
    markerLayer.textContent = '';
  }

  function rebuildMarkers() {
    clearMarkers();
    state.points.forEach((point, index) => {
      createMarkerElement(point);
      updateMarkerMeta(point, index);
    });
    selectPoint(state.selectedId, { persist: false, announce: false });
  }

  function addPoint() {
    if (state.running) return;
    const index = state.points.length;
    const offset = index * 12;
    const point = {
      id: state.nextId++,
      x: window.innerWidth / 2 - MARKER_HIT_SIZE / 2 + offset,
      y: window.innerHeight / 2 - MARKER_HIT_SIZE / 2 + offset,
      delayMs: index === 0 ? 0 : DEFAULT_POINT_DELAY_MS,
      element: null
    };
    clampPoint(point);
    state.points.push(point);
    createMarkerElement(point);
    refreshMarkerMetadata();
    selectPoint(point.id);
  }

  function deleteSelectedPoint() {
    if (state.running) return;
    const point = selectedPoint();
    if (!point) return;

    const index = pointIndex(point);
    point.element?.remove();
    state.points.splice(index, 1);
    const replacement = state.points[index] || state.points[index - 1] || null;
    state.selectedId = replacement?.id ?? null;
    refreshMarkerMetadata();
    selectPoint(state.selectedId);
  }

  function moveSelected(direction) {
    if (state.running) return;
    const point = selectedPoint();
    if (!point) return;
    const index = pointIndex(point);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= state.points.length) return;

    [state.points[index], state.points[targetIndex]] =
      [state.points[targetIndex], state.points[index]];
    refreshMarkerMetadata();
    selectPoint(point.id);
  }

  function refreshMarkerMetadata() {
    state.points.forEach(updateMarkerMeta);
    renderPointStrip();
    updateSelectedEditor();
  }

  function renderPointStrip() {
    pointStrip.textContent = '';
    state.points.forEach((point, index) => {
      const button = document.createElement('button');
      button.className = 'pointChip';
      button.classList.toggle('selected', point.id === state.selectedId);
      button.textContent = `${index + 1} · ${formatDelay(point.delayMs)}`;
      button.disabled = state.running;
      button.addEventListener('click', () => selectPoint(point.id));
      pointStrip.append(button);
    });
  }

  function updateSelectedEditor() {
    const point = selectedPoint();
    const index = point ? pointIndex(point) : -1;
    selectedTitle.textContent = point ? `地点 ${index + 1}` : '地点設定';
    selectedTimingLabel.textContent = index === 0
      ? '開始から待機'
      : '前の地点から待機';
    pointDelayInput.value = point?.delayMs ?? 0;
    pointDelayInput.disabled = !point || state.running;
    movePrevButton.disabled = !point || state.running || index <= 0;
    moveNextButton.disabled =
      !point || state.running || index >= state.points.length - 1;
  }

  function updateButtons() {
    const hasPoints = state.points.length > 0;
    const hasSelected = Boolean(selectedPoint());
    addPointButton.disabled = state.running;
    deletePointButton.disabled = !hasSelected || state.running;
    singleButton.disabled = !hasSelected || state.running;
    startButton.disabled = !hasPoints || state.running;
    stopButton.disabled = !state.running;
    savePresetButton.disabled = state.running;
    loadPresetButton.disabled = state.running;
    deletePresetButton.disabled = state.running;
    presetSlotSelect.disabled = state.running;
    methodSelect.disabled = state.running;
    countInput.disabled = state.running;
    loopInput.disabled = state.running;
    randomEnabledInput.disabled = state.running;
    jitterInput.disabled = state.running;
    rootShell.classList.toggle('running', state.running);
    renderPointStrip();
    updateSelectedEditor();
  }

  function setSettingsOpen(open, { persist = true } = {}) {
    state.settingsOpen = Boolean(open);
    settingsPanel.classList.toggle('collapsed', !state.settingsOpen);
    settingsToggle.classList.toggle('active', state.settingsOpen);
    settingsToggle.textContent = state.settingsOpen ? '⌄' : '⚙';
    settingsToggle.title = state.settingsOpen ? '設定を収納' : '設定を表示';
    if (persist) saveState();
  }

  function setBrowserHidden(hidden, { persist = true } = {}) {
    state.browserHidden = Boolean(hidden);
    browserBar.classList.toggle('hidden', state.browserHidden);
    browserHandle.classList.toggle('visible', state.browserHidden);
    if (persist) saveState();
  }

  function applyPanelVisibility() {
    setSettingsOpen(state.settingsOpen, { persist: false });
    setBrowserHidden(state.browserHidden, { persist: false });
  }

  function deepestElementFromPoint(doc, x, y) {
    let element = doc.elementFromPoint(x, y);
    if (!element) return null;

    while (
      element.shadowRoot &&
      typeof element.shadowRoot.elementFromPoint === 'function'
    ) {
      const inner = element.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === element) break;
      element = inner;
    }

    if (element.tagName === 'IFRAME') {
      try {
        const rect = element.getBoundingClientRect();
        const childDocument = element.contentDocument;
        if (childDocument) {
          const inner = deepestElementFromPoint(
            childDocument,
            x - rect.left,
            y - rect.top
          );
          if (inner) return inner;
        }
      } catch (_) {}
    }

    return { element, document: doc, x, y };
  }

  function targetAtViewportPoint(viewportX, viewportY) {
    const frameRect = iframe.getBoundingClientRect();
    if (
      viewportX < frameRect.left ||
      viewportY < frameRect.top ||
      viewportX > frameRect.right ||
      viewportY > frameRect.bottom
    ) {
      return { error: '地点がiframe外' };
    }

    try {
      const frameDocument = iframe.contentDocument;
      if (!frameDocument) return { error: 'iframe未読込' };
      const x = viewportX - frameRect.left;
      const y = viewportY - frameRect.top;
      return deepestElementFromPoint(frameDocument, x, y) || {
        error: '対象なし'
      };
    } catch (_) {
      return { error: '別ドメインiframeの内部は操作不可' };
    }
  }

  function chooseClickableTarget(element) {
    if (
      !element ||
      element.nodeType !== 1 ||
      typeof element.closest !== 'function'
    ) {
      return element;
    }

    const selector = [
      'button',
      'a[href]',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      'label',
      'summary',
      '[role="button"]',
      '[role="link"]',
      '[onclick]',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    return element.closest(selector) || element;
  }

  function triggerJQueryTap(target, clientX, clientY) {
    const view = target.ownerDocument?.defaultView || window;
    const jq = view.jQuery?.fn?.jquery
      ? view.jQuery
      : view.$?.fn?.jquery
        ? view.$
        : null;
    if (!jq) return false;

    jq(target).trigger(
      jq.Event('tap', {
        clientX,
        clientY,
        pageX: clientX + (view.scrollX || 0),
        pageY: clientY + (view.scrollY || 0),
        which: 1,
        button: 0
      })
    );
    return true;
  }

  function triggerClick(target, clientX, clientY) {
    const view = target.ownerDocument?.defaultView || window;
    try {
      target.focus?.({ preventScroll: true });
    } catch (_) {}

    const options = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view,
      clientX,
      clientY,
      screenX: clientX,
      screenY: clientY,
      button: 0,
      buttons: 1
    };

    if (typeof view.PointerEvent === 'function') {
      target.dispatchEvent(
        new view.PointerEvent('pointerdown', {
          ...options,
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
          pressure: .5
        })
      );
    }

    target.dispatchEvent(new view.MouseEvent('mousedown', options));

    if (typeof view.PointerEvent === 'function') {
      target.dispatchEvent(
        new view.PointerEvent('pointerup', {
          ...options,
          buttons: 0,
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
          pressure: 0
        })
      );
    }

    target.dispatchEvent(
      new view.MouseEvent('mouseup', { ...options, buttons: 0 })
    );

    if (typeof target.click === 'function') {
      target.click();
    } else {
      target.dispatchEvent(
        new view.MouseEvent('click', { ...options, buttons: 0 })
      );
    }
  }

  function elementLabel(element) {
    return String(
      element?.getAttribute?.('aria-label') ||
      element?.getAttribute?.('title') ||
      element?.textContent ||
      element?.tagName ||
      '対象'
    )
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 22);
  }

  function animateMarker(point) {
    const marker = point.element;
    if (!marker) return;
    marker.classList.remove('running');
    void marker.offsetWidth;
    marker.classList.add('running');
  }

  function executePoint(point) {
    const center = markerCenter(point);
    const hit = targetAtViewportPoint(center.x, center.y);
    if (hit.error) return { ok: false, message: hit.error };

    const target = chooseClickableTarget(hit.element);
    if (!target) return { ok: false, message: '対象なし' };

    animateMarker(point);
    const method = methodSelect.value;
    let tapWorked = false;

    if (method === 'tap' || method === 'both') {
      tapWorked = triggerJQueryTap(target, hit.x, hit.y);
    }
    if (
      method === 'click' ||
      method === 'both' ||
      (method === 'tap' && !tapWorked)
    ) {
      triggerClick(target, hit.x, hit.y);
    }

    return { ok: true, message: elementLabel(target) };
  }

  function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function getJitterMs(clickOrdinal) {
    if (!randomEnabledInput.checked || clickOrdinal === 0) return 0;
    const range = clamp(Math.floor(Number(jitterInput.value) || 0), 0, 5000);
    return randomInteger(-range, range);
  }

  function waitForDelay(ms, token) {
    return new Promise(resolve => {
      if (!state.running || token !== state.runToken) {
        resolve(false);
        return;
      }

      let settled = false;
      const settle = value => {
        if (settled) return;
        settled = true;
        if (state.timer !== null) {
          clearTimeout(state.timer);
          state.timer = null;
        }
        if (state.waitResolver === settle) state.waitResolver = null;
        resolve(value);
      };

      state.waitResolver = settle;
      state.timer = setTimeout(() => {
        settle(state.running && token === state.runToken);
      }, ms);
    });
  }

  async function evaluatePointDecision(_point, _context) {
    // 将来ここへ「条件成立まで待機」「条件によるスキップ」を追加する。
    return 'execute';
  }

  async function runPoint(point, context) {
    const rawJitter = getJitterMs(context.clickOrdinal);
    const actualDelay = Math.max(0, point.delayMs + rawJitter);
    const appliedJitter = actualDelay - point.delayMs;
    context.cumulativeJitter += appliedJitter;

    updateStatus(
      `地点${context.index + 1} 待機 ${formatDelay(actualDelay)} ` +
      `(${signedMs(appliedJitter)}, 累積${signedMs(context.cumulativeJitter)})`
    );

    const continued = await waitForDelay(actualDelay, context.token);
    if (!continued) return 'stopped';

    const decision = await evaluatePointDecision(point, context);
    if (!state.running || context.token !== state.runToken) return 'stopped';
    if (decision === 'skip') return 'skipped';

    const result = executePoint(point);
    updateStatus(
      result.ok
        ? `地点${context.index + 1}: ${result.message} ` +
          `(累積${signedMs(context.cumulativeJitter)})`
        : `地点${context.index + 1}: ${result.message}`
    );
    return result.ok ? 'executed' : 'failed';
  }

  function getCycleCount() {
    return clamp(
      Math.floor(Number(countInput.value) || 1),
      1,
      999999
    );
  }

  async function startSequence() {
    if (state.running || state.points.length === 0) return;

    state.running = true;
    state.runToken += 1;
    const token = state.runToken;
    const points = state.points.slice();
    const cycleLimit = getCycleCount();
    let cycle = 0;
    let clickOrdinal = 0;
    let cumulativeJitter = 0;

    saveState();
    updateButtons();

    try {
      while (state.running && token === state.runToken) {
        for (let index = 0; index < points.length; index += 1) {
          if (!state.running || token !== state.runToken) return;

          const context = {
            token,
            cycle,
            index,
            clickOrdinal,
            cumulativeJitter
          };
          const outcome = await runPoint(points[index], context);
          cumulativeJitter = context.cumulativeJitter;
          if (outcome === 'stopped') return;
          clickOrdinal += 1;
        }

        cycle += 1;
        if (!loopInput.checked && cycle >= cycleLimit) {
          stopSequence(`${cycle}回完了`, { incrementToken: false });
          return;
        }
      }
    } catch (error) {
      console.error('[Iframe AutoClicker] 実行エラー', error);
      stopSequence('実行エラー');
    }
  }

  function stopSequence(
    message = '停止',
    { incrementToken = true } = {}
  ) {
    if (incrementToken) state.runToken += 1;
    state.running = false;

    if (state.timer !== null) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    const resolver = state.waitResolver;
    state.waitResolver = null;
    resolver?.(false);

    updateButtons();
    updateStatus(message);
  }

  function loadUrl() {
    const url = normalizeUrl(urlInput.value);
    if (!url) {
      urlInput.focus();
      return;
    }
    urlInput.value = url;
    iframe.src = url;
    saveState();
    updateStatus('読込中');
  }

  function onResize() {
    state.points.forEach(point => {
      clampPoint(point);
      setMarkerPosition(point);
    });
    saveState();
  }

  loadButton.addEventListener('click', loadUrl);
  urlInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      loadUrl();
    }
  });

  iframe.addEventListener('load', () => {
    try {
      urlInput.value = iframe.contentWindow.location.href;
      updateStatus('読込完了');
      saveState();
    } catch (_) {
      updateStatus('読込完了・別ドメイン');
    }
  });

  backButton.addEventListener('click', () => {
    try {
      iframe.contentWindow.history.back();
    } catch (_) {
      updateStatus('戻る操作不可');
    }
  });

  forwardButton.addEventListener('click', () => {
    try {
      iframe.contentWindow.history.forward();
    } catch (_) {
      updateStatus('進む操作不可');
    }
  });

  reloadButton.addEventListener('click', () => {
    try {
      iframe.contentWindow.location.reload();
    } catch (_) {
      iframe.src = iframe.src;
    }
  });

  hideBrowserButton.addEventListener('click', () => setBrowserHidden(true));
  browserHandle.addEventListener('click', () => setBrowserHidden(false));
  settingsToggle.addEventListener('click', () => {
    setSettingsOpen(!state.settingsOpen);
  });

  addPointButton.addEventListener('click', addPoint);
  deletePointButton.addEventListener('click', deleteSelectedPoint);
  singleButton.addEventListener('click', () => {
    const point = selectedPoint();
    if (!point) return;
    const result = executePoint(point);
    updateStatus(result.ok ? `単発: ${result.message}` : result.message);
  });
  startButton.addEventListener('click', startSequence);
  stopButton.addEventListener('click', () => stopSequence());

  movePrevButton.addEventListener('click', () => moveSelected(-1));
  moveNextButton.addEventListener('click', () => moveSelected(1));
  pointDelayInput.addEventListener('change', () => {
    const point = selectedPoint();
    if (!point) return;
    point.delayMs = normalizeDelay(pointDelayInput.value, point.delayMs);
    pointDelayInput.value = point.delayMs;
    refreshMarkerMetadata();
    saveState();
    updateStatus(`地点${pointIndex(point) + 1}: ${formatDelay(point.delayMs)}`);
  });

  [methodSelect, countInput, loopInput, randomEnabledInput, jitterInput]
    .forEach(control => control.addEventListener('change', () => {
      countInput.value = getCycleCount();
      jitterInput.value = clamp(
        Math.floor(Number(jitterInput.value) || 0),
        0,
        5000
      );
      saveState();
    }));

  savePresetButton.addEventListener('click', savePreset);
  loadPresetButton.addEventListener('click', loadPreset);
  deletePresetButton.addEventListener('click', deletePreset);

  closeButton.addEventListener('click', () => destroy());
  window.addEventListener('resize', onResize, { passive: true });
  onCleanup(() => window.removeEventListener('resize', onResize));

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    stopSequence('終了');
    clearMarkers();
    cleanupCallbacks.forEach(callback => {
      try {
        callback();
      } catch (_) {}
    });
    cleanupCallbacks.clear();
    root.remove();
    if (window[GLOBAL_KEY]?.destroy === destroy) {
      delete window[GLOBAL_KEY];
    }
  }

  document.documentElement.append(root);
  loadInitialState();
  refreshPresetOptions();
  rebuildMarkers();

  if (state.points.length === 0) addPoint();
  applyPanelVisibility();
  updateUi();

  function updateUi() {
    refreshMarkerMetadata();
    updateButtons();
  }

  const initialUrl = normalizeUrl(urlInput.value);
  iframe.src = initialUrl || 'about:blank';
  if (!initialUrl) urlInput.focus();

  window[GLOBAL_KEY] = {
    destroy,
    save: saveState,
    stop: stopSequence
  };

  if (typeof completion === 'function') {
    completion({ ok: true, installed: true, version: 3 });
  }
})();
