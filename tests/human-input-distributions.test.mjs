import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createFunctionExtractor } from './source-extract.mjs';

const source = readFileSync(new URL('../a.js', import.meta.url), 'utf8');
const extractFunction = createFunctionExtractor(source);

// `const NAME = <expression>;` を、括弧の対応を数えながら丸ごと取り出す。
function extractConst(name) {
  const token = `\n  const ${name} = `;
  const start = source.indexOf(token);
  assert.ok(start >= 0, `missing production constant: ${name}`);
  let depth = 0;
  for (let index = start + token.length; index < source.length; index++) {
    const char = source[index];
    if (char === '(' || char === '{' || char === '[') depth += 1;
    else if (char === ')' || char === '}' || char === ']') depth -= 1;
    else if (char === ';' && depth === 0) return source.slice(start + 1, index + 1);
  }
  assert.fail(`unterminated production constant: ${name}`);
}

const CONSTANTS = [
  'TRUNCATED_NORMAL_MAX_ATTEMPTS',
  'TOUCH_VISIBLE_LATENCY_MS',
  'TOUCH_FAST_VISIBLE_LATENCY_MS',
  'TOUCH_HANDOFF_VISIBLE_LATENCY_MS',
  'TOUCH_HOLD_LATENCY_MS',
  'TOUCH_FAST_HOLD_LATENCY_MS',
  'TOUCH_HANDOFF_HOLD_LATENCY_MS',
  'TOUCH_SCROLL_SETTLE_LATENCY_MS',
  'TOUCH_SCROLL_INERTIA_LATENCY_MS',
  'TOUCH_START_STDDEV_RATIO',
  'TOUCH_SESSION_OFFSET_X_RATIO',
  'TOUCH_SESSION_OFFSET_Y_RATIO',
  'CENTERED_UNIT_STDDEV',
  'CENTERED_UNIT_TAU',
  'CENTERED_UNIT_CENTER',
  'TEMPO_AR_PHI',
  'TEMPO_AR_STATIONARY_STDDEV',
  'TOUCH_SESSION_DRIFT_TIME_CONSTANT_MS',
  'TOUCH_FITTS_SLOPE_MS',
  'TOUCH_FITTS_MAX_ADD_MS',
  'TOUCH_FITTS_REPEAT_DISTANCE_PX',
  'TOUCH_FITTS_REPEAT_MEAN_SCALE',
  'TOUCH_FITTS_BASELINE_SMOOTHING',
  'TOUCH_FITTS_CENTERED_LIMIT_MS',
  'GESTURE_PHASE_OFFSET_SPAN_MS',
  'GESTURE_FRAME_GUARD_MIN_MS',
  'GESTURE_FRAME_GUARD_MAX_MS',
  'TOUCH_HOLD_REFERENCE_SHORT_SIDE_PX',
  'TOUCH_HOLD_SIZE_SCALE_RANGE',
  'MINIMUM_RUNTIME_JITTER_RATIO',
  'HUMAN_PACING_LEVELS',
  'DEFAULT_HUMAN_PACING',
  'HUMAN_PACING_PROFILES',
  'HUMAN_PACING_FATIGUE_MAX'
];

const FUNCTIONS = [
  'sampleStandardNormal',
  'sampleStandardExponential',
  'sampleTruncatedNormal',
  'sampleTruncatedNormalMs',
  'sampleExGaussian',
  'sampleExGaussianMs',
  'scaleLatencyConfig',
  'shiftLatencyMean',
  'sampleCenteredUnitInterval',
  'sampleCenteredRange',
  'sampleSymmetricJitter',
  'advanceLogTempoState',
  'logTempoMultiplier',
  'advanceOrnsteinUhlenbeck',
  'fittsLatencyProfile',
  'nextFittsBaseline',
  'holdDurationSizeScale',
  'sampleGesturePhaseOffsetMs',
  'sampleGestureFrameGuardMs',
  'humanPacingProfile',
  'sampleMacroBoundaryPauseMs',
  'legacyJitterOffset',
  'normalizeHumanPacing'
];

const prelude = `
  class FlowError extends Error {
    constructor(message, code) { super(message); this.code = code; }
  }
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
`;

const sandbox = new Function(`
  'use strict';
  ${prelude}
  ${CONSTANTS.map(extractConst).join('\n')}
  ${FUNCTIONS.map(extractFunction).join('\n')}
  return { FlowError, ${CONSTANTS.join(', ')}, ${FUNCTIONS.join(', ')} };
`)();

// seed 固定の擬似乱数。決定論的に同じ系列を返す。
function seededRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function moments(values) {
  const count = values.length;
  let mean = 0;
  for (const value of values) mean += value;
  mean /= count;
  let m2 = 0;
  let m3 = 0;
  for (const value of values) {
    const deviation = value - mean;
    m2 += deviation * deviation;
    m3 += deviation * deviation * deviation;
  }
  m2 /= count;
  m3 /= count;
  return { mean, variance: m2, stdDev: Math.sqrt(m2), skewness: m2 === 0 ? 0 : m3 / (m2 ** 1.5) };
}

function sampleMany(draw, count, seed) {
  const random = seededRandom(seed);
  const values = new Array(count);
  for (let index = 0; index < count; index++) values[index] = draw(random);
  return values;
}

function autocorrelation(series, lag = 1) {
  const { mean, variance } = moments(series);
  if (variance === 0) return 0;
  let covariance = 0;
  for (let index = lag; index < series.length; index++) {
    covariance += (series[index] - mean) * (series[index - lag] - mean);
  }
  covariance /= series.length - lag;
  return covariance / variance;
}

