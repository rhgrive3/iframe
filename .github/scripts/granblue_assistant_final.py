from pathlib import Path

source_path = Path('a.js')
test_path = Path('tests/autoflow.static.test.mjs')
source = source_path.read_text(encoding='utf-8')
tests = test_path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    source = source.replace(old, new, 1)


replace_once(
    "const initial=normalizeUrl(urlInput.value||location.href);urlInput.value=initial;iframe.src=initial;",
    "const savedInitial=String(urlInput.value||'').trim(),initial=normalizeUrl(!savedInitial||savedInitial==='about:blank'?location.href:savedInitial);urlInput.value=initial;iframe.src=initial;",
    'legacy blank initial URL'
)
replace_once(
    "tabPages.forEach(p=>{const active=p.id===panelId;p.classList.toggle('active',active);p.setAttribute('aria-hidden',String(!active))});if(persist)saveState()}",
    "tabPages.forEach(p=>{const active=p.id===panelId;p.classList.toggle('active',active);p.setAttribute('aria-hidden',String(!active))});if(state.activeTab==='condition')requestAnimationFrame(refreshGranblueAssistant);if(persist)saveState()}",
    'immediate condition diagnosis'
)

old_assertion = "  assert.match(source, /normalizeUrl\\(urlInput\\.value\\|\\|location\\.href\\)/);"
new_assertion = "  assert.match(source, /normalizeUrl\\(!savedInitial\\|\\|savedInitial==='about:blank'\\?location\\.href:savedInitial\\)/);"
assertion_count = tests.count(old_assertion)
if assertion_count != 1:
    raise SystemExit(f'initial URL test migration: expected exactly one match, got {assertion_count}')
tests = tests.replace(old_assertion, new_assertion, 1)

tests += r'''

test("legacy about blank state also falls back to the parent URL", () => {
  assert.match(source, /!savedInitial\|\|savedInitial==='about:blank'\?location\.href:savedInitial/);
  assert.match(source, /if\(state\.activeTab==='condition'\)requestAnimationFrame\(refreshGranblueAssistant\)/);
});
'''

source_path.write_text(source, encoding='utf-8')
test_path.write_text(tests, encoding='utf-8')
