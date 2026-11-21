import { describe, expect, it } from 'vitest';

import type { SystemShutdownOverview } from '../../services/security/systemShutdown';
import { actionLabel, clockLabel, headline, isHhMm, untilLabel } from './systemShutdown';

const base: SystemShutdownOverview = {
  closed: false, opensAtUtc: null, message: null, resting: false, restUntilUtc: null,
  hoursFromIst: '00:30', hoursToIst: '08:00', manual: null, manualSinceUtc: null, manualUntilUtc: null,
  gate: true, people: [], lastChange: null,
};
// 21 Nov 2026, 6:00 pm India time.
const sixPm = new Date('2026-11-21T12:30:00Z');

describe('system shutdown: what the tab says', () => {
  it('reads India times as people say them', () => {
    expect(clockLabel('00:30')).toBe('12:30 am');
    expect(clockLabel('08:00')).toBe('8:00 am');
    expect(clockLabel('22:05')).toBe('10:05 pm');
    expect(clockLabel('12:00')).toBe('12:00 pm');
    expect(clockLabel(null)).toBe('—');
    expect(isHhMm('07:30')).toBe(true);
    expect(isHhMm('7:30')).toBe(false);
    expect(isHhMm('24:00')).toBe(false);
  });

  it('says until when in India time, with the day when it is not today', () => {
    expect(untilLabel('2026-11-21T14:30:00Z', sixPm)).toBe('8:00 pm');
    expect(untilLabel('2026-11-22T02:30:00Z', sixPm)).toBe('8:00 am tomorrow');
    expect(untilLabel('2026-11-24T02:30:00Z', sixPm)).toBe('8:00 am on 24 Nov');
    expect(untilLabel(null, sixPm)).toBe('—');
    expect(untilLabel('not a time', sixPm)).toBe('—');
  });

  it('running by day names the next daily shutdown', () => {
    expect(headline(base, sixPm)).toEqual({ shut: false, title: 'Verigence is running', detail: 'The next daily shutdown is 12:30 am to 8:00 am, India time.' });
    expect(headline({ ...base, hoursFromIst: null, hoursToIst: null }, sixPm).detail).toBe('There is no daily shutdown.');
  });

  it('shut by hand in the evening says so, and until tomorrow morning', () => {
    const shut = headline({ ...base, closed: true, resting: true, restUntilUtc: '2026-11-22T02:30:00Z', manual: 'SHUT', manualUntilUtc: '2026-11-22T02:30:00Z' }, sixPm);
    expect(shut.shut).toBe(true);
    expect(shut.title).toBe('Verigence is shut until 8:00 am tomorrow');
    expect(shut.detail).toContain('Shut down by hand');
  });

  it('the daily shutdown at night, and a start by hand during it', () => {
    const threeAm = new Date('2026-11-21T21:30:00Z');
    const night = headline({ ...base, closed: true, resting: true, restUntilUtc: '2026-11-22T02:30:00Z' }, threeAm);
    expect(night.title).toBe('Verigence is shut until 8:00 am');
    expect(night.detail).toContain('The daily shutdown (12:30 am to 8:00 am)');
    const started = headline({ ...base, manual: 'OPEN', manualUntilUtc: '2026-11-22T02:30:00Z' }, threeAm);
    expect(started.shut).toBe(false);
    expect(started.detail).toContain('It runs until 8:00 am');
  });

  it('names the last change', () => {
    expect(actionLabel('SHUT_NOW')).toBe('Shut down now');
    expect(actionLabel('START_NOW')).toBe('Start now');
    expect(actionLabel('HOURS 22:00-07:30')).toBe('Daily hours set to 10:00 pm to 7:30 am');
    expect(actionLabel(null)).toBe('—');
  });
});
