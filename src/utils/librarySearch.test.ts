import assert from 'node:assert/strict';
import type { CharacterLibraryItem, LibraryItem } from '../types/library';
import { matchesQuery, searchCharacterEntries } from './librarySearch';

const base = { category: 'characters', createdAt: 0, updatedAt: 0 };

const miku: CharacterLibraryItem = {
  ...base,
  id: 'a',
  name: 'Hatsune Miku',
  data: {
    trigger: 'hatsune_miku',
    series: 'Vocaloid',
    tags: ['aqua hair', 'twintails'],
    notes: 'Always cheerful; avoid dark themes.'
  }
};

const rin: CharacterLibraryItem = {
  ...base,
  id: 'b',
  name: 'Kagamine Rin',
  data: {
    trigger: 'kagamine_rin',
    series: 'Vocaloid',
    tags: ['blonde hair', 'hair bow', 'cheerful']
  }
};

// notes and tags are searchable
assert.equal(matchesQuery(miku, 'dark themes'), true);
assert.equal(matchesQuery(rin, 'hair bow'), true);
assert.equal(matchesQuery(rin, 'dark'), false);

// every term must match
assert.equal(matchesQuery(miku, 'vocaloid twintails'), true);
assert.equal(matchesQuery(miku, 'vocaloid blonde'), false);

// name/trigger matches rank above tag/notes matches
const ranked = searchCharacterEntries([miku, rin], 'cheerful');
assert.deepEqual(
  ranked.map((e) => e.id),
  ['a', 'b']
);
const byTrigger = searchCharacterEntries([miku, rin], 'kagamine');
assert.deepEqual(
  byTrigger.map((e) => e.id),
  ['b']
);

// non-character payloads still search safely
const prompt: LibraryItem = {
  ...base,
  id: 'c',
  category: 'prompts',
  name: 'Sunset',
  data: { type: 'both', positive: 'golden hour, beach', negative: 'lowres' }
};
assert.equal(matchesQuery(prompt, 'beach'), true);
assert.equal(matchesQuery(prompt, 'lowres'), true);
assert.equal(matchesQuery({ ...prompt, data: null }, 'sunset'), true);
