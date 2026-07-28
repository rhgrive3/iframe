(() => {
  'use strict';

  const ROOT_ID = '__fullscreen_iframe_autoclicker__';
  const STORAGE_KEY = '__fullscreen_iframe_autoclicker_state_v1__';

  const existing = document.getElementById(ROOT_ID);

  if (existing) {
    existing.remove();
    return;
  }

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
        width: 64px;
        height: 64px;
        border: 4px solid #ff453a;
        border-radius: 50%;
        background: rgba(255,69,58,.12);
        box-shadow:
          0 0 0 2px rgba(255,255,255,.95),
          0 7px 24px rgba(0,0,0,.32);
        transform: translate3d(0,0,0);
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        cursor: grab;
        pointer-events: auto;
        will-change: transform;
      }

      .marker::before,
      .marker::after {
        content: '';
        position: absolute;
        left: 50%;
        top: 50%;
        border-radius: 2px;
        background: #fff;
        transform: translate(-50%, -50%);
        pointer-events: none;
      }

      .marker::before {
        width: 18px;
        height: 2px;
      }

      .marker::after {
        width: 2px;
        height: 18px;
      }

      .marker.selected {
        border-color: #32d74b;
        background: rgba(50,215,75,.15);
      }

      .marker.running {
        animation: pulse .28s ease-out;
      }

      .marker.dragging {
        cursor: grabbing;
        scale: 1.08;
      }

      .markerNumber {
        position: absolute;
        right: -7px;
        top: -8px;
        min-width: 24px;
        height: 24px;
        padding: 0 6px;
        border-radius: 12px;
        background: #111;
        color: #fff;
        font-size: 12px;
        line-height: 24px;
        text-align: center;
        box-shadow: 0 2px 8px rgba(0,0,0,.35);
        pointer-events: none;
      }

      @keyframes pulse {
        0% {
          scale: 1;
        }

        45% {
          scale: .72;
          opacity: .65;
        }

        100% {
          scale: 1;
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

        .optionalText {
          display: none;
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

      <button id="load" class="primary">
        表示
      </button>

      <button id="hideToolbar" title="上部バーを隠す">
        －
      </button>

      <button id="close" class="danger">
        ×
      </button>
    </div>

    <div id="controlPanel">
      <button id="addPoint" class="primary">
        ＋ 地点
      </button>

      <button id="deletePoint">
        削除
      </button>

      <button id="single">
        単発
      </button>

      <button id="start" class="success">
        ▶ 開始
      </button>

      <button id="stop" class="danger" disabled>
        ■ 停止
      </button>

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
  const controlPanel = shadow.getElementById('controlPanel');

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

  const MARKER_SIZE = 64;

  const state = {
    points: [],
    selectedId: null,
    nextId: 1,
    running: false,
    timer: null,
    sequenceIndex: 0,
    completedCycles: 0,
    toolbarHidden: false
  };

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

  function clampPoint(point) {
    point.x = clamp(
      point.x,
      0,
      Math.max(0, window.innerWidth - MARKER_SIZE)
    );

    point.y = clamp(
      point.y,
      0,
      Math.max(0, window.innerHeight - MARKER_SIZE)
    );
  }

  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
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
    try {
      const saved = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || 'null'
      );

      if (!saved) {
        return;
      }

      if (typeof saved.url === 'string') {
        urlInput.value = saved.url;
      }

      if (Array.isArray(saved.points)) {
        state.points = saved.points
          .filter(
            point =>
              Number.isFinite(point.x) &&
              Number.isFinite(point.y)
          )
          .map(point => ({
            id: Number(point.id) || state.nextId++,
            x: point.x,
            y: point.y,
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

      state.selectedId =
        state.points.some(point => point.id === saved.selectedId)
          ? saved.selectedId
          : state.points[0]?.id ?? null;

      if (
        ['tap', 'click', 'both'].includes(saved.method)
      ) {
        methodSelect.value = saved.method;
      }

      if (saved.interval) {
        intervalInput.value = saved.interval;
      }

      if (saved.count) {
        countInput.value = saved.count;
      }

      loopInput.checked = Boolean(saved.loop);
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
      x: point.x + MARKER_SIZE / 2,
      y: point.y + MARKER_SIZE / 2
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

  function selectPoint(id) {
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
    saveState();
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

  function createMarkerElement(point) {
    const marker = document.createElement('div');
    marker.className = 'marker';

    const number = document.createElement('span');
    number.className = 'markerNumber';

    marker.append(number);
    markerLayer.append(marker);

    point.element = marker;

    function render() {
      marker.style.transform =
        `translate3d(${point.x}px, ${point.y}px, 0)`;
    }

    const drag = {
      active: false,
      pointerId: null,
      offsetX: 0,
      offsetY: 0
    };

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

        selectPoint(point.id);

        drag.active = true;
        drag.pointerId = event.pointerId;
        drag.offsetX = event.clientX - point.x;
        drag.offsetY = event.clientY - point.y;

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

        point.x = event.clientX - drag.offsetX;
        point.y = event.clientY - drag.offsetY;

        clampPoint(point);
        render();
      },
      { passive: false }
    );

    const finishDrag = event => {
      if (
        !drag.active ||
        event.pointerId !== drag.pointerId
      ) {
        return;
      }

      drag.active = false;
      drag.pointerId = null;

      marker.classList.remove('dragging');

      try {
        marker.releasePointerCapture(event.pointerId);
      } catch (_) {}

      saveState();
    };

    marker.addEventListener('pointerup', finishDrag);
    marker.addEventListener('pointercancel', finishDrag);

    marker.addEventListener('click', event => {
      event.stopPropagation();
      selectPoint(point.id);
    });

    render();
    return marker;
  }

  function addPoint(x, y) {
    const offset = state.points.length * 14;

    const point = {
      id: state.nextId++,
      x:
        Number.isFinite(x)
          ? x
          : window.innerWidth / 2 -
            MARKER_SIZE / 2 +
            offset,
      y:
        Number.isFinite(y)
          ? y
          : window.innerHeight / 2 -
            MARKER_SIZE / 2 +
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
      selectPoint(state.selectedId);
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
      const inner =
        element.shadowRoot.elementFromPoint(x, y);

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
        deepestElementFromPoint(
          frameDocument,
          x,
          y
        ) || {
          error: '対象なし'
        }
      );
    } catch (error) {
      return {
        error:
          '別ドメインiframeの内部は操作不可'
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

  function triggerJQueryTap(
    target,
    clientX,
    clientY
  ) {
    const view =
      target.ownerDocument?.defaultView || window;

    const $ =
      view.jQuery?.fn?.jquery
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

  function triggerClick(
    target,
    clientX,
    clientY
  ) {
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
    const hit = targetAtViewportPoint(
      center.x,
      center.y
    );

    if (hit.error) {
      updateStatus(hit.error);
      return false;
    }

    const target = chooseClickableTarget(
      hit.element
    );

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
        triggerClick(
          target,
          hit.x,
          hit.y
        );
      }

      const index =
        state.points.indexOf(point) + 1;

      updateStatus(
        `地点${index}: ${elementLabel(target)}`
      );

      return true;
    } catch (error) {
      console.error(
        '[Iframe AutoClicker]',
        error
      );

      updateStatus('実行失敗');
      return false;
    }
  }

  function getIntervalMs() {
    const value = Number(intervalInput.value);

    if (!Number.isFinite(value)) {
      return 1000;
    }

    return clamp(
      Math.floor(value),
      50,
      600000
    );
  }

  function getCycleCount() {
    const value = Number(countInput.value);

    if (!Number.isFinite(value)) {
      return 1;
    }

    return clamp(
      Math.floor(value),
      1,
      999999
    );
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

    const point =
      state.points[state.sequenceIndex];

    executePoint(point);

    state.sequenceIndex += 1;

    if (
      state.sequenceIndex >= state.points.length
    ) {
      state.sequenceIndex = 0;
      state.completedCycles += 1;

      if (
        !loopInput.checked &&
        state.completedCycles >= getCycleCount()
      ) {
        stopSequence(
          `${state.completedCycles}回完了`
        );
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

  loadButton.addEventListener(
    'click',
    loadUrl
  );

  urlInput.addEventListener(
    'keydown',
    event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        loadUrl();
      }
    }
  );

  iframe.addEventListener('load', () => {
    try {
      urlInput.value =
        iframe.contentWindow.location.href;
      saveState();
      updateStatus('読込完了');
    } catch (_) {
      updateStatus(
        '読込完了・別ドメイン'
      );
    }
  });

  backButton.addEventListener('click', () => {
    try {
      iframe.contentWindow.history.back();
    } catch (_) {
      updateStatus('戻る操作不可');
    }
  });

  forwardButton.addEventListener(
    'click',
    () => {
      try {
        iframe.contentWindow.history.forward();
      } catch (_) {
        updateStatus('進む操作不可');
      }
    }
  );

  reloadButton.addEventListener(
    'click',
    () => {
      try {
        iframe.contentWindow.location.reload();
      } catch (_) {
        iframe.src = iframe.src;
      }
    }
  );

  hideToolbarButton.addEventListener(
    'click',
    () => {
      state.toolbarHidden =
        !state.toolbarHidden;

      toolbar.style.transform =
        state.toolbarHidden
          ? 'translate(-50%, calc(-100% - 18px))'
          : 'translateX(-50%)';

      hideToolbarButton.textContent =
        state.toolbarHidden ? '＋' : '－';
    }
  );

  addPointButton.addEventListener(
    'click',
    () => addPoint()
  );

  deletePointButton.addEventListener(
    'click',
    deleteSelectedPoint
  );

  singleButton.addEventListener(
    'click',
    () => executePoint(selectedPoint())
  );

  startButton.addEventListener(
    'click',
    startSequence
  );

  stopButton.addEventListener(
    'click',
    () => stopSequence()
  );

  closeButton.addEventListener(
    'click',
    () => {
      stopSequence();
      root.remove();
    }
  );

  methodSelect.addEventListener(
    'change',
    saveState
  );

  intervalInput.addEventListener(
    'change',
    saveState
  );

  countInput.addEventListener(
    'change',
    saveState
  );

  loopInput.addEventListener(
    'change',
    saveState
  );

  window.addEventListener(
    'resize',
    () => {
      for (const point of state.points) {
        clampPoint(point);

        point.element.style.transform =
          `translate3d(${point.x}px, ${point.y}px, 0)`;
      }

      saveState();
    },
    { passive: true }
  );

  document.documentElement.append(root);

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
