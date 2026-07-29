from pathlib import Path

path = Path("a.js")
source = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    source = source.replace(old, new, 1)


def replace_all(old: str, new: str, expected: int, label: str) -> None:
    global source
    count = source.count(old)
    if count != expected:
        raise SystemExit(f"{label}: expected {expected} matches, got {count}")
    source = source.replace(old, new)


replace_once(
    "  const STORAGE_KEY = '__fullscreen_iframe_autoclicker_state_v11__';",
    "  const STORAGE_KEY = '__fullscreen_iframe_autoclicker_state_v12__';",
    "storage version",
)
replace_once(
    "  const LEGACY_STORAGE_KEYS = [\n    '__fullscreen_iframe_autoclicker_state_v10__',",
    "  const LEGACY_STORAGE_KEYS = [\n    '__fullscreen_iframe_autoclicker_state_v11__',\n    '__fullscreen_iframe_autoclicker_state_v10__',",
    "legacy v11 storage",
)
replace_once("  const MARKER_HIT_SIZE = 42;", "  const MARKER_HIT_SIZE = 48;", "marker target size")
replace_once(
    "  const DRAG_THRESHOLD_PX = 3;",
    "  const DRAG_THRESHOLD_PX = 3;\n  const COMPACT_DOCK_WIDTH = 104;\n  const COMPACT_DOCK_HEIGHT = 52;",
    "compact constants",
)
replace_once(
    "      #dock.compact{width:90px!important;height:46px!important;border-radius:23px;box-shadow:0 10px 30px rgba(0,0,0,.38)}",
    "      #dock.compact{width:${COMPACT_DOCK_WIDTH}px!important;height:${COMPACT_DOCK_HEIGHT}px!important;border-radius:26px;box-shadow:0 10px 30px rgba(0,0,0,.38)}",
    "compact dock css",
)
replace_once(
    "      #compactBar{display:none;width:90px;height:46px;grid-template-columns:44px 42px;gap:0;padding:2px}",
    "      #compactBar{display:none;width:${COMPACT_DOCK_WIDTH}px;height:${COMPACT_DOCK_HEIGHT}px;grid-template-columns:52px 48px;gap:0;padding:2px}",
    "compact bar css",
)
replace_once(
    "#compactGrip,#compactRun{height:42px;border-radius:21px}",
    "#compactGrip,#compactRun{height:48px;border-radius:24px}",
    "compact controls css",
)

ux_css = r'''
      /* v12: touch-first readability, hierarchy, accessibility, and recovery */
      :host{--muted:rgba(255,255,255,.72);--subtle:rgba(255,255,255,.58)}
      button,select,input:not([type=checkbox]){min-height:44px}
      button{font-weight:750}
      input:not([type=checkbox]),select{font-size:13px;line-height:1.25}
      input:focus-visible,select:focus-visible,button:focus-visible,summary:focus-visible,.marker:focus-visible{outline:2px solid #b7bdff;outline-offset:2px;box-shadow:0 0 0 4px rgba(111,124,255,.22)!important}
      #browserBar{gap:6px;padding:6px}
      #browserBar button{width:44px;height:44px}
      #url{height:44px;font-size:16px}
      #browserHandle{width:58px;height:44px;border-radius:0 0 15px 15px}
      #recordHud{min-height:52px}
      #recordHud button{min-width:48px}
      #topBar{grid-template-columns:44px minmax(0,1fr) 44px 44px 44px;min-height:56px;padding:5px 7px}
      #dockHandle,.iconButton{width:44px;height:44px}
      .undoButton{color:#d7dcff;background:rgba(111,124,255,.14)}
      .brandTitle{font-size:13px}.brandStatus{font-size:11.5px;line-height:1.35}
      #actionBar{gap:8px;padding:10px}.mainAction{height:48px;font-size:13px}
      .addChoice{min-height:62px}.addChoice strong{font-size:13px}.addChoice small{font-size:11px;line-height:1.35}.choiceIcon{width:34px;height:34px}
      .sequenceHeader{font-size:11px}.sequenceHeader button{height:40px;font-size:11px}
      .pointChip{height:46px;min-width:96px}.chipText{font-size:11.5px}.chipIcon{font-size:12px}
      #tabBar{padding:8px 10px}.tabButton{height:44px;font-size:12px}
      .tabPage{padding:12px}.card{padding:14px}.cardTitle{font-size:14px}.cardMeta{font-size:11px;line-height:1.4}
      .field{gap:6px;font-size:12px;line-height:1.35}.field.inline{min-height:48px}.field input[type=number],.field input[type=text],.field input[type=url],.field select{height:44px;font-size:13px}
      .buttonRow button{height:44px;font-size:12px}
      .plainHelp,.callout,.conditionResult,.conditionTargetSummary,.conditionSentence,.targetSummary,.sameOriginNote,.runStats,.saveMeta{font-size:11.5px}
      .quickPreset{min-height:44px;font-size:11.5px}
      #memoryRow button,#memoryRow select{height:44px;font-size:12px}
      .advanced summary,.gamePresets summary{min-height:44px;display:flex;align-items:center;justify-content:space-between;padding:10px 12px;font-size:12px}
      .useSwitch{min-height:44px;font-size:11.5px}.targetMode button{height:44px;font-size:12px}
      .pickerHint{font-size:12px}.pickerHint button{width:44px;height:44px}
      .resizeHandle{width:44px;height:44px}
      .emptyFlow{flex:1 0 100%;min-height:76px;display:flex;align-items:center;justify-content:center;gap:10px;padding:12px;border:1px dashed rgba(183,189,255,.34);border-radius:13px;color:#e4e7ff;background:rgba(111,124,255,.08);text-align:left}
      .emptyFlowIcon{width:36px;height:36px;display:grid;place-items:center;flex:0 0 auto;border-radius:11px;background:rgba(111,124,255,.18);font-size:20px}.emptyFlow strong{display:block;font-size:13px}.emptyFlow small{display:block;margin-top:3px;color:var(--muted);font-size:11px}
      .gamePresets{margin:0 0 9px;border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.10)}.gamePresets summary{color:var(--muted);cursor:pointer;list-style:none}.gamePresets summary::-webkit-details-marker{display:none}.gamePresets summary::after{content:'＋'}.gamePresets[open] summary::after{content:'−'}.gamePresets .quickPresetRow{padding:0 9px 9px;margin:0}
      .layoutGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.sizePresetRow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:8px}.layoutGrid button,.sizePresetRow button{min-height:44px;border-radius:11px;font-size:11.5px}
      @media(max-width:540px){#topBar{grid-template-columns:44px minmax(0,1fr) 44px 44px 44px}.brandStatus{display:none}.cardHeader{align-items:flex-start;flex-wrap:wrap}.layoutGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.sizePresetRow{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(prefers-contrast:more){:host{--line:rgba(255,255,255,.25);--line-strong:rgba(255,255,255,.42);--muted:rgba(255,255,255,.86);--subtle:rgba(255,255,255,.76)}button,input,select,.card{border-color:var(--line-strong)!important}}
'''
replace_once("    </style>", ux_css + "    </style>", "v12 css")

