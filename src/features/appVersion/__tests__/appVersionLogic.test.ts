import { describe, expect, it } from 'vitest';

import { isBelow, isVersion, parseVersion } from '../appVersionLogic';

describe('app version', () => {
  it('compares numbers, not text', () => {
    expect(isBelow('1.4.0', '1.5.0')).toBe(true);
    expect(isBelow('1.10.0', '1.9.0')).toBe(false);
    expect(isBelow('1.5.0', '1.5.0')).toBe(false);
    expect(isBelow('2.0.0', '1.5.0')).toBe(false);
  });

  it('treats an unreadable version as too old, and no minimum as no limit', () => {
    expect(isBelow(undefined, '1.5.0')).toBe(true);
    expect(isBelow('beta', '1.5.0')).toBe(true);
    expect(isBelow('0.1.0', null)).toBe(false);
  });

  it('accepts only three numbers', () => {
    expect(isVersion('1.5.0')).toBe(true);
    expect(isVersion('1.5')).toBe(false);
    expect(parseVersion(' 1.2.3 ')).toEqual([1, 2, 3]);
  });
});
