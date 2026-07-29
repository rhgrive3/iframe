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
    "@media(max-width:620px){#url,.field input[type=number],.field input[type=text],.field input[type=url],.field select,#memoryRow select{font-size:16px!important}#settingsPanel{padding-bottom:env(safe-area-inset-bottom)}}",
    "@media(max-width:620px),(hover:none) and (pointer:coarse){#url,.field input[type=number],.field input[type=text],.field input[type=url],.field select,#memoryRow select{font-size:16px!important}#settingsPanel{padding-bottom:env(safe-area-inset-bottom)}}",
    "touch-device input sizing",
)
replace_once(
    "  function revealEditor(tab='action'){if(!state.settingsOpen)setSettings(true,{persist:false});setActiveTab(tab,{persist:false});requestAnimationFrame(()=>positionDock())}",
    "  function revealEditor(tab='action'){if(!state.settingsOpen)setSettings(true,{persist:false});setActiveTab(tab,{persist:false});saveState();requestAnimationFrame(()=>positionDock())}",
    "persist direct edit destination",
)

path.write_text(source, encoding="utf-8")
