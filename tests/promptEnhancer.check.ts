import assert from 'node:assert/strict';
import { buildEnhancerUserPrompt } from '../src/data/aiPrompts';

const customRequest = 'Change pose into a dynamic running pose.';
const payload = buildEnhancerUserPrompt(true, '1girl, standing', customRequest);

assert.match(payload, new RegExp(`OPERATION:\\n${customRequest}`, 'u'));
assert.doesNotMatch(payload, /MODIFICATION:/u);
console.log('Prompt enhancer custom-mode checks passed');