replace_once(
    '          <button id="quickSave" class="iconButton quickSaveButton" title="選択中の保存先へ上書き保存">保存</button>',
    '          <button id="undo" class="iconButton undoButton" title="直前の削除・読込を元に戻す" aria-label="直前の削除または読込を元に戻す">↶</button>',
    "top undo",
)
replace_once(
    '<button id="addMenuButton" class="mainAction">＋ 追加</button>',
    '<button id="addMenuButton" class="mainAction" aria-expanded="false" aria-controls="addMenu">＋ 追加</button>',
    "add menu aria",
)
replace_once(
    '<button id="settingsToggle" class="iconButton" title="設定を開閉" aria-label="設定を開閉">⌄</button>',
    '<button id="settingsToggle" class="iconButton" title="設定を開閉" aria-label="設定を開閉" aria-expanded="true" aria-controls="settingsPanel">⌄</button>',
    "settings aria",
)
replace_once(
    '<div class="sequenceHeader"><span>実行順</span><button id="clearPoints">すべて消す</button></div>',
    '<div class="sequenceHeader"><span>実行順</span><button id="clearPoints" title="すべての動作を消す">全消去</button></div>',
    "clear label",
)
replace_once(
    '          <div id="tabBar">',
    '          <div id="tabBar" role="tablist" aria-label="設定カテゴリ">',
    "tablist role",
)
replace_once(
    '            <button class="tabButton active" data-tab="action">動作</button>\n'
    '            <button class="tabButton" data-tab="condition">条件</button>\n'
    '            <button class="tabButton" data-tab="global">全体</button>\n'
    '            <button class="tabButton" data-tab="save">保存</button>',
    '            <button id="tabActionButton" class="tabButton active" data-tab="action" role="tab" aria-selected="true" aria-controls="tabAction">動作</button>\n'
    '            <button id="tabConditionButton" class="tabButton" data-tab="condition" role="tab" aria-selected="false" aria-controls="tabCondition" tabindex="-1">条件</button>\n'
    '            <button id="tabGlobalButton" class="tabButton" data-tab="global" role="tab" aria-selected="false" aria-controls="tabGlobal" tabindex="-1">全体</button>\n'
    '            <button id="tabSaveButton" class="tabButton" data-tab="save" role="tab" aria-selected="false" aria-controls="tabSave" tabindex="-1">保存</button>',
    "tab semantics",
)
replace_once('<div id="tabAction" class="tabPage active">', '<div id="tabAction" class="tabPage active" role="tabpanel" aria-labelledby="tabActionButton">', "action panel role")
replace_once('<div id="tabCondition" class="tabPage">', '<div id="tabCondition" class="tabPage" role="tabpanel" aria-labelledby="tabConditionButton" aria-hidden="true">', "condition panel role")
replace_once('<div id="tabGlobal" class="tabPage">', '<div id="tabGlobal" class="tabPage" role="tabpanel" aria-labelledby="tabGlobalButton" aria-hidden="true">', "global panel role")
replace_once('<div id="tabSave" class="tabPage">', '<div id="tabSave" class="tabPage" role="tabpanel" aria-labelledby="tabSaveButton" aria-hidden="true">', "save panel role")

