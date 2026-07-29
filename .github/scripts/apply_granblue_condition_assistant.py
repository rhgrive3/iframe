from pathlib import Path
import re

source_path = Path("a.js")
test_path = Path("tests/autoflow.static.test.mjs")
source = source_path.read_text(encoding="utf-8")
tests = test_path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    source = source.replace(old, new, 1)


def replace_regex(pattern: str, replacement: str, label: str, flags: int = 0) -> None:
    global source
    source, count = re.subn(pattern, replacement, source, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")


css = r'''
      /* Granblue condition assistant */
      .granblueAssistant{margin-bottom:10px;padding:12px;border:1px solid rgba(111,124,255,.28);border-radius:15px;background:linear-gradient(135deg,rgba(111,124,255,.12),rgba(53,201,130,.055))}
      .gbfAssistantHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.gbfAssistantTitle{font-size:13px;font-weight:840}.gbfAssistantCopy{margin-top:3px;color:var(--muted);font-size:11px;line-height:1.45}.gbfAssistantHeader button{flex:0 0 auto;min-height:40px;padding:0 12px;border-radius:10px;color:#dfe2ff;background:rgba(111,124,255,.18);font-size:11px}
      .gbfStatusGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:10px}.gbfStateCard{padding:10px;border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.14)}.gbfStateHead{display:flex;align-items:center;justify-content:space-between;gap:8px}.gbfStateName{font-size:11.5px;font-weight:800}.gbfStateBadge{padding:4px 7px;border-radius:999px;color:#dfe2ff;background:rgba(111,124,255,.17);font-size:10px;font-weight:800}.gbfStateCard[data-state="ready"] .gbfStateBadge,.gbfStateCard[data-state="on"] .gbfStateBadge{color:#a9ecc8;background:rgba(53,201,130,.14)}.gbfStateCard[data-state="off"] .gbfStateBadge,.gbfStateCard[data-state="blocked"] .gbfStateBadge{color:#f3d39d;background:rgba(227,168,77,.13)}.gbfStateCard[data-state="missing"] .gbfStateBadge{color:#c9ccd5;background:rgba(255,255,255,.08)}.gbfStateDetail{display:block;margin-top:6px;color:var(--muted);font-size:10.5px;line-height:1.45}
      .conditionChoiceGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.conditionChoice{min-height:62px;padding:9px 10px;border:1px solid transparent;border-radius:12px;text-align:left}.conditionChoice strong{display:block;font-size:11.5px}.conditionChoice small{display:block;margin-top:3px;color:var(--muted);font-size:10px;line-height:1.35}.conditionChoice.active{border-color:rgba(111,124,255,.46);background:rgba(111,124,255,.16)}.conditionChoice.smart{grid-column:1/-1;color:#e3e6ff;background:rgba(111,124,255,.14)}
      .conditionRecommendation{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;margin-top:9px;padding:10px;border:1px solid rgba(53,201,130,.22);border-radius:12px;background:rgba(53,201,130,.065)}.conditionRecommendationTag{display:block;color:#91e5b7;font-size:9.5px;font-weight:850;letter-spacing:.06em}.conditionRecommendation strong{display:block;margin-top:2px;font-size:12px}.conditionRecommendation p{margin:4px 0 0;color:var(--muted);font-size:10.5px;line-height:1.45}.conditionRecommendation button{min-width:112px;padding:0 11px;border-radius:10px;color:#07170f;background:var(--green);font-size:11px}.conditionRecommendation.unavailable{border-color:var(--line);background:rgba(255,255,255,.025)}.conditionRecommendation.unavailable .conditionRecommendationTag{color:var(--subtle)}
      .conditionGuide{margin-top:9px;border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.10)}.conditionGuide summary{min-height:44px;display:flex;align-items:center;justify-content:space-between;padding:10px 12px;color:var(--muted);cursor:pointer;font-size:11.5px;font-weight:780;list-style:none}.conditionGuide summary::-webkit-details-marker{display:none}.conditionGuide summary::after{content:'＋'}.conditionGuide[open] summary::after{content:'−'}.conditionGuideBody{display:grid;gap:7px;padding:0 10px 10px}.conditionGuideItem{padding:8px 9px;border-radius:10px;background:rgba(255,255,255,.035);font-size:10.5px;line-height:1.45}.conditionGuideItem b{color:#fff}.conditionGuideItem span{color:var(--muted)}
      .granbluePresetRow{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding:0 9px 9px}.gbfPreset{min-height:54px;padding:8px 9px;border-radius:11px;text-align:left}.gbfPreset strong{display:block;font-size:11px}.gbfPreset small{display:block;margin-top:3px;color:var(--muted);font-size:9.5px;line-height:1.35}.gbfPreset.active{box-shadow:inset 0 0 0 1px rgba(111,124,255,.48);background:rgba(111,124,255,.16)}
      @media(max-width:480px){.gbfStatusGrid,.conditionChoiceGrid{grid-template-columns:1fr}.conditionChoice.smart{grid-column:auto}.conditionRecommendation{grid-template-columns:1fr}.conditionRecommendation button{width:100%}}
'''
replace_once("    </style>", css + "    </style>", "assistant css")

assistant_html = r'''              <div id="granblueAssistant" class="granblueAssistant">
                <div class="gbfAssistantHeader"><div><div class="gbfAssistantTitle">グラブル状態診断</div><div class="gbfAssistantCopy">ボタンが「未出現・非表示・押せない・ON/OFF」のどれかを分けて表示します。</div></div><button id="scanGranblue">現在の画面を診断</button></div>
                <div class="gbfStatusGrid">
                  <div id="gbfFullAutoCard" class="gbfStateCard" data-state="missing"><div class="gbfStateHead"><span class="gbfStateName">フルオート</span><span id="gbfFullAutoState" class="gbfStateBadge">未診断</span></div><small id="gbfFullAutoDetail" class="gbfStateDetail">.btn-auto の状態を確認します</small></div>
                  <div id="gbfAttackCard" class="gbfStateCard" data-state="missing"><div class="gbfStateHead"><span class="gbfStateName">攻撃ボタン</span><span id="gbfAttackState" class="gbfStateBadge">未診断</span></div><small id="gbfAttackDetail" class="gbfStateDetail">出現・表示・操作可能状態を確認します</small></div>
                </div>
              </div>
'''
anchor = '''              <div class="conditionStep">
                <div class="stepTitle"><span class="stepNumber">1</span><span>どのボタンを見ますか？</span></div>'''
replace_once(anchor, assistant_html + anchor, "assistant html")

condition_ui = r'''                <div class="conditionChoiceGrid">
                  <button class="conditionChoice" data-condition-preset="visible"><strong>表示されたら</strong><small>DOMにあるだけでなく、画面に見えた時</small></button>
                  <button class="conditionChoice" data-condition-preset="enabled"><strong>押せるようになったら</strong><small>disabledが解除され、操作可能になった時</small></button>
                  <button class="conditionChoice" data-condition-preset="state_on"><strong>ONになったら</strong><small>同じボタンの状態がONへ切り替わった時</small></button>
                  <button class="conditionChoice" data-condition-preset="state_off"><strong>OFFになったら</strong><small>同じボタンの状態がOFFへ切り替わった時</small></button>
                  <button class="conditionChoice" data-condition-preset="missing"><strong>消えたら</strong><small>ボタン自体がDOMからなくなった時</small></button>
                  <button class="conditionChoice" data-condition-preset="page_ready"><strong>読込が終わったら</strong><small>ページ全体のロード完了を待つ時</small></button>
                  <button id="autoCondition" class="conditionChoice smart"><strong>現在状態から自動で選ぶ</strong><small>選んだボタンを診断し、最適な条件を提案します</small></button>
                </div>
                <div id="conditionRecommendation" class="conditionRecommendation unavailable"><div><span class="conditionRecommendationTag">おすすめ</span><strong id="conditionRecommendationTitle">ボタンを選んでください</strong><p id="conditionRecommendationReason">現在の状態を確認すると、使うべき条件と理由を表示します。</p></div><button id="applyConditionRecommendation" disabled>この条件を使う</button></div>
                <details class="conditionGuide"><summary>条件の違いを確認</summary><div class="conditionGuideBody">
                  <div class="conditionGuideItem"><b>見つかった時</b><br><span>HTML上に生成された時。display:noneで見えなくても成立します。</span></div>
                  <div class="conditionGuideItem"><b>表示された時</b><br><span>実際に画面へ見えた時。グラブルの出現待ちは通常これが最適です。</span></div>
                  <div class="conditionGuideItem"><b>押せるようになった時</b><br><span>表示済みだがdisable中のボタンが操作可能になった時。</span></div>
                  <div class="conditionGuideItem"><b>ON / OFFになった時</b><br><span>同じボタンが残ったままclassやaria属性だけ変化する切替状態用です。</span></div>
                </div></details>
                <details class="gamePresets"><summary>グラブル専用の条件</summary><div class="granbluePresetRow">
                  <button class="gbfPreset" data-condition-preset="gbf_full_auto_on"><strong>フルオートがON</strong><small>.btn-auto の on 状態を判定</small></button>
                  <button class="gbfPreset" data-condition-preset="gbf_full_auto_off"><strong>フルオートがOFF</strong><small>ボタンが存在し、onでない状態</small></button>
                  <button class="gbfPreset" data-condition-preset="gbf_attack_ready"><strong>攻撃が押せる</strong><small>表示・有効・攻撃中でない状態</small></button>
                  <button class="gbfPreset" data-condition-preset="gbf_attack_not_ready"><strong>攻撃できない</strong><small>未出現・無効・攻撃中をまとめて判定</small></button>
                </div></details><div id="conditionSentence"'''
replace_regex(r'''                <div class="quickPresetRow"><button class="quickPreset" data-condition-preset="visible">.*?</details><div id="conditionSentence"''', condition_ui, "condition chooser", flags=re.S)

replace_once("restoreRecovery:$('restoreRecovery')};", "restoreRecovery:$('restoreRecovery'),scanGranblue:$('scanGranblue'),applyConditionRecommendation:$('applyConditionRecommendation')};", "controls")
replace_once("conditionTargetSummary=$('conditionTargetSummary'),conditionSentence=$('conditionSentence');", "conditionTargetSummary=$('conditionTargetSummary'),conditionSentence=$('conditionSentence'),conditionRecommendation=$('conditionRecommendation'),conditionRecommendationTitle=$('conditionRecommendationTitle'),conditionRecommendationReason=$('conditionRecommendationReason'),gbfFullAutoCard=$('gbfFullAutoCard'),gbfFullAutoState=$('gbfFullAutoState'),gbfFullAutoDetail=$('gbfFullAutoDetail'),gbfAttackCard=$('gbfAttackCard'),gbfAttackState=$('gbfAttackState'),gbfAttackDetail=$('gbfAttackDetail');", "assistant refs")
replace_once("keyboardFocusTimer:null};", "keyboardFocusTimer:null,conditionRecommendation:null};", "assistant state")

old_normalize = """  function normalizeCondition(value,actionType='click') { const c=value&&typeof value==='object'?value:{};let target=c.target==='point'?'action':c.target;const allowedTargets=actionType==='click'?['action','selector','page']:['selector','page'];if(!allowedTargets.includes(target))target=actionType==='click'?'action':'selector';const types=['exists','missing','visible','hidden','state_on','state_off','enabled','disabled','gbf_full_auto_on','gbf_full_auto_off','gbf_attack_on','gbf_attack_off','class_has','class_missing','value_true','value_false','value_equals','value_not_equals','text_contains','text_not_contains','page_ready','url_contains','url_not_contains'];return {enabled:actionType==='wait'?c.enabled!==false:Boolean(c.enabled),mode:c.mode==='check'?'check':'wait',target,selector:String(c.selector||''),type:types.includes(c.type)?c.type:'exists',className:String(c.className||''),valueName:String(c.valueName||'aria-pressed'),expected:String(c.expected??'false'),text:String(c.text||''),timeoutMs:normalizeConditionTimeout(c.timeoutMs),timeoutAction:['skip','execute'].includes(c.timeoutAction)?c.timeoutAction:'stop',stableMs:normalizeConditionStable(c.stableMs)}; }"""
new_normalize = """  function normalizeCondition(value,actionType='click') { const c=value&&typeof value==='object'?value:{};let target=c.target==='point'?'action':c.target;const allowedTargets=actionType==='click'?['action','selector','page']:['selector','page'];if(!allowedTargets.includes(target))target=actionType==='click'?'action':'selector';const types=['exists','missing','visible','hidden','state_on','state_off','enabled','disabled','gbf_full_auto_on','gbf_full_auto_off','gbf_attack_ready','gbf_attack_not_ready','class_has','class_missing','value_true','value_false','value_equals','value_not_equals','text_contains','text_not_contains','page_ready','url_contains','url_not_contains'];const migratedType=c.type==='gbf_attack_on'?'gbf_attack_ready':c.type==='gbf_attack_off'?'gbf_attack_not_ready':c.type;return {enabled:actionType==='wait'?c.enabled!==false:Boolean(c.enabled),mode:c.mode==='check'?'check':'wait',target,selector:String(c.selector||''),type:types.includes(migratedType)?migratedType:'exists',className:String(c.className||''),valueName:String(c.valueName||'aria-pressed'),expected:String(c.expected??'false'),text:String(c.text||''),timeoutMs:normalizeConditionTimeout(c.timeoutMs),timeoutAction:['skip','execute'].includes(c.timeoutAction)?c.timeoutAction:'stop',stableMs:normalizeConditionStable(c.stableMs)}; }"""
replace_once(old_normalize, new_normalize, "normalize condition")
replace_once('<option value="gbf_attack_on">攻撃ボタンがONの時</option><option value="gbf_attack_off">攻撃ボタンがOFFの時</option>', '<option value="gbf_attack_ready">攻撃ボタンが押せる時</option><option value="gbf_attack_not_ready">攻撃ボタンが押せない時</option>', "advanced Granblue options")

helpers = r'''  const GRANBLUE_CONDITION_TYPES=['gbf_full_auto_on','gbf_full_auto_off','gbf_attack_ready','gbf_attack_not_ready','gbf_attack_on','gbf_attack_off'];
  const isGranblueConditionType=type=>GRANBLUE_CONDITION_TYPES.includes(type);
  function granblueKindForElement(element){const target=element?.closest?.('.btn-auto,.btn-attack-start')||element;if(target?.matches?.('.btn-auto'))return'full_auto';if(target?.matches?.('.btn-attack-start'))return'attack';return null}
  function inspectElementState(element){if(!element)return{exists:false,visible:false,enabled:false,toggle:null,evidence:'DOMにまだ生成されていません'};const view=element.ownerDocument?.defaultView||window,style=view.getComputedStyle?.(element),visible=isVisibleElement(element),enabled=!isDisabledElement(element),toggle=booleanState(element),evidence=[];if(element.classList?.contains('on'))evidence.push('class: on');for(const name of ['aria-pressed','aria-checked','aria-selected','aria-expanded','aria-disabled']){const value=element.getAttribute?.(name);if(value!==null)evidence.push(`${name}: ${value}`)}if(style?.display==='none')evidence.push('display: none');else if(style?.visibility==='hidden')evidence.push('visibility: hidden');else evidence.push(visible?'画面に表示':'画面外またはサイズ0');return{exists:true,visible,enabled,toggle,evidence:evidence.join(' / ')}}
  function readGranblueFullAutoState(){const found=findSelectorElement('.btn-auto');if(found.error)return{known:false,exists:false,visible:false,error:found.error,fatal:found.fatal,current:'判定不可',status:'missing'};const element=found.element;if(!element)return{known:false,exists:false,visible:false,current:'未出現',status:'missing',description:'フルオートボタンはまだDOMに生成されていません'};const observed=inspectElementState(element),on=element.classList.contains('on')||observed.toggle===true,current=!observed.visible?`非表示・${on?'ON':'OFF'}`:on?'表示・ON':'表示・OFF';return{known:true,exists:true,visible:observed.visible,enabled:observed.enabled,on,element,current,status:on?'on':'off',evidence:observed.evidence,description:`フルオート: ${current}`}}
  function readGranblueAttackState(){const found=findSelectorElement('.btn-attack-start');if(found.error)return{known:false,exists:false,visible:false,error:found.error,fatal:found.fatal,current:'判定不可',status:'missing'};const element=found.element;if(!element)return{known:false,exists:false,visible:false,current:'未出現',status:'missing',description:'攻撃ボタンはまだDOMに生成されていません'};const doc=element.ownerDocument,cancel=queryDeep(doc,'.btn-attack-cancel')?.element||null,dummy=queryDeep(doc,'.prt-attack-start-dummy')?.element||null,shown=target=>Boolean(target)&&target.classList.contains('display-on')&&isVisibleElement(target),observed=inspectElementState(element),displayOn=element.classList.contains('display-on')||observed.visible,cancelVisible=shown(cancel),dummyVisible=shown(dummy),disabled=!observed.enabled||element.classList.contains('disable'),ready=displayOn&&observed.visible&&!disabled&&!cancelVisible&&!dummyVisible;let current,status;if(!observed.visible){current='非表示';status='missing'}else if(cancelVisible){current='攻撃中';status='blocked'}else if(dummyVisible){current='操作切替中';status='blocked'}else if(disabled){current='表示・押せない';status='blocked'}else if(ready){current='表示・押せる';status='ready'}else{current='表示・待機中';status='blocked'}return{known:true,exists:true,visible:observed.visible,enabled:observed.enabled,ready,on:ready,element,current,status,cancelVisible,dummyVisible,evidence:observed.evidence,description:`攻撃ボタン: ${current}`}}
  function selectorHintsGranblue(selector){const value=String(selector||'');if(value.includes('btn-auto'))return'full_auto';if(value.includes('btn-attack-start'))return'attack';return null}
  function conditionRecommendationFor(action){if(!action)return{available:false,title:'動作を選んでください',reason:'条件を設定する動作が選択されていません。'};const condition=normalizeCondition(action.condition,action.type);if(condition.target==='page')return{available:true,type:'page_ready',target:'page',title:'「読込が終わったら」がおすすめ',reason:'ページ全体を対象にしているため、要素の表示やON/OFFではなくロード完了を待つのが安全です。'};const target=baseConditionTarget(action,condition),selector=condition.target==='selector'?condition.selector:(!isNavigate(action)&&!isWait(action)&&action.targetMode==='selector'?action.selector:'');if(target.error&&!selector)return{available:false,title:'対象を選んでください',reason:target.error};const element=target.element||null,kind=granblueKindForElement(element)||selectorHintsGranblue(selector);if(kind==='full_auto'){const state=readGranblueFullAutoState();if(!state.exists||!state.visible)return{available:true,type:'visible',target:'selector',selector:'.btn-auto',title:'「表示されたら」がおすすめ',reason:state.exists?'フルオートボタンはDOMにありますが非表示です。ON/OFFより先に、画面へ表示されるのを待つ必要があります。':'フルオートボタンはまだ未出現です。グラブルでは表示タイミングが変わるため、.btn-auto が見えるまで待つのが安定します。'};return{available:true,type:state.on?'gbf_full_auto_off':'gbf_full_auto_on',target:'selector',selector:'.btn-auto',title:`「フルオートが${state.on?'OFF':'ON'}」がおすすめ`,reason:`現在は${state.current}です。同じボタンのclassが切り替わるため、一般的な表示条件ではなく専用のON/OFF判定が最適です。`}}if(kind==='attack'){const state=readGranblueAttackState();return{available:true,type:state.ready?'gbf_attack_not_ready':'gbf_attack_ready',target:'selector',selector:'.btn-attack-start',title:`「攻撃が${state.ready?'押せない':'押せる'}」がおすすめ`,reason:`現在は「${state.current}」です。攻撃ボタンは表示だけでなく、disable・攻撃中表示・ダミー表示を合わせて判定します。`}}if(!element)return{available:true,type:'exists',target:'selector',selector,title:'「見つかった時」がおすすめ',reason:'対象はまだDOMにありません。まずボタン自体が生成されるのを待ちます。'};const observed=inspectElementState(element);if(!observed.visible)return{available:true,type:'visible',target:condition.target,selector,title:'「表示されたら」がおすすめ',reason:'対象はDOMにありますが画面には見えていません。存在条件はすでに成立してしまうため、表示条件を使います。'};if(!observed.enabled)return{available:true,type:'enabled',target:condition.target,selector,title:'「押せるようになったら」がおすすめ',reason:'対象は表示されていますが操作不可です。表示ではなくdisabled解除を待つのが適切です。'};if(observed.toggle!==null)return{available:true,type:observed.toggle?'state_off':'state_on',target:condition.target,selector,title:`「${observed.toggle?'OFF':'ON'}になったら」がおすすめ`,reason:`現在は${observed.toggle?'ON':'OFF'}として判定できます。同じボタンの状態変化を待つ条件が最適です。`};return{available:true,type:'visible',target:condition.target,selector,title:'「表示されたら」がおすすめ',reason:'対象は表示・操作可能ですが明確なON/OFF属性がありません。最も誤判定しにくい表示条件を使います。'}}
  function renderConditionRecommendation(){if(!conditionRecommendation)return;const rec=conditionRecommendationFor(selectedPoint());state.conditionRecommendation=rec;conditionRecommendation.classList.toggle('unavailable',!rec.available);conditionRecommendationTitle.textContent=rec.title;conditionRecommendationReason.textContent=rec.reason;controls.applyConditionRecommendation.disabled=!rec.available}
  function applyConditionRecommendation(rec=state.conditionRecommendation){const p=selectedPoint();if(!p||!rec?.available)return;conditionEnabled.checked=true;conditionType.value=rec.type;if(rec.target)conditionTarget.value=rec.target;if(rec.selector!==undefined)conditionSelector.value=rec.selector;saveConditionFromUi();updateEditor();const result=evaluateCondition(p);showConditionResult(result);updateStatus(`${rec.title}を設定しました`)}
  function setGranblueCard(card,badge,detail,result,kind){if(!card)return;card.dataset.state=result.status||'missing';badge.textContent=result.current||'判定不可';if(result.error)detail.textContent=result.error;else if(!result.exists)detail.textContent=kind==='full_auto'?'.btn-auto はまだ未出現です':'.btn-attack-start はまだ未出現です';else if(kind==='full_auto')detail.textContent=`${result.visible?'画面に表示':'DOMには存在・画面では非表示'} / ${result.evidence||'状態属性なし'}`;else detail.textContent=`${result.ready?'今すぐ押せます':'今は押せません'} / ${result.evidence||'状態属性なし'}`}
  function refreshGranblueAssistant(){const fullAuto=readGranblueFullAutoState(),attack=readGranblueAttackState();setGranblueCard(gbfFullAutoCard,gbfFullAutoState,gbfFullAutoDetail,fullAuto,'full_auto');setGranblueCard(gbfAttackCard,gbfAttackState,gbfAttackDetail,attack,'attack');renderConditionRecommendation()}
'''
replace_regex(r"^  const GRANBLUE_CONDITION_TYPES=.*?^  function readGranblueAttackState\(\).*$", helpers.rstrip(), "Granblue analyzer", flags=re.M | re.S)

condition_label = """  function conditionTypeLabel(type){return({exists:'見つかったら',missing:'消えたら',visible:'表示されたら',hidden:'見えなくなったら',state_on:'ONになったら',state_off:'OFFになったら',enabled:'押せるようになったら',disabled:'押せなくなったら',gbf_full_auto_on:'フルオートがONなら',gbf_full_auto_off:'フルオートがOFFなら',gbf_attack_ready:'攻撃ボタンが押せるなら',gbf_attack_not_ready:'攻撃ボタンが押せないなら',gbf_attack_on:'攻撃ボタンが押せるなら',gbf_attack_off:'攻撃ボタンが押せないなら',class_has:'指定classが付いたら',class_missing:'指定classが消えたら',value_true:'値がtrueになったら',value_false:'値がfalseになったら',value_equals:'値が一致したら',value_not_equals:'値が変わったら',text_contains:'指定文字が出たら',text_not_contains:'指定文字が消えたら',page_ready:'ページの読込が終わったら',url_contains:'URLに文字が入ったら',url_not_contains:'URLから文字が消えたら'})[type]||'条件が合ったら'}"""
replace_regex(r"^  function conditionTypeLabel\(type\).*$", condition_label, "condition labels", flags=re.M)

eval_prefix = """  function evaluateCondition(action){const condition=normalizeCondition(action.condition,action.type),type=condition.type;if(isGranblueConditionType(type)){const fullAuto=type.startsWith('gbf_full_auto_'),observed=fullAuto?readGranblueFullAutoState():readGranblueAttackState();if(observed.error)return{matched:false,error:observed.error,fatal:observed.fatal,current:observed.current,description:observed.error};if(!observed.exists)return{matched:type==='gbf_attack_not_ready'||type==='gbf_attack_off',current:observed.current||'未出現',description:observed.description||'対象ボタンはまだ未出現です'};const expected=fullAuto?type.endsWith('_on'):type==='gbf_attack_ready'||type==='gbf_attack_on',actual=fullAuto?observed.on:observed.ready,matched=actual===expected;return{matched,element:observed.element,current:observed.current,description:`${matched?'条件に合っています':'まだ条件に合いません'} · ${fullAuto?'フルオート':'攻撃ボタン'}: ${observed.current}`}}const target="""
replace_regex(r"^  function evaluateCondition\(action\)\{.*?\}const target=", eval_prefix, "Granblue evaluation", flags=re.M)

replace_once("conditionStable.disabled=!p||busy||!conditionEnabled.checked||conditionMode.value==='check';updateConditionFields();", "conditionStable.disabled=!p||busy||!conditionEnabled.checked||conditionMode.value==='check';updateConditionFields();refreshGranblueAssistant();", "editor assistant refresh")
replace_regex(r"^  controls\.autoCondition\.addEventListener\('click'.*$", "  controls.autoCondition.addEventListener('click',()=>applyConditionRecommendation(conditionRecommendationFor(selectedPoint())));controls.applyConditionRecommendation.addEventListener('click',()=>applyConditionRecommendation());controls.scanGranblue.addEventListener('click',()=>{refreshGranblueAssistant();updateStatus('グラブルの現在状態を診断しました')});", "assistant events", flags=re.M)
replace_once("saveConditionFromUi();updateEditor();showConditionResult(evaluateCondition(p))}));", "saveConditionFromUi();updateEditor();refreshGranblueAssistant();showConditionResult(evaluateCondition(p))}));", "preset refresh")
replace_once("if(!state.running)updateStatus('読込完了');saveState()}catch{if(!state.running)updateStatus('読込完了・別ドメイン')}", "if(!state.running)updateStatus('読込完了');saveState();refreshGranblueAssistant()}catch{if(!state.running)updateStatus('読込完了・別ドメイン');refreshGranblueAssistant()}", "iframe diagnosis")
replace_once("else updateConditionTargetSummary()},700);", "else updateConditionTargetSummary();refreshGranblueAssistant()},700);", "live diagnosis")
replace_once("const initial=normalizeUrl(urlInput.value);iframe.src=initial||'about:blank';if(!initial)urlInput.focus();", "const initial=normalizeUrl(urlInput.value||location.href);urlInput.value=initial;iframe.src=initial;", "parent URL initial load")
replace_once("restoreRecovery,method,positionRandomEnabled,timeRandomEnabled};", "restoreRecovery,method,positionRandomEnabled,timeRandomEnabled,readGranblueFullAutoState,readGranblueAttackState,conditionRecommendationFor,refreshGranblueAssistant};", "test exports")

tests += r'''

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
  assert.match(source, /normalizeUrl\(urlInput\.value\|\|location\.href\)/);
  assert.match(source, /urlInput\.value=initial;iframe\.src=initial/);
  assert.doesNotMatch(source, /iframe\.src=initial\|\|'about:blank'/);
});
'''

source_path.write_text(source, encoding="utf-8")
test_path.write_text(tests, encoding="utf-8")
