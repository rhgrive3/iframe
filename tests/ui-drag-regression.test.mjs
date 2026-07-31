import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../a.js', import.meta.url), 'utf8');

test('distribution script parses', () => {
  assert.doesNotThrow(() => new vm.Script(source));
});

test('touch drag owns its pointer and suppresses native page movement', () => {
  assert.match(source, /function acquireDragLock\(/);
  assert.match(source, /setPointerCapture\?\.\(event\.pointerId\)/);
  assert.match(source, /\['touchmove', 'gesturestart', 'gesturechange'\]/);
  assert.match(source, /window\.addEventListener\(type, suppressNativeDrag, \{ capture: true, passive: false \}\)/);
  assert.match(source, /releaseDragLock\(event, handle\)/);
  assert.match(source, /releaseDragLock\(event, marker\)/);
});

test('interrupted drags release every interaction lock and restore state', () => {
  assert.match(source, /function cancelActiveDrag\(/);
  assert.match(source, /root\.classList\.remove\('ui-dragging'\)/);
  assert.match(source, /shadow\.addEventListener\('lostpointercapture', cancelDragOnLostCapture, true\)/);
  assert.match(source, /window\.addEventListener\('blur', cancelDragOnBlur, true\)/);
  assert.match(source, /window\.addEventListener\('pagehide', cancelDragOnPageHide, true\)/);
  assert.match(source, /document\.addEventListener\('visibilitychange', cancelDragOnVisibilityChange, true\)/);
  assert.match(source, /if \(event\.type === 'pointercancel'\) return cancel\(\)/);
  assert.match(source, /state\.dockWidth = drag\.initialWidth/);
  assert.match(source, /action\.cx = drag\.baseX/);
});

test('touch jitter remains a tap while intentional movement starts a drag', () => {
  assert.match(source, /function pointerDragThreshold\(event\)/);
  assert.match(source, /event\?\.pointerType === 'touch'\) return 9/);
  assert.match(source, /if \(!drag\.moved && Math\.hypot\(dx, dy\) < drag\.threshold\) return/);
  assert.match(source, /if \(!drag\.moved && handle\.id === 'compactGrip'\) setCompact\(false\)/);
  assert.match(source, /if \(!drag\.moved\) selectMarker\(\)/);
});

test('canceled touch recording is discarded instead of becoming a click', () => {
  assert.match(source, /function recordPointerCancel\(event\)/);
  assert.match(source, /state\.activeRecordPointers\.delete\(event\.pointerId\)/);
  assert.match(source, /item\.dot\.remove\(\)/);
  assert.match(source, /recordLayer\.addEventListener\('pointercancel', recordPointerCancel/);
  assert.doesNotMatch(source, /recordLayer\.addEventListener\('pointercancel', recordPointerEnd/);
});

test('coarse pointers do not use fragile HTML drag and drop', () => {
  assert.match(source, /supportsNativeBlockDrag/);
  assert.match(source, /card\.draggable = !state\.running && supportsNativeBlockDrag/);
});

test('compact UI stays within its box and has one grip icon', () => {
  assert.match(source, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(source, /requestAnimationFrame\(positionDock\)/);
  assert.doesNotMatch(source, /id="compactGrip"[^>]*>⠿<\/button>/);
});
