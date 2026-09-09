import assert from 'node:assert/strict';
import {
  buildBooruPrompt,
  formatBooruWarnings,
  normalizeBooruRatings
} from './booruGallery';

assert.deepEqual(normalizeBooruRatings([], ['general']), []);
assert.deepEqual(normalizeBooruRatings(['safe'], []), ['safe']);
assert.deepEqual(
  normalizeBooruRatings(['general', 'explicit'], ['explicit', 'unknown']),
  ['explicit']
);
assert.deepEqual(normalizeBooruRatings(['general', 'explicit'], ['unknown']), [
  'general'
]);

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
