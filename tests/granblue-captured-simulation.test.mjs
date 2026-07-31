import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../a.js', import.meta.url), 'utf8');
const fixture = JSON.parse(readFileSync(new URL('./fixtures/granblue-captured-scenarios.json', import.meta.url), 'utf8'));

const SELECTORS = Object.freeze({
  assistScreen: '#prt-assist-search.prt-assist-contents.active',
  assistList: '#prt-search-list',
  assistRows: '#prt-search-list > .btn-multi-raid.lis-raid.search',
  supporterScreen: '#cnt-quest.cnt-quest.supporter_raid',
  deckOk: '.pop-deck.supporter_raid .prt-btn-deck > .btn-usual-ok.se-quest-start',
  popup: '#pop .common-pop-error.pop-show',
  popupBody: '#popup-body',
  popupOk: '.prt-popup-footer > .btn-usual-ok',
  unclaimedList: '#prt-unclaimed-list',
  unclaimedRows: '#prt-unclaimed-list > .btn-multi-raid.lis-raid[data-href^="result_multi/"]',
  battleScreen: '.cnt-raid-stage.multi',
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

function extractFunction(name) {
  const starts = [`async function ${name}(`, `function ${name}(`];
  const start = starts.map(token => source.indexOf(token)).find(index => index >= 0);
  assert.notEqual(start, undefined, `missing production function: ${name}`);
  const paramsOpen = source.indexOf('(', start);
  assert.ok(paramsOpen >= 0, `missing function parameters: ${name}`);
  let paramsDepth = 0;
  let paramsClose = -1;
  let paramsMode = 'code';
  for (let index = paramsOpen; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];
    if (paramsMode === 'line-comment') {
      if (char === '\n') paramsMode = 'code';
      continue;
    }
    if (paramsMode === 'block-comment') {
      if (char === '*' && next === '/') { paramsMode = 'code'; index += 1; }
      continue;
    }
    if (paramsMode === 'single' || paramsMode === 'double' || paramsMode === 'template') {
      const delimiter = paramsMode === 'single' ? "'" : paramsMode === 'double' ? '"' : '`';
      if (char === '\\') { index += 1; continue; }
      if (char === delimiter) paramsMode = 'code';
      continue;
    }
    if (char === '/' && next === '/') { paramsMode = 'line-comment'; index += 1; continue; }
    if (char === '/' && next === '*') { paramsMode = 'block-comment'; index += 1; continue; }
    if (char === "'") { paramsMode = 'single'; continue; }
    if (char === '"') { paramsMode = 'double'; continue; }
    if (char === '`') { paramsMode = 'template'; continue; }
    if (char === '(') paramsDepth += 1;
    if (char === ')') {
      paramsDepth -= 1;
      if (paramsDepth === 0) { paramsClose = index; break; }
    }
  }
  assert.ok(paramsClose >= 0, `unterminated function parameters: ${name}`);
  const open = source.indexOf('{', paramsClose + 1);
  assert.ok(open >= 0, `missing function body: ${name}`);
  let depth = 0;
  let mode = 'code';
  for (let index = open; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];
    if (mode === 'line-comment') {
      if (char === '\n') mode = 'code';
      continue;
    }
    if (mode === 'block-comment') {
      if (char === '*' && next === '/') {
        mode = 'code';
        index += 1;
      }
      continue;
    }
    if (mode === 'single' || mode === 'double' || mode === 'template') {
      const delimiter = mode === 'single' ? "'" : mode === 'double' ? '"' : '`';
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === delimiter) mode = 'code';
      continue;
    }
    if (char === '/' && next === '/') {
      mode = 'line-comment';
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      mode = 'block-comment';
      index += 1;
      continue;
    }
    if (char === "'") {
      mode = 'single';
      continue;
    }
    if (char === '"') {
      mode = 'double';
      continue;
    }
    if (char === '`') {
      mode = 'template';
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`unterminated production function: ${name}`);
}

