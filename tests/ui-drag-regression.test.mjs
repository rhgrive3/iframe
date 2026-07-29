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

test('coarse pointers do not use fragile HTML drag and drop', () => {
  assert.match(source, /supportsNativeBlockDrag/);
  assert.match(source, /card\.draggable = !state\.running && supportsNativeBlockDrag/);
});

test('compact UI stays within its box and has one grip icon', () => {
  assert.match(source, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(source, /requestAnimationFrame\(positionDock\)/);
  assert.doesNotMatch(source, /id="compactGrip"[^>]*>⠿<\/button>/);
});