// 変更前に使われていた切断正規のパラメータ。ex-Gauss 化しても期待値はここへ戻るべき。
const LEGACY_LATENCY_MS = Object.freeze({
  TOUCH_VISIBLE_LATENCY_MS: { mean: 130, stdDev: 20, min: 80, max: 250 },
  TOUCH_FAST_VISIBLE_LATENCY_MS: { mean: 24, stdDev: 6, min: 12, max: 42 },
  TOUCH_HANDOFF_VISIBLE_LATENCY_MS: { mean: 8, stdDev: 3, min: 2, max: 16 },
  TOUCH_HOLD_LATENCY_MS: { mean: 95, stdDev: 15, min: 50, max: 180 },
  TOUCH_FAST_HOLD_LATENCY_MS: { mean: 55, stdDev: 9, min: 32, max: 85 },
  TOUCH_HANDOFF_HOLD_LATENCY_MS: { mean: 42, stdDev: 7, min: 28, max: 65 },
  TOUCH_SCROLL_SETTLE_LATENCY_MS: { mean: 72, stdDev: 16, min: 36, max: 130 },
  TOUCH_SCROLL_INERTIA_LATENCY_MS: { mean: 180, stdDev: 34, min: 110, max: 290 }
});

// A: ex-Gaussian 化
test('A: ex-Gaussian latencies keep the pre-change expected wait while gaining a right tail', () => {
  for (const [name, legacy] of Object.entries(LEGACY_LATENCY_MS)) {
    const config = sandbox[name];
    const before = moments(sampleMany(
      random => sandbox.sampleTruncatedNormalMs(legacy, random), 120_000, 0x51ee0 + name.length
    ));
    const after = moments(sampleMany(
      random => sandbox.sampleExGaussianMs(config, random), 120_000, 0x51ee1 + name.length
    ));
    // 期待値は据え置き（許容 1.5%）。
    assert.ok(
      Math.abs(after.mean - before.mean) / before.mean < 0.015,
      `${name}: expected wait moved from ${before.mean.toFixed(2)} to ${after.mean.toFixed(2)}`
    );
    // 切断正規はほぼ対称、ex-Gauss は右に歪む。
    assert.ok(before.skewness < 0.35, `${name}: legacy skew ${before.skewness.toFixed(3)}`);
    assert.ok(after.skewness > 0.7, `${name}: ex-Gaussian skew ${after.skewness.toFixed(3)}`);
    // 裾が伸びるぶん分散も増える。
    assert.ok(after.stdDev > before.stdDev, `${name}: spread did not widen`);
    // min/max は守る。
    for (const value of sampleMany(random => sandbox.sampleExGaussianMs(config, random), 5_000, 7)) {
      assert.ok(value >= config.min && value <= config.max, `${name}: ${value} escaped its bounds`);
    }
  }
});

test('A: ex-Gaussian sampling is deterministic under a fixed seed and validates its parameters', () => {
  const first = sampleMany(random => sandbox.sampleExGaussian(sandbox.TOUCH_HOLD_LATENCY_MS, random), 64, 99);
  const second = sampleMany(random => sandbox.sampleExGaussian(sandbox.TOUCH_HOLD_LATENCY_MS, random), 64, 99);
  assert.deepEqual(first, second);
  assert.throws(
    () => sandbox.sampleExGaussian({ mean: 10, stdDev: 1, tau: -1, min: 0, max: 20 }, seededRandom(1)),
    error => error.code === 'INVALID_EX_GAUSSIAN'
  );
  assert.throws(
    () => sandbox.sampleExGaussian({ mean: 10, stdDev: 1, tau: 1, min: 30, max: 20 }, seededRandom(1)),
    error => error.code === 'INVALID_EX_GAUSSIAN'
  );
  assert.equal(sandbox.sampleExGaussian({ mean: 12, stdDev: 0, tau: 0, min: 0, max: 20 }, seededRandom(1)), 12);
});

test('A: latency multipliers scale the whole distribution so truncation cannot bias the mean', () => {
  const scaled = sandbox.scaleLatencyConfig(sandbox.TOUCH_VISIBLE_LATENCY_MS, 0.75);
  for (const key of ['mean', 'stdDev', 'tau', 'min', 'max']) {
    assert.ok(Math.abs(scaled[key] - (sandbox.TOUCH_VISIBLE_LATENCY_MS[key] * 0.75)) < 1e-9);
  }
  const base = moments(sampleMany(
    random => sandbox.sampleExGaussian(sandbox.TOUCH_VISIBLE_LATENCY_MS, random), 200_000, 4242
  ));
  const shrunk = moments(sampleMany(
    random => sandbox.sampleExGaussian(scaled, random), 200_000, 4242
  ));
  assert.ok(Math.abs((shrunk.mean / base.mean) - 0.75) < 0.01, `ratio ${(shrunk.mean / base.mean).toFixed(4)}`);

  const shifted = sandbox.shiftLatencyMean(sandbox.TOUCH_VISIBLE_LATENCY_MS, 40);
  const moved = moments(sampleMany(random => sandbox.sampleExGaussian(shifted, random), 200_000, 4242));
  assert.ok(Math.abs((moved.mean - base.mean) - 40) < 1.5, `shift ${(moved.mean - base.mean).toFixed(2)}`);
  assert.equal(sandbox.scaleLatencyConfig(sandbox.TOUCH_VISIBLE_LATENCY_MS, 1), sandbox.TOUCH_VISIBLE_LATENCY_MS);
  assert.equal(sandbox.shiftLatencyMean(sandbox.TOUCH_VISIBLE_LATENCY_MS, 0), sandbox.TOUCH_VISIBLE_LATENCY_MS);
});