granblue_row = '<div class="quickPresetRow granbluePresetRow"><button class="quickPreset" data-condition-preset="gbf_full_auto_on">フルオート ON</button><button class="quickPreset" data-condition-preset="gbf_full_auto_off">フルオート OFF</button><button class="quickPreset" data-condition-preset="gbf_attack_on">攻撃 ON</button><button class="quickPreset" data-condition-preset="gbf_attack_off">攻撃 OFF</button></div>'
replace_once(granblue_row, '<details class="gamePresets"><summary>グラブル用の条件</summary>' + granblue_row + '</details>', "granblue progressive disclosure")

layout_card = '''            <div class="card"><div class="cardHeader"><div><div class="cardTitle">メニュー表示</div><div class="cardMeta">ドラッグせずに位置と大きさを変更できます</div></div></div><div class="layoutGrid" role="group" aria-label="メニュー位置"><button data-dock-position="top-left">左上</button><button data-dock-position="top-center">上中央</button><button data-dock-position="top-right">右上</button><button data-dock-position="bottom-left">左下</button><button data-dock-position="bottom-center">下中央</button><button data-dock-position="bottom-right">右下</button></div><div class="sizePresetRow" role="group" aria-label="メニューサイズ"><button data-dock-size="small">小さめ</button><button data-dock-size="standard">標準</button><button data-dock-size="large">大きめ</button><button data-dock-size="reset">位置も初期化</button></div></div>\n'''
replace_once('            <div class="card"><div class="cardHeader"><div><div class="cardTitle">動作履歴</div>', layout_card + '            <div class="card"><div class="cardHeader"><div><div class="cardTitle">動作履歴</div>', "layout controls card")

replace_once("quickSave:$('quickSave'),", "undo:$('undo'),", "controls undo mapping")
replace_once(
    "  const tabButtons=[...shadow.querySelectorAll('.tabButton')],tabPages=[...shadow.querySelectorAll('.tabPage')],clickModeButtons=[...clickTargetMode.querySelectorAll('button[data-mode]')],conditionPresetButtons=[...shadow.querySelectorAll('[data-condition-preset]')];",
    "  const tabButtons=[...shadow.querySelectorAll('.tabButton')],tabPages=[...shadow.querySelectorAll('.tabPage')],clickModeButtons=[...clickTargetMode.querySelectorAll('button[data-mode]')],conditionPresetButtons=[...shadow.querySelectorAll('[data-condition-preset]')];\n  const dockPositionButtons=[...shadow.querySelectorAll('[data-dock-position]')],dockSizeButtons=[...shadow.querySelectorAll('[data-dock-size]')];",
    "layout button queries",
)
replace_once(
    "  const updateStatus=s=>status.textContent=s;",
    "  const prefersReducedMotion=()=>Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);\n  const motionBehavior=()=>prefersReducedMotion()?'auto':'smooth';\n  const updateStatus=s=>{const text=String(s??'');if(status.textContent!==text)status.textContent=text};",
    "status dedupe",
)
replace_once("  function snapshot(){return{version:11,", "  function snapshot(){return{version:12,", "snapshot version")
replace_once(
    "  function createRecoveryPoint(label='変更前'){try{localStorage.setItem(RECOVERY_KEY,JSON.stringify({label,createdAt:Date.now(),snapshot:snapshot()}));return true}catch{return false}}",
    "  const hasRecovery=()=>Boolean(readJson(RECOVERY_KEY)?.snapshot);\n  function createRecoveryPoint(label='変更前'){try{localStorage.setItem(RECOVERY_KEY,JSON.stringify({label,createdAt:Date.now(),snapshot:snapshot()}));queueMicrotask(()=>updateButtons());return true}catch{return false}}",
    "recovery availability",
)
replace_once("updateStatus(`${data.label||'直前の状態'}へ戻しました`)}", "updateStatus(`${data.label||'直前の状態'}へ戻しました`);updateButtons()}", "recovery refresh")
replace_once(
    "  function updateMarkerMeta(p,i){if(!p.element)return;p.element.querySelector('.markerNumber').textContent=String(i+1);p.element.querySelector('.markerDelay').textContent=`${formatMs(p.delayMs)} · ${p.holdMs}ms${p.targetMode==='selector'?' · 追跡':''}${p.condition?.enabled?' · 条件':''}`}",
    "  function updateMarkerMeta(p,i){if(!p.element)return;p.element.querySelector('.markerNumber').textContent=String(i+1);p.element.querySelector('.markerDelay').textContent=`${formatMs(p.delayMs)} · ${p.holdMs}ms${p.targetMode==='selector'?' · 追跡':''}${p.condition?.enabled?' · 条件':''}`;p.element.setAttribute('aria-label',`${i+1}番目のクリック地点。矢印キーで1px、Shift＋矢印で10px移動`)}",
    "marker aria",
)
replace_once(
    "  function createMarker(p){const el=document.createElement('div');el.className='marker';el.innerHTML='<div class=\"markerVisual\"></div><span class=\"markerNumber\"></span><span class=\"markerDelay\"></span>';",
    "  function createMarker(p){const el=document.createElement('div');el.className='marker';el.tabIndex=0;el.setAttribute('role','button');el.innerHTML='<div class=\"markerVisual\"></div><span class=\"markerNumber\"></span><span class=\"markerDelay\"></span>';",
    "marker keyboard focus",
)
replace_once("if(d.moved){d.suppress=performance.now()+350;updateDockAnchors();saveState()}", "if(d.moved){d.suppress=performance.now()+350;saveState()}", "marker drag anchor bug")
replace_once(
    "    el.addEventListener('click',e=>{e.stopPropagation();if(performance.now()<d.suppress)return;selectPoint(p.id)});p.cleanup=()=>{if(d.raf)cancelAnimationFrame(d.raf);remove()};setMarkerPosition(p);return el}",
    "    el.addEventListener('keydown',e=>{if(state.running||state.recording)return;const step=e.shiftKey?10:1,moves={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]},moveBy=moves[e.key];if(moveBy){e.preventDefault();selectPoint(p.id,{persist:false});p.cx+=moveBy[0];p.cy+=moveBy[1];clampPoint(p);setMarkerPosition(p);saveState();return}if(e.key==='Enter'||e.key===' '){e.preventDefault();selectPoint(p.id)}});\n    el.addEventListener('click',e=>{e.stopPropagation();if(performance.now()<d.suppress)return;selectPoint(p.id)});p.cleanup=()=>{if(d.raf)cancelAnimationFrame(d.raf);remove()};setMarkerPosition(p);return el}",
    "marker keyboard movement",
)

