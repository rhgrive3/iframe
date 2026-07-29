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
    "  function resetDockLayout(){state.dockWidth=DEFAULT_DOCK_WIDTH;state.dockHeight=DEFAULT_DOCK_HEIGHT;state.dockX=null;state.dockY=null;state.dockGapX=null;state.dockGapY=null;state.compact=false;dock.classList.remove('compact');applyDockSize();positionDock({defaultIfMissing:true});saveState();updateStatus('メニュー位置とサイズを標準に戻しました')}",
    "  function resetDockLayout(){state.dockWidth=DEFAULT_DOCK_WIDTH;state.dockHeight=DEFAULT_DOCK_HEIGHT;state.dockX=null;state.dockY=null;state.dockGapX=null;state.dockGapY=null;state.compact=false;dock.classList.remove('compact');controls.minimize.textContent='—';controls.minimize.setAttribute('aria-label','メニューを小さくする');applyDockSize();positionDock({defaultIfMissing:true});saveState();updateStatus('メニュー位置とサイズを標準に戻しました')}",
    "reset compact affordance",
)
replace_once(
    "  function applyVisibility(){applyDockSize();setSettings(state.settingsOpen,{persist:false});setBrowserHidden(state.browserHidden,{persist:false});dock.classList.toggle('compact',state.compact);controls.minimize.textContent=state.compact?'□':'—';setActiveTab(state.activeTab,{persist:false});setAddMenu(false)}",
    "  function applyVisibility(){applyDockSize();setSettings(state.settingsOpen,{persist:false});setBrowserHidden(state.browserHidden,{persist:false});dock.classList.toggle('compact',state.compact);controls.minimize.textContent=state.compact?'□':'—';controls.minimize.setAttribute('aria-label',state.compact?'メニューを開く':'メニューを小さくする');setActiveTab(state.activeTab,{persist:false});setAddMenu(false)}",
    "restore compact accessibility state",
)

path.write_text(source, encoding="utf-8")