// B: テンポの自己相関
test('B: the AR(1) tempo multiplier averages to 1 and carries the configured autocorrelation', () => {
  const random = seededRandom(20260807);
  const states = new Array(400_000);
  const multipliers = new Array(400_000);
  let state = 0;
  for (let index = 0; index < states.length; index++) {
    state = sandbox.advanceLogTempoState(state, sandbox.TEMPO_AR_PHI, sandbox.TEMPO_AR_STATIONARY_STDDEV, random);
    states[index] = state;
    multipliers[index] = sandbox.logTempoMultiplier(state, sandbox.TEMPO_AR_STATIONARY_STDDEV);
  }
  const logStats = moments(states);
  const multiplierStats = moments(multipliers);

  // 定常SDは設定どおり、平均は0。
  assert.ok(Math.abs(logStats.mean) < 0.01, `log mean ${logStats.mean.toFixed(4)}`);
  assert.ok(
    Math.abs(logStats.stdDev - sandbox.TEMPO_AR_STATIONARY_STDDEV) < 0.005,
    `log sd ${logStats.stdDev.toFixed(4)}`
  );
  // 乗数の期待値は 1 に正規化されている（待ち時間の期待値を動かさない条件）。
  assert.ok(Math.abs(multiplierStats.mean - 1) < 0.005, `multiplier mean ${multiplierStats.mean.toFixed(5)}`);
  // 1次自己相関は φ。
  assert.ok(
    Math.abs(autocorrelation(states, 1) - sandbox.TEMPO_AR_PHI) < 0.01,
    `lag-1 ${autocorrelation(states, 1).toFixed(4)}`
  );
  // 2次は φ²（AR(1) の形をしている）。
  assert.ok(
    Math.abs(autocorrelation(states, 2) - (sandbox.TEMPO_AR_PHI ** 2)) < 0.015,
    `lag-2 ${autocorrelation(states, 2).toFixed(4)}`
  );
  // 乗数系列そのものも正の自己相関を持つ（独立ではない）。
  assert.ok(autocorrelation(multipliers, 1) > 0.45);
});

test('B: the same tempo state is shared by taps, waitRandomized and randomWait', () => {
  assert.match(source, /const tempoMultiplier = nextTempoMultiplier\(\);/);
  const wait = source.slice(
    source.indexOf('async function waitRandomized'),
    source.indexOf('async function runAssistListTransition')
  );
  assert.match(wait, /nextTempoMultiplier\(\)/);
  const randomWaitStart = source.indexOf("case 'randomWait': {");
  const randomWait = source.slice(randomWaitStart, source.indexOf("case 'watch':", randomWaitStart));
  assert.match(randomWait, /nextTempoMultiplier\(\)/);
  assert.equal((source.match(/^ {2}let logTempoState = 0;$/m) || []).length, 1);
});

// C: セッションバイアスのドリフト
test('C: the session bias drifts as an Ornstein-Uhlenbeck process with the configured stationary spread', () => {
  const config = { mean: 0.03, stdDev: 0.006, min: -10, max: 10 };
  const timeConstant = sandbox.TOUCH_SESSION_DRIFT_TIME_CONSTANT_MS;
  const stepMs = 60_000;
  const random = seededRandom(4711);
  const series = new Array(400_000);
  let value = config.mean;
  for (let index = 0; index < series.length; index++) {
    value = sandbox.advanceOrnsteinUhlenbeck(value, config, stepMs, timeConstant, random);
    series[index] = value;
  }
  const stats = moments(series.slice(1000));
  assert.ok(Math.abs(stats.mean - config.mean) < 0.0005, `mean ${stats.mean.toFixed(6)}`);
  // 定常SDは現行 stdDev と同じ。
  assert.ok(Math.abs(stats.stdDev - config.stdDev) < 0.0003, `sd ${stats.stdDev.toFixed(6)}`);
  // OU の自己相関は exp(-dt/tau)。
  const expected = Math.exp(-stepMs / timeConstant);
  assert.ok(
    Math.abs(autocorrelation(series.slice(1000), 1) - expected) < 0.01,
    `lag-1 ${autocorrelation(series.slice(1000), 1).toFixed(4)} vs ${expected.toFixed(4)}`
  );
  // 歪みはない（OU は正規）。
  assert.ok(Math.abs(stats.skewness) < 0.05);
});

test('C: session drift stays inside the original truncation range and freezes when no time has passed', () => {
  const config = sandbox.TOUCH_SESSION_OFFSET_X_RATIO;
  const random = seededRandom(88);
  let value = config.mean;
  for (let index = 0; index < 50_000; index++) {
    value = sandbox.advanceOrnsteinUhlenbeck(value, config, 30_000, sandbox.TOUCH_SESSION_DRIFT_TIME_CONSTANT_MS, random);
    assert.ok(value >= config.min && value <= config.max, `${value} escaped [${config.min}, ${config.max}]`);
  }
  const frozen = sandbox.advanceOrnsteinUhlenbeck(0.031, config, 0, sandbox.TOUCH_SESSION_DRIFT_TIME_CONSTANT_MS, random);
  assert.equal(frozen, 0.031);
});

