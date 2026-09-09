import assert from 'node:assert/strict';
import { isBooruMediaUrl } from './libraryService';

assert.equal(isBooruMediaUrl('http://booru-image.localhost/?url=x'), true);
assert.equal(isBooruMediaUrl('booru-image://localhost/?url=x'), true);
assert.equal(isBooruMediaUrl('https://cdn.example.com/image.png'), false);