old_render = "  function renderPointStrip(){pointStrip.textContent='';state.points.forEach((p,i)=>{const b=document.createElement('button');b.className='pointChip';b.classList.toggle('navigate',isNavigate(p));b.classList.toggle('wait',isWait(p));b.classList.toggle('selected',p.id===state.selectedId);b.classList.toggle('disabledAction',p.enabled===false);b.classList.toggle('selectorTarget',!isNavigate(p)&&!isWait(p)&&p.targetMode==='selector');b.classList.toggle('currentRun',state.running&&state.currentActionIndex===i);const icon=document.createElement('span');icon.className='chipIcon';icon.textContent=isNavigate(p)?'↗':isWait(p)?'◇':p.targetMode==='selector'?'◎':'●';const text=document.createElement('span');text.className='chipText';text.textContent=isNavigate(p)?`${i+1}  ${displayUrl(p.url)}`:isWait(p)?`${i+1}  条件を待つ`:`${i+1}  ${p.targetMode==='selector'?(p.targetLabel||p.selector||'ボタンを追う'):formatMs(p.delayMs)}`;b.append(icon,text);if(p.condition?.enabled){const dot=document.createElement('span');dot.className='conditionDot';dot.title='条件あり';b.append(dot)}b.disabled=state.running||state.recording;b.addEventListener('click',()=>selectPoint(p.id));pointStrip.append(b)})}"
new_render = '''  function renderPointStrip(){
    pointStrip.textContent='';pointStrip.setAttribute('aria-label','実行する動作');
    if(!state.points.length){const empty=document.createElement('button'),icon=document.createElement('span'),copy=document.createElement('span'),title=document.createElement('strong'),help=document.createElement('small');empty.className='emptyFlow';icon.className='emptyFlowIcon';icon.textContent='＋';title.textContent='最初の動作を追加';help.textContent='タップ位置・URL移動・条件待ちから作成できます';copy.append(title,help);empty.append(icon,copy);empty.addEventListener('click',()=>{addPoint();revealEditor('action')});pointStrip.append(empty);return}
    state.points.forEach((p,i)=>{const b=document.createElement('button');b.className='pointChip';b.classList.toggle('navigate',isNavigate(p));b.classList.toggle('wait',isWait(p));b.classList.toggle('selected',p.id===state.selectedId);b.classList.toggle('disabledAction',p.enabled===false);b.classList.toggle('selectorTarget',!isNavigate(p)&&!isWait(p)&&p.targetMode==='selector');b.classList.toggle('currentRun',state.running&&state.currentActionIndex===i);b.setAttribute('aria-pressed',String(p.id===state.selectedId));const icon=document.createElement('span');icon.className='chipIcon';icon.textContent=isNavigate(p)?'↗':isWait(p)?'◇':p.targetMode==='selector'?'◎':'●';const text=document.createElement('span');text.className='chipText';text.textContent=isNavigate(p)?`${i+1}  ${displayUrl(p.url)}`:isWait(p)?`${i+1}  条件を待つ`:`${i+1}  ${p.targetMode==='selector'?(p.targetLabel||p.selector||'ボタンを追う'):formatMs(p.delayMs)}`;b.setAttribute('aria-label',`${i+1}番目、${actionName(p,i)}${p.enabled===false?'、使用しない':''}${p.condition?.enabled?'、条件あり':''}`);b.append(icon,text);if(p.condition?.enabled){const dot=document.createElement('span');dot.className='conditionDot';dot.title='条件あり';b.append(dot)}b.disabled=state.running||state.recording;b.addEventListener('click',()=>selectPoint(p.id));pointStrip.append(b)})
  }'''
