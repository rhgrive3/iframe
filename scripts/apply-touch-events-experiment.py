from pathlib import Path
import re

SOURCE_PATH = Path("a.js")
TEST_PATH = Path("test/touch-event-regression.test.mjs")

source = SOURCE_PATH.read_text(encoding="utf-8")

old_version = "  const APP_VERSION = 15;"
new_version = "  const APP_VERSION = 16;"
if old_version not in source:
    raise SystemExit("APP_VERSION 15 marker not found")
source = source.replace(old_version, new_version, 1)

pattern = re.compile(
    r"  async function jqTapStrict\(target, \{ signal, label: targetLabel = '対象' \} = \{\}\) \{.*?\n  \}\n\n  function randomUniform\(min, max\) \{",
    re.S,
)

replacement = r'''  const TOUCH_VISIBLE_WAIT_MIN_MS = 98;
  const TOUCH_VISIBLE_WAIT_MAX_MS = 150;
  const TOUCH_HOLD_MIN_MS = 65;
  const TOUCH_HOLD_MAX_MS = 115;
  const TOUCH_END_MAX_DRIFT_PX = 5;
  const SCROLL_SPEED_MIN_PX_PER_SEC = 900;
  const SCROLL_SPEED_MAX_PX_PER_SEC = 1800;

  function makeTouchList(items) {
    const list = [...items];
    Object.defineProperty(list, 'item', {
      configurable: true,
      value(index) { return list[index] ?? null; }
    });
    return list;
  }

  function createSyntheticTouch(win, target, identifier, point) {
    const init = {
      identifier,
      target,
      clientX: point.x,
      clientY: point.y,
      screenX: point.x + finite(win.screenX, 0),
      screenY: point.y + finite(win.screenY, 0),
      pageX: point.x + finite(win.scrollX, 0),
      pageY: point.y + finite(win.scrollY, 0),
      radiusX: randomUniform(1.2, 2.8),
      radiusY: randomUniform(1.2, 2.8),
      rotationAngle: randomUniform(-8, 8),
      force: randomUniform(0.35, 0.75)
    };
    if (typeof win.Touch === 'function') {
      try { return new win.Touch(init); } catch {}
    }
    return Object.freeze(init);
  }

  function dispatchSyntheticTouch(win, target, type, touch, active) {
    const activeTouches = makeTouchList(active ? [touch] : []);
    const changedTouches = makeTouchList([touch]);
    let event = null;
    if (typeof win.TouchEvent === 'function') {
      try {
        event = new win.TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          touches: activeTouches,
          targetTouches: activeTouches,
          changedTouches
        });
      } catch {}
    }
    if (!event) {
      event = new win.Event(type, { bubbles: true, cancelable: true, composed: true });
      Object.defineProperties(event, {
        touches: { configurable: true, value: activeTouches },
        targetTouches: { configurable: true, value: activeTouches },
        changedTouches: { configurable: true, value: changedTouches }
      });
    }
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

  async function animatePhysicalScroll(win, scroller, destination, signal) {
    const start = scrollPosition(win, scroller);
    const max = maxScrollPosition(win, scroller);
    const end = {
      x: clamp(destination.x, 0, max.x),
      y: clamp(destination.y, 0, max.y)
    };
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    if (distance < 1) return false;
    const speed = randomUniform(SCROLL_SPEED_MIN_PX_PER_SEC, SCROLL_SPEED_MAX_PX_PER_SEC);
    const duration = clamp((distance / speed) * 1000, 140, 900);
    const jitterAmplitude = randomUniform(0.15, Math.min(1.25, Math.max(0.15, distance * 0.01)));
    const startedAt = await nextAnimationFrame(win, signal);
    while (true) {
      const now = await nextAnimationFrame(win, signal);
      const progress = clamp((now - startedAt) / duration, 0, 1);
      const eased = 1 - ((1 - progress) ** 3);
      const fade = 1 - progress;
      const jitter = Math.sin(progress * Math.PI * 6) * jitterAmplitude * fade;
      setScrollPosition(
        win,
        scroller,
        start.x + ((end.x - start.x) * eased),
        start.y + ((end.y - start.y) * eased) + jitter
      );
      if (progress >= 1) break;
    }
    setScrollPosition(win, scroller, end.x, end.y);
    return true;
  }

  function pointForTarget(target, fractions) {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      throw new FlowError('押下対象の大きさを取得できません', 'TARGET_HAS_NO_AREA');
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

  function randomEndPoint(start, rect) {
    const angle = randomUniform(0, Math.PI * 2);
    const radius = Math.sqrt(Math.random()) * TOUCH_END_MAX_DRIFT_PX;
    const epsilon = 0.01;
    return {
      x: clamp(start.x + (Math.cos(angle) * radius), rect.left + epsilon, rect.right - epsilon),
      y: clamp(start.y + (Math.sin(angle) * radius), rect.top + epsilon, rect.bottom - epsilon)
    };
  }

  async function jqTapStrict(target, { signal, label: targetLabel = '対象' } = {}) {
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
        const fractions = { x: Math.random(), y: Math.random() };
        let start = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          await ensureTargetPointVisible(target, fractions, { signal });
          await abortableDelay(randomUniform(TOUCH_VISIBLE_WAIT_MIN_MS, TOUCH_VISIBLE_WAIT_MAX_MS), signal);
          if (!target.isConnected || target.ownerDocument?.defaultView !== frameWindow()) {
            throw new FlowError(`${targetLabel}が押下直前に無効になりました`, 'STALE_TARGET');
          }
          const checked = await ensureTargetPointVisible(target, fractions, { signal });
          if (!checked.scrolled) {
            start = checked;
            break;
          }
        }
        if (!start) throw new FlowError(`${targetLabel}の表示位置が安定しません`, 'TARGET_UNSTABLE');
        const hit = target.ownerDocument.elementFromPoint(start.x, start.y);
        if (!hit || (hit !== target && !target.contains(hit))) {
          throw new FlowError(`${targetLabel}のランダム座標が他要素に遮られています`, 'TARGET_OCCLUDED');
        }
        dispatchTarget = hit;
        identifier = Math.floor(randomUniform(1, 2_147_483_647));
        activePoint = start;
        const startTouch = createSyntheticTouch(win, dispatchTarget, identifier, start);
        dispatchSyntheticTouch(win, dispatchTarget, 'touchstart', startTouch, true);
        touchActive = true;
        await abortableDelay(randomUniform(TOUCH_HOLD_MIN_MS, TOUCH_HOLD_MAX_MS), signal);
        const endPoint = randomEndPoint(start, start.rect);
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

  function randomUniform(min, max) {'''

