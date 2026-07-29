from pathlib import Path

path = Path("a.js")
source = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    source = source.replace(old, new, 1)


replace_once(
    '<button id="autoCondition" class="quickPreset smart">今と反対になったら</button></div><div id="conditionSentence"',
    '<button id="autoCondition" class="quickPreset smart">今と反対になったら</button></div><div class="quickPresetRow granbluePresetRow"><button class="quickPreset" data-condition-preset="gbf_full_auto_on">フルオート ON</button><button class="quickPreset" data-condition-preset="gbf_full_auto_off">フルオート OFF</button><button class="quickPreset" data-condition-preset="gbf_attack_on">攻撃 ON</button><button class="quickPreset" data-condition-preset="gbf_attack_off">攻撃 OFF</button></div><div id="conditionSentence"',
    "Granblue quick presets",
)

replace_once(
    '<option value="disabled">押せなくなった時</option><option value="class_has">',
    '<option value="disabled">押せなくなった時</option><option value="gbf_full_auto_on">フルオートがONの時</option><option value="gbf_full_auto_off">フルオートがOFFの時</option><option value="gbf_attack_on">攻撃ボタンがONの時</option><option value="gbf_attack_off">攻撃ボタンがOFFの時</option><option value="class_has">',
    "advanced condition options",
)

replace_once(
    "const types=['exists','missing','visible','hidden','state_on','state_off','enabled','disabled','class_has','class_missing','value_true','value_false','value_equals','value_not_equals','text_contains','text_not_contains','page_ready','url_contains','url_not_contains'];",
    "const types=['exists','missing','visible','hidden','state_on','state_off','enabled','disabled','gbf_full_auto_on','gbf_full_auto_off','gbf_attack_on','gbf_attack_off','class_has','class_missing','value_true','value_false','value_equals','value_not_equals','text_contains','text_not_contains','page_ready','url_contains','url_not_contains'];",
    "condition type allowlist",
)

helper_anchor = "  function findSelectorElement(selector){const doc=rootDocument();if(!doc)return{error:'ページ内部を確認できません（別ドメインの可能性）',fatal:true};const value=String(selector||'').trim();if(!value)return{error:'class または idを入力してください',fatal:true};const found=queryDeep(doc,value);if(found?.selectorError)return{error:'class / idの書き方が正しくありません',fatal:true};return{element:found?.element||null}}"
helper_code = helper_anchor + """
  const GRANBLUE_CONDITION_TYPES=['gbf_full_auto_on','gbf_full_auto_off','gbf_attack_on','gbf_attack_off'];
  const isGranblueConditionType=type=>GRANBLUE_CONDITION_TYPES.includes(type);
  function readGranblueFullAutoState(){const found=findSelectorElement('.btn-auto');if(found.error)return{known:false,error:found.error,fatal:found.fatal,current:'判定不可'};const element=found.element;if(!element)return{known:false,current:'ボタンなし',description:'フルオートボタンが見つかりません'};const on=element.classList.contains('on');return{known:true,on,element,current:on?'ON':'OFF'}}
  function readGranblueAttackState(){const found=findSelectorElement('.btn-attack-start');if(found.error)return{known:false,error:found.error,fatal:found.fatal,current:'判定不可'};const element=found.element;if(!element)return{known:false,current:'ボタンなし',description:'攻撃ボタンが見つかりません'};const doc=element.ownerDocument,cancel=queryDeep(doc,'.btn-attack-cancel')?.element||null,dummy=queryDeep(doc,'.prt-attack-start-dummy')?.element||null,shown=target=>Boolean(target)&&target.classList.contains('display-on')&&isVisibleElement(target),disabled=isDisabledElement(element)||element.classList.contains('disable'),on=shown(element)&&!disabled&&!shown(cancel)&&!shown(dummy);return{known:true,on,element,current:on?'ON':'OFF'}}"""
replace_once(helper_anchor, helper_code, "Granblue state readers")

replace_once(
    "let type=c.type;if(conditionTarget.value==='page'&&!['page_ready','url_contains','url_not_contains'].includes(type))type='page_ready';if(conditionTarget.value!=='page'&&['page_ready','url_contains','url_not_contains'].includes(type))type='exists';",
    "let type=c.type;const gameCondition=isGranblueConditionType(type);if(!gameCondition&&conditionTarget.value==='page'&&!['page_ready','url_contains','url_not_contains'].includes(type))type='page_ready';if(!gameCondition&&conditionTarget.value!=='page'&&['page_ready','url_contains','url_not_contains'].includes(type))type='exists';",
    "condition field coercion",
)
replace_once(
    "const usesSelector=conditionTarget.value==='selector',usesClass=",
    "const usesSelector=conditionTarget.value==='selector'&&!gameCondition,usesClass=",
    "Granblue selector visibility",
)

replace_once(
    "disabled:'押せなくなったら',class_has:",
    "disabled:'押せなくなったら',gbf_full_auto_on:'フルオートがONなら',gbf_full_auto_off:'フルオートがOFFなら',gbf_attack_on:'攻撃ボタンがONなら',gbf_attack_off:'攻撃ボタンがOFFなら',class_has:",
    "condition labels",
)

replace_once(
    "let target='選んだ対象';if(c.target==='page')target='ページ';else if(c.selector)target=c.selector;",
    "let target='選んだ対象';if(isGranblueConditionType(c.type))target='グラブルのバトル画面';else if(c.target==='page')target='ページ';else if(c.selector)target=c.selector;",
    "condition sentence target",
)