replace_once(old_render, new_render, "empty state and sequence accessibility")
replace_once("behavior:'smooth'", "behavior:motionBehavior()", "reduced motion scroll")
replace_once(
    "  function setActiveTab(name,{persist=true}={}){state.activeTab=['action','condition','global','save'].includes(name)?name:'action';tabButtons.forEach(b=>b.classList.toggle('active',b.dataset.tab===state.activeTab));tabPages.forEach(p=>p.classList.toggle('active',p.id===`tab${state.activeTab[0].toUpperCase()}${state.activeTab.slice(1)}`));if(persist)saveState()}",
    "  function setActiveTab(name,{persist=true}={}){state.activeTab=['action','condition','global','save'].includes(name)?name:'action';const panelId=`tab${state.activeTab[0].toUpperCase()}${state.activeTab.slice(1)}`;tabButtons.forEach(b=>{const active=b.dataset.tab===state.activeTab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1});tabPages.forEach(p=>{const active=p.id===panelId;p.classList.toggle('active',active);p.setAttribute('aria-hidden',String(!active))});if(persist)saveState()}",
    "tab aria state",
)
replace_once(
    "  function setAddMenu(open){state.addMenuOpen=Boolean(open);addMenu.classList.toggle('open',state.addMenuOpen);controls.addMenu.textContent=state.addMenuOpen?'− 閉じる':'＋ 追加';requestAnimationFrame(()=>positionDock())}",
    "  function setAddMenu(open){state.addMenuOpen=Boolean(open);addMenu.classList.toggle('open',state.addMenuOpen);addMenu.toggleAttribute('inert',!state.addMenuOpen);addMenu.setAttribute('aria-hidden',String(!state.addMenuOpen));controls.addMenu.textContent=state.addMenuOpen?'− 閉じる':'＋ 追加';controls.addMenu.setAttribute('aria-expanded',String(state.addMenuOpen));requestAnimationFrame(()=>positionDock())}",
    "add menu focus containment",
)
replace_once("conditionPresetButtons.forEach(b=>b.classList.toggle('active',b.dataset.conditionPreset===type));", "conditionPresetButtons.forEach(b=>{const active=b.dataset.conditionPreset===type;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});", "condition preset aria")
replace_all("clickModeButtons.forEach(b=>b.classList.toggle('active',b.dataset.mode===p.targetMode));", "clickModeButtons.forEach(b=>{const active=b.dataset.mode===p.targetMode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});", 2, "click mode aria")
replace_once(
    "    for(const c of [clickSelector,waitForTarget,targetTimeout,targetFailure,scrollTarget,controls.pickPointTarget,controls.pickClickTarget,controls.testClickTarget])c.disabled=!p||nav||waiting||busy;updateConditionFields();",
    "    for(const c of [clickSelector,waitForTarget,targetFailure,scrollTarget,controls.pickPointTarget,controls.pickClickTarget,controls.testClickTarget])c.disabled=!p||nav||waiting||busy;targetTimeout.disabled=!p||nav||waiting||busy||!waitForTarget.checked;loadTimeout.disabled=!p||!nav||busy||!waitForLoad.checked;conditionTimeout.disabled=!p||busy||!conditionEnabled.checked||conditionMode.value==='check';conditionTimeoutAction.disabled=conditionTimeout.disabled;conditionStable.disabled=!p||busy||!conditionEnabled.checked||conditionMode.value==='check';updateConditionFields();",
    "dependent editor controls",
)
replace_once(
    "  function setSettings(open,{persist=true}={}){state.settingsOpen=Boolean(open);settingsPanel.classList.toggle('closed',!state.settingsOpen);dock.classList.toggle('settingsClosed',!state.settingsOpen);controls.settings.classList.toggle('active',state.settingsOpen);controls.settings.textContent=state.settingsOpen?'⌄':'⚙';requestAnimationFrame(()=>positionDock());if(persist)saveState()}",
    "  function setSettings(open,{persist=true}={}){state.settingsOpen=Boolean(open);settingsPanel.classList.toggle('closed',!state.settingsOpen);settingsPanel.toggleAttribute('inert',!state.settingsOpen);settingsPanel.setAttribute('aria-hidden',String(!state.settingsOpen));dock.classList.toggle('settingsClosed',!state.settingsOpen);controls.settings.classList.toggle('active',state.settingsOpen);controls.settings.textContent=state.settingsOpen?'⌄':'⚙';controls.settings.setAttribute('aria-expanded',String(state.settingsOpen));requestAnimationFrame(()=>positionDock());if(persist)saveState()}",
    "settings focus containment",
)
replace_once(
    "  function setBrowserHidden(hidden,{persist=true}={}){state.browserHidden=Boolean(hidden);browserBar.classList.toggle('hidden',state.browserHidden);browserHandle.classList.toggle('visible',state.browserHidden);if(!state.browserHidden)requestAnimationFrame(()=>normalizeDockPosition());if(persist)saveState()}",
    "  function setBrowserHidden(hidden,{persist=true}={}){state.browserHidden=Boolean(hidden);browserBar.classList.toggle('hidden',state.browserHidden);browserBar.toggleAttribute('inert',state.browserHidden);browserBar.setAttribute('aria-hidden',String(state.browserHidden));browserHandle.classList.toggle('visible',state.browserHidden);browserHandle.setAttribute('aria-expanded',String(!state.browserHidden));if(!state.browserHidden)requestAnimationFrame(()=>normalizeDockPosition());if(persist)saveState()}",
    "browser focus containment",
)
replace_once(
    "  function applyVisibility(){applyDockSize();setSettings(state.settingsOpen,{persist:false});setBrowserHidden(state.browserHidden,{persist:false});dock.classList.toggle('compact',state.compact);controls.minimize.textContent=state.compact?'□':'—';controls.minimize.setAttribute('aria-label',state.compact?'メニューを開く':'メニューを小さくする');setActiveTab(state.activeTab,{persist:false});setAddMenu(false)}",
    "  function applyVisibility(){applyDockSize();setSettings(state.settingsOpen,{persist:false});setBrowserHidden(state.browserHidden,{persist:false});dock.classList.toggle('compact',state.compact);controls.minimize.textContent=state.compact?'□':'—';controls.minimize.setAttribute('aria-label',state.compact?'メニューを開く':'メニューを小さくする');controls.minimize.setAttribute('aria-expanded',String(!state.compact));setActiveTab(state.activeTab,{persist:false});setAddMenu(false)}",
    "compact aria initial",
)
replace_once("controls.minimize.setAttribute('aria-label',state.compact?'メニューを開く':'メニューを小さくする');requestAnimationFrame", "controls.minimize.setAttribute('aria-label',state.compact?'メニューを開く':'メニューを小さくする');controls.minimize.setAttribute('aria-expanded',String(!state.compact));requestAnimationFrame", "compact aria updates")