// D: Fitts の法則
test('D: Fitts adjustment grows with distance, caps at +250ms and shortens rapid repeats', () => {
  const width = 40;
  const at = distance => sandbox.fittsLatencyProfile({ x: 0, y: 0 }, { x: distance, y: 0 }, width);

  // 初回（直前タップなし）は無調整。
  assert.deepEqual(
    sandbox.fittsLatencyProfile(null, { x: 100, y: 0 }, width),
    { addMs: 0, rawAddMs: null, meanScale: 1, distancePx: null }
  );

  // 連打（D < 8px）は 0.75 倍で、加算はしない。
  const repeat = at(sandbox.TOUCH_FITTS_REPEAT_DISTANCE_PX - 1);
  assert.equal(repeat.meanScale, sandbox.TOUCH_FITTS_REPEAT_MEAN_SCALE);
  assert.equal(repeat.addMs, 0);
  assert.equal(repeat.rawAddMs, null);

  // 距離に対して単調増加。
  let previous = -1;
  for (const distance of [10, 20, 40, 80, 160, 320, 640, 1280, 4000]) {
    const profile = at(distance);
    assert.ok(profile.rawAddMs >= previous, `not monotone at ${distance}px`);
    assert.equal(profile.meanScale, 1);
    previous = profile.rawAddMs;
  }

  // 公式どおり: 55 * log2(2D/W + 1)。
  const checked = at(200);
  assert.ok(Math.abs(checked.rawAddMs - (sandbox.TOUCH_FITTS_SLOPE_MS * Math.log2(((2 * 200) / width) + 1))) < 1e-9);

  // 上限 +250ms。
  assert.equal(at(10_000_000).rawAddMs, sandbox.TOUCH_FITTS_MAX_ADD_MS);
  assert.ok(at(20_000).rawAddMs <= sandbox.TOUCH_FITTS_MAX_ADD_MS);

  // 標的が小さいほど（W が小さいほど）索引は大きい。
  assert.ok(
    sandbox.fittsLatencyProfile({ x: 0, y: 0 }, { x: 200, y: 0 }, 12).rawAddMs
    > sandbox.fittsLatencyProfile({ x: 0, y: 0 }, { x: 200, y: 0 }, 120).rawAddMs
  );

  // baseline を渡すと、その分だけ差し引かれる（相関構造は同じ、位置だけがずれる）。
  const baseline = checked.rawAddMs - 20;
  assert.ok(Math.abs(sandbox.fittsLatencyProfile({ x: 0, y: 0 }, { x: 200, y: 0 }, width, baseline).addMs - 20) < 1e-9);
  // 実効加算量は上下対称に頭打ちする。
  assert.ok(sandbox.TOUCH_FITTS_CENTERED_LIMIT_MS > 0);
  assert.equal(
    sandbox.fittsLatencyProfile({ x: 0, y: 0 }, { x: 200, y: 0 }, width, 0).addMs,
    sandbox.TOUCH_FITTS_CENTERED_LIMIT_MS
  );
});

test('D: the running Fitts baseline keeps the average visible latency where it was', () => {
  const width = 44;
  // 実際に起こりうる移動距離を一様に流し込み、EMA が生の加算量の平均へ収束することを見る。
  const random = seededRandom(31415);
  const distances = new Array(4000);
  for (let index = 0; index < distances.length; index++) distances[index] = 20 + (random() * 500);
  const raw = distances.map(distance => Math.min(
    sandbox.TOUCH_FITTS_MAX_ADD_MS,
    sandbox.TOUCH_FITTS_SLOPE_MS * Math.log2(((2 * distance) / width) + 1)
  ));
  const rawMean = moments(raw).mean;

  let baseline = sandbox.TOUCH_FITTS_SLOPE_MS * 2.8;
  const applied = [];
  for (let index = 0; index < distances.length; index++) {
    const profile = sandbox.fittsLatencyProfile(
      { x: 0, y: 0 }, { x: distances[index], y: 0 }, width, baseline
    );
    baseline = sandbox.nextFittsBaseline(baseline, profile);
    applied.push(profile.addMs);
  }
  // 生の Fitts をそのまま足すと平均 +100ms 以上ずれる。
  assert.ok(rawMean > 100, `raw Fitts add averages ${rawMean.toFixed(1)}ms`);
  // 収束後の実効加算量の平均はほぼ 0（= 平均処理速度を落とさない）。
  const settled = moments(applied.slice(500));
  assert.ok(Math.abs(settled.mean) < 2, `centred Fitts add averages ${settled.mean.toFixed(2)}ms`);
  // それでも索引の違いは残るので、加算量は距離と強く相関する。
  const settledDistances = distances.slice(500);
  const settledApplied = applied.slice(500);
  const distanceStats = moments(settledDistances);
  let covariance = 0;
  for (let index = 0; index < settledApplied.length; index++) {
    covariance += (settledDistances[index] - distanceStats.mean) * (settledApplied[index] - settled.mean);
  }
  covariance /= settledApplied.length;
  const correlation = covariance / (distanceStats.stdDev * settled.stdDev);
  assert.ok(correlation > 0.85, `distance/latency correlation ${correlation.toFixed(3)}`);
  assert.ok(settled.stdDev > 15, `centred Fitts spread ${settled.stdDev.toFixed(2)}ms`);
  // 連打・初回（rawAddMs === null）は基準線を動かさない。
  assert.equal(sandbox.nextFittsBaseline(42, { addMs: 0, rawAddMs: null }), 42);
  assert.equal(sandbox.nextFittsBaseline(42, null), 42);
  // 頭打ちは上下対称。
  const far = sandbox.fittsLatencyProfile({ x: 0, y: 0 }, { x: 100_000, y: 0 }, width, 0);
  assert.equal(far.addMs, sandbox.TOUCH_FITTS_CENTERED_LIMIT_MS);
  const near = sandbox.fittsLatencyProfile({ x: 0, y: 0 }, { x: 20, y: 0 }, width, sandbox.TOUCH_FITTS_MAX_ADD_MS);
  assert.equal(near.addMs, -sandbox.TOUCH_FITTS_CENTERED_LIMIT_MS);
});

