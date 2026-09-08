import assert from 'node:assert/strict';
import { createConfirmDialog } from '../src/composables/useConfirmDialog';

const dialog = createConfirmDialog();
const confirmed = dialog.confirm({
  title: 'Delete?',
  description: 'Permanent.'
});

assert.equal(dialog.open.value, true);
dialog.finish(true);
assert.equal(await confirmed, true);
assert.equal(dialog.open.value, false);

const replaced = dialog.confirm({ title: 'First', description: 'First.' });
const replacement = dialog.confirm({ title: 'Second', description: 'Second.' });

assert.equal(await replaced, false);
dialog.finish(false);
assert.equal(await replacement, false);
