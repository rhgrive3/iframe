import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createFunctionExtractor } from './source-extract.mjs';

const source = readFileSync(new URL('../a.js', import.meta.url), 'utf8');
const extractFunction = createFunctionExtractor(source);

const SELECTORS = Object.freeze({
  authCaptcha: '#pop-c-a-i',
  authCaptchaPanel: '.pop-usual',
  authCaptchaContent: '#c-a-i-frm-group, .txt-c-a-i-message'
});

function constantOf(name) {
  const match = source.match(new RegExp(`const ${name} = (.+);`));
  assert.ok(match, `missing production constant: ${name}`);
  return vm.runInNewContext(match[1].replace(/_/g, ''));
}

const AUTH_CAPTCHA_POLL_MS = constantOf('AUTH_CAPTCHA_POLL_MS');
const AUTH_CAPTCHA_IDLE_ESCAPE_MS = constantOf('AUTH_CAPTCHA_IDLE_ESCAPE_MS');
const AUTH_CAPTCHA_ESCAPE_URL = source.match(/const AUTH_CAPTCHA_ESCAPE_URL = '([^']+)'/)[1];
const AUTH_CAPTCHA_STOP_REASON = source.match(/const AUTH_CAPTCHA_STOP_REASON = '([^']+)'/)[1];

class Clock {
  constructor() {
    this.now = 0;
    this.timers = new Map();
    this.serial = 1;
  }

  schedule(callback, ms, interval) {
    const id = this.serial++;
    this.timers.set(id, { callback, at: this.now + Math.max(0, ms), interval });
    return id;
  }

  clear(id) {
    this.timers.delete(id);
  }

  advance(ms) {
    const target = this.now + ms;
    for (let guard = 0; guard < 100_000; guard++) {
      let dueId = null;
      let due = null;
      for (const [id, timer] of this.timers) {
        if (timer.at <= target && (!due || timer.at < due.at)) {
          dueId = id;
          due = timer;
        }
      }
      if (!due) break;
      this.now = due.at;
      if (due.interval == null) this.timers.delete(dueId);
      else due.at = this.now + due.interval;
      due.callback();
    }
    this.now = target;
  }
}

class Node {
  constructor({ classes = [], visible = true } = {}) {
    this.style = { display: '', visibility: '', opacity: '' };
    this.hidden = false;
    this.isConnected = true;
    this.visible = visible;
    this.classList = { contains: name => classes.includes(name) };
    this.nodes = new Map();
  }

  add(selector, node) {
    this.nodes.set(selector, node);
    node.ownerDocument = this.ownerDocument;
    return node;
  }

  querySelector(selector) {
    return this.nodes.get(selector) || null;
  }

  getBoundingClientRect() {
    return this.visible
      ? { width: 320, height: 120 }
      : { width: 0, height: 0 };
  }

  getClientRects() {
    return this.visible ? [this.getBoundingClientRect()] : [];
  }
}

function captchaDocument({ solved = false, closing = false, visible = true } = {}) {
  const doc = new Node();
  doc.defaultView = {
    getComputedStyle: node => ({
      display: node.style.display || 'block',
      visibility: node.style.visibility || 'visible',
      opacity: node.style.opacity === '' ? '1' : node.style.opacity
    })
  };
  doc.ownerDocument = doc;
  const root = doc.add(SELECTORS.authCaptcha, new Node({ visible }));
  // 認証を通すと view が $el.empty() するので、#pop-c-a-i だけが空で残る
  if (solved) return doc;
  root.add(SELECTORS.authCaptchaPanel, new Node({
    classes: closing ? ['pop-usual', 'pop-hide'] : ['pop-usual', 'pop-show'],
    visible
  }));
  root.add(SELECTORS.authCaptchaContent, new Node({ visible }));
  return doc;
}

