from pathlib import Path

path = Path('a.js')
source = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, got {count}')
    source = source.replace(old, new, 1)


replace_once(
    "controls.record.disabled=state.running;controls.recordPanel.disabled=state.running;controls.run.disabled=!has&&!state.running;controls.compactRun.disabled=!has&&!state.running;",
    "controls.record.disabled=busy;controls.recordPanel.disabled=busy;controls.run.disabled=state.recording||(!has&&!state.running);controls.compactRun.disabled=state.recording||(!has&&!state.running);controls.clear.disabled=!has||busy;for(const control of [...dockPositionButtons,...dockSizeButtons])control.disabled=busy;",
    'busy control states',
)
replace_once(
    "  for(const control of [clickSelector,waitForTarget,targetTimeout,targetFailure,scrollTarget])control.addEventListener('change',saveClickTargetFromUi);clickSelector.addEventListener('input',saveClickTargetFromUi);",
    "  for(const control of [clickSelector,targetTimeout,targetFailure,scrollTarget])control.addEventListener('change',saveClickTargetFromUi);waitForTarget.addEventListener('change',()=>{saveClickTargetFromUi();updateEditor()});clickSelector.addEventListener('input',saveClickTargetFromUi);",
    'target dependency refresh',
)
replace_once(
    "  waitForLoad.addEventListener('change',()=>{const p=selectedPoint();if(!isNavigate(p))return;p.waitForLoad=waitForLoad.checked;saveState()});",
    "  waitForLoad.addEventListener('change',()=>{const p=selectedPoint();if(!isNavigate(p))return;p.waitForLoad=waitForLoad.checked;saveState();updateEditor()});",
    'navigation dependency refresh',
)
replace_once(
    "saveConditionFromUi()});\n  conditionSelector.addEventListener('input'",
    "saveConditionFromUi();updateEditor()});\n  conditionSelector.addEventListener('input'",
    'condition dependency refresh',
)
replace_once(
    "saveConditionFromUi();showConditionResult(evaluateCondition(p));updateStatus(`条件を「${conditionTypeLabel(conditionType.value)}」にしました`)",
    "saveConditionFromUi();updateEditor();showConditionResult(evaluateCondition(p));updateStatus(`条件を「${conditionTypeLabel(conditionType.value)}」にしました`)",
    'automatic condition refresh',
)
replace_once(
    "saveConditionFromUi();updateConditionFields();showConditionResult(evaluateCondition(p))}));tabButtons.forEach(button=>button.addEventListener('click',()=>setActiveTab(button.dataset.tab)));",
    "saveConditionFromUi();updateEditor();showConditionResult(evaluateCondition(p))}));tabButtons.forEach((button,index)=>{button.addEventListener('click',()=>setActiveTab(button.dataset.tab));button.addEventListener('keydown',event=>{let next=index;if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(index+1)%tabButtons.length;else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(index-1+tabButtons.length)%tabButtons.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabButtons.length-1;else return;event.preventDefault();const target=tabButtons[next];setActiveTab(target.dataset.tab);target.focus()})});",
    'tab keyboard navigation',
)
replace_once(
    'aria-label="メニューを移動。ダブルタップで位置とサイズを戻す"',
    'aria-label="メニューを移動。矢印キーでも移動、ダブルタップで位置とサイズを戻す"',
    'dock handle instructions',
)
replace_once(
    'aria-label="左下からサイズ変更"',
    'aria-label="左下からサイズ変更。矢印キーでも変更"',
    'left resize instructions',
)
replace_once(
    'aria-label="右下からサイズ変更"',
    'aria-label="右下からサイズ変更。矢印キーでも変更"',
    'right resize instructions',
)

path.write_text(source, encoding='utf-8')
