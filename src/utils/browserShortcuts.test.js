import assert from 'node:assert/strict';
import { isNativeBrowserShortcut } from './browserShortcuts';

const event = (key, modifiers = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers
});
for (const key of ['F5', 'F12']) assert.ok(isNativeBrowserShortcut(event(key)));
assert.ok(
  isNativeBrowserShortcut(event('R', { ctrlKey: true, shiftKey: true }))
);
assert.ok(isNativeBrowserShortcut(event('r', { metaKey: true })));
assert.ok(isNativeBrowserShortcut(event('ArrowLeft', { altKey: true })));
for (const key of ['a', 'c', 'x', 'v', 'z', 'y', 'Enter']) {
  assert.equal(isNativeBrowserShortcut(event(key, { ctrlKey: true })), false);
}
assert.equal(isNativeBrowserShortcut(event('r')), false);
assert.equal(isNativeBrowserShortcut(event('ArrowLeft')), false);
console.log('Native browser shortcut and editing shortcut checks passed');