test('D: the tap loop feeds the previous touch point into the visible latency and updates it on completion', () => {
  const tap = source.slice(source.indexOf('async function jqTapStrict'), source.indexOf('function configuredElementState'));
  assert.match(tap, /const fitts = fittsLatencyProfile\(recentTouchPoint\(\), planned, plannedShortSide, fittsBaselineMs\)/);
  assert.match(tap, /fittsBaselineMs = nextFittsBaseline\(fittsBaselineMs, fitts\)/);
  assert.match(tap, /fitts\.addMs/);
  assert.match(tap, /tempoMultiplier \* postErrorSlowingFactor \* fitts\.meanScale/);
  assert.match(tap, /lastTouchPoint = \{ x: endPoint\.x, y: endPoint\.y \}/);
  assert.match(tap, /lastTouchAt = Date\.now\(\)/);
  // 更新は touchend のあと。
  assert.ok(tap.indexOf("'touchend'") < tap.indexOf('lastTouchPoint = {'));
});

// F: 一様分布の置換
test('F: the centered replacement keeps the midpoint expectation, tightens the spread and skews right', () => {
  const unit = moments(sampleMany(random => sandbox.sampleCenteredUnitInterval(random), 600_000, 31337));
  assert.ok(Math.abs(unit.mean - 0.5) < 0.002, `mean ${unit.mean.toFixed(5)}`);
  // 一様分布の SD は 1/sqrt(12) ≈ 0.2887。中央寄りなのでそれより小さい。
  assert.ok(unit.stdDev < 0.22, `sd ${unit.stdDev.toFixed(4)}`);
  assert.ok(unit.stdDev > 0.12, `sd ${unit.stdDev.toFixed(4)}`);
  // 右裾があるので歪度は正。
  assert.ok(unit.skewness > 0.15, `skew ${unit.skewness.toFixed(4)}`);
  for (const value of sampleMany(random => sandbox.sampleCenteredUnitInterval(random), 20_000, 5)) {
    assert.ok(value >= 0 && value <= 1);
  }
});

test('F: sampleCenteredRange preserves min/max meaning and the uniform expectation', () => {
  const range = moments(sampleMany(random => sandbox.sampleCenteredRange(2, 8, random), 300_000, 606));
  assert.ok(Math.abs(range.mean - 5) < 0.02, `mean ${range.mean.toFixed(4)}`);
  assert.ok(range.skewness > 0.15);
  for (const value of sampleMany(random => sandbox.sampleCenteredRange(2, 8, random), 20_000, 11)) {
    assert.ok(value >= 2 && value <= 8);
  }
  assert.equal(sandbox.sampleCenteredRange(3, 3, seededRandom(1)), 3);
  assert.throws(() => sandbox.sampleCenteredRange(9, 1, seededRandom(1)), error => error.code === 'INVALID_RANGE');
});

test('F: symmetric jitter is unbiased and bounded by its magnitude', () => {
  const jitter = moments(sampleMany(random => sandbox.sampleSymmetricJitter(0.18, random), 300_000, 909));
  assert.ok(Math.abs(jitter.mean) < 0.002, `mean ${jitter.mean.toFixed(5)}`);
  // ±0.18 の一様なら SD は 0.18/sqrt(3) ≈ 0.104。中央寄りなのでそれより小さい。
  assert.ok(jitter.stdDev < 0.1, `sd ${jitter.stdDev.toFixed(4)}`);
  for (const value of sampleMany(random => sandbox.sampleSymmetricJitter(0.18, random), 20_000, 13)) {
    assert.ok(Math.abs(value) <= 0.18 + 1e-12);
  }
  assert.equal(sandbox.sampleSymmetricJitter(0, seededRandom(1)), 0);
});

test('F: legacy position jitter uses a Gaussian radius truncated at the configured radius', () => {
  const radius = 10;
  const offsets = sampleMany(random => sandbox.legacyJitterOffset(radius, random), 200_000, 2024);
  const lengths = offsets.map(({ dx, dy }) => Math.hypot(dx, dy));
  for (const length of lengths) assert.ok(length <= radius + 1e-9, `${length} exceeded ${radius}`);
  const xs = moments(offsets.map(offset => offset.dx));
  const ys = moments(offsets.map(offset => offset.dy));
  // 中心対称なので平均は 0。
  assert.ok(Math.abs(xs.mean) < 0.05 && Math.abs(ys.mean) < 0.05);
  // 一様円板なら平均動径は 2R/3 ≈ 6.67。ガウス動径（σ = R/2.2）はもっと中心寄り。
  const meanLength = moments(lengths).mean;
  assert.ok(meanLength < 4.2, `mean radius ${meanLength.toFixed(3)}`);
  assert.ok(meanLength > 3, `mean radius ${meanLength.toFixed(3)}`);
  assert.deepEqual(sandbox.legacyJitterOffset(0, seededRandom(1)), { dx: 0, dy: 0 });
});

