import { describe, expect, it } from 'vitest';

import type { MaintenanceNotice, PersonAnnouncement } from '../../../services/security/announcements';
import {
  announcementStatus,
  buildMessageInput,
  formatBackAt,
  gateDecision,
  isoToIstInput,
  istInputToIso,
  parseQuietHours,
  popupVisible,
  validateMessage,
  type MessageForm,
} from '../announcementLogic';

const notice: MaintenanceNotice = { announcementId: 'm1', kind: 'MAINTENANCE', title: 'x', body: 'y', backAt: null, startsAt: '2026-10-04T00:00:00Z', endsAt: null, audience: 'EVERYONE', active: true };

describe('gateDecision', () => {
  const base = { maintenance: notice, signedIn: true, role: 'PC', pathname: '/dashboard' };
  it('blocks a signed-in person inside the app', () => {
    expect(gateDecision(base)).toBe('block');
  });
  it('lets SuperAdmin in, with the banner', () => {
    expect(gateDecision({ ...base, role: 'SUPER_ADMIN' })).toBe('admin-banner');
  });
  it('fails open: no notice, or an unknown state, means open', () => {
    expect(gateDecision({ ...base, maintenance: null })).toBe('open');
    expect(gateDecision({ ...base, maintenance: undefined })).toBe('open');
  });
  it('keeps sign-in and the public pages reachable, and signed-out people open', () => {
    expect(gateDecision({ ...base, pathname: '/login' })).toBe('open');
    expect(gateDecision({ ...base, pathname: '/terms' })).toBe('open');
    expect(gateDecision({ ...base, signedIn: false })).toBe('open');
  });
});

describe('popupVisible', () => {
  const a: PersonAnnouncement = { announcementId: 'a1', kind: 'NOTICE', title: 't', body: 'b' };
  const base = { announcement: a, dismissed: new Set<string>(), signedIn: true, pathname: '/dashboard', gate: 'open' as const };
  it('shows the one announcement in the app', () => {
    expect(popupVisible(base)).toBe(true);
    expect(popupVisible({ ...base, gate: 'admin-banner' })).toBe(true);
  });
  it('stays hidden when there is none, on the login page, signed out, under maintenance, or once dismissed', () => {
    expect(popupVisible({ ...base, announcement: null })).toBe(false);
    expect(popupVisible({ ...base, pathname: '/login' })).toBe(false);
    expect(popupVisible({ ...base, signedIn: false })).toBe(false);
    expect(popupVisible({ ...base, gate: 'block' })).toBe(false);
    expect(popupVisible({ ...base, dismissed: new Set(['a1']) })).toBe(false);
  });
});

describe('announcementStatus', () => {
  const now = new Date('2026-10-04T12:00:00Z');
  it('derives the status from the dates and the active flag', () => {
    expect(announcementStatus({ active: false, startsAt: '2026-10-01T00:00:00Z', endsAt: null }, now)).toBe('Stopped');
    expect(announcementStatus({ active: true, startsAt: '2026-10-05T00:00:00Z', endsAt: null }, now)).toBe('Scheduled');
    expect(announcementStatus({ active: true, startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-04T11:00:00Z' }, now)).toBe('Ended');
    expect(announcementStatus({ active: true, startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-09T00:00:00Z' }, now)).toBe('Showing');
    expect(announcementStatus({ active: true, startsAt: '2026-10-01T00:00:00Z', endsAt: null }, now)).toBe('Showing');
  });
});

describe('IST date-times', () => {
  it('turns what was typed in IST into an ISO instant with +05:30', () => {
    expect(istInputToIso('2026-10-04T17:30')).toBe('2026-10-04T17:30:00+05:30');
    expect(istInputToIso('')).toBeUndefined();
    expect(istInputToIso('2026-13-04T17:30')).toBeUndefined();
  });
  it('shows an instant as IST wall-clock time, round trip included', () => {
    expect(isoToIstInput('2026-10-04T12:00:00Z')).toBe('2026-10-04T17:30');
    expect(isoToIstInput('2026-10-04T23:00:00Z')).toBe('2026-10-05T04:30');
    expect(isoToIstInput(istInputToIso('2026-10-04T17:30'))).toBe('2026-10-04T17:30');
    expect(isoToIstInput(null)).toBe('');
  });
  it('words the expected return time', () => {
    const now = new Date('2026-10-04T05:00:00Z'); // 10:30 am IST on the 4th
    expect(formatBackAt('2026-10-04T12:00:00Z', now)).toBe('5:30 pm today');
    expect(formatBackAt('2026-10-05T03:30:00Z', now)).toBe('9:00 am tomorrow');
    expect(formatBackAt('2026-10-07T03:30:00Z', now)).toBe('9:00 am on 07 Oct');
    expect(formatBackAt(null, now)).toBeNull();
  });
});

describe('new message form', () => {
  const ok: MessageForm = { kind: 'NOTICE', title: ' Hello ', body: ' Welcome ', audience: 'EVERYONE', people: [], from: '', until: '' };
  it('accepts a complete message and builds the body', () => {
    expect(validateMessage(ok)).toBeNull();
    expect(buildMessageInput(ok)).toEqual({ kind: 'NOTICE', title: 'Hello', body: 'Welcome', audience: 'EVERYONE' });
    expect(buildMessageInput({ ...ok, audience: 'PEOPLE', people: ['u1'], from: '2026-10-04T10:00', until: '2026-10-05T10:00' })).toEqual({
      kind: 'NOTICE', title: 'Hello', body: 'Welcome', audience: 'PEOPLE', people: ['u1'], startsAt: '2026-10-04T10:00:00+05:30', endsAt: '2026-10-05T10:00:00+05:30',
    });
  });
  it('finds the first problem', () => {
    expect(validateMessage({ ...ok, title: ' ' })).toMatch(/title/i);
    expect(validateMessage({ ...ok, body: 'x'.repeat(1001) })).toMatch(/1000/);
    expect(validateMessage({ ...ok, audience: 'PEOPLE' })).toMatch(/person/);
    expect(validateMessage({ ...ok, from: '2026-10-05T10:00', until: '2026-10-04T10:00' })).toMatch(/after/);
  });
  it('reads the wait between messages', () => {
    expect(parseQuietHours('20')).toBe(20);
    expect(parseQuietHours('0')).toBe(0);
    expect(parseQuietHours('720')).toBe(720);
    expect(parseQuietHours('721')).toBeNull();
    expect(parseQuietHours('-1')).toBeNull();
    expect(parseQuietHours('')).toBeNull();
    expect(parseQuietHours('2.5')).toBeNull();
  });
});