class FakeElement {
  constructor({ textContent = '', dataset = {}, classes = [], style = {}, visible = true, tagName = 'DIV' } = {}) {
    this.textContent = textContent;
    this.dataset = { ...dataset };
    this.className = classes.join(' ');
    this.tagName = tagName;
    this.style = { display: '', visibility: '', opacity: '', ...style };
    this.hidden = false;
    this.isConnected = true;
    this.children = [];
    this._visible = visible;
    this._one = new Map();
    this._many = new Map();
    this._closest = new Map();
    this._attributes = new Map();
    this.classList = { contains: name => classes.includes(name) };
  }

  add(selector, element) {
    this._one.set(selector, element);
    return element;
  }

  addAll(selector, elements) {
    this._many.set(selector, [...elements]);
    return elements;
  }

  setClosest(selector, element) {
    this._closest.set(selector, element);
    return this;
  }

  querySelector(selector) {
    return this._one.get(selector) || this._many.get(selector)?.[0] || null;
  }

  querySelectorAll(selector) {
    return this._many.get(selector) || (this._one.has(selector) ? [this._one.get(selector)] : []);
  }

  closest(selector) {
    return this._closest.get(selector) || null;
  }

  getBoundingClientRect() {
    return this._visible ? { left: 0, top: 0, right: 320, bottom: 80, width: 320, height: 80 } : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }

  getClientRects() {
    return this._visible ? [this.getBoundingClientRect()] : [];
  }

  getAttribute(name) {
    return this._attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this._attributes.set(name, String(value));
  }
}

class FakeDocument extends FakeElement {
  constructor({ stage = null, readyState = 'complete' } = {}) {
    super();
    this.readyState = readyState;
    this.body = { childElementCount: 1 };
    this.defaultView = {
      stage,
      getComputedStyle: element => ({
        display: element.style.display || 'block',
        visibility: element.style.visibility || 'visible',
        opacity: element.style.opacity === '' ? '1' : element.style.opacity
      })
    };
    this.ownerDocument = this;
  }

  attach(selector, element) {
    element.ownerDocument = this;
    this.add(selector, element);
    return element;
  }