// E: マクロ構造
test('E: iteration-boundary pauses match their configured rates and stay off when disabled', () => {
  const weak = sandbox.HUMAN_PACING_PROFILES.weak;
  const samples = sampleMany(random => sandbox.sampleMacroBoundaryPauseMs(weak, 0, random), 400_000, 777);
  const zero = samples.filter(value => value === 0).length / samples.length;
  const long = samples.filter(value => value >= weak.longPauseMinMs).length / samples.length;
  const short = samples.filter(value => value > 0 && value < weak.longPauseMinMs).length / samples.length;
  assert.ok(Math.abs(short - weak.shortPauseChance) < 0.002, `short rate ${short.toFixed(4)}`);
  assert.ok(Math.abs(long - weak.longPauseChance) < 0.001, `long rate ${long.toFixed(4)}`);
  assert.ok(Math.abs(zero - (1 - weak.shortPauseChance - weak.longPauseChance)) < 0.002);

  // 1反復あたりの平均コスト（≒0.16秒）。
  const expected = (weak.shortPauseChance * ((weak.shortPauseMinMs + weak.shortPauseMaxMs) / 2))
    + (weak.longPauseChance * ((weak.longPauseMinMs + weak.longPauseMaxMs) / 2));
  assert.ok(Math.abs(moments(samples).mean - expected) / expected < 0.12, `mean ${moments(samples).mean.toFixed(1)}`);

  // 「なし」は常に 0。
  for (const value of sampleMany(random => sandbox.sampleMacroBoundaryPauseMs(sandbox.HUMAN_PACING_PROFILES.off, 3_600_000, random), 20_000, 3)) {
    assert.equal(value, 0);
  }
  // 「中」は「弱」より重い。
  const medium = moments(sampleMany(random => sandbox.sampleMacroBoundaryPauseMs(sandbox.HUMAN_PACING_PROFILES.medium, 0, random), 200_000, 5));
  assert.ok(medium.mean > moments(samples).mean);
});

test('E: elapsed-time fatigue lengthens boundary pauses gently and is capped', () => {
  const weak = sandbox.HUMAN_PACING_PROFILES.weak;
  const fresh = moments(sampleMany(random => sandbox.sampleMacroBoundaryPauseMs(weak, 0, random), 400_000, 4242)).mean;
  const hour = moments(sampleMany(random => sandbox.sampleMacroBoundaryPauseMs(weak, 3_600_000, random), 400_000, 4242)).mean;
  // 60分で +8%。
  assert.ok(Math.abs((hour / fresh) - (1 + weak.fatiguePerHour)) < 0.01, `ratio ${(hour / fresh).toFixed(4)}`);
  const forever = moments(sampleMany(random => sandbox.sampleMacroBoundaryPauseMs(weak, 3_600_000 * 500, random), 200_000, 4242)).mean;
  assert.ok((forever / fresh) <= 1 + sandbox.HUMAN_PACING_FATIGUE_MAX + 0.01, `ratio ${(forever / fresh).toFixed(4)}`);
});

test('E: pacing is settings-controlled, defaults to weak and never runs inside a block', () => {
  assert.deepEqual(sandbox.HUMAN_PACING_LEVELS, ['off', 'weak', 'medium']);
  assert.equal(sandbox.DEFAULT_HUMAN_PACING, 'weak');
  assert.equal(sandbox.normalizeHumanPacing('medium'), 'medium');
  assert.equal(sandbox.normalizeHumanPacing('nonsense'), 'weak');
  assert.equal(sandbox.normalizeHumanPacing(undefined), 'weak');
  assert.equal(sandbox.humanPacingProfile('nonsense'), sandbox.HUMAN_PACING_PROFILES.weak);

  assert.match(source, /id="humanPacingLevel"/);
  assert.match(source, /humanPacing: normalizeHumanPacing\(raw\.humanPacing\)/);
  assert.match(source, /humanPacing: currentHumanPacingLevel\(\)/);

  // 挿入箇所は repeat / repeatUntil の反復境界だけ。
  const calls = source.match(/await pauseAtIterationBoundary\(context\)/g) || [];
  assert.equal(calls.length, 2);
  const repeatStart = source.indexOf("case 'repeat': {");
  const repeatUntilStart = source.indexOf("case 'repeatUntil': {", repeatStart);
  const repeat = source.slice(repeatStart, repeatUntilStart);
  const repeatUntil = source.slice(repeatUntilStart, source.indexOf("case 'if': {", repeatUntilStart));
  assert.match(repeat, /if \(control\.iteration < count\) await pauseAtIterationBoundary\(context\)/);
  assert.match(repeatUntil, /await pauseAtIterationBoundary\(context\)/);
  const blockList = source.slice(
    source.indexOf('async function runBlockList'),
    source.indexOf('async function executeWorkflowBlock')
  );
  assert.doesNotMatch(blockList, /pauseAtIterationBoundary/);
  const tap = source.slice(source.indexOf('async function jqTapStrict'), source.indexOf('function configuredElementState'));
  assert.doesNotMatch(tap, /pauseAtIterationBoundary/);
});