old_update_buttons = "  function updateButtons(){const p=selectedPoint(),has=state.points.length>0,busy=state.running||state.recording;controls.addMenu.disabled=busy;controls.add.disabled=busy;controls.addNavigate.disabled=busy;controls.addWait.disabled=busy;controls.single.disabled=!p||busy;controls.runFromSelected.disabled=!p||busy;controls.record.disabled=state.running;controls.recordPanel.disabled=state.running;controls.run.disabled=!has&&!state.running;controls.compactRun.disabled=!has&&!state.running;for(const c of [method,count,loop,timeRandomEnabled,timeJitter,positionRandomEnabled,positionJitter,recordMode,presetSlot,presetName,controls.savePreset,controls.loadPreset,controls.deletePreset,controls.quickSave,controls.exportSettings,controls.importFile,controls.restoreRecovery])c.disabled=busy;shell.classList.toggle('running',state.running);shell.classList.toggle('recording',state.recording);controls.run.textContent=state.running?'■ 停止':'▶ 開始';controls.run.classList.toggle('stopping',state.running);controls.compactRun.textContent=state.running?'■':'▶';controls.compactRun.classList.toggle('stopping',state.running);renderPointStrip();updateEditor();updateRunStats()}"
new_update_buttons = "  function updateButtons(){const p=selectedPoint(),has=state.points.length>0,busy=state.running||state.recording;controls.addMenu.disabled=busy;controls.add.disabled=busy;controls.addNavigate.disabled=busy;controls.addWait.disabled=busy;controls.single.disabled=!p||busy;controls.runFromSelected.disabled=!p||busy;controls.record.disabled=state.running;controls.recordPanel.disabled=state.running;controls.run.disabled=!has&&!state.running;controls.compactRun.disabled=!has&&!state.running;for(const c of [method,loop,timeRandomEnabled,positionRandomEnabled,recordMode,presetSlot,presetName,controls.savePreset,controls.loadPreset,controls.deletePreset,controls.exportSettings,controls.importFile])c.disabled=busy;count.disabled=busy||loop.checked;timeJitter.disabled=busy||!timeRandomEnabled.checked;positionJitter.disabled=busy||!positionRandomEnabled.checked;const recoverable=hasRecovery();controls.undo.disabled=busy||!recoverable;controls.restoreRecovery.disabled=busy||!recoverable;shell.classList.toggle('running',state.running);shell.classList.toggle('recording',state.recording);controls.run.textContent=state.running?'■ 停止':'▶ 開始';controls.run.classList.toggle('stopping',state.running);controls.run.setAttribute('aria-pressed',String(state.running));controls.run.setAttribute('aria-label',state.running?'実行を停止':'すべての動作を開始');controls.compactRun.textContent=state.running?'■':'▶';controls.compactRun.classList.toggle('stopping',state.running);controls.compactRun.setAttribute('aria-pressed',String(state.running));renderPointStrip();updateEditor();updateRunStats()}"
replace_once(old_update_buttons, new_update_buttons, "dependent global controls and recovery")
replace_once(
    "  function showConditionResult(result){const matched=Boolean(result.matched);conditionResult.classList.toggle('ok',matched);conditionResult.classList.toggle('bad',Boolean(result.error)||!matched);conditionResult.lastElementChild.textContent=result.error?`確認できません：${result.error}`:matched?`今は進む状態です。開始すると、この動作をすぐ実行します。${result.current?` 現在: ${result.current}`:''}`:`今は待つ状態です。開始すると、条件が合うまでここで待ちます。${result.current?` 現在: ${result.current}`:''}`;updateConditionTargetSummary()}",
    "  function showConditionResult(result){const matched=Boolean(result.matched),message=result.error?`確認できません：${result.error}`:matched?`今は進む状態です。開始すると、この動作をすぐ実行します。${result.current?` 現在: ${result.current}`:''}`:`今は待つ状態です。開始すると、条件が合うまでここで待ちます。${result.current?` 現在: ${result.current}`:''}`;conditionResult.classList.toggle('ok',matched);conditionResult.classList.toggle('bad',Boolean(result.error)||!matched);if(conditionResult.lastElementChild.textContent!==message)conditionResult.lastElementChild.textContent=message;updateConditionTargetSummary()}",
    "condition live region dedupe",
)
replace_once("if(apply&&state.recordings.length){const recs=", "if(apply&&state.recordings.length){createRecoveryPoint('記録適用前');const recs=", "recording recovery")
replace_all("state.compact?Math.min(90,box.width-limits.margin*2):size.width,height=state.compact?Math.min(46,box.height-limits.margin*2):size.height", "state.compact?Math.min(COMPACT_DOCK_WIDTH,box.width-limits.margin*2):size.width,height=state.compact?Math.min(COMPACT_DOCK_HEIGHT,box.height-limits.margin*2):size.height", 1, "compact normalize")
replace_all("state.compact?Math.min(90,box.width-size.limits.margin*2):size.width,height=state.compact?Math.min(46,box.height-size.limits.margin*2):size.height", "state.compact?Math.min(COMPACT_DOCK_WIDTH,box.width-size.limits.margin*2):size.width,height=state.compact?Math.min(COMPACT_DOCK_HEIGHT,box.height-size.limits.margin*2):size.height", 1, "compact position")
replace_once(
    "},{passive:false});onCleanup(remove)}\n\n  function installDockResize",
    "},{passive:false});handle.addEventListener('keydown',e=>{const step=e.shiftKey?48:12,moves={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]},moveBy=moves[e.key];if(moveBy){e.preventDefault();state.dockX=(state.dockX??dock.getBoundingClientRect().left)+moveBy[0];state.dockY=(state.dockY??dock.getBoundingClientRect().top)+moveBy[1];normalizeDockPosition();updateDockAnchors();saveState()}else if(tapToOpen&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setCompact(false)}});onCleanup(remove)}\n\n  function installDockResize",
    "dock keyboard movement",
)
replace_once(
    "handle.addEventListener('dblclick',e=>{e.preventDefault();state.dockWidth=DEFAULT_DOCK_WIDTH;state.dockHeight=DEFAULT_DOCK_HEIGHT;applyDockSize();normalizeDockPosition();saveState();updateStatus('メニューサイズを標準に戻しました')});onCleanup(remove)}",
    "handle.addEventListener('keydown',e=>{const step=e.shiftKey?80:16;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))return;e.preventDefault();if(e.key==='Home'){state.dockWidth=DEFAULT_DOCK_WIDTH;state.dockHeight=DEFAULT_DOCK_HEIGHT}else{const r=dock.getBoundingClientRect(),limits=dockLimits(),right=r.right;if(e.key==='ArrowLeft')state.dockWidth=clamp(r.width-step,limits.minWidth,limits.maxWidth);if(e.key==='ArrowRight')state.dockWidth=clamp(r.width+step,limits.minWidth,limits.maxWidth);if(e.key==='ArrowUp')state.dockHeight=clamp(r.height-step,limits.minHeight,limits.maxHeight);if(e.key==='ArrowDown')state.dockHeight=clamp(r.height+step,limits.minHeight,limits.maxHeight);if(side==='left')state.dockX=right-state.dockWidth}applyDockSize();normalizeDockPosition();updateDockAnchors();saveState()});handle.addEventListener('dblclick',e=>{e.preventDefault();state.dockWidth=DEFAULT_DOCK_WIDTH;state.dockHeight=DEFAULT_DOCK_HEIGHT;applyDockSize();normalizeDockPosition();saveState();updateStatus('メニューサイズを標準に戻しました')});onCleanup(remove)}",
    "resize keyboard alternative",
)

