from pathlib import Path

path = Path('.github/scripts/perfection_v12.py')
source = path.read_text(encoding='utf-8')
old = '''replace_once("if(d.moved){d.suppress=performance.now()+350;updateDockAnchors();saveState()}", "if(d.moved){d.suppress=performance.now()+350;saveState()}", "marker drag anchor bug")'''
new = '''replace_once("if(d.moved){d.suppress=performance.now()+350;updateDockAnchors();saveState()}d.id=null", "if(d.moved){d.suppress=performance.now()+350;saveState()}d.id=null", "marker drag anchor bug")'''
if source.count(old) != 1:
    raise SystemExit(f'expected one marker patch definition, got {source.count(old)}')
path.write_text(source.replace(old, new, 1), encoding='utf-8')
