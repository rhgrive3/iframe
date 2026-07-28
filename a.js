(() => {
  'use strict';

  const ROOT_ID = '__fullscreen_iframe_autoclicker__';
  const GLOBAL_KEY = '__FULLSCREEN_IFRAME_AUTOCLICKER__';
  const STORAGE_KEY = '__fullscreen_iframe_autoclicker_state_v2__';
  const LEGACY_STORAGE_KEY = '__fullscreen_iframe_autoclicker_state_v1__';

  const LEGACY_MARKER_SIZE = 64;
  const MARKER_HIT_SIZE = 46;
  const MARKER_VISUAL_SIZE = 36;
  const DRAG_THRESHOLD_PX = 3;

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
      :host,
      * {
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

      #toolbar {
        position: fixed;
        top: max(8px, env(safe-area-inset-top));
        left: 50%;
        z-index: 100;
        width: min(1100px, calc(100vw - 16px));
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px;
        border: 1px solid rgba(255,255,255,.18);
        border-radius: 14px;
        background: rgba(24,24,28,.88);
        box-shadow: 0 8px 30px rgba(0,0,0,.35);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        color: #fff;
        transition: transform .2s ease;
      }

      #url {
        flex: 1;
        min-width: 80px;
        height: 38px;
        padding: 0 11px;
        border: 1px solid rgba(255,255,255,.16);
        border-radius: 9px;
        outline: none;
        background: rgba(255,255,255,.12);
        color: #fff;
        font-size: 15px;
      }

      #url::placeholder {
        color: rgba(255,255,255,.55);
      }

      button,
      select,
      input[type="number"] {
        height: 38px;
        border: 0;
        border-radius: 9px;
        font: inherit;
      }

      button {
        padding: 0 12px;
        background: rgba(255,255,255,.14);
        color: #fff;
        font-weight: 650;
        cursor: pointer;
        white-space: nowrap;
      }

      button:active {
        transform: scale(.96);
      }

      button:disabled {
        opacity: .4;
      }

      .primary {
        background: #087cff;
      }

      .success {
        background: #19a655;
      }

      .danger {
        background: #e83b34;
      }

      #controlPanel {
        position: fixed;
        left: 50%;
        bottom: max(10px, env(safe-area-inset-bottom));
        z-index: 100;
        width: min(1000px, calc(100vw - 16px));
        transform: translateX(-50%);
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 8px;
        border: 1px solid rgba(255,255,255,.18);
        border-radius: 15px;
        background: rgba(24,24,28,.9);
        box-shadow: 0 8px 30px rgba(0,0,0,.36);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        color: #fff;
      }

      select,
      input[type="number"] {
        padding: 0 8px;
        background: rgba(255,255,255,.13);
        color: #fff;
        outline: none;
      }

      input[type="number"] {
        width: 82px;
      }

      label {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 13px;
        white-space: nowrap;
      }

      #status {
        min-width: 115px;
        max-width: 220px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: rgba(255,255,255,.75);
        font-size: 12px;
      }

      #markerLayer {
        position: fixed;
        inset: 0;
        z-index: 50;
        pointer-events: none;
      }

      .marker {
        position: fixed;
        left: 0;
        top: 0;
        width: 46px;
        height: 46px;
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
        width: 36px;
        height: 36px;
        transform: translate(-50%, -50%);
        border: 3px solid #ff453a;
        border-radius: 50%;
        background: rgba(255,69,58,.13);
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
        pointer-events: none;
      }

      .markerVisual::before {
        width: 12px;
        height: 2px;
      }

      .markerVisual::after {
        width: 2px;
        height: 12px;
      }

      .marker.selected .markerVisual {
        border-color: #32d74b;
        background: rgba(50,215,75,.16);
      }

      .marker.dragging {
        cursor: grabbing;
      }

      .marker.dragging .markerVisual {
        filter: brightness(1.12);
        box-shadow:
          0 0 0 1.5px rgba(255,255,255,.98),
          0 7px 20px rgba(0,0,0,.38);
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
        background: #111;
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        line-height: 18px;
        text-align: center;
        box-shadow: 0 2px 6px rgba(0,0,0,.35);
        pointer-events: none;
      }

      @keyframes markerPulse {
        0% {
          transform: translate(-50%, -50%) scale(1);
        }

        45% {
          transform: translate(-50%, -50%) scale(.72);
          opacity: .68;
        }

        100% {
          transform: translate(-50%, -50%) scale(1);
          opacity: 1;
        }
      }

      @media (max-width: 700px) {
        #toolbar {
          gap: 4px;
        }

        #toolbar button {
          padding: 0 9px;
        }
      }
    </style>

    <iframe
      id="frame"
      allow="fullscreen; autoplay; clipboard-read; clipboard-write"
      referrerpolicy="no-referrer-when-downgrade"
    ></iframe>

    <div id="markerLayer"></div>

    <div id="toolbar">
      <button id="back" title="戻る">←</button>
      <button id="forward" title="進む">→</button>
      <button id="reload" title="再読込">↻</button>

      <input
        id="url"
        type="text"
        placeholder="https://example.com"
        autocomplete="off"
        spellcheck="false"
      >

      <button id="load" class="primary">表示</button>
      <button id="hideToolbar" title="上部バーを隠す">－</button>
      <button id="close" class="danger">×</button>
    </div>

    <div id="controlPanel">
      <button id="addPoint" class="primary">＋ 地点</button>
      <button id="deletePoint">削除</button>
      <button id="single">単発</button>
      <button id="start" class="success">▶ 開始</button>
      <button id="stop" class="danger" disabled>■ 停止</button>

      <label>
        方式
        <select id="method">
          <option value="tap">jQuery tap</option>
          <option value="click">click</option>
          <option value="both">tap＋click</option>
        </select>
      </label>

      <label>
        間隔
        <input
          id="interval"
          type="number"
          min="50"
          max="600000"
          step="50"
          value="1000"
        >
        ms
      </label>

      <label>
        回数
        <input
          id="count"
          type="number"
          min="1"
          max="999999"
          step="1"
          value="1"
        >
      </label>

      <label>
        <input id="loop" type="checkbox">
        無限
      </label>

      <span id="status">地点なし</span>
    </div>
  `;

  const iframe = shadow.getElementById('frame');
  const toolbar = shadow.getElementById('toolbar');
  const markerLayer = shadow.getElementById('markerLayer');

  const urlInput = shadow.getElementById('url');
  const loadButton = shadow.getElementById('load');
  const backButton = shadow.getElementById('back');
  const forwardButton = shadow.getElementById('forward');
  const reloadButton = shadow.getElementById('reload');
  const hideToolbarButton = shadow.getElementById('hideToolbar');
  const closeButton = shadow.getElementById('close');

  const addPointButton = shadow.getElementById('addPoint');
  const deletePointButton = shadow.getElementById('deletePoint');
  const singleButton = shadow.getElementById('single');
  const startButton = shadow.getElementById('start');
  const stopButton = shadow.getElementById('stop');

  const methodSelect = shadow.getElementById('method');
  const intervalInput = shadow.getElementById('interval');
  const countInput = shadow.getElementById('count');
  const loopInput = shadow.getElementById('loop');
  const status = shadow.getElementById('status');

  const state = {
    points: [],
    selectedId: null,
    nextId: 1,
    running: false,
    timer: null,
    sequenceIndex: 0,
    completedCycles: 0,
    toolbarHidden: false,
    destroyed: false
  };

  const cleanupCallbacks = new Set();

  function onCleanup(callback) {
    cleanupCallbacks.add(callback);
    return callback;
  }

  function normalizeUrl(value) {
    const trimmed = String(value || '').trim();

    if (!trimmed) {
      return '';
    }

    if (/^(https?:|about:blank)/i.test(trimmed)) {
      return trimmed;
    }

    return `https://${trimmed}`;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function clampCoordinates(x, y) {
    return {
      x: clamp(
        x,
        0,
        Math.max(0, window.innerWidth - MARKER_HIT_SIZE)
      ),
      y: clamp(
        y,
        0,
        Math.max(0, window.innerHeight - MARKER_HIT_SIZE)
      )
    };
  }

  function clampPoint(point) {
    const next = clampCoordinates(point.x, point.y);
    point.x = next.x;
    point.y = next.y;
  }

  function readSavedState() {
    const read = key => {
      try {
        return JSON.parse(localStorage.getItem(key) || 'null');
      } catch (_) {
        return null;
      }
    };

    const current = read(STORAGE_KEY);

    if (current) {
      return {
        data: current,
        isLegacy: false
      };
    }

    const legacy = read(LEGACY_STORAGE_KEY);

    return legacy
      ? {
          data: legacy,
          isLegacy: true
        }
      : null;
  }

  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 2,
          markerHitSize: MARKER_HIT_SIZE,
          url: urlInput.value,
          points: state.points.map(({ id, x, y }) => ({
            id,
            x,
            y
          })),
          selectedId: state.selectedId,
          nextId: state.nextId,
          method: methodSelect.value,
          interval: intervalInput.value,
          count: countInput.value,
          loop: loopInput.checked
        })
      );
    } catch (error) {
      console.warn('[AutoClicker] 設定保存失敗', error);
    }
  }

  function loadState() {
    const savedState = readSavedState();

    if (!savedState) {
      return;
    }

    const { data: saved, isLegacy } = savedState;

    try {
      if (typeof saved.url === 'string') {
        urlInput.value = saved.url;
      }

      if (Array.isArray(saved.points)) {
        const savedMarkerSize = Number(saved.markerHitSize);
        const sourceMarkerSize = Number.isFinite(savedMarkerSize)
          ? savedMarkerSize
          : isLegacy
            ? LEGACY_MARKER_SIZE
            : MARKER_HIT_SIZE;
        const centerCorrection =
          (sourceMarkerSize - MARKER_HIT_SIZE) / 2;

        state.points = saved.points
          .filter(
            point =>
              Number.isFinite(point.x) &&
              Number.isFinite(point.y)
          )
          .map(point => ({
            id: Number(point.id) || state.nextId++,
            x: point.x + centerCorrection,
            y: point.y + centerCorrection,
            element: null
          }));

        for (const point of state.points) {
          clampPoint(point);
        }
      }

      state.nextId = Math.max(
        Number(saved.nextId) || 1,
        ...state.points.map(point => point.id + 1),
        1
      );

      state.selectedId = state.points.some(
        point => point.id === saved.selectedId
      )
        ? saved.selectedId
        : state.points[0]?.id ?? null;

      if (['tap', 'click', 'both'].includes(saved.method)) {
        methodSelect.value = saved.method;
      }

      if (saved.interval) {
        intervalInput.value = saved.interval;
      }

      if (saved.count) {
        countInput.value = saved.count;
      }

      loopInput.checked = Boolean(saved.loop);

      if (isLegacy) {
        saveState();
      }
    } catch (error) {
      console.warn('[AutoClicker] 設定読込失敗', error);
    }
  }

  function selectedPoint() {
    return (
      state.points.find(
        point => point.id === state.selectedId
      ) || null
    );
  }

  function markerCenter(point) {
    return {
      x: point.x + MARKER_HIT_SIZE / 2,
      y: point.y + MARKER_HIT_SIZE / 2
    };
  }

  function updateStatus(message) {
    status.textContent = message;
  }

  function updateButtons() {
    const hasPoints = state.points.length > 0;
    const hasSelected = Boolean(selectedPoint());

    deletePointButton.disabled = !hasSelected || state.running;
    singleButton.disabled = !hasSelected || state.running;
    startButton.disabled = !hasPoints || state.running;
    stopButton.disabled = !state.running;
    addPointButton.disabled = state.running;
  }

  function selectPoint(id, { persist = true } = {}) {
    state.selectedId = id;

    for (const point of state.points) {
      point.element?.classList.toggle(
        'selected',
        point.id === id
      );
    }

    const index = state.points.findIndex(
      point => point.id === id
    );

    updateStatus(
      index >= 0
        ? `地点 ${index + 1} を選択`
        : '地点なし'
    );

    updateButtons();

    if (persist) {
      saveState();
    }
  }

  function renderPointNumbers() {
    state.points.forEach((point, index) => {
      const number = point.element?.querySelector(
        '.markerNumber'
      );

      if (number) {
        number.textContent = String(index + 1);
      }
    });
  }

  function setMarkerPosition(point) {
    point.element.style.transform =
      `translate3d(${point.x}px, ${point.y}px, 0)`;
  }

  function createMarkerElement(point) {
    const marker = document.createElement('div');
    marker.className = 'marker';
    marker.setAttribute('role', 'button');
    marker.setAttribute('aria-label', `クリック地点 ${point.id}`);

    const visual = document.createElement('div');
    visual.className = 'markerVisual';

    const number = document.createElement('span');
    number.className = 'markerNumber';

    visual.append(number);
    marker.append(visual);
    markerLayer.append(marker);

    point.element = marker;

    const drag = {
      active: false,
      pointerId: null,
      startClientX: 0,
      startClientY: 0,
      startPointX: 0,
      startPointY: 0,
      pendingX: point.x,
      pendingY: point.y,
      moved: false,
      frameId: null
    };

    function flushDragFrame() {
      if (drag.frameId !== null) {
        cancelAnimationFrame(drag.frameId);
        drag.frameId = null;
      }

      point.x = drag.pendingX;
      point.y = drag.pendingY;
      setMarkerPosition(point);
    }

    function scheduleDragFrame() {
      if (drag.frameId !== null) {
        return;
      }

      drag.frameId = requestAnimationFrame(() => {
        drag.frameId = null;
        point.x = drag.pendingX;
        point.y = drag.pendingY;
        setMarkerPosition(point);
      });
    }

    function updateDragFromEvent(event) {
      const coalesced =
        typeof event.getCoalescedEvents === 'function'
          ? event.getCoalescedEvents()
          : null;
      const sample = coalesced?.length
        ? coalesced[coalesced.length - 1]
        : event;

      const deltaX = sample.clientX - drag.startClientX;
      const deltaY = sample.clientY - drag.startClientY;

      if (
        !drag.moved &&
        Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD_PX
      ) {
        drag.moved = true;
      }

      const next = clampCoordinates(
        drag.startPointX + deltaX,
        drag.startPointY + deltaY
      );

      drag.pendingX = next.x;
      drag.pendingY = next.y;
      scheduleDragFrame();
    }

    function finishDrag(event) {
      if (
        !drag.active ||
        event.pointerId !== drag.pointerId
      ) {
        return;
      }

      event.preventDefault?.();
      flushDragFrame();

      drag.active = false;
      drag.pointerId = null;
      marker.classList.remove('dragging');

      try {
        marker.releasePointerCapture(event.pointerId);
      } catch (_) {}

      saveState();
    }

    marker.addEventListener(
      'pointerdown',
      event => {
        if (state.running) {
          return;
        }

        if (
          event.button !== undefined &&
          event.button !== 0
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        selectPoint(point.id, { persist: false });

        drag.active = true;
        drag.pointerId = event.pointerId;
        drag.startClientX = event.clientX;
        drag.startClientY = event.clientY;
        drag.startPointX = point.x;
        drag.startPointY = point.y;
        drag.pendingX = point.x;
        drag.pendingY = point.y;
        drag.moved = false;

        marker.classList.add('dragging');

        try {
          marker.setPointerCapture(event.pointerId);
        } catch (_) {}
      },
      { passive: false }
    );

    marker.addEventListener(
      'pointermove',
      event => {
        if (
          !drag.active ||
          event.pointerId !== drag.pointerId
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        updateDragFromEvent(event);
      },
      { passive: false }
    );

    marker.addEventListener('pointerup', finishDrag, {
      passive: false
    });
    marker.addEventListener('pointercancel', finishDrag, {
      passive: false
    });

    marker.addEventListener('lostpointercapture', event => {
      if (
        drag.active &&
        event.pointerId === drag.pointerId
      ) {
        flushDragFrame();
        drag.active = false;
        drag.pointerId = null;
        marker.classList.remove('dragging');
        saveState();
      }
    });

    setMarkerPosition(point);
    return marker;
  }

  function addPoint(x, y) {
    const offset = state.points.length * 12;

    const point = {
      id: state.nextId++,
      x:
        Number.isFinite(x)
          ? x
          : window.innerWidth / 2 -
            MARKER_HIT_SIZE / 2 +
            offset,
      y:
        Number.isFinite(y)
          ? y
          : window.innerHeight / 2 -
            MARKER_HIT_SIZE / 2 +
            offset,
      element: null
    };

    clampPoint(point);
    state.points.push(point);

    createMarkerElement(point);
    renderPointNumbers();
    selectPoint(point.id);
    saveState();
  }

  function deleteSelectedPoint() {
    const point = selectedPoint();

    if (!point) {
      return;
    }

    const index = state.points.indexOf(point);

    point.element?.remove();
    state.points.splice(index, 1);

    const replacement =
      state.points[index] ||
      state.points[index - 1] ||
      null;

    state.selectedId = replacement?.id ?? null;

    renderPointNumbers();

    if (replacement) {
      selectPoint(replacement.id);
    } else {
      updateStatus('地点なし');
      updateButtons();
      saveState();
    }
  }

  function rebuildMarkers() {
    markerLayer.textContent = '';

    for (const point of state.points) {
      createMarkerElement(point);
    }

    renderPointNumbers();

    if (state.selectedId !== null) {
      selectPoint(state.selectedId, { persist: false });
    } else {
      updateButtons();
    }
  }

  function deepestElementFromPoint(doc, x, y) {
    let element = doc.elementFromPoint(x, y);

    if (!element) {
      return null;
    }

    while (
      element.shadowRoot &&
      typeof element.shadowRoot.elementFromPoint ===
        'function'
    ) {
      const inner = element.shadowRoot.elementFromPoint(x, y);

      if (!inner || inner === element) {
        break;
      }

      element = inner;
    }

    if (element.tagName === 'IFRAME') {
      try {
        const rect = element.getBoundingClientRect();
        const childDocument = element.contentDocument;

        if (childDocument) {
          const innerResult = deepestElementFromPoint(
            childDocument,
            x - rect.left,
            y - rect.top
          );

          if (innerResult) {
            return innerResult;
          }
        }
      } catch (_) {}
    }

    return {
      element,
      document: doc,
      x,
      y
    };
  }

  function targetAtViewportPoint(viewportX, viewportY) {
    const frameRect = iframe.getBoundingClientRect();

    if (
      viewportX < frameRect.left ||
      viewportY < frameRect.top ||
      viewportX > frameRect.right ||
      viewportY > frameRect.bottom
    ) {
      return {
        error: '地点がiframe外'
      };
    }

    try {
      const frameDocument = iframe.contentDocument;

      if (!frameDocument) {
        return {
          error: 'iframe未読込'
        };
      }

      const x = viewportX - frameRect.left;
      const y = viewportY - frameRect.top;

      return (
        deepestElementFromPoint(frameDocument, x, y) || {
          error: '対象なし'
        }
      );
    } catch (_) {
      return {
        error: '別ドメインiframeの内部は操作不可'
      };
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
    const view =
      target.ownerDocument?.defaultView || window;

    const $ = view.jQuery?.fn?.jquery
      ? view.jQuery
      : view.$?.fn?.jquery
        ? view.$
        : null;

    if (!$) {
      return false;
    }

    const event = $.Event('tap', {
      clientX,
      clientY,
      pageX: clientX + (view.scrollX || 0),
      pageY: clientY + (view.scrollY || 0),
      which: 1,
      button: 0
    });

    $(target).trigger(event);
    return true;
  }

  function triggerClick(target, clientX, clientY) {
    const view =
      target.ownerDocument?.defaultView || window;

    try {
      target.focus?.({
        preventScroll: true
      });
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
          pressure: 0.5
        })
      );
    }

    target.dispatchEvent(
      new view.MouseEvent('mousedown', options)
    );

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
      new view.MouseEvent('mouseup', {
        ...options,
        buttons: 0
      })
    );

    if (typeof target.click === 'function') {
      target.click();
    } else {
      target.dispatchEvent(
        new view.MouseEvent('click', {
          ...options,
          buttons: 0
        })
      );
    }
  }

  function elementLabel(element) {
    if (!element) {
      return '対象';
    }

    return String(
      element.getAttribute?.('aria-label') ||
      element.getAttribute?.('title') ||
      element.textContent ||
      element.tagName ||
      '対象'
    )
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 24);
  }

  function animateMarker(point) {
    const marker = point.element;

    if (!marker) {
      return;
    }

    marker.classList.remove('running');
    void marker.offsetWidth;
    marker.classList.add('running');
  }

  function executePoint(point) {
    if (!point) {
      return false;
    }

    const center = markerCenter(point);
    const hit = targetAtViewportPoint(center.x, center.y);

    if (hit.error) {
      updateStatus(hit.error);
      return false;
    }

    const target = chooseClickableTarget(hit.element);

    if (!target) {
      updateStatus('対象なし');
      return false;
    }

    animateMarker(point);

    try {
      const method = methodSelect.value;
      let tapWorked = false;

      if (method === 'tap' || method === 'both') {
        tapWorked = triggerJQueryTap(
          target,
          hit.x,
          hit.y
        );
      }

      if (
        method === 'click' ||
        method === 'both' ||
        (method === 'tap' && !tapWorked)
      ) {
        triggerClick(target, hit.x, hit.y);
      }

      const index = state.points.indexOf(point) + 1;

      updateStatus(
        `地点${index}: ${elementLabel(target)}`
      );

      return true;
    } catch (error) {
      console.error('[Iframe AutoClicker]', error);
      updateStatus('実行失敗');
      return false;
    }
  }

  function getIntervalMs() {
    const value = Number(intervalInput.value);

    if (!Number.isFinite(value)) {
      return 1000;
    }

    return clamp(Math.floor(value), 50, 600000);
  }

  function getCycleCount() {
    const value = Number(countInput.value);

    if (!Number.isFinite(value)) {
      return 1;
    }

    return clamp(Math.floor(value), 1, 999999);
  }

  function stopSequence(message = '停止') {
    state.running = false;

    if (state.timer !== null) {
      clearTimeout(state.timer);
      state.timer = null;
    }

    state.sequenceIndex = 0;
    state.completedCycles = 0;

    updateButtons();
    updateStatus(message);
  }

  function scheduleNext() {
    if (!state.running) {
      return;
    }

    if (state.points.length === 0) {
      stopSequence('地点なし');
      return;
    }

    const point = state.points[state.sequenceIndex];
    executePoint(point);

    state.sequenceIndex += 1;

    if (state.sequenceIndex >= state.points.length) {
      state.sequenceIndex = 0;
      state.completedCycles += 1;

      if (
        !loopInput.checked &&
        state.completedCycles >= getCycleCount()
      ) {
        stopSequence(`${state.completedCycles}回完了`);
        return;
      }
    }

    state.timer = setTimeout(
      scheduleNext,
      getIntervalMs()
    );
  }

  function startSequence() {
    if (
      state.running ||
      state.points.length === 0
    ) {
      return;
    }

    state.running = true;
    state.sequenceIndex = 0;
    state.completedCycles = 0;

    saveState();
    updateButtons();
    updateStatus('実行中');

    scheduleNext();
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

  function handleResize() {
    for (const point of state.points) {
      clampPoint(point);
      setMarkerPosition(point);
    }

    saveState();
  }

  function destroy() {
    if (state.destroyed) {
      return;
    }

    state.destroyed = true;
    stopSequence();

    for (const callback of cleanupCallbacks) {
      try {
        callback();
      } catch (_) {}
    }

    cleanupCallbacks.clear();
    root.remove();

    if (window[GLOBAL_KEY]?.root === root) {
      delete window[GLOBAL_KEY];
    }
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
      saveState();
      updateStatus('読込完了');
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

  hideToolbarButton.addEventListener('click', () => {
    state.toolbarHidden = !state.toolbarHidden;

    toolbar.style.transform = state.toolbarHidden
      ? 'translate(-50%, calc(-100% - 18px))'
      : 'translateX(-50%)';

    hideToolbarButton.textContent =
      state.toolbarHidden ? '＋' : '－';
  });

  addPointButton.addEventListener('click', () => addPoint());
  deletePointButton.addEventListener(
    'click',
    deleteSelectedPoint
  );
  singleButton.addEventListener('click', () =>
    executePoint(selectedPoint())
  );
  startButton.addEventListener('click', startSequence);
  stopButton.addEventListener('click', () => stopSequence());
  closeButton.addEventListener('click', destroy);

  methodSelect.addEventListener('change', saveState);
  intervalInput.addEventListener('change', saveState);
  countInput.addEventListener('change', saveState);
  loopInput.addEventListener('change', saveState);

  window.addEventListener('resize', handleResize, {
    passive: true
  });
  onCleanup(() =>
    window.removeEventListener('resize', handleResize)
  );

  window.addEventListener('orientationchange', handleResize, {
    passive: true
  });
  onCleanup(() =>
    window.removeEventListener(
      'orientationchange',
      handleResize
    )
  );

  document.documentElement.append(root);

  window[GLOBAL_KEY] = {
    root,
    destroy
  };

  loadState();
  rebuildMarkers();

  if (state.points.length === 0) {
    addPoint();
  }

  updateButtons();

  if (urlInput.value) {
    iframe.src = normalizeUrl(urlInput.value);
  } else {
    iframe.src = 'about:blank';
    urlInput.focus();
  }
})();