layout_functions = r'''
  function placeDockPreset(position){if(state.running||state.recording)return;state.compact=false;dock.classList.remove('compact');const size=applyDockSize(),box=size.limits.box,margin=12,right=box.left+box.width-size.width-margin,bottom=box.top+box.height-size.height-margin,centerX=box.left+(box.width-size.width)/2;const positions={topLeft:[box.left+margin,box.top+margin],topCenter:[centerX,box.top+margin],topRight:[right,box.top+margin],bottomLeft:[box.left+margin,bottom],bottomCenter:[centerX,bottom],bottomRight:[right,bottom]},key=String(position||'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),next=positions[key]||positions.bottomCenter;state.dockX=next[0];state.dockY=next[1];normalizeDockPosition();updateDockAnchors();controls.minimize.textContent='—';controls.minimize.setAttribute('aria-expanded','true');saveState();updateStatus('メニュー位置を変更しました')}
  function setDockSizePreset(size){if(state.running||state.recording)return;if(size==='reset')return resetDockLayout();const presets={small:[480,440],standard:[DEFAULT_DOCK_WIDTH,DEFAULT_DOCK_HEIGHT],large:[900,860]},next=presets[size]||presets.standard;state.compact=false;dock.classList.remove('compact');state.dockWidth=next[0];state.dockHeight=next[1];applyDockSize();normalizeDockPosition();updateDockAnchors();controls.minimize.textContent='—';controls.minimize.setAttribute('aria-expanded','true');saveState();updateStatus(`メニューを${size==='small'?'小さめ':size==='large'?'大きめ':'標準'}にしました`)}

'''
replace_once("  function applyImportedSnapshot", layout_functions + "  function applyImportedSnapshot", "layout functions")
replace_once(
    "  controls.settings.addEventListener('click',()=>setSettings(!state.settingsOpen));",
    "  controls.settings.addEventListener('click',()=>setSettings(!state.settingsOpen));controls.undo.addEventListener('click',restoreRecovery);dockPositionButtons.forEach(button=>button.addEventListener('click',()=>placeDockPreset(button.dataset.dockPosition)));dockSizeButtons.forEach(button=>button.addEventListener('click',()=>setDockSizePreset(button.dataset.dockSize)));",
    "layout and undo listeners",
)
replace_once(
    "  for(const c of [method,count,loop,timeRandomEnabled,timeJitter,positionRandomEnabled,positionJitter,recordMode])c.addEventListener('change',()=>{count.value=clamp(int(count.value,1),1,999999);timeJitter.value=clamp(int(timeJitter.value,DEFAULT_TIME_JITTER_MS),0,5000);positionJitter.value=clamp(finite(positionJitter.value,DEFAULT_POSITION_JITTER_PX),0,MAX_POSITION_JITTER_PX);saveState()});",
    "  for(const c of [method,count,loop,timeRandomEnabled,timeJitter,positionRandomEnabled,positionJitter,recordMode])c.addEventListener('change',()=>{count.value=clamp(int(count.value,1),1,999999);timeJitter.value=clamp(int(timeJitter.value,DEFAULT_TIME_JITTER_MS),0,5000);positionJitter.value=clamp(finite(positionJitter.value,DEFAULT_POSITION_JITTER_PX),0,MAX_POSITION_JITTER_PX);saveState();updateButtons()});",
    "global dependencies",
)
replace_once(
    "controls.savePreset.addEventListener('click',()=>savePreset());controls.quickSave.addEventListener('click',()=>{const ok=savePreset({quiet:true});if(ok)updateStatus(`「${presetName.value||`保存 ${presetSlot.value}`}」へ上書き保存しました`)});controls.loadPreset",
    "controls.savePreset.addEventListener('click',()=>savePreset());controls.loadPreset",
    "remove redundant quick save",
)

