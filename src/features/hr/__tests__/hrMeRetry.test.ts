import { describe, expect, it } from 'vitest';

import { HrHttpError, HrNetworkError } from '../../../services/hr/client';
import { shouldRetryHrMe } from '../hrQueries';

describe('shouldRetryHrMe', () => {
  it('tries a refused check twice more (13 Nov 2026: a just-issued sign-in was refused)', () => {
    const refused = new HrHttpError(401);
    expect(shouldRetryHrMe(0, refused)).toBe(true);
    expect(shouldRetryHrMe(1, refused)).toBe(true);
    expect(shouldRetryHrMe(2, refused)).toBe(false);
  });

  it('tries again after a dropped connection', () => {
    expect(shouldRetryHrMe(0, new HrNetworkError('HR could not be reached.'))).toBe(true);
  });

  it('does not try again when HR gave a real answer', () => {
    expect(shouldRetryHrMe(0, new HrHttpError(403))).toBe(false);
    expect(shouldRetryHrMe(0, new HrHttpError(404))).toBe(false);
    expect(shouldRetryHrMe(0, new HrHttpError(500))).toBe(false);
  });
});