function createGuard({ document = captchaDocument(), running = true } = {}) {
  const clock = new Clock();
  const events = { logs: [], statuses: [], toasts: [], stops: [], navigations: [] };
  const frame = { document, readable: true };
  const state = { destroyed: false, running: running ? { id: 'run' } : null, legacyRunning: null };
  const sandbox = vm.createContext({
    SELECTORS,
    state,
    AUTH_CAPTCHA_POLL_MS,
    AUTH_CAPTCHA_IDLE_ESCAPE_MS,
    AUTH_CAPTCHA_ESCAPE_URL,
    AUTH_CAPTCHA_STOP_REASON,
    authCaptchaGuard: vm.runInNewContext(`(${source.match(/const authCaptchaGuard = (\{[\s\S]*?\});/)[1]})`),
    performance: { now: () => clock.now },
    setInterval: (callback, ms) => clock.schedule(callback, ms, ms),
    clearInterval: id => clock.clear(id),
    setTimeout: (callback, ms) => clock.schedule(callback, ms, null),
    clearTimeout: id => clock.clear(id),
    frameDocument: () => {
      if (!frame.readable) throw new Error('iframe内部を読み取れません');
      return frame.document;
    },
    appendLog: (message, level = '', name = '') => events.logs.push({ message, level, name }),
    setStatus: message => events.statuses.push(message),
    toast: message => events.toasts.push(message),
    flushWorkflowStore: () => {},
    saveLegacyState: () => {},
    stopEverything: reason => {
      events.stops.push(reason);
      state.running = null;
      state.legacyRunning = null;
    },
    window: {
      location: { replace: url => events.navigations.push(url) }
    }
  });
  sandbox.window.top = sandbox.window;
  sandbox.window.parent = sandbox.window;
  for (const name of [
    'computedVisible',
    'authCaptchaInfo',
    'authCaptchaPresence',
    'authCaptchaWatchNeeded',
    'startAuthCaptchaWatch',
    'stopAuthCaptchaWatch',
    'pollAuthCaptcha',
    'haltForAuthCaptcha',
    'scheduleAuthCaptchaEscape',
    'clearAuthCaptchaEscape',
    'releaseAuthCaptchaHold',
    'escapeFromAuthCaptcha',
    'navigateHostAway'
  ]) sandbox[name] = vm.runInContext(`(${extractFunction(name)})`, sandbox);
  return { sandbox, clock, events, frame, state };
}

test('the authentication captcha stops the running workflow within one poll', () => {
  const { sandbox, clock, events, state } = createGuard();
  sandbox.startAuthCaptchaWatch();
  assert.deepEqual(events.stops, [AUTH_CAPTCHA_STOP_REASON]);
  assert.equal(state.running, null);
  assert.equal(sandbox.authCaptchaGuard.held, true);
  assert.ok(events.logs.some(log => log.level === 'error' && log.message.includes('即時停止')));
  assert.ok(events.statuses.includes(AUTH_CAPTCHA_STOP_REASON));
  assert.deepEqual(events.navigations, []);

  // 検出を繰り返しても停止と通知は一度だけ
  clock.advance(AUTH_CAPTCHA_POLL_MS * 4);
  assert.deepEqual(events.stops, [AUTH_CAPTCHA_STOP_REASON]);
  assert.equal(events.toasts.length, 1);
});

test('a captcha left untouched for 30 seconds forces the parent page to Google', () => {
  const { sandbox, clock, events } = createGuard();
  sandbox.startAuthCaptchaWatch();

  clock.advance(AUTH_CAPTCHA_IDLE_ESCAPE_MS - 1000);
  assert.deepEqual(events.navigations, []);

  clock.advance(1000);
  assert.deepEqual(events.navigations, [AUTH_CAPTCHA_ESCAPE_URL]);
  assert.ok(events.logs.some(log => log.message.includes('放置') && log.message.includes(AUTH_CAPTCHA_ESCAPE_URL)));

  // 離脱後はポーリングも離脱タイマーも残さない
  const pending = events.navigations.length;
  clock.advance(AUTH_CAPTCHA_IDLE_ESCAPE_MS * 2);
  assert.equal(events.navigations.length, pending);
});

test('solving the captcha inside the 30 seconds cancels the escape', () => {
  const { sandbox, clock, events, frame } = createGuard();
  sandbox.startAuthCaptchaWatch();
  clock.advance(AUTH_CAPTCHA_IDLE_ESCAPE_MS - 2000);

  frame.document = captchaDocument({ solved: true });
  clock.advance(AUTH_CAPTCHA_POLL_MS);
  assert.equal(sandbox.authCaptchaGuard.held, false);
  assert.ok(events.statuses.includes('認証画面が閉じられました'));

  clock.advance(AUTH_CAPTCHA_IDLE_ESCAPE_MS * 2);
  assert.deepEqual(events.navigations, []);
});

