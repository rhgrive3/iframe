import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../a.js', import.meta.url), 'utf8');

test('top-level installation is guarded and replaces stale instances', () => {
  assert.match(source, /if \(window\.top !== window\) return;/);
  assert.match(source, /const previous = window\[GLOBAL_KEY\]/);
  assert.match(source, /previous\?\.destroy/);
});

test('legacy state and workflow storage remain backward compatible', () => {
  assert.match(source, /state_v12/);
  assert.match(source, /LEGACY_STORAGE_KEYS = Array\.from\(\{ length: 11 \}/);
  assert.match(source, /state_v\$\{11 - index\}/);
  assert.match(source, /WORKFLOW_STORAGE_KEY/);
  assert.match(source, /WORKFLOW_AUTOSAVE_KEY/);
});

test('primary UI remains touch-sized and safe-area aware', () => {
  assert.match(source, /button\{min-height:44px/);
  assert.match(source, /#browserBar/);
  assert.match(source, /safe-area-inset-bottom/);
  assert.match(source, /100dvh/);
});

test('workflow execution retains bounded iteration and timeout guards', () => {
  assert.match(source, /MAX_REPEAT_COUNT = 10_000/);
  assert.match(source, /MAX_CONDITION_ITERATIONS = 10_000/);
  assert.match(source, /DEFAULT_FLOW_TIMEOUT_MS = 120_000/);
  assert.match(source, /runWorkflow/);
  assert.match(source, /stopWorkflow/);
});

test('Granblue screen and action selectors remain stable', () => {
  for (const selector of [
    '#prt-assist-search.prt-assist-contents.active',
    '#prt-search-list > .btn-multi-raid.lis-raid.search',
    '#cnt-quest.cnt-quest.supporter_raid',
    '.pop-deck.supporter_raid .prt-btn-deck > .btn-usual-ok.se-quest-start',
    '.cnt-raid-stage.multi',
    '.btn-auto',
    '.btn-attack-start'
  ]) assert.ok(source.includes(selector), `missing selector: ${selector}`);
});

test('known Granblue failure states retain explicit messages', () => {
  assert.match(source, /救援できるマルチバトルは最大3つまでです。/);
  assert.match(source, /未確認バトルを確認して下さい。/);
  assert.match(source, /参戦人数が上限に達しているため参戦できませんでした。/);
});

test('synthetic touch execution remains serialized and cancel-safe', () => {
  assert.match(source, /queueExclusive/);
  assert.match(source, /activeTapTargets/);
  assert.match(source, /function dispatchSyntheticTouch/);
  assert.match(source, /'touchcancel'/);
});