shortcut_code = r'''
  function handlePanelShortcut(event){if(event.defaultPrevented)return;const target=event.composedPath?.()[0]||event.target,editing=target instanceof HTMLElement&&target.matches('input,select,textarea');if(event.key==='Escape'){if(state.picking){event.preventDefault();endPicker('選択を中止しました')}else if(state.recording){event.preventDefault();stopRecording({apply:false})}else if(state.running){event.preventDefault();stopSequence('停止')}else if(state.addMenuOpen){event.preventDefault();setAddMenu(false)}return}if((event.metaKey||event.ctrlKey)&&event.key==='Enter'&&!editing){event.preventDefault();state.running?stopSequence('停止'):startSequence()}}
  shadow.addEventListener('keydown',handlePanelShortcut);

'''
replace_once("  shadow.addEventListener('focusin'", shortcut_code + "  shadow.addEventListener('focusin'", "keyboard shortcuts")
replace_once(
    "  document.documentElement.append(root);loadInitial();refreshPresets();rebuildMarkers();if(!state.points.length)addPoint();applyVisibility();updateUi();requestAnimationFrame(()=>positionDock({defaultIfMissing:true}));const initial=normalizeUrl(urlInput.value);iframe.src=initial||'about:blank';if(!initial)urlInput.focus();",
    "  document.documentElement.append(root);shadow.querySelectorAll('input[type=number]').forEach(input=>input.inputMode='decimal');loadInitial();refreshPresets();rebuildMarkers();applyVisibility();updateUi();if(!state.points.length)updateStatus('「＋ 追加」から最初の動作を作成してください');requestAnimationFrame(()=>positionDock({defaultIfMissing:true}));const initial=normalizeUrl(urlInput.value);iframe.src=initial||'about:blank';if(!initial)urlInput.focus();",
    "true empty initial state",
)
replace_once("  if(typeof completion==='function')completion({ok:true,installed:true,version:11});", "  if(typeof completion==='function')completion({ok:true,installed:true,version:12});", "completion version")

path.write_text(source, encoding="utf-8")
