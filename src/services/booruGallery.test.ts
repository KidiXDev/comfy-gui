import assert from 'node:assert/strict';
import { buildBooruPrompt, formatBooruWarnings } from './booruGallery';

assert.equal(
  buildBooruPrompt(
    {
      copyright: ['series_name'],
      character: ['alice_(wonderland)'],
      general: ['blue_hair', 'series_name']
    },
    {
      categories: ['copyright', 'character', 'general'],
      replaceUnderscores: true,
      escapeParentheses: true
    },
    ['blue_hair']
  ),
  'series name, alice \\(wonderland\\)'
);

assert.deepEqual(
  formatBooruWarnings(['local-blacklist-filtered', 'restricted-media-hidden']),
  ['Some restricted posts are unavailable for this account.']
);
