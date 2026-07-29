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
    "#shell.keyboardOpen:not(.urlKeyboardOpen) #dock{transition:none!important;border-radius:14px}",
    "#shell.keyboardOpen:not(.urlKeyboardOpen) #dock{height:var(--dock-height)!important;max-height:none!important;transition:none!important;border-radius:14px}",
    "preserve dock height while typing",
)
replace_once(
    '<button id="browserHandle" title="URLバーを表示">⌄</button>',
    '<button id="browserHandle" title="URLバーを表示" aria-label="URLバーを表示">⌄</button>',
    "browser handle label",
)
replace_once(
    '<button id="dockHandle" title="ドラッグして移動"></button>',
    '<button id="dockHandle" title="ドラッグして移動・ダブルタップで位置を戻す" aria-label="メニューを移動。ダブルタップで位置とサイズを戻す"></button>',
    "dock handle label",
)
replace_once(
    '<button id="minimize" class="iconButton" title="小さくする">—</button>',
    '<button id="minimize" class="iconButton" title="小さくする" aria-label="メニューを小さくする">—</button>',
    "minimize label",
)
replace_once(
    '<button id="settingsToggle" class="iconButton" title="設定を開閉">⌄</button>',
    '<button id="settingsToggle" class="iconButton" title="設定を開閉" aria-label="設定を開閉">⌄</button>',
    "settings label",
)
replace_once(
    '<div id="compactBar"><button id="compactGrip" title="ドラッグ・タップで開く"></button><button id="compactRun">▶</button></div>',
    '<div id="compactBar"><button id="compactGrip" title="ドラッグ・タップで開く。ダブルタップで位置を戻す" aria-label="メニューを移動または開く。ダブルタップで位置とサイズを戻す"></button><button id="compactRun" aria-label="実行または停止">▶</button></div>',
    "compact controls labels",
)
replace_once(
    "  function setCompact(compact,{persist=true}={}){const before=dock.getBoundingClientRect(),rightGap=window.innerWidth-before.right,bottomGap=window.innerHeight-before.bottom;updateDockAnchors();state.compact=Boolean(compact);dock.classList.toggle('compact',state.compact);controls.minimize.textContent=state.compact?'□':'—';requestAnimationFrame(()=>{const after=dock.getBoundingClientRect();state.dockX=state.dockAnchorX==='right'?window.innerWidth-rightGap-after.width:before.left;state.dockY=state.dockAnchorY==='bottom'?window.innerHeight-bottomGap-after.height:before.top;normalizeDockPosition();if(persist)saveState()})}",
    "  function setCompact(compact,{persist=true}={}){const before=dock.getBoundingClientRect(),box=viewportBox(),right=box.left+box.width,bottom=box.top+box.height,rightGap=right-before.right,bottomGap=bottom-before.bottom;updateDockAnchors();state.compact=Boolean(compact);dock.classList.toggle('compact',state.compact);controls.minimize.textContent=state.compact?'□':'—';controls.minimize.setAttribute('aria-label',state.compact?'メニューを開く':'メニューを小さくする');requestAnimationFrame(()=>{const after=dock.getBoundingClientRect();state.dockX=state.dockAnchorX==='right'?right-rightGap-after.width:before.left;state.dockY=state.dockAnchorY==='bottom'?bottom-bottomGap-after.height:before.top;normalizeDockPosition();if(persist)saveState()})}",
    "viewport-aware compact toggle",
)
replace_once(
    "  shadow.addEventListener('focusin',event=>{const target=event.target;if(!(target instanceof HTMLElement)||!target.matches('input,select,textarea'))return;enterKeyboardMode(target);if(target===urlInput)setTimeout(()=>target.select?.(),0)});shadow.addEventListener('focusout',()=>{clearTimeout(state.keyboardFocusTimer);state.keyboardFocusTimer=setTimeout(()=>{const active=shadow.activeElement;if(!(active instanceof HTMLElement)||!active.matches('input,select,textarea'))exitKeyboardMode()},140)});",
    "  shadow.addEventListener('focusin',event=>{const target=event.target;if(!(target instanceof HTMLElement)||!target.matches('input,select,textarea'))return;if(target===urlInput){setTimeout(()=>target.select?.(),0);return}enterKeyboardMode(target)});shadow.addEventListener('focusout',()=>{clearTimeout(state.keyboardFocusTimer);state.keyboardFocusTimer=setTimeout(()=>{const active=shadow.activeElement;if(!(active instanceof HTMLElement)||!active.matches('input,select,textarea')||active===urlInput)exitKeyboardMode()},140)});",
    "do not enter dock keyboard mode for URL field",
)

path.write_text(source, encoding="utf-8")