source, count = pattern.subn(replacement, source, count=1)
if count != 1:
    raise SystemExit(f"jqTapStrict replacement count was {count}, expected 1")
if ".trigger('tap')" in source or '.trigger("tap")' in source:
    raise SystemExit("jQuery tap trigger remains after replacement")

SOURCE_PATH.write_text(source, encoding="utf-8")

TEST_PATH.parent.mkdir(parents=True, exist_ok=True)
TEST_PATH.write_text(
    """import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../a.js', import.meta.url), 'utf8');

test('distribution script parses', () => {
  assert.doesNotThrow(() => new vm.Script(source));
});

test('tap path uses touchstart and touchend without jQuery tap', () => {
  assert.match(source, /dispatchSyntheticTouch\\(win, dispatchTarget, 'touchstart'/);
  assert.match(source, /dispatchSyntheticTouch\\(win, dispatchTarget, 'touchend'/);
  assert.doesNotMatch(source, /\\.trigger\\(['\"]tap['\"]\\)/);
});

test('start point, hold, visible delay, and end drift are randomized', () => {
  assert.match(source, /TOUCH_VISIBLE_WAIT_MIN_MS = 98/);
  assert.match(source, /TOUCH_VISIBLE_WAIT_MAX_MS = 150/);
  assert.match(source, /TOUCH_HOLD_MIN_MS = 65/);
  assert.match(source, /TOUCH_HOLD_MAX_MS = 115/);
  assert.match(source, /TOUCH_END_MAX_DRIFT_PX = 5/);
  assert.match(source, /fractions = \\{ x: Math\\.random\\(\\), y: Math\\.random\\(\\) \\}/);
  assert.match(source, /Math\\.sqrt\\(Math\\.random\\(\\)\\)/);
});

test('offscreen targets use randomized animated scrolling', () => {
  assert.match(source, /function scrollableAncestors\\(/);
  assert.match(source, /async function animatePhysicalScroll\\(/);
  assert.match(source, /SCROLL_SPEED_MIN_PX_PER_SEC = 900/);
  assert.match(source, /SCROLL_SPEED_MAX_PX_PER_SEC = 1800/);
  assert.match(source, /await ensureTargetPointVisible\\(target, fractions/);
});

test('an interrupted touch is cancelled cleanly', () => {
  assert.match(source, /dispatchSyntheticTouch\\(win, dispatchTarget, 'touchcancel'/);
});
""",
    encoding="utf-8",
)
