import { describe, expect, it } from 'vitest';

import { AuditCoreHttpError } from '../audit-core/client';
import { auditCoreErrorMessage } from '../audit-core/errorMessage';
import { HrHttpError, hrErrorMessage } from '../hr/client';
import { NIGHT_MODE_MESSAGE, isNightModeError } from '../nightMode';

describe('NIGHT_MODE from the services', () => {
  it('reads Audit Core problem JSON (errorCode) as Night Mode On', () => {
    const error = new AuditCoreHttpError(403, { errorCode: 'NIGHT_MODE', title: 'Night mode', detail: 'Night Mode On', status: 403, correlationId: 'c-1' });
    expect(isNightModeError(error)).toBe(true);
    expect(error.message).toBe(NIGHT_MODE_MESSAGE);
    expect(auditCoreErrorMessage(error)).toBe(NIGHT_MODE_MESSAGE);
  });

  it('reads a myHR ApiError ({code, detail}) as Night Mode On, not "You do not have access"', () => {
    const error = new HrHttpError(403, { code: 'NIGHT_MODE', detail: 'Night Mode On' }, 'c-2');
    expect(isNightModeError(error)).toBe(true);
    expect(error.message).toBe(NIGHT_MODE_MESSAGE);
    expect(hrErrorMessage(error)).toBe(NIGHT_MODE_MESSAGE);
  });

  it('also knows a structured detail and the error type URN', () => {
    expect(isNightModeError({ detail: { code: 'NIGHT_MODE' } })).toBe(true);
    expect(isNightModeError({ problem: { type: 'urn:verigence:audit-core:error:NIGHT_MODE' } })).toBe(true);
  });

  it('leaves every other refusal as it was', () => {
    const denied = new HrHttpError(403, { code: 'HR_PERMISSION_DENIED', detail: 'No' });
    expect(isNightModeError(denied)).toBe(false);
    expect(hrErrorMessage(denied)).toBe('You do not have access to this.');
    const other = new AuditCoreHttpError(403, { errorCode: 'VAC-AUTH-002', detail: 'Permission denied' });
    expect(isNightModeError(other)).toBe(false);
    expect(auditCoreErrorMessage(other)).toContain('VAC-AUTH-002');
    expect(isNightModeError(new Error('NIGHT_MODE'))).toBe(false);
    expect(isNightModeError(undefined)).toBe(false);
  });
});
