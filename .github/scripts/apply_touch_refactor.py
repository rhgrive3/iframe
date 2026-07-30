from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
source_path = ROOT / "a.js"
source = source_path.read_text(encoding="utf-8")

def replace_exact(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    source = source.replace(old, new, 1)

replace_exact("  const APP_VERSION = 19;", "  const APP_VERSION = 20;", "APP_VERSION")

old_touch_core = """  const TOUCH_VISIBLE_LATENCY_MS = Object.freeze({ mean: 130, stdDev: 20, min: 80, max: 250 });
  const TOUCH_HOLD_LATENCY_MS = Object.freeze({ mean: 95, stdDev: 15, min: 50, max: 180 });
  const TOUCH_START_STDDEV_RATIO_MIN = 0.12;
  const TOUCH_START_STDDEV_RATIO_MAX = 0.15;
  const TOUCH_DRIFT_STDDEV_RATIO = 0.012;
  const TOUCH_DRIFT_STDDEV_MIN_PX = 0.35;
  const TOUCH_DRIFT_STDDEV_MAX_PX = 3;
  const SCROLL_SPEED_MIN_PX_PER_SEC = 900;
  const SCROLL_SPEED_MAX_PX_PER_SEC = 1800;

  function sampleClampedNormalMs({ mean, stdDev, min, max }, random = Math.random) {
    const meanValue = Number(mean);
    const stdDevValue = Number(stdDev);
    const minValue = Number(min);
    const maxValue = Number(max);
    if (![meanValue, stdDevValue, minValue, maxValue].every(Number.isFinite)
      || stdDevValue < 0
      || maxValue < minValue) {
      throw new FlowError('正規分布レイテンシのパラメータが不正です', 'INVALID_NORMAL_LATENCY');
    }
    return Math.round(clamp(
      (sampleStandardNormal(random) * stdDevValue) + meanValue,
      minValue,
      maxValue
    ));
  }

  function sampleStandardNormal(random = Math.random) {
    const u1 = Math.max(Number.MIN_VALUE, 1 - random());
    const u2 = 1 - random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

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
    const accepted = target.dispatchEvent(event);
    if (!accepted || event.defaultPrevented) {
      throw new FlowError(`${type}が対象側でキャンセルされました`, 'TOUCH_EVENT_CANCELED');
    }
    return event;
  }
"""

new_touch_core = """  const TOUCH_VISIBLE_LATENCY_MS = Object.freeze({ mean: 130, stdDev: 20, min: 80, max: 250 });
  const TOUCH_HOLD_LATENCY_MS = Object.freeze({ mean: 95, stdDev: 15, min: 50, max: 180 });
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
  const TOUCH_MOVE_MAX_COUNT = 4;
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

  function dispatchSyntheticTouch(win, target, type, touch, active, { allowCanceled = false } = {}) {
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
    const accepted = target.dispatchEvent(event);
    if ((!accepted || event.defaultPrevented) && !allowCanceled) {
      throw new FlowError(`${type}が対象側でキャンセルされました`, 'TOUCH_EVENT_CANCELED');
    }
    return event;
  }
"""
replace_exact(old_touch_core, new_touch_core, "touch core")

old_scroll = """  async function animatePhysicalScroll(win, scroller, destination, signal) {
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
"""

new_scroll = """  function quadraticBezierScalar(p0, p1, p2, progress) {
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
      dispatchSyntheticTouch(win, dispatchTarget, 'touchstart', startTouch, true, { allowCanceled: true });
      touchActive = true;
      const startedAt = highResolutionNow(win);
      while (true) {
        const now = await nextAnimationFrame(win, signal);
        const elapsedProgress = Math.min(1, Math.max(0, (now - startedAt) / duration));
        const scrollProgress = integrateScrollVelocity(elapsedProgress) / SCROLL_VELOCITY_AREA;
        activePoint = sampleCorrelatedTrajectoryPoint(trajectory, elapsedProgress);
        const moveTouch = createSyntheticTouch(win, dispatchTarget, identifier, activePoint);
        dispatchSyntheticTouch(win, dispatchTarget, 'touchmove', moveTouch, true, { allowCanceled: true });
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
      dispatchSyntheticTouch(win, dispatchTarget, 'touchend', endTouch, false, { allowCanceled: true });
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
          dispatchSyntheticTouch(win, dispatchTarget, 'touchcancel', cancelTouch, false, { allowCanceled: true });
        } catch {}
      }
      throw error;
    }
  }
"""
replace_exact(old_scroll, new_scroll, "physical scroll")

old_point = """  function pointForTarget(target, fractions) {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      throw new FlowError('押下対象の大きさを取得できません', 'TARGET_HAS_NO_AREA');
    }
    const insetX = Math.min(0.01, rect.width / 2);
    const insetY = Math.min(0.01, rect.height / 2);
    return {
      rect,
      x: clamp(rect.left + (rect.width * fractions.x), rect.left + insetX, rect.right - insetX),
      y: clamp(rect.top + (rect.height * fractions.y), rect.top + insetY, rect.bottom - insetY)
    };
  }
"""
new_point = """  function pointForTarget(target, fractions) {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      throw new FlowError('押下対象の大きさを取得できません', 'TARGET_HAS_NO_AREA');
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
"""
replace_exact(old_point, new_point, "pointForTarget")

old_sampling = """  function sampleTouchStartFractions(random = Math.random) {
    const stdDevRatio = randomUniform(
      TOUCH_START_STDDEV_RATIO_MIN,
      TOUCH_START_STDDEV_RATIO_MAX,
      random
    );
    return {
      x: clamp(0.5 + (sampleStandardNormal(random) * stdDevRatio), 0, 1),
      y: clamp(0.5 + (sampleStandardNormal(random) * stdDevRatio), 0, 1)
    };
  }

  function sampleTouchEndPoint(start, rect, random = Math.random) {
    const stdDev = clamp(
      Math.min(rect.width, rect.height) * TOUCH_DRIFT_STDDEV_RATIO,
      TOUCH_DRIFT_STDDEV_MIN_PX,
      TOUCH_DRIFT_STDDEV_MAX_PX
    );
    const insetX = Math.min(0.01, rect.width / 2);
    const insetY = Math.min(0.01, rect.height / 2);
    return {
      x: clamp(start.x + (sampleStandardNormal(random) * stdDev), rect.left + insetX, rect.right - insetX),
      y: clamp(start.y + (sampleStandardNormal(random) * stdDev), rect.top + insetY, rect.bottom - insetY)
    };
  }

  function interpolateTouchPoint(start, end, progress) {
    return {
      x: start.x + ((end.x - start.x) * progress),
      y: start.y + ((end.y - start.y) * progress)
    };
  }
"""
new_sampling = """  function sampleTouchStartFractions(random = Math.random) {
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
    if (distancePx < 1) return 1;
    if (durationMs >= 100) {
      return Math.floor(randomUniform(2, TOUCH_MOVE_MAX_COUNT + 1, random));
    }
    if (distancePx >= 8) {
      return Math.floor(randomUniform(2, 4, random));
    }
    if (durationMs >= 75 || distancePx >= 3) {
      return Math.floor(randomUniform(1, 3, random));
    }
    return 1;
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
"""
replace_exact(old_sampling, new_sampling, "touch sampling")

replace_exact(
    """        await abortableDelay(sampleClampedNormalMs(TOUCH_VISIBLE_LATENCY_MS), signal);
""",
    """        await abortableDelay(sampleTruncatedNormalMs(TOUCH_VISIBLE_LATENCY_MS), signal);
""",
    "visible latency"
)

old_tap_path = """        const holdDuration = sampleClampedNormalMs(TOUCH_HOLD_LATENCY_MS);
        const endPoint = sampleTouchEndPoint(start, start.rect);
        const movement = Math.hypot(endPoint.x - start.x, endPoint.y - start.y);
        if (movement > Number.EPSILON) {
          const moveProgress = randomUniform(0.4, 0.7);
          await abortableDelay(holdDuration * moveProgress, signal);
          const movePoint = interpolateTouchPoint(start, endPoint, moveProgress);
          activePoint = movePoint;
          const moveTouch = createSyntheticTouch(win, dispatchTarget, identifier, movePoint);
          dispatchSyntheticTouch(win, dispatchTarget, 'touchmove', moveTouch, true);
          await abortableDelay(holdDuration * (1 - moveProgress), signal);
        } else {
          await abortableDelay(holdDuration, signal);
        }
        activePoint = endPoint;
        const endTouch = createSyntheticTouch(win, dispatchTarget, identifier, endPoint);
        dispatchSyntheticTouch(win, dispatchTarget, 'touchend', endTouch, false);
"""
new_tap_path = """        const holdDuration = sampleTruncatedNormalMs(TOUCH_HOLD_LATENCY_MS);
        const endPoint = sampleTouchEndPoint(start, start.rect);
        const movement = Math.hypot(endPoint.x - start.x, endPoint.y - start.y);
        const moveCount = determineTouchMoveCount(holdDuration, movement);
        const trajectory = createCorrelatedTrajectory(start, endPoint, start.rect);
        const startedAt = highResolutionNow(win);
        for (let moveIndex = 1; moveIndex <= moveCount; moveIndex++) {
          const moveProgress = moveIndex / (moveCount + 1);
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
"""
replace_exact(old_tap_path, new_tap_path, "tap lifecycle")

source_path.write_text(source, encoding="utf-8")

test_path = ROOT / "test/touch-event-regression.test.mjs"
test_path.write_text(r"""import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../a.js', import.meta.url), 'utf8');

test('script parses', () => assert.doesNotThrow(() => new vm.Script(source)));

test('all internally sampled interaction delays use rejection-sampled truncated normals', () => {
  assert.match(source, /function sampleTruncatedNormal\(/);
  assert.match(source, /TRUNCATED_NORMAL_MAX_ATTEMPTS = 10_000/);
  assert.match(source, /if \(sample >= minValue && sample <= maxValue\) return sample/);
  assert.match(source, /sampleTruncatedNormalMs\(TOUCH_VISIBLE_LATENCY_MS\)/);
  assert.match(source, /sampleTruncatedNormalMs\(TOUCH_HOLD_LATENCY_MS\)/);
  assert.match(source, /sampleTruncatedNormalMs\(TOUCH_SCROLL_SETTLE_LATENCY_MS\)/);
  assert.doesNotMatch(source, /sampleClampedNormalMs/);
});

test('tap start is a session-consistent offset 2D truncated normal without edge clamping', () => {
  assert.match(source, /const TOUCH_SESSION = Object\.freeze/);
  assert.match(source, /rightOffsetX: sampleTruncatedNormal\(TOUCH_SESSION_OFFSET_X_RATIO\)/);
  assert.match(source, /verticalOffsetY: sampleTruncatedNormal\(TOUCH_SESSION_OFFSET_Y_RATIO\)/);
  assert.match(source, /mean: 0\.5 \+ TOUCH_SESSION\.rightOffsetX/);
  assert.match(source, /mean: 0\.5 \+ TOUCH_SESSION\.verticalOffsetY/);
  assert.doesNotMatch(source, /x: clamp\(0\.5/);
  assert.doesNotMatch(source, /y: clamp\(0\.5/);
});

test('optional Touch physical attributes are omitted', () => {
  const start = source.indexOf('function createSyntheticTouch');
  const end = source.indexOf('function dispatchSyntheticTouch', start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(source.slice(start, end), /radiusX|radiusY|rotationAngle|force/);
});

test('tap move count follows duration and distance and uses a noisy quadratic trajectory', () => {
  assert.match(source, /function determineTouchMoveCount\(durationMs, distancePx/);
  assert.match(source, /if \(distancePx < 1\) return 1/);
  assert.match(source, /if \(durationMs >= 100\)/);
  assert.match(source, /TOUCH_MOVE_MAX_COUNT \+ 1/);
  assert.match(source, /function quadraticBezier\(/);
  assert.match(source, /TOUCH_TRAJECTORY_NOISE_CORRELATION/);
  assert.match(source, /await waitForGestureProgress/);
  const move = source.indexOf("dispatchSyntheticTouch(win, dispatchTarget, 'touchmove'");
  const end = source.indexOf("dispatchSyntheticTouch(win, dispatchTarget, 'touchend'");
  assert.ok(move >= 0 && end > move);
});

test('hybrid scroll dispatches touchmove and updates scroll position in the same animation frame', () => {
  const start = source.indexOf('async function animatePhysicalScroll');
  const end = source.indexOf('function pointForTarget', start);
  const block = source.slice(start, end);
  assert.match(block, /dispatchSyntheticTouch\(win, dispatchTarget, 'touchstart'/);
  assert.match(block, /const now = await nextAnimationFrame\(win, signal\)/);
  const move = block.indexOf("dispatchSyntheticTouch(win, dispatchTarget, 'touchmove'");
  const scroll = block.indexOf('setScrollPosition(', move);
  assert.ok(move >= 0 && scroll > move);
  assert.match(block, /scrollVelocityEnvelope/);
  assert.match(block, /Math\.exp\(-5 \* progress\)/);
  assert.match(block, /dispatchSyntheticTouch\(win, dispatchTarget, 'touchend'/);
});

test('TouchEvent lists remain coherent and cancellation is retained', () => {
  assert.match(source, /const activeTouches = active \? \[touch\] : \[\]/);
  assert.match(source, /touches: activeTouches/);
  assert.match(source, /targetTouches: activeTouches/);
  assert.match(source, /changedTouches: \[touch\]/);
  assert.match(source, /'touchcancel'/);
});
""", encoding="utf-8")

for temporary in (
    ROOT / ".github/workflows/apply-touch-refactor.yml",
    Path(__file__),
):
    temporary.unlink(missing_ok=True)
