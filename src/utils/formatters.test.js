import { describe, expect, test } from 'bun:test';
import { formatFileSize, formatShortDate } from './formatters';

describe('formatters', () => {
  test('formats byte sizes consistently', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  test('keeps an empty timestamp empty', () => {
    expect(formatShortDate(0)).toBe('');
  });
});
