import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../a.js", import.meta.url), "utf8");

test("v12 migration remains backward compatible", () => {
  assert.match(source, /state_v12/);
  assert.match(source, /state_v11/);
  assert.match(source, /version:12/);
});

test("principal touch targets meet enhanced sizing", () => {
  const marker = Number(source.match(/const MARKER_HIT_SIZE = (\d+);/)?.[1]);
  assert.ok(marker >= 44, `marker hit size was ${marker}`);
  assert.match(source, /button,select,input:not\(\[type=checkbox\]\)\{min-height:44px\}/);
  assert.match(source, /#browserHandle\{[^}]*height:44px/);
});

test("an empty flow remains empty and offers all action types", () => {
  assert.doesNotMatch(source, /if\(!state\.points\.length\)addPoint\(\)/);
  assert.match(source, /className='emptyFlow'/);
  assert.match(source, /最初の動作を選ぶ/);
  assert.match(source, /setAddMenu\(true\);controls\.add\.focus\(\)/);
});

test("keyboard and non-drag alternatives are present", () => {
  assert.match(source, /矢印キーで1px/);
  assert.match(source, /data-dock-position/);
  assert.match(source, /data-dock-size/);
  assert.match(source, /handlePanelShortcut/);
  assert.match(source, /event\.key==='Home'/);
  assert.match(source, /tabButtons\.forEach\(\(button,index\)=>/);
});

test("hidden panels are removed from focus order", () => {
  assert.match(source, /toggleAttribute\('inert'/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /aria-orientation="horizontal"/);
  assert.match(source, /aria-selected/);
});

test("dependent controls refresh immediately", () => {
  assert.match(source, /waitForTarget\.addEventListener\('change',\(\)=>\{saveClickTargetFromUi\(\);updateEditor\(\)\}\)/);
  assert.match(source, /p\.waitForLoad=waitForLoad\.checked;saveState\(\);updateEditor\(\)/);
  assert.match(source, /saveConditionFromUi\(\);updateEditor\(\)/);
  assert.match(source, /controls\.run\.disabled=state\.recording/);
  assert.match(source, /controls\.clear\.disabled=!has\|\|busy/);
});

test("responsive density remains readable", () => {
  assert.match(source, /@media\(max-width:340px\)\{#reload,#hideBrowser\{display:none\}\}/);
  assert.match(source, /#memoryRow\{grid-template-columns:minmax\(0,1\.4fr\) repeat\(2,minmax\(80px,\.7fr\)\)\}/);
  assert.match(source, /\.logEntry\{[^}]*font-size:11px/);
  assert.match(source, /usesSoftwareKeyboard/);
  assert.match(source, /\(hover:none\) and \(pointer:coarse\)/);
  assert.match(source, /if\(!usesSoftwareKeyboard\(\)\)return;enterKeyboardMode\(target\)/);
});

test("destructive and replacement operations are recoverable", () => {
  assert.match(source, /id="undo"/);
  assert.match(source, /createRecoveryPoint\('記録適用前'\)/);
  assert.match(source, /controls\.undo\.addEventListener/);
});

test("user-derived condition summaries do not use innerHTML", () => {
  assert.doesNotMatch(source, /conditionTargetSummary[^;\n]*innerHTML/);
  assert.match(source, /setConditionTargetSummary/);
});


test("Granblue assistant explains state and recommends conditions", () => {
  assert.match(source, /id="granblueAssistant"/);
  assert.match(source, /id="conditionRecommendation"/);
  assert.match(source, /function conditionRecommendationFor/);
  assert.match(source, /function refreshGranblueAssistant/);
  assert.match(source, /gbf_attack_ready/);
  assert.match(source, /gbf_attack_not_ready/);
  assert.match(source, /DOMにありますが画面には見えていません/);
});

test("condition choices explain existence visibility enabled and toggle states", () => {
  assert.match(source, /HTML上に生成された時/);
  assert.match(source, /実際に画面へ見えた時/);
  assert.match(source, /disabled解除/);
  assert.match(source, /classやaria属性だけ変化/);
});

test("first iframe load mirrors the parent page URL when no saved URL exists", () => {
  assert.match(source, /normalizeUrl\(!savedInitial\|\|savedInitial==='about:blank'\?location\.href:savedInitial\)/);
  assert.match(source, /urlInput\.value=initial;iframe\.src=initial/);
  assert.doesNotMatch(source, /iframe\.src=initial\|\|'about:blank'/);
});


test("same-page initial iframe cannot recursively install itself in child frames", () => {
  assert.match(source, /if \(window\.top !== window\) return;/);
});

test("Granblue presets bind their known stable selectors", () => {
  assert.match(source, /conditionSelector\.value=preset\.startsWith\('gbf_full_auto_'\)\?'\.btn-auto':'\.btn-attack-start'/);
  assert.match(source, /function findGranblueElement/);
  assert.match(source, /if\(!state\.settingsOpen\|\|state\.activeTab!=='condition'\)return/);
});


test("legacy about blank state also falls back to the parent URL", () => {
  assert.match(source, /!savedInitial\|\|savedInitial==='about:blank'\?location\.href:savedInitial/);
  assert.match(source, /if\(state\.activeTab==='condition'\)requestAnimationFrame\(refreshGranblueAssistant\)/);
});
