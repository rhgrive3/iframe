(() => {
  'use strict';

  const ROOT_ID = '__fullscreen_iframe_autoclicker__';
  const GLOBAL_KEY = '__FULLSCREEN_IFRAME_AUTOCLICKER__';
  const STORAGE_KEY = '__fullscreen_iframe_autoclicker_state_v4__';
  const LEGACY_STORAGE_KEYS = [
    '__fullscreen_iframe_autoclicker_state_v3__',
    '__fullscreen_iframe_autoclicker_state_v2__',
    '__fullscreen_iframe_autoclicker_state_v1__'
  ];
  const PRESET_PREFIX = '__fullscreen_iframe_autoclicker_preset_v2__';
  const LEGACY_PRESET_PREFIX = '__fullscreen_iframe_autoclicker_preset_v1__';

  const MARKER_HIT_SIZE = 44;
  const MARKER_VISUAL_SIZE = 29;
  const EDGE_OVERSHOOT_PX = 9;
  const LEGACY_MARKER_SIZE = 64;
  const DRAG_THRESHOLD_PX = 3;
  const DEFAULT_POINT_DELAY_MS = 1000;
  const DEFAULT_HOLD_MS = 55;
  const DEFAULT_JITTER_MS = 100;
  const MAX_DELAY_MS = 600000;
  const MAX_HOLD_MS = 5000;
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

      :host {
        --bg: rgba(16, 18, 23, .9);
        --bg-strong: rgba(18, 20, 27, .97);
        --surface: rgba(255, 255, 255, .065);
        --surface-hover: rgba(255, 255, 255, .105);
        --line: rgba(255, 255, 255, .12);
        --line-strong: rgba(255, 255, 255, .18);
        --text: rgba(255, 255, 255, .96);
        --muted: rgba(255, 255, 255, .58);
        --accent: #6d7cff;
        --accent-strong: #5365ff;
        --success: #2dbb72;
        --danger: #f05252;
        --record: #ff4d64;
      }

      button, select, input {
        font: inherit;
      }

      button {
        border: 0;
        color: var(--text);
        background: var(--surface);
        cursor: pointer;
        touch-action: manipulation;
      }

      button:active {
        transform: scale(.965);
      }

      button:disabled, input:disabled, select:disabled {
        opacity: .38;
      }

      #frame {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
        background: #fff;
      }

      #browserBar {
        position: fixed;
        z-index: 190;
        top: max(8px, env(safe-area-inset-top));
        left: 50%;
        width: min(1080px, calc(100vw - 16px));
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 6px;
        border: 1px solid var(--line-strong);
        border-radius: 15px;
        color: var(--text);
        background: var(--bg);
        box-shadow: 0 12px 36px rgba(0, 0, 0, .34);
        backdrop-filter: blur(22px) saturate(145%);
        -webkit-backdrop-filter: blur(22px) saturate(145%);
        transition: transform .2s ease, opacity .18s ease;
      }

      #browserBar.hidden {
        transform: translate(-50%, calc(-100% - 22px));
        opacity: 0;
        pointer-events: none;
      }

      #browserBar button {
        flex: 0 0 auto;
        width: 40px;
        height: 40px;
        border-radius: 11px;
        font-size: 17px;
        font-weight: 760;
      }

      #browserBar .wideButton {
        width: auto;
        min-width: 52px;
        padding: 0 13px;
        background: var(--accent-strong);
        font-size: 13px;
      }

      #url {
        flex: 1;
        min-width: 70px;
        height: 40px;
        padding: 0 12px;
        border: 1px solid var(--line);
        border-radius: 11px;
        outline: none;
        color: var(--text);
        background: rgba(0, 0, 0, .22);
        font-size: 15px;
      }

      #url::placeholder { color: rgba(255, 255, 255, .42); }

      #browserHandle {
        position: fixed;
        z-index: 189;
        top: max(6px, env(safe-area-inset-top));
        left: 50%;
        transform: translateX(-50%);
        display: none;
        width: 50px;
        height: 30px;
        border: 1px solid var(--line);
        border-radius: 0 0 13px 13px;
        background: var(--bg);
        box-shadow: 0 7px 22px rgba(0, 0, 0, .28);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      #browserHandle.visible { display: block; }

      #markerLayer {
        position: fixed;
        inset: 0;
        z-index: 70;
        pointer-events: none;
      }

      #rootShell.running .marker,
      #rootShell.recording .marker {
        pointer-events: none;
      }

      .marker {
        position: fixed;
        left: 0;
        top: 0;
        width: ${MARKER_HIT_SIZE}px;
        height: ${MARKER_HIT_SIZE}px;
        transform: translate3d(0, 0, 0);
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

      .markerVisual {
        position: absolute;
        left: 50%;
        top: 50%;
        width: ${MARKER_VISUAL_SIZE}px;
        height: ${MARKER_VISUAL_SIZE}px;
        transform: translate(-50%, -50%);
        border: 2.5px solid #ff5b57;
        border-radius: 50%;
        background: rgba(255, 91, 87, .15);
        box-shadow:
          0 0 0 1px rgba(255, 255, 255, .92),
          0 4px 13px rgba(0, 0, 0, .32);
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

      .markerVisual::before { width: 10px; height: 1.5px; }
      .markerVisual::after { width: 1.5px; height: 10px; }

      .marker.selected .markerVisual {
        border-color: #40d486;
        background: rgba(64, 212, 134, .17);
        box-shadow:
          0 0 0 1px rgba(255, 255, 255, .94),
          0 0 0 4px rgba(64, 212, 134, .11),
          0 5px 14px rgba(0, 0, 0, .34);
      }

      .marker.dragging { cursor: grabbing; }
      .marker.dragging .markerVisual { filter: brightness(1.16); }
      .marker.running .markerVisual { animation: markerPulse .24s ease-out; }

      .markerNumber {
        position: absolute;
        right: -2px;
        top: -3px;
        min-width: 17px;
        height: 17px;
        padding: 0 4px;
        border-radius: 9px;
        color: #fff;
        background: rgba(10, 11, 15, .94);
        font-size: 9px;
        font-weight: 800;
        line-height: 17px;
        text-align: center;
        box-shadow: 0 2px 6px rgba(0, 0, 0, .36);
        pointer-events: none;
      }

      .markerDelay {
        position: absolute;
        left: 50%;
        top: calc(100% - 1px);
        transform: translateX(-50%);
        padding: 2px 5px;
        border: 1px solid rgba(255, 255, 255, .1);
        border-radius: 6px;
        color: rgba(255, 255, 255, .92);
        background: rgba(12, 13, 17, .82);
        font-size: 8.5px;
        font-weight: 720;
        line-height: 1.05;
        white-space: nowrap;
        box-shadow: 0 2px 7px rgba(0, 0, 0, .22);
        pointer-events: none;
      }

      @keyframes markerPulse {
        0% { transform: translate(-50%, -50%) scale(1); }
        45% { transform: translate(-50%, -50%) scale(.7); opacity: .7; }
        100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
      }

      #recordLayer {
        position: fixed;
        inset: 0;
        z-index: 145;
        display: none;
        pointer-events: none;
        touch-action: none;
        background: rgba(255, 71, 93, .025);
      }

      #recordLayer.active {
        display: block;
        pointer-events: auto;
      }

      .recordDot {
        position: fixed;
        width: 30px;
        height: 30px;
        transform: translate(-50%, -50%);
        border: 2px solid rgba(255, 255, 255, .95);
        border-radius: 50%;
        color: #fff;
        background: rgba(255, 61, 88, .86);
        box-shadow: 0 0 0 5px rgba(255, 61, 88, .16), 0 6px 16px rgba(0, 0, 0, .28);
        font-size: 10px;
        font-weight: 800;
        line-height: 26px;
        text-align: center;
        pointer-events: none;
        animation: recordDotIn .2s ease-out;
      }

      @keyframes recordDotIn {
        from { transform: translate(-50%, -50%) scale(.55); opacity: 0; }
        to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
      }

      #recordHud {
        position: fixed;
        z-index: 230;
        top: max(64px, calc(env(safe-area-inset-top) + 54px));
        left: 50%;
        display: none;
        align-items: center;
        gap: 8px;
        transform: translateX(-50%);
        padding: 7px 8px 7px 12px;
        border: 1px solid rgba(255, 255, 255, .18);
        border-radius: 999px;
        color: #fff;
        background: rgba(22, 18, 23, .94);
        box-shadow: 0 10px 30px rgba(0, 0, 0, .34);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      #recordHud.active { display: flex; }

      .recordPulse {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--record);
        box-shadow: 0 0 0 0 rgba(255, 77, 100, .5);
        animation: recordPulse 1.35s infinite;
      }

      @keyframes recordPulse {
        0% { box-shadow: 0 0 0 0 rgba(255, 77, 100, .48); }
        70% { box-shadow: 0 0 0 8px rgba(255, 77, 100, 0); }
        100% { box-shadow: 0 0 0 0 rgba(255, 77, 100, 0); }
      }

      #recordCount {
        min-width: 68px;
        font-size: 12px;
        font-weight: 720;
      }

      #recordHud button {
        height: 36px;
        padding: 0 12px;
        border-radius: 18px;
        font-size: 12px;
        font-weight: 760;
      }

      #finishRecord { background: var(--record); }

      #controller {
        position: fixed;
        z-index: 220;
        left: 0;
        top: 0;
        width: min(650px, calc(100vw - 16px));
        color: var(--text);
        border: 1px solid var(--line-strong);
        border-radius: 19px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, .045), transparent 28%),
          var(--bg-strong);
        box-shadow:
          0 22px 55px rgba(0, 0, 0, .42),
          inset 0 1px 0 rgba(255, 255, 255, .07);
        backdrop-filter: blur(26px) saturate(150%);
        -webkit-backdrop-filter: blur(26px) saturate(150%);
        overflow: hidden;
        will-change: transform;
      }

      #controller.collapsed {
        width: 100px;
        border-radius: 26px;
      }

      #miniController { display: none; }
      #controller.collapsed #miniController {
        display: grid;
        grid-template-columns: 50px 50px;
        width: 100px;
        height: 50px;
      }
      #controller.collapsed #expandedController { display: none; }

      #miniGrip,
      #miniRun {
        position: relative;
        width: 50px;
        height: 50px;
        border-radius: 0;
        background: transparent;
      }

      #miniGrip {
        cursor: grab;
        touch-action: none;
      }

      #miniGrip:active { transform: none; }

      #miniGrip::before {
        content: '••';
        display: block;
        transform: rotate(90deg);
        color: rgba(255, 255, 255, .48);
        font-size: 16px;
        letter-spacing: 2px;
      }

      #miniRun {
        border-left: 1px solid var(--line);
        color: #fff;
        background: rgba(109, 124, 255, .18);
        font-size: 17px;
        font-weight: 800;
      }

      #controller.running #miniRun { background: rgba(240, 82, 82, .22); }
      #controller.recording #miniRun { background: rgba(255, 77, 100, .24); }

      #controllerHeader {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 6px;
        min-height: 48px;
        padding: 6px 7px 6px 13px;
        border-bottom: 1px solid var(--line);
      }

      #controllerDrag {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 9px;
        height: 40px;
        cursor: grab;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
      }

      .brandMark {
        position: relative;
        flex: 0 0 auto;
        width: 27px;
        height: 27px;
        border-radius: 9px;
        background: linear-gradient(145deg, #8290ff, #5162ff);
        box-shadow: 0 6px 16px rgba(83, 101, 255, .3);
      }

      .brandMark::before,
      .brandMark::after {
        content: '';
        position: absolute;
        left: 50%;
        top: 50%;
        border-radius: 2px;
        background: #fff;
        transform: translate(-50%, -50%);
      }

      .brandMark::before { width: 11px; height: 2px; }
      .brandMark::after { width: 2px; height: 11px; }

      .brandText {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }

      .brandTitle {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
        font-weight: 820;
        letter-spacing: .02em;
      }

      #status {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--muted);
        font-size: 10px;
        font-weight: 620;
      }

      .headerButton {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        font-size: 16px;
        font-weight: 760;
      }

      #collapseController { background: rgba(255, 255, 255, .08); }
      #settingsToggle.active { color: #fff; background: rgba(109, 124, 255, .28); }

      #quickActions {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 6px;
        padding: 8px;
      }

      .actionButton {
        min-width: 0;
        height: 44px;
        padding: 0 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 760;
        white-space: nowrap;
      }

      #addPoint { background: rgba(109, 124, 255, .22); }
      #recordButton { color: #fff; background: rgba(255, 77, 100, .2); }
      #start { background: rgba(45, 187, 114, .25); }
      #stop { background: rgba(240, 82, 82, .22); }

      #settingsPanel {
        max-height: min(58vh, 520px);
        overflow: auto;
        padding: 8px;
        border-top: 1px solid var(--line);
        transition: max-height .22s ease, padding .2s ease, opacity .18s ease;
        overscroll-behavior: contain;
      }

      #settingsPanel.hidden {
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
        border: 1px solid rgba(255, 255, 255, .075);
        border-radius: 14px;
        background: rgba(255, 255, 255, .045);
      }

      .section + .section { margin-top: 7px; }

      .sectionHeader {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 9px;
      }

      .sectionTitle {
        color: rgba(255, 255, 255, .91);
        font-size: 12px;
        font-weight: 800;
        letter-spacing: .015em;
      }

      .sectionMeta {
        color: var(--muted);
        font-size: 10px;
        font-weight: 650;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 7px;
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: 5px;
        min-width: 0;
        color: var(--muted);
        font-size: 10.5px;
        font-weight: 650;
      }

      .field.inline {
        min-height: 43px;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        padding: 0 10px;
        border: 1px solid rgba(255, 255, 255, .08);
        border-radius: 11px;
        background: rgba(0, 0, 0, .11);
      }

      .field input[type="number"],
      .field select,
      #memoryRow select {
        width: 100%;
        height: 39px;
        padding: 0 9px;
        border: 1px solid rgba(255, 255, 255, .105);
        border-radius: 11px;
        outline: none;
        color: #fff;
        background: rgba(0, 0, 0, .18);
      }

      input[type="checkbox"] {
        width: 20px;
        height: 20px;
        accent-color: var(--accent);
      }

      #pointStrip {
        display: flex;
        gap: 5px;
        overflow-x: auto;
        padding: 0 0 8px;
        scrollbar-width: none;
      }
      #pointStrip::-webkit-scrollbar { display: none; }

      .pointChip {
        flex: 0 0 auto;
        height: 31px;
        padding: 0 10px;
        border: 1px solid transparent;
        border-radius: 16px;
        color: rgba(255, 255, 255, .72);
        background: rgba(255, 255, 255, .07);
        font-size: 10px;
        font-weight: 760;
      }

      .pointChip.selected {
        color: #fff;
        border-color: rgba(109, 124, 255, .38);
        background: rgba(109, 124, 255, .22);
      }

      .twoButtons {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }

      .twoButtons button,
      #memoryRow button {
        height: 39px;
        border-radius: 11px;
        font-size: 11px;
        font-weight: 760;
      }

      #memoryRow {
        display: grid;
        grid-template-columns: 100px repeat(3, minmax(0, 1fr));
        gap: 6px;
      }

      #savePreset { background: rgba(109, 124, 255, .23); }
      #deletePreset { background: rgba(240, 82, 82, .18); }

      .hint {
        margin-top: 7px;
        color: rgba(255, 255, 255, .43);
        font-size: 9.5px;
        line-height: 1.45;
      }

      @media (max-width: 660px) {
        #quickActions {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        .grid { grid-template-columns: 1fr; }
        #memoryRow { grid-template-columns: 86px repeat(3, minmax(0, 1fr)); }
        .actionButton { font-size: 11px; }
      }
    </style>

    <div id="rootShell">
      <iframe id="frame"
        allow="fullscreen; autoplay; clipboard-read; clipboard-write"
        referrerpolicy="no-referrer-when-downgrade"></iframe>

      <div id="markerLayer"></div>
      <div id="recordLayer"></div>

      <div id="recordHud">
        <span class="recordPulse"></span>
        <span id="recordCount">0 タッチ</span>
        <button id="cancelRecord">取消</button>
        <button id="finishRecord">完了</button>
      </div>

      <div id="browserBar">
        <button id="back" title="戻る">←</button>
        <button id="forward" title="進む">→</button>
        <button id="reload" title="再読込">↻</button>
        <input id="url" type="text" placeholder="https://example.com"
          autocomplete="off" spellcheck="false">
        <button id="load" class="wideButton">表示</button>
        <button id="hideBrowser" title="URLバーを収納">⌃</button>
        <button id="close" title="終了">×</button>
      </div>
      <button id="browserHandle" title="URLバーを表示">⌄</button>

      <div id="controller">
        <div id="miniController">
          <button id="miniGrip" title="ドラッグ・タップで展開"></button>
          <button id="miniRun" title="開始・停止">▶</button>
        </div>

        <div id="expandedController">
          <div id="controllerHeader">
            <div id="controllerDrag">
              <span class="brandMark"></span>
              <span class="brandText">
                <span class="brandTitle">AUTO TAP</span>
                <span id="status">地点なし</span>
              </span>
            </div>
            <button id="settingsToggle" class="headerButton" title="詳細設定">≡</button>
            <button id="collapseController" class="headerButton" title="最小化">—</button>
          </div>

          <div id="quickActions">
            <button id="addPoint" class="actionButton">＋ 地点</button>
            <button id="deletePoint" class="actionButton">削除</button>
            <button id="single" class="actionButton">1回</button>
            <button id="recordButton" class="actionButton">● 記録</button>
            <button id="start" class="actionButton">▶ 開始</button>
            <button id="stop" class="actionButton" disabled>■ 停止</button>
            <button id="clearPoints" class="actionButton">全消去</button>
          </div>

          <div id="settingsPanel">
            <section class="section">
              <div class="sectionHeader">
                <span id="selectedTitle" class="sectionTitle">地点設定</span>
                <span id="selectedTimingLabel" class="sectionMeta">前の地点から</span>
              </div>
              <div id="pointStrip"></div>
              <div class="grid">
                <label class="field">
                  待機時間（ms）
                  <input id="pointDelay" type="number" min="0"
                    max="${MAX_DELAY_MS}" step="10" value="1000">
                </label>
                <label class="field">
                  タッチ保持（ms）
                  <input id="pointHold" type="number" min="0"
                    max="${MAX_HOLD_MS}" step="5" value="${DEFAULT_HOLD_MS}">
                </label>
                <div class="field">
                  実行順
                  <div class="twoButtons">
                    <button id="movePrev">← 前へ</button>
                    <button id="moveNext">後へ →</button>
                  </div>
                </div>
              </div>
            </section>

            <section class="section">
              <div class="sectionHeader">
                <span class="sectionTitle">記録</span>
                <span class="sectionMeta">位置・間隔・保持時間</span>
              </div>
              <div class="grid">
                <label class="field">
                  記録の反映方法
                  <select id="recordMode">
                    <option value="replace">現在の地点を置換</option>
                    <option value="append">現在の地点へ追加</option>
                  </select>
                </label>
              </div>
              <div class="hint">
                記録開始後に画面を順番にタッチしてください。タッチ開始位置、前のタッチからの間隔、押していた時間を地点へ変換します。
              </div>
            </section>

            <section class="section">
              <div class="sectionHeader">
                <span class="sectionTitle">再生</span>
                <span class="sectionMeta">直列実行</span>
              </div>
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
                各地点は前の地点が完了してから待機します。初期値では2地点目が±0.1秒、3地点目の累積が最大±0.2秒になります。
              </div>
            </section>

            <section class="section">
              <div class="sectionHeader">
                <span class="sectionTitle">記憶</span>
                <span class="sectionMeta">自動保存＋5スロット</span>
              </div>
              <div id="memoryRow">
                <select id="presetSlot"></select>
                <button id="savePreset">保存</button>
                <button id="loadPreset">読込</button>
                <button id="deletePreset">消去</button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  `;

  const $id = id => shadow.getElementById(id);

  const rootShell = $id('rootShell');
  const iframe = $id('frame');
  const markerLayer = $id('markerLayer');
  const recordLayer = $id('recordLayer');
  const recordHud = $id('recordHud');
  const recordCount = $id('recordCount');
  const cancelRecordButton = $id('cancelRecord');
  const finishRecordButton = $id('finishRecord');

  const browserBar = $id('browserBar');
  const browserHandle = $id('browserHandle');
  const urlInput = $id('url');
  const loadButton = $id('load');
  const backButton = $id('back');
  const forwardButton = $id('forward');
  const reloadButton = $id('reload');
  const hideBrowserButton = $id('hideBrowser');
  const closeButton = $id('close');

  const controller = $id('controller');
  const miniGrip = $id('miniGrip');
  const miniRunButton = $id('miniRun');
  const controllerDrag = $id('controllerDrag');
  const settingsToggle = $id('settingsToggle');
  const collapseControllerButton = $id('collapseController');
  const settingsPanel = $id('settingsPanel');
  const status = $id('status');

  const addPointButton = $id('addPoint');
  const deletePointButton = $id('deletePoint');
  const singleButton = $id('single');
  const recordButton = $id('recordButton');
  const startButton = $id('start');
  const stopButton = $id('stop');
  const clearPointsButton = $id('clearPoints');

  const selectedTitle = $id('selectedTitle');
  const selectedTimingLabel = $id('selectedTimingLabel');
  const pointStrip = $id('pointStrip');
  const pointDelayInput = $id('pointDelay');
  const pointHoldInput = $id('pointHold');
  const movePrevButton = $id('movePrev');
  const moveNextButton = $id('moveNext');
  const recordModeSelect = $id('recordMode');

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
    controllerCollapsed: false,
    controllerX: null,
    controllerY: null,
    controllerReady: false,
    recording: false,
    recordStartedAt: 0,
    recordDraft: [],
    recordPointers: new Map(),
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

  function normalizeDelay(value, fallback = DEFAULT_POINT_DELAY_MS) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return clamp(Math.round(number), 0, MAX_DELAY_MS);
  }

  function normalizeHold(value, fallback = DEFAULT_HOLD_MS) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return clamp(Math.round(number), 0, MAX_HOLD_MS);
  }

  function clampPoint(point) {
    point.x = clamp(
      Number(point.x) || 0,
      -EDGE_OVERSHOOT_PX,
      window.innerWidth + EDGE_OVERSHOOT_PX
    );
    point.y = clamp(
      Number(point.y) || 0,
      -EDGE_OVERSHOOT_PX,
      window.innerHeight + EDGE_OVERSHOOT_PX
    );
  }

  function clickCoordinates(point) {
    return {
      x: clamp(point.x, .5, Math.max(.5, window.innerWidth - .5)),
      y: clamp(point.y, .5, Math.max(.5, window.innerHeight - .5))
    };
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
      version: 4,
      coordinateMode: 'center',
      markerHitSize: MARKER_HIT_SIZE,
      url: urlInput.value,
      points: state.points.map(({ id, x, y, delayMs, holdMs }) => ({
        id,
        x,
        y,
        delayMs,
        holdMs
      })),
      selectedId: state.selectedId,
      nextId: state.nextId,
      method: methodSelect.value,
      count: countInput.value,
      loop: loopInput.checked,
      randomEnabled: randomEnabledInput.checked,
      jitterMs: jitterInput.value,
      recordMode: recordModeSelect.value,
      settingsOpen: state.settingsOpen,
      browserHidden: state.browserHidden,
      controllerCollapsed: state.controllerCollapsed,
      controllerX: state.controllerX,
      controllerY: state.controllerY
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

  function applySnapshot(snapshot, { legacyKey = '' } = {}) {
    if (!snapshot || typeof snapshot !== 'object') return false;

    if (typeof snapshot.url === 'string') {
      urlInput.value = snapshot.url;
    }

    const isCenterMode = snapshot.coordinateMode === 'center' || snapshot.version >= 4;
    const savedMarkerSize = Number(snapshot.markerHitSize);
    const sourceMarkerSize = Number.isFinite(savedMarkerSize)
      ? savedMarkerSize
      : legacyKey.endsWith('_v1__')
        ? LEGACY_MARKER_SIZE
        : 46;
    const oldGlobalInterval = normalizeDelay(
      snapshot.interval,
      DEFAULT_POINT_DELAY_MS
    );

    state.points = Array.isArray(snapshot.points)
      ? snapshot.points
          .filter(point =>
            Number.isFinite(Number(point.x)) &&
            Number.isFinite(Number(point.y))
          )
          .map((point, index) => ({
            id: Number(point.id) || index + 1,
            x: isCenterMode
              ? Number(point.x)
              : Number(point.x) + sourceMarkerSize / 2,
            y: isCenterMode
              ? Number(point.y)
              : Number(point.y) + sourceMarkerSize / 2,
            delayMs: normalizeDelay(
              point.delayMs,
              index === 0 ? 0 : oldGlobalInterval
            ),
            holdMs: normalizeHold(point.holdMs),
            element: null,
            cleanup: null
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
    recordModeSelect.value = ['replace', 'append'].includes(snapshot.recordMode)
      ? snapshot.recordMode
      : 'replace';
    state.settingsOpen = snapshot.settingsOpen !== false;
    state.browserHidden = Boolean(snapshot.browserHidden);
    state.controllerCollapsed = Boolean(snapshot.controllerCollapsed);
    state.controllerX = Number.isFinite(Number(snapshot.controllerX))
      ? Number(snapshot.controllerX)
      : null;
    state.controllerY = Number.isFinite(Number(snapshot.controllerY))
      ? Number(snapshot.controllerY)
      : null;

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

  function legacyPresetKey(slot) {
    return `${LEGACY_PRESET_PREFIX}_${slot}`;
  }

  function readPreset(slot) {
    return readJson(presetKey(slot)) || readJson(legacyPresetKey(slot));
  }

  function refreshPresetOptions() {
    const selected = presetSlotSelect.value || '1';
    presetSlotSelect.textContent = '';

    for (let slot = 1; slot <= PRESET_SLOTS; slot += 1) {
      const option = document.createElement('option');
      const exists = Boolean(readPreset(slot));
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
    const snapshot = readPreset(slot);
    if (!snapshot) {
      updateStatus(`スロット${slot}は空`);
      return;
    }

    stopSequence('読込中');
    cancelRecording({ announce: false });
    clearMarkers();
    applySnapshot(snapshot);
    rebuildMarkers();
    applyVisibility();
    updateUi();
    requestAnimationFrame(() => {
      positionController({ useDefaultWhenMissing: true });
    });
    saveState();

    const url = normalizeUrl(urlInput.value);
    if (url) iframe.src = url;
    updateStatus(`スロット${slot}を読込`);
  }

  function deletePreset() {
    const slot = presetSlotSelect.value;
    localStorage.removeItem(presetKey(slot));
    localStorage.removeItem(legacyPresetKey(slot));
    refreshPresetOptions();
    presetSlotSelect.value = slot;
    updateStatus(`スロット${slot}を消去`);
  }

  function setMarkerPosition(point) {
    if (!point.element) return;
    point.element.style.transform = `translate3d(${point.x - MARKER_HIT_SIZE / 2}px, ${point.y - MARKER_HIT_SIZE / 2}px, 0)`;
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
      updateStatus(point ? `地点${pointIndex(point) + 1}を選択` : '地点なし');
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

    marker.addEventListener('pointerdown', event => {
      if (state.running || state.recording) return;
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
    }, { passive: false });

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

  function addPoint({ x, y, delayMs, holdMs } = {}) {
    if (state.running || state.recording) return null;
    const index = state.points.length;
    const offset = index * 11;
    const point = {
      id: state.nextId++,
      x: Number.isFinite(x) ? x : window.innerWidth / 2 + offset,
      y: Number.isFinite(y) ? y : window.innerHeight / 2 + offset,
      delayMs: normalizeDelay(delayMs, index === 0 ? 0 : DEFAULT_POINT_DELAY_MS),
      holdMs: normalizeHold(holdMs),
      element: null,
      cleanup: null
    };
    clampPoint(point);
    state.points.push(point);
    createMarkerElement(point);
    refreshMarkerMetadata();
    selectPoint(point.id);
    return point;
  }

  function deleteSelectedPoint() {
    if (state.running || state.recording) return;
    const point = selectedPoint();
    if (!point) return;

    const index = pointIndex(point);
    point.cleanup?.();
    point.element?.remove();
    state.points.splice(index, 1);
    const replacement = state.points[index] || state.points[index - 1] || null;
    state.selectedId = replacement?.id ?? null;
    refreshMarkerMetadata();
    selectPoint(state.selectedId);
  }

  function clearAllPoints() {
    if (state.running || state.recording) return;
    clearMarkers();
    state.points = [];
    state.selectedId = null;
    refreshMarkerMetadata();
    updateButtons();
    saveState();
    updateStatus('地点を全消去');
  }

  function moveSelected(direction) {
    if (state.running || state.recording) return;
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
      button.disabled = state.running || state.recording;
      button.addEventListener('click', () => selectPoint(point.id));
      pointStrip.append(button);
    });
  }

  function updateSelectedEditor() {
    const point = selectedPoint();
    const index = point ? pointIndex(point) : -1;
    selectedTitle.textContent = point ? `地点 ${index + 1}` : '地点設定';
    selectedTimingLabel.textContent = index === 0 ? '開始から' : '前の地点から';
    pointDelayInput.value = point?.delayMs ?? 0;
    pointHoldInput.value = point?.holdMs ?? DEFAULT_HOLD_MS;
    const disabled = !point || state.running || state.recording;
    pointDelayInput.disabled = disabled;
    pointHoldInput.disabled = disabled;
    movePrevButton.disabled = disabled || index <= 0;
    moveNextButton.disabled = disabled || index >= state.points.length - 1;
  }

  function updateButtons() {
    const hasPoints = state.points.length > 0;
    const hasSelected = Boolean(selectedPoint());
    const locked = state.running || state.recording;

    addPointButton.disabled = locked;
    deletePointButton.disabled = !hasSelected || locked;
    clearPointsButton.disabled = !hasPoints || locked;
    singleButton.disabled = !hasSelected || locked;
    recordButton.disabled = state.running;
    startButton.disabled = !hasPoints || locked;
    stopButton.disabled = !state.running;

    savePresetButton.disabled = locked;
    loadPresetButton.disabled = locked;
    deletePresetButton.disabled = locked;
    presetSlotSelect.disabled = locked;
    methodSelect.disabled = locked;
    countInput.disabled = locked;
    loopInput.disabled = locked;
    randomEnabledInput.disabled = locked;
    jitterInput.disabled = locked;
    recordModeSelect.disabled = locked;

    rootShell.classList.toggle('running', state.running);
    rootShell.classList.toggle('recording', state.recording);
    controller.classList.toggle('running', state.running);
    controller.classList.toggle('recording', state.recording);

    startButton.textContent = state.running ? '実行中' : '▶ 開始';
    recordButton.textContent = state.recording ? '■ 完了' : '● 記録';
    miniRunButton.textContent = state.running ? '■' : state.recording ? '●' : '▶';
    renderPointStrip();
    updateSelectedEditor();
  }

  function setSettingsOpen(open, { persist = true } = {}) {
    state.settingsOpen = Boolean(open);
    settingsPanel.classList.toggle('hidden', !state.settingsOpen);
    settingsToggle.classList.toggle('active', state.settingsOpen);
    settingsToggle.textContent = state.settingsOpen ? '⌃' : '≡';
    settingsToggle.title = state.settingsOpen ? '詳細設定を収納' : '詳細設定を表示';
    if (persist) saveState();
    requestAnimationFrame(() => positionController());
  }

  function setBrowserHidden(hidden, { persist = true } = {}) {
    state.browserHidden = Boolean(hidden);
    browserBar.classList.toggle('hidden', state.browserHidden);
    browserHandle.classList.toggle('visible', state.browserHidden);
    if (persist) saveState();
  }

  function setControllerCollapsed(collapsed, { persist = true } = {}) {
    state.controllerCollapsed = Boolean(collapsed);
    controller.classList.toggle('collapsed', state.controllerCollapsed);
    requestAnimationFrame(() => {
      positionController();
      if (persist) saveState();
    });
  }

  function applyVisibility() {
    setSettingsOpen(state.settingsOpen, { persist: false });
    setBrowserHidden(state.browserHidden, { persist: false });
    setControllerCollapsed(state.controllerCollapsed, { persist: false });
  }

  function controllerBounds() {
    const rect = controller.getBoundingClientRect();
    return {
      width: rect.width || (state.controllerCollapsed ? 100 : 650),
      height: rect.height || 50
    };
  }

  function positionController({ useDefaultWhenMissing = false } = {}) {
    const { width, height } = controllerBounds();
    if (
      useDefaultWhenMissing ||
      !Number.isFinite(state.controllerX) ||
      !Number.isFinite(state.controllerY)
    ) {
      if (!Number.isFinite(state.controllerX)) {
        state.controllerX = (window.innerWidth - width) / 2;
      }
      if (!Number.isFinite(state.controllerY)) {
        state.controllerY = window.innerHeight - height - 12;
      }
    }

    state.controllerX = clamp(
      Number(state.controllerX) || 0,
      6,
      Math.max(6, window.innerWidth - width - 6)
    );
    state.controllerY = clamp(
      Number(state.controllerY) || 0,
      6,
      Math.max(6, window.innerHeight - height - 6)
    );
    controller.style.transform =
      `translate3d(${state.controllerX}px, ${state.controllerY}px, 0)`;
    state.controllerReady = true;
  }

  function installDragHandle(handle, { tapAction = null } = {}) {
    const drag = {
      active: false,
      pointerId: null,
      startClientX: 0,
      startClientY: 0,
      startX: 0,
      startY: 0,
      latestX: 0,
      latestY: 0,
      moved: false,
      rafId: 0,
      suppressClickUntil: 0
    };

    function render() {
      drag.rafId = 0;
      if (!drag.active) return;
      const dx = drag.latestX - drag.startClientX;
      const dy = drag.latestY - drag.startClientY;
      if (!drag.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
        drag.moved = true;
      }
      if (!drag.moved) return;
      state.controllerX = drag.startX + dx;
      state.controllerY = drag.startY + dy;
      positionController();
    }

    function queue() {
      if (!drag.rafId) drag.rafId = requestAnimationFrame(render);
    }

    function read(event) {
      const events = event.getCoalescedEvents?.();
      const latest = events?.length ? events[events.length - 1] : event;
      drag.latestX = latest.clientX;
      drag.latestY = latest.clientY;
    }

    function move(event) {
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      read(event);
      queue();
    }

    function finish(event) {
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      read(event);
      if (drag.rafId) {
        cancelAnimationFrame(drag.rafId);
        drag.rafId = 0;
      }
      render();
      drag.active = false;
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
      if (drag.moved) {
        drag.suppressClickUntil = performance.now() + 350;
        saveState();
      } else {
        tapAction?.();
      }
      drag.pointerId = null;
    }

    function down(event) {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      drag.active = true;
      drag.pointerId = event.pointerId;
      drag.startClientX = event.clientX;
      drag.startClientY = event.clientY;
      drag.latestX = event.clientX;
      drag.latestY = event.clientY;
      drag.startX = state.controllerX;
      drag.startY = state.controllerY;
      drag.moved = false;
      window.addEventListener('pointermove', move, { capture: true, passive: false });
      window.addEventListener('pointerup', finish, { capture: true, passive: false });
      window.addEventListener('pointercancel', finish, { capture: true, passive: false });
    }

    handle.addEventListener('pointerdown', down, { passive: false });
    onCleanup(() => {
      if (drag.rafId) cancelAnimationFrame(drag.rafId);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
    });
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
      viewportX >= frameRect.right ||
      viewportY >= frameRect.bottom
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

  function findJQuery(target) {
    const view = target.ownerDocument?.defaultView || window;
    if (view.jQuery?.fn?.jquery) return view.jQuery;
    if (view.$?.fn?.jquery) return view.$;
    return null;
  }

  function dispatchPressDown(target, clientX, clientY) {
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
      target.dispatchEvent(new view.PointerEvent('pointerdown', {
        ...options,
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
        pressure: .5
      }));
    }
    target.dispatchEvent(new view.MouseEvent('mousedown', options));
  }

  function dispatchPressUpAndClick(target, clientX, clientY) {
    const view = target.ownerDocument?.defaultView || window;
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
      buttons: 0
    };

    if (typeof view.PointerEvent === 'function') {
      target.dispatchEvent(new view.PointerEvent('pointerup', {
        ...options,
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
        pressure: 0
      }));
    }
    target.dispatchEvent(new view.MouseEvent('mouseup', options));

    if (typeof target.click === 'function') {
      target.click();
    } else {
      target.dispatchEvent(new view.MouseEvent('click', options));
    }
  }

  function triggerJQueryTap(target, clientX, clientY) {
    const jq = findJQuery(target);
    if (!jq) return false;
    const view = target.ownerDocument?.defaultView || window;
    jq(target).trigger(jq.Event('tap', {
      clientX,
      clientY,
      pageX: clientX + (view.scrollX || 0),
      pageY: clientY + (view.scrollY || 0),
      which: 1,
      button: 0
    }));
    return true;
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

  async function executePoint(point, token) {
    const coords = clickCoordinates(point);
    const hit = targetAtViewportPoint(coords.x, coords.y);
    if (hit.error) return { ok: false, message: hit.error };

    const target = chooseClickableTarget(hit.element);
    if (!target) return { ok: false, message: '対象なし' };

    animateMarker(point);
    const method = methodSelect.value;
    const jqAvailable = Boolean(findJQuery(target));
    const useClick = method === 'click' || method === 'both' ||
      (method === 'tap' && !jqAvailable);

    if (useClick) {
      dispatchPressDown(target, hit.x, hit.y);
    }

    if (point.holdMs > 0) {
      const held = await waitForDelay(point.holdMs, token);
      if (!held) return { ok: false, stopped: true, message: '停止' };
    }

    if (method === 'tap' || method === 'both') {
      triggerJQueryTap(target, hit.x, hit.y);
    }
    if (useClick) {
      dispatchPressUpAndClick(target, hit.x, hit.y);
    }

    return { ok: true, message: elementLabel(target) };
  }

  function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function intervalJitterMs(pointIndexInCycle) {
    if (!randomEnabledInput.checked || pointIndexInCycle === 0) return 0;
    const range = clamp(Math.floor(Number(jitterInput.value) || 0), 0, 5000);
    return randomInteger(-range, range);
  }

  async function evaluatePointDecision(_point, _context) {
    // 将来ここへ「条件成立まで待機」「条件によるスキップ」を追加する。
    return 'execute';
  }

  async function runPoint(point, context) {
    const rawJitter = intervalJitterMs(context.index);
    const actualDelay = Math.max(0, point.delayMs + rawJitter);
    const appliedJitter = actualDelay - point.delayMs;
    context.cumulativeJitter += appliedJitter;

    updateStatus(
      `地点${context.index + 1} 待機 ${formatDelay(actualDelay)} ` +
      `(${signedMs(appliedJitter)} / 累積${signedMs(context.cumulativeJitter)})`
    );

    const continued = await waitForDelay(actualDelay, context.token);
    if (!continued) return 'stopped';

    const decision = await evaluatePointDecision(point, context);
    if (!state.running || context.token !== state.runToken) return 'stopped';
    if (decision === 'skip') return 'skipped';

    const result = await executePoint(point, context.token);
    if (result.stopped) return 'stopped';
    updateStatus(
      result.ok
        ? `地点${context.index + 1}: ${result.message} ` +
          `(累積${signedMs(context.cumulativeJitter)})`
        : `地点${context.index + 1}: ${result.message}`
    );
    return result.ok ? 'executed' : 'failed';
  }

  function getCycleCount() {
    return clamp(Math.floor(Number(countInput.value) || 1), 1, 999999);
  }

  async function startSequence() {
    if (state.running || state.recording || state.points.length === 0) return;

    state.running = true;
    state.runToken += 1;
    const token = state.runToken;
    const points = state.points.slice();
    const cycleLimit = getCycleCount();
    let cycle = 0;

    saveState();
    updateButtons();

    try {
      while (state.running && token === state.runToken) {
        let cumulativeJitter = 0;
        for (let index = 0; index < points.length; index += 1) {
          if (!state.running || token !== state.runToken) return;
          const context = {
            token,
            cycle,
            index,
            cumulativeJitter
          };
          const outcome = await runPoint(points[index], context);
          cumulativeJitter = context.cumulativeJitter;
          if (outcome === 'stopped') return;
        }

        cycle += 1;
        if (!loopInput.checked && cycle >= cycleLimit) {
          stopSequence(`${cycle}回完了`, { incrementToken: false });
          return;
        }
      }
    } catch (error) {
      console.error('[Iframe AutoClicker] 実行失敗', error);
      stopSequence('実行失敗');
    }
  }

  function stopSequence(message = '停止', { incrementToken = true } = {}) {
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

  function renderRecordPreview(entry, index) {
    const dot = document.createElement('span');
    dot.className = 'recordDot';
    dot.textContent = String(index + 1);
    dot.style.left = `${entry.x}px`;
    dot.style.top = `${entry.y}px`;
    recordLayer.append(dot);
  }

  function clearRecordPreview() {
    recordLayer.textContent = '';
  }

  function updateRecordHud() {
    recordCount.textContent = `${state.recordDraft.length} タッチ`;
  }

  function startRecording() {
    if (state.running || state.recording) return;
    state.recording = true;
    state.recordStartedAt = performance.now();
    state.recordDraft = [];
    state.recordPointers.clear();
    clearRecordPreview();
    recordLayer.classList.add('active');
    recordHud.classList.add('active');
    updateRecordHud();
    updateStatus('記録中：画面を順番にタッチ');
    updateButtons();
  }

  function cancelRecording({ announce = true } = {}) {
    if (!state.recording && state.recordDraft.length === 0) return;
    state.recording = false;
    state.recordPointers.clear();
    state.recordDraft = [];
    clearRecordPreview();
    recordLayer.classList.remove('active');
    recordHud.classList.remove('active');
    updateButtons();
    if (announce) updateStatus('記録を取消');
  }

  function finishRecording() {
    if (!state.recording) return;
    const draft = state.recordDraft.slice();
    state.recording = false;
    state.recordPointers.clear();
    clearRecordPreview();
    recordLayer.classList.remove('active');
    recordHud.classList.remove('active');

    if (draft.length === 0) {
      updateButtons();
      updateStatus('タッチが記録されていません');
      return;
    }

    if (recordModeSelect.value === 'replace') {
      clearMarkers();
      state.points = [];
      state.selectedId = null;
    }

    const firstNewIndex = state.points.length;
    draft.forEach(entry => {
      state.points.push({
        id: state.nextId++,
        x: entry.x,
        y: entry.y,
        delayMs: normalizeDelay(entry.delayMs, 0),
        holdMs: normalizeHold(entry.holdMs),
        element: null,
        cleanup: null
      });
    });

    rebuildMarkers();
    const selected = state.points[firstNewIndex] || state.points[0] || null;
    state.selectedId = selected?.id ?? null;
    selectPoint(state.selectedId, { persist: false, announce: false });
    refreshMarkerMetadata();
    updateButtons();
    saveState();
    updateStatus(`${draft.length}件のタッチを地点へ変換`);
  }

  function latestPointerPosition(event) {
    const events = event.getCoalescedEvents?.();
    const latest = events?.length ? events[events.length - 1] : event;
    return { x: latest.clientX, y: latest.clientY };
  }

  recordLayer.addEventListener('pointerdown', event => {
    if (!state.recording) return;
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    const position = latestPointerPosition(event);
    const now = performance.now();
    state.recordPointers.set(event.pointerId, {
      downAt: now,
      x: position.x,
      y: position.y,
      latestX: position.x,
      latestY: position.y
    });
    try {
      recordLayer.setPointerCapture(event.pointerId);
    } catch (_) {}
  }, { passive: false });

  recordLayer.addEventListener('pointermove', event => {
    const active = state.recordPointers.get(event.pointerId);
    if (!active) return;
    event.preventDefault();
    const position = latestPointerPosition(event);
    active.latestX = position.x;
    active.latestY = position.y;
  }, { passive: false });

  function finishRecordedPointer(event) {
    const active = state.recordPointers.get(event.pointerId);
    if (!active) return;
    event.preventDefault();
    const position = latestPointerPosition(event);
    const upAt = performance.now();
    const previous = state.recordDraft[state.recordDraft.length - 1];
    const delayMs = previous
      ? Math.max(0, Math.round(active.downAt - previous.downAt))
      : Math.max(0, Math.round(active.downAt - state.recordStartedAt));
    const entry = {
      x: clamp(position.x, 0, window.innerWidth),
      y: clamp(position.y, 0, window.innerHeight),
      downAt: active.downAt,
      delayMs,
      holdMs: Math.max(0, Math.round(upAt - active.downAt))
    };
    state.recordDraft.push(entry);
    state.recordPointers.delete(event.pointerId);
    renderRecordPreview(entry, state.recordDraft.length - 1);
    updateRecordHud();
    updateStatus(
      `記録${state.recordDraft.length}: ${formatDelay(entry.delayMs)} / 保持${entry.holdMs}ms`
    );
    try {
      recordLayer.releasePointerCapture(event.pointerId);
    } catch (_) {}
  }

  recordLayer.addEventListener('pointerup', finishRecordedPointer, { passive: false });
  recordLayer.addEventListener('pointercancel', event => {
    state.recordPointers.delete(event.pointerId);
  });

  async function singleSelectedPoint() {
    if (state.running || state.recording) return;
    const point = selectedPoint();
    if (!point) return;

    state.running = true;
    state.runToken += 1;
    const token = state.runToken;
    updateButtons();
    const result = await executePoint(point, token);
    state.running = false;
    updateButtons();
    updateStatus(result.ok ? `単発: ${result.message}` : result.message);
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
    requestAnimationFrame(() => positionController());
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
  collapseControllerButton.addEventListener('click', () => {
    setControllerCollapsed(true);
  });

  addPointButton.addEventListener('click', () => addPoint());
  deletePointButton.addEventListener('click', deleteSelectedPoint);
  clearPointsButton.addEventListener('click', clearAllPoints);
  singleButton.addEventListener('click', singleSelectedPoint);
  recordButton.addEventListener('click', () => {
    if (state.recording) finishRecording();
    else startRecording();
  });
  startButton.addEventListener('click', startSequence);
  stopButton.addEventListener('click', () => stopSequence());

  finishRecordButton.addEventListener('click', finishRecording);
  cancelRecordButton.addEventListener('click', () => cancelRecording());

  miniRunButton.addEventListener('click', () => {
    if (state.recording) finishRecording();
    else if (state.running) stopSequence();
    else startSequence();
  });

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

  pointHoldInput.addEventListener('change', () => {
    const point = selectedPoint();
    if (!point) return;
    point.holdMs = normalizeHold(pointHoldInput.value, point.holdMs);
    pointHoldInput.value = point.holdMs;
    saveState();
    updateStatus(`地点${pointIndex(point) + 1}: 保持${point.holdMs}ms`);
  });

  [
    methodSelect,
    countInput,
    loopInput,
    randomEnabledInput,
    jitterInput,
    recordModeSelect
  ].forEach(control => control.addEventListener('change', () => {
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

  installDragHandle(controllerDrag);
  installDragHandle(miniGrip, {
    tapAction: () => setControllerCollapsed(false)
  });

  function updateUi() {
    refreshMarkerMetadata();
    updateButtons();
  }

  function destroy() {
    if (state.destroyed) return;
    saveState();
    state.destroyed = true;
    cancelRecording({ announce: false });
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
  applyVisibility();
  updateUi();

  requestAnimationFrame(() => {
    positionController({ useDefaultWhenMissing: true });
  });

  const initialUrl = normalizeUrl(urlInput.value);
  iframe.src = initialUrl || 'about:blank';
  if (!initialUrl) urlInput.focus();

  window[GLOBAL_KEY] = {
    destroy,
    save: saveState,
    stop: stopSequence,
    record: startRecording
  };

  if (typeof completion === 'function') {
    completion({ ok: true, installed: true, version: 4 });
  }
})();
