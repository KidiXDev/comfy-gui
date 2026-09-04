import assert from 'node:assert/strict';
import { normalizeModelFilename } from './civitai';

assert.equal(
  normalizeModelFilename('external\\portraits\\Model.SAFETENSORS'),
  'model.safetensors'
);
assert.equal(
  normalizeModelFilename('portraits/model.safetensors'),
  'model.safetensors'
);

console.log('Civitai model filename matching: OK');
