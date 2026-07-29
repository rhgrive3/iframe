from pathlib import Path

source_path = Path('a.js')
test_path = Path('tests/autoflow.static.test.mjs')
source = source_path.read_text(encoding='utf-8')
tests = test_path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    source = source.replace(old, new, 1)


replace_once("  'use strict';\n", "  'use strict';\n\n  if (window.top !== window) return;\n", 'top-frame recursion guard')

replace_once(
    "  function findSelectorElement(selector){const doc=rootDocument();if(!doc)return{error:'ページ内部を確認できません（別ドメインの可能性）',fatal:true};const value=String(selector||'').trim();if(!value)return{error:'class または idを入力してください',fatal:true};const found=queryDeep(doc,value);if(found?.selectorError)return{error:'class / idの書き方が正しくありません',fatal:true};return{element:found?.element||null}}",
    "  function findSelectorElement(selector){const doc=rootDocument();if(!doc)return{error:'ページ内部を確認できません（別ドメインの可能性）',fatal:true};const value=String(selector||'').trim();if(!value)return{error:'class または idを入力してください',fatal:true};const found=queryDeep(doc,value);if(found?.selectorError)return{error:'class / idの書き方が正しくありません',fatal:true};return{element:found?.element||null}}\n  function findGranblueElement(selector){const doc=rootDocument();if(!doc)return{error:'ページ内部を確認できません（別ドメインの可能性）',fatal:true};try{return{element:doc.querySelector(selector)}}catch(error){return{error:'グラブルのボタンを確認できません',fatal:true}}}",
    'fast Granblue lookup'
)
replace_once("const found=findSelectorElement('.btn-auto')", "const found=findGranblueElement('.btn-auto')", 'full auto lookup')
replace_once("const found=findSelectorElement('.btn-attack-start')", "const found=findGranblueElement('.btn-attack-start')", 'attack lookup')
replace_once(
    "  function refreshGranblueAssistant(){const fullAuto=readGranblueFullAutoState(),attack=readGranblueAttackState();setGranblueCard(gbfFullAutoCard,gbfFullAutoState,gbfFullAutoDetail,fullAuto,'full_auto');setGranblueCard(gbfAttackCard,gbfAttackState,gbfAttackDetail,attack,'attack');renderConditionRecommendation()}",
    "  function refreshGranblueAssistant(){if(!state.settingsOpen||state.activeTab!=='condition')return;const fullAuto=readGranblueFullAutoState(),attack=readGranblueAttackState();setGranblueCard(gbfFullAutoCard,gbfFullAutoState,gbfFullAutoDetail,fullAuto,'full_auto');setGranblueCard(gbfAttackCard,gbfAttackState,gbfAttackDetail,attack,'attack');renderConditionRecommendation()}",
    'diagnosis visibility guard'
)
replace_once(
    "if(isGranblueConditionType(preset)){conditionType.value=preset}else if(preset==='page_ready')",
    "if(isGranblueConditionType(preset)){conditionTarget.value='selector';conditionSelector.value=preset.startsWith('gbf_full_auto_')?'.btn-auto':'.btn-attack-start';conditionType.value=preset}else if(preset==='page_ready')",
    'Granblue preset selector'
)
replace_once(
    "executePoint,readGranblueFullAutoState,readGranblueAttackState,selectorForElement,clickElementStatus,normalizeCondition,applySnapshot,snapshot,applyDockSize,setCompact,savePreset,restoreRecovery,method,positionRandomEnabled,timeRandomEnabled,readGranblueFullAutoState,readGranblueAttackState,conditionRecommendationFor,refreshGranblueAssistant",
    "executePoint,readGranblueFullAutoState,readGranblueAttackState,selectorForElement,clickElementStatus,normalizeCondition,applySnapshot,snapshot,applyDockSize,setCompact,savePreset,restoreRecovery,method,positionRandomEnabled,timeRandomEnabled,conditionRecommendationFor,refreshGranblueAssistant",
    'deduplicate test exports'
)

tests += r'''

test("same-page initial iframe cannot recursively install itself in child frames", () => {
  assert.match(source, /if \(window\.top !== window\) return;/);
});

test("Granblue presets bind their known stable selectors", () => {
  assert.match(source, /conditionSelector\.value=preset\.startsWith\('gbf_full_auto_'\)\?'\.btn-auto':'\.btn-attack-start'/);
  assert.match(source, /function findGranblueElement/);
  assert.match(source, /if\(!state\.settingsOpen\|\|state\.activeTab!=='condition'\)return/);
});
'''

source_path.write_text(source, encoding='utf-8')
test_path.write_text(tests, encoding='utf-8')
