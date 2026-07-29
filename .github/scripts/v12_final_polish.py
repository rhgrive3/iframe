from pathlib import Path

path = Path('a.js')
source = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, got {count}')
    source = source.replace(old, new, 1)


extra_css = r'''
      /* v12 final density audit */
      .typePill{height:28px;font-size:11px}.saveStateBadge{font-size:10.5px}
      .markerNumber{font-size:10px}.markerDelay{font-size:9.5px}
      .logEntry{grid-template-columns:58px minmax(0,1fr);padding:9px 10px;font-size:11px}.logEmpty{font-size:11px}.toolbarMini{min-height:40px!important;font-size:11px!important}
      .sentenceLabel{font-size:11.5px}.stepNumber{font-size:10.5px}.saveHero button,.saveTools button{font-size:11.5px}
      #memoryRow{grid-template-columns:minmax(0,1.4fr) repeat(2,minmax(80px,.7fr))}
      @media(max-width:380px){#memoryRow{grid-template-columns:1fr 1fr}#memoryRow select{grid-column:1/-1}.saveHero{grid-template-columns:1fr}.saveHero button{width:100%}}
      @media(max-width:340px){#reload,#hideBrowser{display:none}}
'''
replace_once('    </style>', extra_css + '    </style>', 'final responsive css')
replace_once(
    "@media(max-width:540px){#topBar{grid-template-columns:44px minmax(0,1fr) 44px 44px 44px}.brandStatus{display:none}.cardHeader",
    "@media(max-width:540px){#topBar{grid-template-columns:44px minmax(0,1fr) 44px 44px 44px}.cardHeader",
    'retain mobile status',
)
replace_once(
    '<div id="tabBar" role="tablist" aria-label="設定カテゴリ">',
    '<div id="tabBar" role="tablist" aria-label="設定カテゴリ" aria-orientation="horizontal">',
    'tab orientation',
)
replace_once(
    "title.textContent='最初の動作を追加';help.textContent='タップ位置・URL移動・条件待ちから作成できます';copy.append(title,help);empty.append(icon,copy);empty.addEventListener('click',()=>{addPoint();revealEditor('action')});",
    "title.textContent='最初の動作を選ぶ';help.textContent='クリック・URL移動・条件待ちから選べます';copy.append(title,help);empty.append(icon,copy);empty.addEventListener('click',()=>{setAddMenu(true);controls.add.focus()});",
    'empty state action consistency',
)
replace_once(
    "controls.minimize.setAttribute('aria-label','メニューを小さくする');applyDockSize();",
    "controls.minimize.setAttribute('aria-label','メニューを小さくする');controls.minimize.setAttribute('aria-expanded','true');applyDockSize();",
    'reset compact state aria',
)
replace_once(
    "controls.minimize.textContent='—';controls.minimize.setAttribute('aria-expanded','true');saveState();updateStatus('メニュー位置を変更しました')",
    "controls.minimize.textContent='—';controls.minimize.setAttribute('aria-label','メニューを小さくする');controls.minimize.setAttribute('aria-expanded','true');saveState();updateStatus('メニュー位置を変更しました')",
    'position preset aria',
)
replace_once(
    "controls.minimize.textContent='—';controls.minimize.setAttribute('aria-expanded','true');saveState();updateStatus(`メニューを${size==='small'?'小さめ':size==='large'?'大きめ':'標準'}にしました`)",
    "controls.minimize.textContent='—';controls.minimize.setAttribute('aria-label','メニューを小さくする');controls.minimize.setAttribute('aria-expanded','true');saveState();updateStatus(`メニューを${size==='small'?'小さめ':size==='large'?'大きめ':'標準'}にしました`)",
    'size preset aria',
)
replace_once("updateStatus('アクションを全消去')", "updateStatus('すべての動作を消しました')", 'clear status wording')
replace_once(
    "  shadow.addEventListener('focusin',event=>{const target=event.target;if(!(target instanceof HTMLElement)||!target.matches('input,select,textarea'))return;if(target===urlInput){setTimeout(()=>target.select?.(),0);return}enterKeyboardMode(target)});",
    "  const usesSoftwareKeyboard=()=>Boolean(window.matchMedia?.('(hover:none) and (pointer:coarse)').matches);\n  shadow.addEventListener('focusin',event=>{const target=event.target;if(!(target instanceof HTMLElement)||!target.matches('input,select,textarea'))return;if(target===urlInput){setTimeout(()=>target.select?.(),0);return}if(!usesSoftwareKeyboard())return;enterKeyboardMode(target)});",
    'scope keyboard mode to touch devices',
)

path.write_text(source, encoding='utf-8')
