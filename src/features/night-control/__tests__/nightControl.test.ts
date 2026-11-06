import { describe, expect, it } from 'vitest';

import type { MyNightControl, MyNightFeature } from '../../../services/security/nightControl';
import { NightControlRequestError } from '../../../services/security/nightControl';
import { FILE_DOWNLOAD, JOURNEY_360, isNightBlocked, istMinuteOfDay, msUntilNextBoundary, nightRefetchInterval, parseHhMm } from '../nightControl';
import { grantErrorMessage, grantFeatureLabel, isHhMm, noteProblem, revokeErrorMessage } from '../nightAdmin';

const feature = (over: Partial<MyNightFeature>): MyNightFeature => ({
  featureKey: JOURNEY_360, label: 'Journey 360', enabled: true, startsAt: '20:00', endsAt: '08:30',
  active: true, blocked: true, allowedBy: null, ...over,
});

const state = (features: MyNightFeature[]): MyNightControl => ({
  nightModeOn: features.some((f) => f.blocked), message: 'Night Mode On', exempt: null, checkedAt: '2026-11-06T15:00:00Z', features,
});

/** An instant given in India time (UTC+05:30). */
const ist = (hhmm: string, seconds = 0) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 10, 6, h, m, seconds) - 330 * 60_000);
};

describe('isNightBlocked', () => {
  it('follows Security: blocked only when the feature row says so', () => {
    const data = state([feature({}), feature({ featureKey: FILE_DOWNLOAD, label: 'Downloads', blocked: false, allowedBy: 'GRANT' })]);
    expect(isNightBlocked(data, JOURNEY_360)).toBe(true);
    expect(isNightBlocked(data, FILE_DOWNLOAD)).toBe(false);
  });

  it('treats no answer (loading or failed) and unknown features as not blocked', () => {
    expect(isNightBlocked(undefined, JOURNEY_360)).toBe(false);
    expect(isNightBlocked(state([feature({})]), 'SOMETHING_NEW')).toBe(false);
  });

  it('never blocks a SuperAdmin or Executive (Security sends blocked: false)', () => {
    const data = { ...state([feature({ blocked: false, allowedBy: 'EXECUTIVE' })]), exempt: 'EXECUTIVE' as const };
    expect(isNightBlocked(data, JOURNEY_360)).toBe(false);
  });
});

describe('India time and the refetch schedule', () => {
  it('reads HH:MM and India minutes of the day', () => {
    expect(parseHhMm('20:00')).toBe(1200);
    expect(parseHhMm('08:30')).toBe(510);
    expect(parseHhMm('8:30')).toBeUndefined();
    expect(istMinuteOfDay(ist('19:59'))).toBe(1199);
    expect(istMinuteOfDay(ist('00:10'))).toBe(10);
  });

  it('finds the next start or end, across midnight', () => {
    const features = [feature({})];
    expect(msUntilNextBoundary(features, ist('19:58'))).toBe(2 * 60_000);
    expect(msUntilNextBoundary(features, ist('08:29', 30))).toBe(30_000);
    expect(msUntilNextBoundary(features, ist('23:00'))).toBe((9 * 60 + 30) * 60_000);
    expect(msUntilNextBoundary([feature({ enabled: false })], ist('19:58'))).toBeUndefined();
  });

  it('asks every 5 minutes, sooner just after a boundary, never more often than every 15 seconds', () => {
    const data = state([feature({})]);
    expect(nightRefetchInterval(data, ist('12:00'))).toBe(5 * 60_000);
    expect(nightRefetchInterval(data, ist('19:58'))).toBe(2 * 60_000 + 5_000);
    expect(nightRefetchInterval(data, ist('19:59', 55))).toBe(15_000);
    expect(nightRefetchInterval(undefined, ist('19:59'))).toBe(5 * 60_000);
  });
});

describe('SuperAdmin page helpers', () => {
  const features = [{ featureKey: JOURNEY_360, label: 'Journey 360' }, { featureKey: FILE_DOWNLOAD, label: 'File downloads' }];

  it('names a grant: All features or the feature label', () => {
    expect(grantFeatureLabel(null, features)).toBe('All features');
    expect(grantFeatureLabel(FILE_DOWNLOAD, features)).toBe('File downloads');
    expect(grantFeatureLabel('LATER_FEATURE', features)).toBe('LATER_FEATURE');
  });

  it('wants a note of 3 to 500 characters and valid times', () => {
    expect(noteProblem('  ab ')).toBeDefined();
    expect(noteProblem('Month-end audit')).toBeUndefined();
    expect(noteProblem('x'.repeat(501))).toBeDefined();
    expect(isHhMm('20:00')).toBe(true);
    expect(isHhMm('24:00')).toBe(false);
  });

  it('says 409 as "This person already has this access"', () => {
    expect(grantErrorMessage(new NightControlRequestError(409, 'Already granted'))).toBe('This person already has this access.');
    expect(grantErrorMessage(new NightControlRequestError(422, 'note too short'))).toBe('note too short');
    expect(revokeErrorMessage(new NightControlRequestError(404, 'gone'))).toMatch(/already removed/);
  });
});
