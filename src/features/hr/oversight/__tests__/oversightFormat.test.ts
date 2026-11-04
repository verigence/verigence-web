import { describe, expect, it } from 'vitest';

import { HrHttpError } from '../../../../services/hr/client';
import { formatAgeHours, isForbidden, itemDetail, oversightErrorMessage, roleLabel } from '../oversightFormat';

describe('oversight words', () => {
  it('writes waiting times in hours and days', () => {
    expect(formatAgeHours(null)).toBe('—');
    expect(formatAgeHours(0.4)).toBe('Under 1 h');
    expect(formatAgeHours(3)).toBe('3 h');
    expect(formatAgeHours(23.9)).toBe('23 h');
    expect(formatAgeHours(48)).toBe('2 d');
    expect(formatAgeHours(52.5)).toBe('2 d 4 h');
  });
  it('names what an item is about', () => {
    expect(itemDetail({ type: 'ATTENDANCE', detail: 'LATE_CHECK_IN' })).toBe('Late check-in');
    expect(itemDetail({ type: 'LEAVE', detail: 'SPECIAL' })).toBe('Special occasion leave');
    expect(itemDetail({ type: 'CLAIM', detail: 'TRAVEL' })).toBe('TRAVEL');
    expect(roleLabel('TL')).toBe('Team Lead');
    expect(roleLabel('PM')).toBe('Project Manager');
  });
  it('explains who can see the page when the server refuses', () => {
    const refused = new HrHttpError(403, { code: 'HR_FORBIDDEN' });
    expect(isForbidden(refused)).toBe(true);
    expect(oversightErrorMessage(refused)).toBe('Only an Executive, HR or the CEO can see this.');
    expect(isForbidden(new HrHttpError(500))).toBe(false);
  });
});