  attachAll(selector, elements) {
    for (const element of elements) element.ownerDocument = this;
    this.addAll(selector, elements);
    return elements;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stageFor(raidId, status) {
  return { pJsnData: { raid_id: raidId }, gGameStatus: status };
}

function control(classes, style = {}) {
  return new FakeElement({ classes, style });
}

function assistRow({ raidId, hp, people }) {
  const row = new FakeElement({ dataset: { raidId } });
  row.add('.prt-raid-gauge-inner', new FakeElement({ style: { width: `${hp}%` } }));
  row.add('.prt-flees-in', new FakeElement({ textContent: people }));
  return row;
}

function popupDocument(message) {
  const doc = new FakeDocument();
  const popup = doc.attach(SELECTORS.popup, new FakeElement());
  const body = new FakeElement({ textContent: message });
  const ok = new FakeElement();
  body.ownerDocument = doc;
  ok.ownerDocument = doc;
  popup.add(SELECTORS.popupBody, body);
  popup.add(SELECTORS.popupOk, ok);
  return doc;
}

function battleDocument({ raidId, status, autoClasses = [], attackClasses = [], dummyClasses = ['display-off'], cancelClasses = ['display-off'] }) {
  const doc = new FakeDocument({ stage: stageFor(raidId, status) });
  doc.attach(SELECTORS.battleScreen, new FakeElement());
  doc.attach(SELECTORS.fullAuto, control(autoClasses, { display: 'block' }));
  doc.attach(SELECTORS.attackStart, control(attackClasses));
  doc.attach(SELECTORS.attackDummy, control(dummyClasses));
  doc.attach(SELECTORS.attackCancel, control(cancelClasses));
  return doc;
}

const clock = { now: 0 };
const harness = { url: fixture.urls.assist, doc: new FakeDocument() };
const state = {
  running: { recentRaidIds: new Set() },
  battleEndArmed: false,
  battleEndArmedAt: 0,
  activeBattleDocument: null,
  activeBattleStatus: null,
  expectedBattleRaidId: ''
};

const sandbox = vm.createContext({
  SELECTORS,
  state,
  BATTLE_END_MESSAGE: '敵が倒されたため、このバトルは終了しました。',
  DEFAULT_STABLE_MS: 140,
  MAX_RECENT_RAID_IDS: 128,
  battleProgressCache: new WeakMap(),
  lightweightMode: false,
  performance: { now: () => clock.now },
  frameDocument: () => harness.doc,
  frameWindow: () => harness.doc.defaultView,
  currentFrameUrl: () => harness.url,
  window: { getComputedStyle: element => element.ownerDocument.defaultView.getComputedStyle(element) }
});

for (const name of [
  'normalizePopupText',
  'computedVisible',
  'hiddenOrAbsent',
  'popupInfo',
  'detectScreenState',
  'safeDetectScreenState',
  'expectedScreenMatches',
  'pageBaseReady',
  'parseAssistRow',
  'rankAssistRows',
  'recentRaidIdSet',
  'rememberRecentRaidId',
  'wasRecentRaidId',
  'runtimeFlagEnabled',
  'battleRuntimeState',
  'resetBattleEndDetection',
  'battleControlReady',
  'armBattleEndDetection',
  'battleEndDetectionMatches',
  'fullAutoState',
  'detectBattleEndState',
  'safeBattleEndState',
  'recoverableBattleEndState',
  'elementDisplayOn',
  'turnSignature',
  'battleProgressSignature',
  'attackSnapshot',
  'isAttackInProgress',
  'attackTransitionFromBaseline'
]) {
  sandbox[name] = vm.runInContext(`(${extractFunction(name)})`, sandbox);
}

sandbox.NORMALIZED_ERRORS = {
  MAX_ASSIST: sandbox.normalizePopupText(fixture.messages.maxAssist),
  UNCLAIMED: sandbox.normalizePopupText(fixture.messages.unclaimed),
  RAID_FULL: sandbox.normalizePopupText(fixture.messages.raidFull)
};

function setFrame(doc, url) {
  harness.doc = doc;
  harness.url = url;
}

function resetRuntime(expectedRaidId = '') {
  state.running = { recentRaidIds: new Set() };
  sandbox.resetBattleEndDetection({ expectedRaidId });
  clock.now = 0;
}

test('captured Granblue screens classify with production priority and popup normalization', () => {
  const cases = [
    [fixture.messages.maxAssist, 'MAX_ASSIST_ERROR'],
    [fixture.messages.unclaimed, 'UNCLAIMED_ERROR'],
    [fixture.messages.raidFull, 'RAID_FULL_ERROR']
  ];
  for (const [message, expected] of cases) {
    const doc = popupDocument(message);
    setFrame(doc, fixture.urls.assist);
    assert.equal(sandbox.detectScreenState(doc).type, expected);
  }

  const assist = new FakeDocument();
  assist.attach(SELECTORS.assistScreen, new FakeElement());
  setFrame(assist, fixture.urls.assist);
  assert.equal(sandbox.detectScreenState(assist).type, 'ASSIST_LIST');

  const supporter = new FakeDocument();
  supporter.attach(SELECTORS.supporterScreen, new FakeElement());
  setFrame(supporter, fixture.urls.assist);
  assert.equal(sandbox.detectScreenState(supporter).type, 'SUPPORTER');

  const deck = new FakeDocument();
  deck.attach(SELECTORS.supporterScreen, new FakeElement());
  deck.attach(SELECTORS.deckOk, new FakeElement());
  setFrame(deck, fixture.urls.assist);
  assert.equal(sandbox.detectScreenState(deck).type, 'DECK_CONFIRM');

  const unclaimed = new FakeDocument();
  unclaimed.attach(SELECTORS.unclaimedList, new FakeElement());
  setFrame(unclaimed, fixture.urls.assist);
  assert.equal(sandbox.detectScreenState(unclaimed).type, 'UNCLAIMED_LIST');

  const result = new FakeDocument();
  setFrame(result, fixture.urls.result);
  assert.equal(sandbox.detectScreenState(result).type, 'RESULT');
  assert.equal(sandbox.expectedScreenMatches('result', result), true);
});

test('captured assist HP and participant counts rank correctly and recent raid IDs are excluded', () => {
  resetRuntime();
  const rows = fixture.assistRows.map(assistRow);
  const ranked = sandbox.rankAssistRows(rows, 50, 'atLeast');
  assert.deepEqual(
    Array.from(ranked, item => item.raidId),
    ['46244077420', '46244081963', '46244080269', '46244075451', '46244088266']
  );

  sandbox.rememberRecentRaidId(state.running, ranked[0].raidId);
  const eligible = ranked.filter(item => !sandbox.wasRecentRaidId(state.running, item.raidId));
  assert.equal(eligible[0].raidId, '46244081963');

  for (let index = 0; index < 130; index++) sandbox.rememberRecentRaidId(state.running, `raid-${index}`);
  assert.equal(state.running.recentRaidIds.size, 128);
  assert.equal(state.running.recentRaidIds.has('raid-0'), false);
  assert.equal(state.running.recentRaidIds.has('raid-129'), true);
});

test('stale finished status from the previous raid cannot arm or end the selected raid', () => {
  resetRuntime(fixture.raids.selected);
  const stale = battleDocument({
    raidId: fixture.raids.previous,
    status: clone(fixture.status.staleFinished),
    autoClasses: [],
    attackClasses: ['display-on']
  });
  setFrame(stale, fixture.urls.battle);
  const runtime = sandbox.battleRuntimeState(stale);
  assert.equal(runtime.available, false);
  assert.equal(runtime.finished, false);
  assert.equal(sandbox.armBattleEndDetection(stale, runtime), false);
  assert.equal(sandbox.detectBattleEndState(stale), null);
  assert.equal(state.battleEndArmed, false);
});

test('full-auto and attack controls follow the captured loading-ready-attacking sequence', () => {
  resetRuntime(fixture.raids.selected);
  const status = clone(fixture.status.loading);
  const doc = battleDocument({
    raidId: fixture.raids.selected,
    status,
    autoClasses: [],
    attackClasses: ['display-off']
  });
  setFrame(doc, fixture.urls.battle);

  const loadingAuto = sandbox.fullAutoState(doc);
  assert.equal(loadingAuto.visible, true);
  assert.equal(loadingAuto.enabled, false);
  assert.equal(sandbox.armBattleEndDetection(doc, loadingAuto.runtime), false);

  status.enable_auto_button = 1;
  doc.querySelector(SELECTORS.attackStart).classList = { contains: name => name === 'display-on' };
  const readyAuto = sandbox.fullAutoState(doc);
  assert.equal(readyAuto.enabled, true);
  assert.equal(readyAuto.on, false);
  assert.equal(sandbox.armBattleEndDetection(doc, readyAuto.runtime), true);

  const baseline = sandbox.attackSnapshot(doc);
  assert.equal(sandbox.isAttackInProgress(baseline), false);

  status.auto_attack = 1;
  status.attacking = 1;
  status.attackQueue.attackButtonPushed = 1;
  const current = sandbox.attackSnapshot(doc);
  assert.equal(sandbox.fullAutoState(doc).on, true);
  assert.equal(sandbox.isAttackInProgress(current), true);
  assert.ok(sandbox.attackTransitionFromBaseline(baseline, current));
});

test('same live status object becomes a valid runtime finish only after the battle was armed', () => {
  resetRuntime(fixture.raids.selected);
  const status = clone(fixture.status.ready);
  const doc = battleDocument({
    raidId: fixture.raids.selected,
    status,
    autoClasses: [],
    attackClasses: ['display-on']
  });
  setFrame(doc, fixture.urls.battle);

  assert.equal(sandbox.detectBattleEndState(doc), null);
  assert.equal(state.battleEndArmed, true);
  assert.equal(state.activeBattleStatus, status);
  assert.equal(state.running.recentRaidIds.has(fixture.raids.selected), true);

  status.finish = 1;
  status.battle_end = 1;
  assert.equal(sandbox.detectBattleEndState(doc)?.type, 'RUNTIME_FINISHED');
});

test('first-hit kill followed by iframe document replacement and result redirect remains recoverable', () => {
  resetRuntime(fixture.raids.selected);
  const liveStatus = clone(fixture.status.ready);
  const battle = battleDocument({
    raidId: fixture.raids.selected,
    status: liveStatus,
    autoClasses: [],
    attackClasses: ['display-on']
  });
  setFrame(battle, fixture.urls.battle);
  assert.equal(sandbox.armBattleEndDetection(battle), true);

  const resultDocument = new FakeDocument();
  setFrame(resultDocument, fixture.urls.result);
  assert.equal(sandbox.detectBattleEndState(resultDocument)?.type, 'RESULT');

  sandbox.resetBattleEndDetection({ expectedRaidId: fixture.raids.selected });
  assert.equal(sandbox.safeBattleEndState(), null);
  assert.equal(sandbox.recoverableBattleEndState()?.type, 'RESULT');

  sandbox.resetBattleEndDetection();
  assert.equal(sandbox.recoverableBattleEndState(), null);
});

test('hidden template residue never ends a battle; visible rematch/result UI does after stabilization', () => {
  resetRuntime(fixture.raids.selected);
  const status = clone(fixture.status.ready);
  const doc = battleDocument({
    raidId: fixture.raids.selected,
    status,
    autoClasses: [],
    attackClasses: ['display-on']
  });
  setFrame(doc, fixture.urls.battle);
  assert.equal(sandbox.armBattleEndDetection(doc), true);
  clock.now = 500;

  const hiddenCommand = new FakeElement({ visible: false });
  const hiddenResult = new FakeElement({ visible: true }).setClosest('.prt-command-end', hiddenCommand);
  hiddenResult.ownerDocument = doc;
  hiddenCommand.ownerDocument = doc;
  doc.attach(SELECTORS.battleResult, hiddenResult);
  assert.equal(sandbox.detectBattleEndState(doc), null);

  hiddenCommand._visible = true;
  assert.equal(sandbox.detectBattleEndState(doc)?.type, 'RESULT_BUTTON');

  doc._one.delete(SELECTORS.battleResult);
  const hiddenPopup = new FakeElement({ visible: false });
  const notice = new FakeElement({ textContent: fixture.messages.battleEnded, visible: true })
    .setClosest('#pop, #pop-force', hiddenPopup);
  notice.ownerDocument = doc;
  hiddenPopup.ownerDocument = doc;
  doc.attach(SELECTORS.battleEndNotice, notice);
  assert.equal(sandbox.detectBattleEndState(doc), null);

  hiddenPopup._visible = true;
  assert.equal(sandbox.detectBattleEndState(doc)?.type, 'REMATCH_FAIL');
});

test('a different raid/status object cannot inherit the armed identity of the previous battle', () => {
  resetRuntime(fixture.raids.selected);
  const selectedStatus = clone(fixture.status.ready);
  const selectedDoc = battleDocument({
    raidId: fixture.raids.selected,
    status: selectedStatus,
    autoClasses: [],
    attackClasses: ['display-on']
  });
  setFrame(selectedDoc, fixture.urls.battle);
  assert.equal(sandbox.armBattleEndDetection(selectedDoc), true);

  const nextStatus = clone(fixture.status.staleFinished);
  const nextDoc = battleDocument({
    raidId: fixture.raids.next,
    status: nextStatus,
    autoClasses: [],
    attackClasses: ['display-on']
  });
  setFrame(nextDoc, `https://game.granbluefantasy.jp/#raid_multi/${fixture.raids.next}`);
  assert.equal(sandbox.battleRuntimeState(nextDoc).available, false);
  assert.equal(sandbox.detectBattleEndState(nextDoc), null);
});