test('an unreadable iframe suspends judgement instead of cancelling the escape', () => {
  const { sandbox, clock, events, frame } = createGuard();
  sandbox.startAuthCaptchaWatch();

  frame.readable = false;
  clock.advance(AUTH_CAPTCHA_POLL_MS * 4);
  assert.equal(sandbox.authCaptchaGuard.held, true);
  assert.deepEqual(events.navigations, []);

  clock.advance(AUTH_CAPTCHA_IDLE_ESCAPE_MS);
  assert.deepEqual(events.navigations, [AUTH_CAPTCHA_ESCAPE_URL]);
});

test('restarting a run re-arms the escape window instead of inheriting the old one', () => {
  const { sandbox, clock, events, state } = createGuard();
  sandbox.startAuthCaptchaWatch();
  clock.advance(AUTH_CAPTCHA_IDLE_ESCAPE_MS - 5000);

  // 実行し直した時点で「放置」ではなくなる
  state.running = { id: 'run-2' };
  sandbox.releaseAuthCaptchaHold();
  sandbox.startAuthCaptchaWatch();
  assert.equal(sandbox.authCaptchaGuard.held, false);

  clock.advance(AUTH_CAPTCHA_POLL_MS);
  assert.equal(events.stops.length, 2);
  assert.equal(sandbox.authCaptchaGuard.held, true);

  clock.advance(AUTH_CAPTCHA_IDLE_ESCAPE_MS - 1000);
  assert.deepEqual(events.navigations, []);
  clock.advance(1000);
  assert.deepEqual(events.navigations, [AUTH_CAPTCHA_ESCAPE_URL]);
});

test('a closing or emptied captcha popup is never treated as an active challenge', () => {
  for (const options of [{ solved: true }, { closing: true }, { visible: false }]) {
    const { sandbox, clock, events } = createGuard({ document: captchaDocument(options) });
    sandbox.startAuthCaptchaWatch();
    assert.deepEqual(events.stops, [], JSON.stringify(options));
    clock.advance(AUTH_CAPTCHA_IDLE_ESCAPE_MS * 2);
    assert.deepEqual(events.navigations, [], JSON.stringify(options));
  }
});

test('workflow errors are classified for the restart-once-then-stop rule', () => {
  const classes = source.slice(source.indexOf('class FlowError'), source.indexOf('function abortException'));
  const state = { destroyed: false };
  const sandbox = vm.createContext({ state });
  // class 宣言はコンテキストのレキシカルスコープに入るので、参照はまとめて受け取る
  const { FlowError, FlowStop, FlowRestart } = vm.runInContext(
    `${classes}\n({ FlowError, FlowStop, FlowRestart })`,
    sandbox
  );
  for (const name of ['normalizePopupText', 'workflowErrorSignature', 'retryableWorkflowError']) {
    sandbox[name] = vm.runInContext(`(${extractFunction(name)})`, sandbox);
  }
  const { workflowErrorSignature, retryableWorkflowError } = sandbox;

  const timeout = new FlowError('要素が見つかりません', 'TIMEOUT');
  timeout.block = { id: 'block-1' };
  const sameAgain = new FlowError('要素が見つかりません', 'TIMEOUT');
  sameAgain.block = { id: 'block-1' };
  const elsewhere = new FlowError('要素が見つかりません', 'TIMEOUT');
  elsewhere.block = { id: 'block-2' };

  assert.equal(workflowErrorSignature(timeout), workflowErrorSignature(sameAgain));
  assert.notEqual(workflowErrorSignature(timeout), workflowErrorSignature(elsewhere));
  assert.notEqual(
    workflowErrorSignature(timeout),
    workflowErrorSignature(new FlowError('要素が見つかりません', 'CROSS_ORIGIN'))
  );

  assert.equal(retryableWorkflowError(timeout), true);
  assert.equal(retryableWorkflowError(new Error('想定外')), true);
  assert.equal(retryableWorkflowError(new FlowStop('停止')), false);
  assert.equal(retryableWorkflowError(new FlowRestart()), false);
  assert.equal(retryableWorkflowError(new DOMException('停止', 'AbortError')), false);
  assert.equal(retryableWorkflowError(timeout, { signal: { aborted: true } }), false);
  state.destroyed = true;
  assert.equal(retryableWorkflowError(timeout), false);
});