// H: rAF 位相ロックの解消
test('H: gesture phase offsets de-phase the frame clock without changing the expected duration', () => {
  const offsets = sampleMany(random => sandbox.sampleGesturePhaseOffsetMs(random), 300_000, 616);
  const stats = moments(offsets);
  assert.ok(Math.abs(stats.mean) < 0.05, `mean ${stats.mean.toFixed(4)}`);
  const half = sandbox.GESTURE_PHASE_OFFSET_SPAN_MS / 2;
  for (const value of offsets) assert.ok(value >= -half && value < half);
  // 16.7ms の rAF 周期を丸ごとまたぐだけの幅がある。
  assert.ok(sandbox.GESTURE_PHASE_OFFSET_SPAN_MS >= 16);

  const guards = sampleMany(random => sandbox.sampleGestureFrameGuardMs(random), 200_000, 617);
  for (const value of guards) {
    assert.ok(value >= sandbox.GESTURE_FRAME_GUARD_MIN_MS && value <= sandbox.GESTURE_FRAME_GUARD_MAX_MS);
  }
  assert.ok(Math.abs(moments(guards).mean - 7) < 0.05);

  const wait = source.slice(
    source.indexOf('async function waitForGestureProgress'),
    source.indexOf('async function jqTapStrict')
  );
  assert.match(wait, /const threshold = sampleGestureFrameGuardMs\(\)/);
  assert.match(wait, /const guard = sampleGestureFrameGuardMs\(\)/);
  assert.doesNotMatch(wait, /remaining > 20/);
  assert.doesNotMatch(wait, /remaining - 8/);
});

test('H: the touchmove interval is pinned to one refresh rate for the whole session', () => {
  assert.match(source, /const SESSION_FRAME_INTERVAL_MS = isAndroidPhone\(\)/);
  assert.match(source, /DISPLAY_REFRESH_INTERVAL_120HZ_MS\b/);
  assert.match(source, /const DISPLAY_REFRESH_INTERVAL_60HZ_MS = 16\.7/);
  assert.match(source, /const DISPLAY_REFRESH_INTERVAL_120HZ_MS = 8\.3/);
  const counter = source.slice(
    source.indexOf('function determineTouchMoveCount'),
    source.indexOf('function sampleTouchMoveProgresses')
  );
  assert.match(counter, /const frameInterval = SESSION_FRAME_INTERVAL_MS/);
  assert.match(counter, /mean: frameInterval/);
  assert.doesNotMatch(counter, /mean: 15\.5/);
});

// I: post-error slowing
test('I: post-error slowing only arms on STALE_TARGET retries and decays back to 1 in three successes', () => {
  const factor = vm.runInNewContext(`
    ${extractConst('POST_ERROR_SLOWING_FACTOR')}
    ${extractConst('POST_ERROR_SLOWING_DECAY')}
    ({ POST_ERROR_SLOWING_FACTOR, POST_ERROR_SLOWING_DECAY })
  `);
  assert.equal(factor.POST_ERROR_SLOWING_FACTOR, 1.3);
  let value = factor.POST_ERROR_SLOWING_FACTOR;
  for (let index = 0; index < 3; index++) value = 1 + ((value - 1) * factor.POST_ERROR_SLOWING_DECAY);
  assert.ok(Math.abs(value - 1) < 0.02, `after three successes ${value.toFixed(4)}`);

  const tapper = source.slice(
    source.indexOf('async function tapConfiguredElement'),
    source.indexOf('function randomUniform')
  );
  assert.match(tapper, /if \(error\?\.code !== 'STALE_TARGET'\) throw error;\s*\n\s*\/\/[^\n]*\n\s*markPostErrorSlowing\(\);/);
  assert.equal((source.match(/markPostErrorSlowing\(\)/g) || []).length, 2);
  const tap = source.slice(source.indexOf('async function jqTapStrict'), source.indexOf('function configuredElementState'));
  assert.match(tap, /relaxPostErrorSlowing\(\)/);
});

// J: hold と標的サイズの相関
test('J: hold duration scales inversely with the target short side inside +-15%', () => {
  const reference = sandbox.TOUCH_HOLD_REFERENCE_SHORT_SIDE_PX;
  const range = sandbox.TOUCH_HOLD_SIZE_SCALE_RANGE;
  assert.ok(Math.abs(sandbox.holdDurationSizeScale(reference) - 1) < 1e-9);
  let previous = Infinity;
  for (const shortSide of [4, 8, 16, 22, 32, 44, 64, 96, 176, 400, 2000]) {
    const scale = sandbox.holdDurationSizeScale(shortSide);
    assert.ok(scale <= previous, `not monotone at ${shortSide}px`);
    assert.ok(scale >= 1 - range - 1e-9 && scale <= 1 + range + 1e-9, `scale ${scale} out of +-15%`);
    previous = scale;
  }
  // 小さい標的ほど長い。
  assert.ok(sandbox.holdDurationSizeScale(11) > sandbox.holdDurationSizeScale(176));
  assert.equal(sandbox.holdDurationSizeScale(11), 1 + range);
  assert.equal(sandbox.holdDurationSizeScale(176), 1 - range);

  const tap = source.slice(source.indexOf('async function jqTapStrict'), source.indexOf('function configuredElementState'));
  assert.match(tap, /holdDurationSizeScale\(Math\.min\(start\.rect\.width, start\.rect\.height\)\)/);
});