old_summary = "  function updateConditionTargetSummary(){const p=selectedPoint();if(!p||!conditionTargetSummary)return;const c=normalizeCondition(p.condition,p.type),target=baseConditionTarget(p,c),text=conditionTargetSummary.lastElementChild;if(c.target==='page')text.innerHTML=`<strong>ページ全体</strong><br>${conditionTypeLabel(c.type)}`;else if(target.error)text.innerHTML=`<strong>${c.selector||'対象未選択'}</strong><br>${target.error}`;else if(!target.element)text.innerHTML=`<strong>${c.selector||p.targetLabel||'対象未選択'}</strong><br>まだ見つかっていません`;else text.innerHTML=`<strong>${label(target.element)}</strong><br>${plainElementState(target.element)} · ${conditionTypeLabel(c.type)}`;updateConditionSentence()}"
new_summary = "  function updateConditionTargetSummary(){const p=selectedPoint();if(!p||!conditionTargetSummary)return;const c=normalizeCondition(p.condition,p.type),text=conditionTargetSummary.lastElementChild;if(isGranblueConditionType(c.type)){const result=evaluateCondition(p);text.innerHTML=`<strong>グラブルのバトル画面</strong><br>${conditionTypeLabel(c.type)} · 現在: ${result.current||'判定不可'}`;updateConditionSentence();return}const target=baseConditionTarget(p,c);if(c.target==='page')text.innerHTML=`<strong>ページ全体</strong><br>${conditionTypeLabel(c.type)}`;else if(target.error)text.innerHTML=`<strong>${c.selector||'対象未選択'}</strong><br>${target.error}`;else if(!target.element)text.innerHTML=`<strong>${c.selector||p.targetLabel||'対象未選択'}</strong><br>まだ見つかっていません`;else text.innerHTML=`<strong>${label(target.element)}</strong><br>${plainElementState(target.element)} · ${conditionTypeLabel(c.type)}`;updateConditionSentence()}"
replace_once(old_summary, new_summary, "condition target summary")

old_evaluate_start = "  function evaluateCondition(action){const condition=normalizeCondition(action.condition,action.type),target=baseConditionTarget(action,condition),type=condition.type;if(target.error)"
new_evaluate_start = "  function evaluateCondition(action){const condition=normalizeCondition(action.condition,action.type),type=condition.type;if(isGranblueConditionType(type)){const fullAuto=type.startsWith('gbf_full_auto_'),observed=fullAuto?readGranblueFullAutoState():readGranblueAttackState();if(observed.error)return{matched:false,error:observed.error,fatal:observed.fatal,current:observed.current,description:observed.error};if(!observed.known)return{matched:false,current:observed.current||'判定不可',description:observed.description||'対象ボタンが見つからないため判定できません'};const expectedOn=type.endsWith('_on'),matched=observed.on===expectedOn;return{matched,element:observed.element,current:observed.current,description:`${matched?'条件に合っています':'まだ条件に合いません'} · ${fullAuto?'フルオート':'攻撃ボタン'}: ${observed.current}`}}const target=baseConditionTarget(action,condition);if(target.error)"
replace_once(old_evaluate_start, new_evaluate_start, "Granblue condition evaluation")

replace_once(
    "if(conditionTarget.value==='page'&&!['page_ready','url_contains','url_not_contains'].includes(conditionType.value))conditionType.value='page_ready';",
    "if(!isGranblueConditionType(conditionType.value)&&conditionTarget.value==='page'&&!['page_ready','url_contains','url_not_contains'].includes(conditionType.value))conditionType.value='page_ready';",
    "condition change coercion",
)

replace_once(
    "if(preset==='page_ready'){conditionTarget.value='page';conditionType.value='page_ready'}else{conditionTarget.value=!isNavigate(p)&&!isWait(p)?'action':'selector';conditionType.value=preset}",
    "if(isGranblueConditionType(preset)){conditionType.value=preset}else if(preset==='page_ready'){conditionTarget.value='page';conditionType.value='page_ready'}else{conditionTarget.value=!isNavigate(p)&&!isWait(p)?'action':'selector';conditionType.value=preset}",
    "Granblue preset handler",
)

inspect_start = "controls.inspectCondition.addEventListener('click',()=>{const p=selectedPoint();if(!p)return;saveConditionFromUi();const c=normalizeCondition(p.condition,p.type),target=baseConditionTarget(p,c);if(target.error)"
inspect_new = "controls.inspectCondition.addEventListener('click',()=>{const p=selectedPoint();if(!p)return;saveConditionFromUi();const c=normalizeCondition(p.condition,p.type);if(isGranblueConditionType(c.type)){const result=evaluateCondition(p);showConditionResult(result);if(result.element)flashTarget(result.element,result.description);return}const target=baseConditionTarget(p,c);if(target.error)"
replace_once(inspect_start, inspect_new, "Granblue inspect handler")

replace_once(
    "executePoint,selectorForElement,clickElementStatus,normalizeCondition,",
    "executePoint,readGranblueFullAutoState,readGranblueAttackState,selectorForElement,clickElementStatus,normalizeCondition,",
    "test API exports",
)

path.write_text(source, encoding="utf-8")
