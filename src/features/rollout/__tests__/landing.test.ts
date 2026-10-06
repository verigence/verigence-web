import { describe, expect, it } from 'vitest';

import { hrHomePath, landingDecision, type LandingInput } from '../landing';

const base: LandingInput = {
  features: { status: 'ready', audit: false },
  hr: { loading: false, available: true, isEmployee: true, canReadEmployees: false },
  searchParams: new URLSearchParams(),
};
const decide = (over: Omit<Partial<LandingInput>, 'hr'> & { hr?: Partial<LandingInput['hr']> }) =>
  landingDecision({ ...base, ...over, hr: { ...base.hr, ...over.hr } });

describe('landingDecision', () => {
  it('waits while the features are loading, before showing or redirecting anything', () => {
    expect(decide({ features: { status: 'loading' } })).toEqual({ kind: 'wait' });
  });

  it('waits for HR only when Audit is off', () => {
    expect(decide({ hr: { loading: true } })).toEqual({ kind: 'wait' });
    expect(decide({ features: { status: 'ready', audit: true }, hr: { loading: true } })).toEqual({ kind: 'stay' });
  });

  it('stays on the dashboard when the features request failed', () => {
    expect(decide({ features: { status: 'error' } })).toEqual({ kind: 'stay' });
  });

  it('stays when Audit is on', () => {
    expect(decide({ features: { status: 'ready', audit: true } })).toEqual({ kind: 'stay' });
  });

  it('sends an employee without Audit to attendance', () => {
    expect(decide({})).toEqual({ kind: 'go', to: '/hr/attendance' });
  });

  it('sends an HR reader who is not an employee to the employee list, other HR holders to their own page', () => {
    expect(decide({ hr: { isEmployee: false, canReadEmployees: true } })).toEqual({ kind: 'go', to: '/hr/employees' });
    expect(decide({ hr: { isEmployee: false, canReadEmployees: false } })).toEqual({ kind: 'go', to: '/hr/me' });
  });

  it('stays when there is no HR, or HR could not be determined', () => {
    expect(decide({ hr: { available: false, isEmployee: false } })).toEqual({ kind: 'stay' });
  });

  it('leaves Audit work alone when the URL carries any query parameter', () => {
    expect(decide({ searchParams: new URLSearchParams('action=create-booking') })).toEqual({ kind: 'stay' });
    expect(decide({ searchParams: new URLSearchParams('action=create-booking&view=x') })).toEqual({ kind: 'stay' });
    expect(decide({ features: { status: 'loading' }, searchParams: new URLSearchParams('action=create-booking') })).toEqual({ kind: 'stay' });
  });
});

describe('hrHomePath', () => {
  it('is attendance for an employee, the employee list for an HR reader, else the person\'s own page', () => {
    expect(hrHomePath({ isEmployee: true, canReadEmployees: false })).toBe('/hr/attendance');
    expect(hrHomePath({ isEmployee: true, canReadEmployees: true })).toBe('/hr/attendance');
    expect(hrHomePath({ isEmployee: false, canReadEmployees: true })).toBe('/hr/employees');
    expect(hrHomePath({ isEmployee: false, canReadEmployees: false })).toBe('/hr/me');
  });
});