// G: 既定 jitter
test('G: default jitter is 0.18s while saved values are left untouched', () => {
  assert.equal((source.match(/jitterSec: 0\.18/g) || []).length, 3);
  assert.match(source, /refreshJitterSec: 0\.18/);
  // normalizeBlock は保存値をそのまま通す（欠損時の既定だけが 0）。
  assert.match(source, /jitterSec: clamp\(finite\(config\.jitterSec, 0\), 0, 600\)/);
  const wait = source.slice(
    source.indexOf('async function waitRandomized'),
    source.indexOf('async function runAssistListTransition')
  );
  assert.match(wait, /configured > 0 \? configured : base \* MINIMUM_RUNTIME_JITTER_RATIO/);
  assert.match(wait, /\(base \+ sampleSymmetricJitter\(jitter\)\) \* nextTempoMultiplier\(\)/);
  assert.equal(sandbox.MINIMUM_RUNTIME_JITTER_RATIO, 0.2);
});

// 総合: 変更全体で1タップあたりの期待所要時間が増えないこと（= 平均処理速度を落とさない）。
test('end to end, one simulated tap never costs more than it did before', () => {
  const COUNT = 120_000;

  const legacy = (() => {
    const random = seededRandom(20260807);
    let total = 0;
    for (let index = 0; index < COUNT; index++) {
      total += sandbox.sampleTruncatedNormalMs(LEGACY_LATENCY_MS.TOUCH_VISIBLE_LATENCY_MS, random);
      total += sandbox.sampleTruncatedNormalMs(LEGACY_LATENCY_MS.TOUCH_HOLD_LATENCY_MS, random);
    }
    return total / COUNT;
  })();

  // 標的の大きさと移動距離の混ぜ方を変えても増えないことを見たいので、複数の想定で回す。
  // typical: 標的サイズが基準(44px)まわりに散らばる現実的な配分。ここは決して遅くならないこと。
  // sized: 極端に小さい／大きい標的だけを引いた場合。J（hold と標的サイズの相関）のぶんだけ
  //        ずれるのは設計どおりなので、±15% の範囲に収まっていればよい。
  const scenarios = [
    { label: 'fixed 44px target, always retargeting', typical: true, shortSide: () => 44, distance: random => 20 + (random() * 450) },
    { label: 'mixed target sizes with 12% rapid repeats', typical: true, shortSide: random => 30 + (random() * 60), distance: random => (random() < 0.12 ? random() * 8 : 20 + (random() * 450)) },
    { label: 'small targets, short hops', typical: false, shortSide: () => 24, distance: random => 10 + (random() * 90) },
    { label: 'large targets, long sweeps', typical: false, shortSide: () => 120, distance: random => 200 + (random() * 700) }
  ];

  for (const scenario of scenarios) {
    const random = seededRandom(11235);
    let logTempo = 0;
    let baseline = sandbox.TOUCH_FITTS_SLOPE_MS * 2.8;
    let total = 0;
    let counted = 0;
    for (let index = 0; index < COUNT; index++) {
      logTempo = sandbox.advanceLogTempoState(
        logTempo, sandbox.TEMPO_AR_PHI, sandbox.TEMPO_AR_STATIONARY_STDDEV, random
      );
      const tempo = sandbox.logTempoMultiplier(logTempo, sandbox.TEMPO_AR_STATIONARY_STDDEV);
      const shortSide = scenario.shortSide(random);
      const distance = scenario.distance(random);
      const fitts = sandbox.fittsLatencyProfile({ x: 0, y: 0 }, { x: distance, y: 0 }, shortSide, baseline);
      baseline = sandbox.nextFittsBaseline(baseline, fitts);
      const visible = sandbox.sampleExGaussianMs(
        sandbox.shiftLatencyMean(
          sandbox.scaleLatencyConfig(sandbox.TOUCH_VISIBLE_LATENCY_MS, tempo * fitts.meanScale),
          fitts.addMs
        ),
        random
      );
      const hold = sandbox.sampleExGaussianMs(
        sandbox.scaleLatencyConfig(sandbox.TOUCH_HOLD_LATENCY_MS, sandbox.holdDurationSizeScale(shortSide)),
        random
      );
      // 基準線が落ち着くまでの立ち上がりは平均から除く。
      if (index < 2000) continue;
      total += visible + hold;
      counted += 1;
    }
    const current = total / counted;
    const limit = scenario.typical ? 1.01 : 1 + sandbox.TOUCH_HOLD_SIZE_SCALE_RANGE;
    assert.ok(
      current <= legacy * limit,
      `${scenario.label}: ${legacy.toFixed(1)}ms -> ${current.toFixed(1)}ms per tap (limit x${limit})`
    );
    // 逆に速くなりすぎてもいない（意図しない待ち時間の消失がない）。
    assert.ok(
      current >= legacy * (1 - sandbox.TOUCH_HOLD_SIZE_SCALE_RANGE),
      `${scenario.label}: ${legacy.toFixed(1)}ms -> ${current.toFixed(1)}ms per tap`
    );
  }
});

test('no interaction timing is drawn from a raw uniform any more', () => {
  // randomUniform に残ってよいのは Touch identifier だけ。
  const uses = source.match(/randomUniform\([^)]*\)/g) || [];
  for (const use of uses) {
    assert.ok(
      /randomUniform\(min, max, random/.test(use) || /randomUniform\(1, 2_147_483_647\)/.test(use),
      `unexpected uniform draw: ${use}`
    );
  }
  assert.doesNotMatch(source, /Math\.sqrt\(Math\.random\(\)\) \* radius/);
});
