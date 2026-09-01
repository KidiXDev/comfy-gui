import { describe, expect, test } from 'bun:test';
import { isNewerVersion } from './version';

describe('isNewerVersion', () => {
  test('compares release versions numerically', () => {
    expect(isNewerVersion('v1.10.0', 'v1.9.0')).toBe(true);
    expect(isNewerVersion('v2.0.0', 'v1.99.0')).toBe(true);
    expect(isNewerVersion('v1.0.0', 'v1.0.0')).toBe(false);
    expect(isNewerVersion('v1.9.0', 'v1.10.0')).toBe(false);
  });
});
