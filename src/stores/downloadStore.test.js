import { expect, test } from 'bun:test';
import { shouldPollDownloads } from './downloadStore';

test('download polling stops for stable states', () => {
  expect(shouldPollDownloads([{ status: 'active' }])).toBe(true);
  expect(shouldPollDownloads([{ status: 'waiting' }])).toBe(true);
  expect(shouldPollDownloads([{ status: 'paused' }])).toBe(false);
  expect(shouldPollDownloads([{ status: 'complete' }])).toBe(false);
  expect(shouldPollDownloads([])).toBe(false);
});
