from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
source_path = ROOT / "a.js"
test_path = ROOT / "test" / "touch-event-regression.test.mjs"

source = source_path.read_text(encoding="utf-8")


def replace_exact(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    return text.replace(old, new, 1)


source = replace_exact(
    source,
    "  const APP_VERSION = 20;",
    "  const APP_VERSION = 21;",
    "APP_VERSION",
)

old_dispatch = """  function dispatchSyntheticTouch(win, target, type, touch, active, { allowCanceled = false } = {}) {
    if (typeof win.TouchEvent !== 'function') {
      throw new FlowError('この環境は標準TouchEventに対応していません', 'TOUCH_EVENT_UNSUPPORTED');
    }
    const activeTouches = active ? [touch] : [];
    let event;
    try {
      event = new win.TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        touches: activeTouches,
        targetTouches: activeTouches,
        changedTouches: [touch]
      });
    } catch (error) {
      throw new FlowError(`TouchEvent生成に失敗しました: ${error.message}`, 'TOUCH_EVENT_CONSTRUCTION_FAILED');
    }
    const accepted = target.dispatchEvent(event);
    if ((!accepted || event.defaultPrevented) && !allowCanceled) {
      throw new FlowError(`${type}が対象側でキャンセルされました`, 'TOUCH_EVENT_CANCELED');
    }
    return event;
  }
"""

new_dispatch = """  function dispatchSyntheticTouch(win, target, type, touch, active) {
    if (typeof win.TouchEvent !== 'function') {
      throw new FlowError('この環境は標準TouchEventに対応していません', 'TOUCH_EVENT_UNSUPPORTED');
    }
    const activeTouches = active ? [touch] : [];
    let event;
    try {
      event = new win.TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        touches: activeTouches,
        targetTouches: activeTouches,
        changedTouches: [touch]
      });
    } catch (error) {
      throw new FlowError(`TouchEvent生成に失敗しました: ${error.message}`, 'TOUCH_EVENT_CONSTRUCTION_FAILED');
    }
    // preventDefault() is a normal part of many touch handlers: it suppresses
    // emulated mouse/click behavior while the page still consumes the gesture.
    // Do not terminate touchmove/touchend merely because dispatchEvent() is false.
    target.dispatchEvent(event);
    return event;
  }
"""

source = replace_exact(source, old_dispatch, new_dispatch, "dispatchSyntheticTouch")

allow_canceled_count = source.count(", { allowCanceled: true }")
if allow_canceled_count != 4:
    raise SystemExit(f"allowCanceled call sites: expected 4, got {allow_canceled_count}")
source = source.replace(", { allowCanceled: true }", "")

source_path.write_text(source, encoding="utf-8")

tests = test_path.read_text(encoding="utf-8")
old_test = """test('TouchEvent lists remain coherent and cancellation is retained', () => {
  assert.match(source, /const activeTouches = active \\? \\[touch\\] : \\[\\]/);
  assert.match(source, /touches: activeTouches/);
  assert.match(source, /targetTouches: activeTouches/);
  assert.match(source, /changedTouches: \\[touch\\]/);
  assert.match(source, /'touchcancel'/);
});
"""
new_test = """test('TouchEvent lists remain coherent and cancellation cleanup is retained', () => {
  assert.match(source, /const activeTouches = active \\? \\[touch\\] : \\[\\]/);
  assert.match(source, /touches: activeTouches/);
  assert.match(source, /targetTouches: activeTouches/);
  assert.match(source, /changedTouches: \\[touch\\]/);
  assert.match(source, /'touchcancel'/);
});

test('preventDefault is treated as normal touch-handler feedback, not a gesture failure', () => {
  const start = source.indexOf('function dispatchSyntheticTouch');
  const end = source.indexOf('function scrollableAncestors', start);
  const block = source.slice(start, end);
  assert.match(block, /target\\.dispatchEvent\\(event\\)/);
  assert.doesNotMatch(block, /event\\.defaultPrevented/);
  assert.doesNotMatch(block, /TOUCH_EVENT_CANCELED/);
  assert.doesNotMatch(source, /allowCanceled/);
});
"""
tests = replace_exact(tests, old_test, new_test, "preventDefault regression test")
test_path.write_text(tests, encoding="utf-8")
