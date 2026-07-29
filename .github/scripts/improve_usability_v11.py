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
    "const STORAGE_KEY = '__fullscreen_iframe_autoclicker_state_v10__';",
    "const STORAGE_KEY = '__fullscreen_iframe_autoclicker_state_v11__';",
    "storage version",
)
replace_once(
    "const LEGACY_STORAGE_KEYS = [\n    '__fullscreen_iframe_autoclicker_state_v9__',",
    "const LEGACY_STORAGE_KEYS = [\n    '__fullscreen_iframe_autoclicker_state_v10__',\n    '__fullscreen_iframe_autoclicker_state_v9__',",
    "legacy v10 migration",
)
replace_once(
    "input,select{outline:none} input:focus-visible,select:focus-visible,button:focus-visible",
    "input,select{outline:none;font-size:14px} input:focus-visible,select:focus-visible,button:focus-visible",
    "readable form controls",
)
replace_once(
    "      #dock.settingsClosed{height:auto!important}",
    "      @media(max-width:620px){#url,.field input[type=number],.field input[type=text],.field input[type=url],.field select,#memoryRow select{font-size:16px!important}#settingsPanel{padding-bottom:env(safe-area-inset-bottom)}}\n"
    "      @media(max-width:460px){#forward{display:none}#browserBar{width:calc(100vw - 8px);padding:4px}#browserBar button{width:36px}#browserBar .wide{min-width:48px;padding:0 10px}}\n"
    "      @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}\n"
    "      #shell.keyboardOpen:not(.urlKeyboardOpen) #browserBar,#shell.keyboardOpen:not(.urlKeyboardOpen) #browserHandle,#shell.keyboardOpen:not(.urlKeyboardOpen) #topBar,#shell.keyboardOpen:not(.urlKeyboardOpen) #actionBar,#shell.keyboardOpen:not(.urlKeyboardOpen) #addMenu,#shell.keyboardOpen:not(.urlKeyboardOpen) #sequenceArea,#shell.keyboardOpen:not(.urlKeyboardOpen) #tabBar,#shell.keyboardOpen:not(.urlKeyboardOpen) .resizeHandle{display:none!important}\n"
    "      #shell.keyboardOpen:not(.urlKeyboardOpen) #dock{transition:none!important;border-radius:14px}\n"
    "      #shell.keyboardOpen:not(.urlKeyboardOpen) #settingsPanel{border-top:0;overscroll-behavior:contain}\n"
    "      #shell.keyboardOpen:not(.urlKeyboardOpen) .tabPage{padding-top:8px;padding-bottom:max(90px,calc(env(safe-area-inset-bottom) + 70px))}\n\n"
    "      #dock.settingsClosed{height:auto!important}",
    "keyboard and responsive styles",
)
replace_once(
    '<div id="browserBar"><button id="back" title="戻る">←</button><button id="forward" title="進む">→</button><button id="reload" title="再読込">↻</button><input id="url" type="text" placeholder="https://example.com" autocomplete="off" spellcheck="false"><button id="load" class="wide">表示</button><button id="hideBrowser" title="URLバーを収納">⌃</button><button id="close" title="終了">×</button></div>',
    '<div id="browserBar" role="navigation" aria-label="ページ操作"><button id="back" title="戻る" aria-label="戻る">←</button><button id="forward" title="進む" aria-label="進む">→</button><button id="reload" title="再読込" aria-label="再読込">↻</button><input id="url" type="text" inputmode="url" aria-label="表示するURL" placeholder="https://example.com" autocomplete="off" autocapitalize="none" spellcheck="false"><button id="load" class="wide">表示</button><button id="hideBrowser" title="URLバーを収納" aria-label="URLバーを収納">⌃</button><button id="close" title="終了" aria-label="終了">×</button></div>',
    "browser accessibility",
)
replace_once(
    '<span id="status" class="brandStatus">アクションなし</span>',
    '<span id="status" class="brandStatus" role="status" aria-live="polite">アクションなし</span>',
    "live status",
)
replace_once(
    '<div id="conditionResult" class="conditionResult"><span class="resultDot"></span><span>ここに「今すぐ進む」か「まだ待つ」かを表示します。コードの知識は不要です。</span></div>',
    '<div id="conditionResult" class="conditionResult" role="status" aria-live="polite"><span class="resultDot"></span><span>ここに「今すぐ進む」か「まだ待つ」かを表示します。コードの知識は不要です。</span></div>',
    "condition live status",
)
replace_once(
    "activeTab:'action',picking:null,highlightTimer:null,logs:[],runCycle:0,currentActionIndex:-1,runStartIndex:0};",
    "activeTab:'action',picking:null,highlightTimer:null,logs:[],runCycle:0,currentActionIndex:-1,runStartIndex:0,keyboardOpen:false,keyboardTarget:null,keyboardFocusTimer:null};",
    "keyboard state",
)
replace_once(
    "  function dockLimits(){const margin=5;return{margin,maxWidth:Math.max(MIN_DOCK_WIDTH,Math.min(MAX_DOCK_WIDTH,window.innerWidth-margin*2)),maxHeight:Math.max(MIN_DOCK_HEIGHT,Math.min(MAX_DOCK_HEIGHT,window.innerHeight-margin*2))}}",
    "  function viewportBox(){const viewport=window.visualViewport;return{left:finite(viewport?.offsetLeft,0),top:finite(viewport?.offsetTop,0),width:Math.max(1,finite(viewport?.width,window.innerWidth)),height:Math.max(1,finite(viewport?.height,window.innerHeight))}}\n"
    "  function dockLimits(){const margin=5,box=viewportBox(),maxWidth=Math.max(1,Math.min(MAX_DOCK_WIDTH,box.width-margin*2)),maxHeight=Math.max(1,Math.min(MAX_DOCK_HEIGHT,box.height-margin*2));return{margin,box,minWidth:Math.min(MIN_DOCK_WIDTH,maxWidth),minHeight:Math.min(MIN_DOCK_HEIGHT,maxHeight),maxWidth,maxHeight}}",
    "viewport-aware dock limits",
)
replace_once(
    "  function applyDockSize(){const limits=dockLimits(),preferredWidth=clamp(finite(state.dockWidth,DEFAULT_DOCK_WIDTH),MIN_DOCK_WIDTH,MAX_DOCK_WIDTH),preferredHeight=clamp(finite(state.dockHeight,DEFAULT_DOCK_HEIGHT),MIN_DOCK_HEIGHT,MAX_DOCK_HEIGHT),width=Math.min(preferredWidth,limits.maxWidth),height=Math.min(preferredHeight,limits.maxHeight);state.dockWidth=preferredWidth;state.dockHeight=preferredHeight;dock.style.setProperty('--dock-width',`${width}px`);dock.style.setProperty('--dock-height',`${height}px`);return{width,height}}",
    "  function applyDockSize(){const limits=dockLimits(),preferredWidth=clamp(finite(state.dockWidth,DEFAULT_DOCK_WIDTH),MIN_DOCK_WIDTH,MAX_DOCK_WIDTH),preferredHeight=clamp(finite(state.dockHeight,DEFAULT_DOCK_HEIGHT),MIN_DOCK_HEIGHT,MAX_DOCK_HEIGHT),width=clamp(preferredWidth,limits.minWidth,limits.maxWidth),height=clamp(preferredHeight,limits.minHeight,limits.maxHeight);state.dockWidth=preferredWidth;state.dockHeight=preferredHeight;dock.style.setProperty('--dock-width',`${width}px`);dock.style.setProperty('--dock-height',`${height}px`);return{width,height,limits}}",
    "responsive dock size",
)
replace_once(
    "  function normalizeDockPosition(){const size=applyDockSize(),width=state.compact?90:size.width,height=state.compact?46:size.height,margin=5,maxX=Math.max(margin,window.innerWidth-width-margin),maxY=Math.max(margin,window.innerHeight-height-margin);state.dockX=clamp(finite(state.dockX,(window.innerWidth-width)/2),margin,maxX);state.dockY=clamp(finite(state.dockY,window.innerHeight-height-12),margin,maxY);if(!state.browserHidden&&!browserBar.classList.contains('hidden')){const bar=browserBar.getBoundingClientRect(),overlapX=state.dockX<bar.right+6&&state.dockX+width>bar.left-6,below=bar.bottom+6;if(overlapX&&state.dockY<below&&below<=maxY)state.dockY=below}dock.style.left=`${state.dockX}px`;dock.style.top=`${state.dockY}px`}",
    "  function normalizeDockPosition(){const size=applyDockSize(),limits=size.limits,box=limits.box,width=state.compact?Math.min(90,box.width-limits.margin*2):size.width,height=state.compact?Math.min(46,box.height-limits.margin*2):size.height,minX=box.left+limits.margin,minY=box.top+limits.margin,maxX=Math.max(minX,box.left+box.width-width-limits.margin),maxY=Math.max(minY,box.top+box.height-height-limits.margin);state.dockX=clamp(finite(state.dockX,box.left+(box.width-width)/2),minX,maxX);state.dockY=clamp(finite(state.dockY,box.top+box.height-height-12),minY,maxY);if(!state.browserHidden&&!browserBar.classList.contains('hidden')){const bar=browserBar.getBoundingClientRect(),overlapX=state.dockX<bar.right+6&&state.dockX+width>bar.left-6,below=bar.bottom+6;if(overlapX&&state.dockY<below&&below<=maxY)state.dockY=below}dock.style.left=`${state.dockX}px`;dock.style.top=`${state.dockY}px`}",
    "viewport-aware dock position",
)
replace_once(
    "  function updateDockAnchors(){const r=dock.getBoundingClientRect();state.dockAnchorX=r.left+r.width/2>window.innerWidth/2?'right':'left';state.dockAnchorY=r.top+r.height/2>window.innerHeight/2?'bottom':'top';state.dockGapX=Math.max(5,state.dockAnchorX==='right'?window.innerWidth-r.right:r.left);state.dockGapY=Math.max(5,state.dockAnchorY==='bottom'?window.innerHeight-r.bottom:r.top)}",
    "  function updateDockAnchors(){const r=dock.getBoundingClientRect(),box=viewportBox(),right=box.left+box.width,bottom=box.top+box.height;state.dockAnchorX=r.left+r.width/2>box.left+box.width/2?'right':'left';state.dockAnchorY=r.top+r.height/2>box.top+box.height/2?'bottom':'top';state.dockGapX=Math.max(5,state.dockAnchorX==='right'?right-r.right:r.left-box.left);state.dockGapY=Math.max(5,state.dockAnchorY==='bottom'?bottom-r.bottom:r.top-box.top)}",
    "viewport-aware anchors",
)
replace_once(
    "  function positionDock({defaultIfMissing=false,useAnchor=false}={}){const size=applyDockSize(),width=state.compact?90:size.width,height=state.compact?46:size.height;if(defaultIfMissing&&(state.dockX==null||state.dockY==null)){state.dockX=(window.innerWidth-width)/2;state.dockY=window.innerHeight-height-12}else if(useAnchor){if(Number.isFinite(state.dockGapX))state.dockX=state.dockAnchorX==='right'?window.innerWidth-width-state.dockGapX:state.dockGapX;if(Number.isFinite(state.dockGapY))state.dockY=state.dockAnchorY==='bottom'?window.innerHeight-height-state.dockGapY:state.dockGapY}normalizeDockPosition();if(!useAnchor||!Number.isFinite(state.dockGapX)||!Number.isFinite(state.dockGapY))updateDockAnchors()}",
    "  function positionDock({defaultIfMissing=false,useAnchor=false}={}){const size=applyDockSize(),box=size.limits.box,width=state.compact?Math.min(90,box.width-size.limits.margin*2):size.width,height=state.compact?Math.min(46,box.height-size.limits.margin*2):size.height,right=box.left+box.width,bottom=box.top+box.height;if(defaultIfMissing&&(state.dockX==null||state.dockY==null)){state.dockX=box.left+(box.width-width)/2;state.dockY=bottom-height-12}else if(useAnchor){if(Number.isFinite(state.dockGapX))state.dockX=state.dockAnchorX==='right'?right-width-state.dockGapX:box.left+state.dockGapX;if(Number.isFinite(state.dockGapY))state.dockY=state.dockAnchorY==='bottom'?bottom-height-state.dockGapY:box.top+state.dockGapY}normalizeDockPosition();if(!useAnchor||!Number.isFinite(state.dockGapX)||!Number.isFinite(state.dockGapY))updateDockAnchors()}",
    "viewport-aware initial position",
)
replace_once("return{version:10,markerHitSize", "return{version:11,markerHitSize", "snapshot version")
replace_once(
    "  function selectPoint(id,{persist=true,announce=true}={}){state.selectedId=id;state.points.forEach(p=>p.element?.classList.toggle('selected',p.id===id));renderPointStrip();updateEditor();updateButtons();const p=selectedPoint();if(announce)updateStatus(p?`${actionName(p)}を選択`:'アクションなし');if(persist)saveState()}",
    "  function selectPoint(id,{persist=true,announce=true}={}){state.selectedId=id;state.points.forEach(p=>p.element?.classList.toggle('selected',p.id===id));renderPointStrip();updateEditor();updateButtons();const p=selectedPoint();if(announce)updateStatus(p?`${actionName(p)}を選択`:'アクションなし');requestAnimationFrame(()=>pointStrip.querySelector('.pointChip.selected')?.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'}));if(persist)saveState()}",
    "selected action visibility",
)
replace_once(
    "  function updateConditionTargetSummary(){const p=selectedPoint();if(!p||!conditionTargetSummary)return;const c=normalizeCondition(p.condition,p.type),text=conditionTargetSummary.lastElementChild;if(isGranblueConditionType(c.type)){const result=evaluateCondition(p);text.innerHTML=`<strong>グラブルのバトル画面</strong><br>${conditionTypeLabel(c.type)} · 現在: ${result.current||'判定不可'}`;updateConditionSentence();return}const target=baseConditionTarget(p,c);if(c.target==='page')text.innerHTML=`<strong>ページ全体</strong><br>${conditionTypeLabel(c.type)}`;else if(target.error)text.innerHTML=`<strong>${c.selector||'対象未選択'}</strong><br>${target.error}`;else if(!target.element)text.innerHTML=`<strong>${c.selector||p.targetLabel||'対象未選択'}</strong><br>まだ見つかっていません`;else text.innerHTML=`<strong>${label(target.element)}</strong><br>${plainElementState(target.element)} · ${conditionTypeLabel(c.type)}`;updateConditionSentence()}",
    "  function setConditionTargetSummary(title,detail){const text=conditionTargetSummary?.lastElementChild;if(!text)return;text.textContent='';const strong=document.createElement('strong');strong.textContent=String(title||'対象未選択');text.append(strong,document.createElement('br'),document.createTextNode(String(detail||'')))}\n"
    "  function updateConditionTargetSummary(){const p=selectedPoint();if(!p||!conditionTargetSummary)return;const c=normalizeCondition(p.condition,p.type);if(isGranblueConditionType(c.type)){const result=evaluateCondition(p);setConditionTargetSummary('グラブルのバトル画面',`${conditionTypeLabel(c.type)} · 現在: ${result.current||'判定不可'}`);updateConditionSentence();return}const target=baseConditionTarget(p,c);if(c.target==='page')setConditionTargetSummary('ページ全体',conditionTypeLabel(c.type));else if(target.error)setConditionTargetSummary(c.selector||'対象未選択',target.error);else if(!target.element)setConditionTargetSummary(c.selector||p.targetLabel||'対象未選択','まだ見つかっていません');else setConditionTargetSummary(label(target.element),`${plainElementState(target.element)} · ${conditionTypeLabel(c.type)}`);updateConditionSentence()}",
    "safe condition summary",
)
replace_once(
    "  function setSettings(open,{persist=true}={}){state.settingsOpen=Boolean(open);",
    "  function placeDockForKeyboard(){if(!state.keyboardOpen||state.keyboardTarget==='url')return;const box=viewportBox(),margin=4,r=dock.getBoundingClientRect(),left=clamp(r.left,box.left+margin,Math.max(box.left+margin,box.left+box.width-r.width-margin));dock.style.left=`${left}px`;dock.style.top=`${box.top+margin}px`}\n"
    "  function enterKeyboardMode(target){clearTimeout(state.keyboardFocusTimer);state.keyboardOpen=true;state.keyboardTarget=target===urlInput?'url':'dock';shell.classList.add('keyboardOpen');shell.classList.toggle('urlKeyboardOpen',state.keyboardTarget==='url');if(state.keyboardTarget==='url')return;setAddMenu(false);requestAnimationFrame(()=>{placeDockForKeyboard();const panelRect=settingsPanel.getBoundingClientRect(),targetRect=target.getBoundingClientRect(),delta=targetRect.top-panelRect.top-10;if(Number.isFinite(delta))settingsPanel.scrollTop=Math.max(0,settingsPanel.scrollTop+delta)})}\n"
    "  function exitKeyboardMode(){clearTimeout(state.keyboardFocusTimer);if(!state.keyboardOpen)return;state.keyboardOpen=false;state.keyboardTarget=null;shell.classList.remove('keyboardOpen','urlKeyboardOpen');requestAnimationFrame(()=>positionDock({defaultIfMissing:true,useAnchor:true}))}\n"
    "  function revealEditor(tab='action'){if(!state.settingsOpen)setSettings(true,{persist:false});setActiveTab(tab,{persist:false});requestAnimationFrame(()=>positionDock())}\n"
    "  function resetDockLayout(){state.dockWidth=DEFAULT_DOCK_WIDTH;state.dockHeight=DEFAULT_DOCK_HEIGHT;state.dockX=null;state.dockY=null;state.dockGapX=null;state.dockGapY=null;state.compact=false;dock.classList.remove('compact');applyDockSize();positionDock({defaultIfMissing:true});saveState();updateStatus('メニュー位置とサイズを標準に戻しました')}\n\n"
    "  function setSettings(open,{persist=true}={}){state.settingsOpen=Boolean(open);",
    "keyboard helpers and editor reveal",
)
replace_once(
    "  function onResize(){state.points.forEach(p=>{if(!isNavigate(p)&&!isWait(p)){clampPoint(p);setMarkerPosition(p)}});applyDockSize();requestAnimationFrame(()=>positionDock({defaultIfMissing:true,useAnchor:true}))}",
    "  function onResize(){state.points.forEach(p=>{if(!isNavigate(p)&&!isWait(p)){clampPoint(p);setMarkerPosition(p)}});if(state.keyboardOpen){if(state.keyboardTarget!=='url')requestAnimationFrame(placeDockForKeyboard);return}applyDockSize();requestAnimationFrame(()=>positionDock({defaultIfMissing:true,useAnchor:true}))}",
    "keyboard-safe resize",
)
replace_once(
    "  controls.add.addEventListener('click',()=>{addPoint();setAddMenu(false)});controls.addNavigate.addEventListener('click',()=>{addNavigation();setAddMenu(false)});controls.addWait.addEventListener('click',()=>{addWait();setAddMenu(false)});",
    "  controls.add.addEventListener('click',()=>{addPoint();revealEditor('action');setAddMenu(false)});controls.addNavigate.addEventListener('click',()=>{addNavigation();revealEditor('action');setAddMenu(false)});controls.addWait.addEventListener('click',()=>{addWait();revealEditor('condition');setAddMenu(false)});",
    "direct add-to-edit flow",
)
replace_once(
    "  shadow.addEventListener('focusin',event=>{const target=event.target;if(!(target instanceof HTMLElement)||!target.matches('input,select,textarea'))return;setTimeout(()=>{try{target.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'})}catch{target.scrollIntoView()}},220)});",
    "  shadow.addEventListener('focusin',event=>{const target=event.target;if(!(target instanceof HTMLElement)||!target.matches('input,select,textarea'))return;enterKeyboardMode(target);if(target===urlInput)setTimeout(()=>target.select?.(),0)});shadow.addEventListener('focusout',()=>{clearTimeout(state.keyboardFocusTimer);state.keyboardFocusTimer=setTimeout(()=>{const active=shadow.activeElement;if(!(active instanceof HTMLElement)||!active.matches('input,select,textarea'))exitKeyboardMode()},140)});",
    "keyboard focus management",
)
replace_once(
    "onCleanup(()=>{window.removeEventListener('resize',onResize);window.visualViewport?.removeEventListener('resize',onResize)});installDockDrag(dockHandle);installDockDrag(compactGrip,{tapToOpen:true});installDockResize(resizeLeft,'left');installDockResize(resizeRight,'right');",
    "onCleanup(()=>{window.removeEventListener('resize',onResize);window.visualViewport?.removeEventListener('resize',onResize)});installDockDrag(dockHandle);installDockDrag(compactGrip,{tapToOpen:true});installDockResize(resizeLeft,'left');installDockResize(resizeRight,'right');dockHandle.addEventListener('dblclick',event=>{event.preventDefault();resetDockLayout()});compactGrip.addEventListener('dblclick',event=>{event.preventDefault();resetDockLayout()});",
    "dock reset gesture",
)
replace_once("installed:true,version:10", "installed:true,version:11", "completion version")

path.write_text(source, encoding="utf-8")
