import { describe, expect, it } from 'vitest';

import { HrHttpError, HrNetworkError } from '../../../../services/hr/client';
import {
  ageLabel,
  dateAgeLabel,
  decisionErrorMessage,
  formatDate,
  formatDateRange,
  formatDateTimeIst,
  formatDays,
  formatDistanceM,
  formatMoney,
  formatMonth,
  formatTimeIst,
  istToday,
  noteProblem,
  noteRequired,
  stageSteps,
  staleAfterError,
} from '../approvalFormat';

describe('dates are shown in India time', () => {
  it('formats date-only values without shifting them', () => {
    expect(formatDate('2026-10-03')).toBe('03 Oct 2026');
    expect(formatMonth('2026-10')).toBe('Oct 2026');
    expect(formatDate(null)).toBe('—');
    expect(formatDateRange('2026-10-03', '2026-10-03')).toBe('03 Oct 2026');
    expect(formatDateRange('2026-10-03', '2026-10-05')).toBe('03 Oct 2026 to 05 Oct 2026');
  });

  it('converts timestamps to IST', () => {
    expect(formatTimeIst('2026-10-03T04:45:00+00:00')).toBe('10:15 am IST');
    expect(formatDateTimeIst('2026-10-03T20:30:00Z')).toBe('04 Oct 2026, 2:00 am IST');
    expect(formatTimeIst('not a date')).toBe('—');
  });

  it('takes the IST calendar day for "today"', () => {
    expect(istToday(new Date('2026-10-03T19:00:00Z'))).toBe('2026-10-04');
    expect(istToday(new Date('2026-10-03T17:00:00Z'))).toBe('2026-10-03');
  });
});

describe('age', () => {
  const now = new Date('2026-10-04T06:00:00Z');
  it('counts days for date-only values', () => {
    expect(dateAgeLabel('2026-10-04', now)).toBe('Today');
    expect(dateAgeLabel('2026-10-03', now)).toBe('Yesterday');
    expect(dateAgeLabel('2026-09-30', now)).toBe('4 days ago');
  });
  it('counts minutes, hours and days for timestamps', () => {
    expect(ageLabel('2026-10-04T05:59:50Z', now)).toBe('Just now');
    expect(ageLabel('2026-10-04T05:15:00Z', now)).toBe('45 min ago');
    expect(ageLabel('2026-10-04T01:00:00Z', now)).toBe('5 h ago');
    expect(ageLabel('2026-10-02T06:00:00Z', now)).toBe('2 days ago');
  });
});

describe('numbers', () => {
  it('formats rupees, distances and days', () => {
    expect(formatMoney(1250)).toBe('₹1,250');
    expect(formatMoney(1250.5)).toBe('₹1,250.50');
    expect(formatMoney(null)).toBe('—');
    expect(formatDistanceM(430.4)).toBe('430 m');
    expect(formatDistanceM(1530)).toBe('1.5 km');
    expect(formatDistanceM(null)).toBeNull();
    expect(formatDays(1, false)).toBe('1 day');
    expect(formatDays(2.5, false)).toBe('2.5 days');
    expect(formatDays(0.5, true)).toBe('Half day');
  });
});

describe('claim stages', () => {
  it('marks done, current and upcoming', () => {
    expect(stageSteps(['TL_PM', 'HR', 'FINANCE'], 'HR').map((s) => s.state)).toEqual(['done', 'current', 'upcoming']);
    expect(stageSteps(['HR'], 'HR')[0].label).toBe('HR');
    expect(stageSteps(['TL_PM'], null).map((s) => s.state)).toEqual(['upcoming']);
  });
});

describe('notes', () => {
  it('requires a reason to reject or send back, never to approve', () => {
    expect(noteRequired('APPROVE')).toBe(false);
    expect(noteRequired('REJECT')).toBe(true);
    expect(noteRequired('CORRECTION')).toBe(true);
    expect(noteProblem('APPROVE', '')).toBe('');
    expect(noteProblem('REJECT', '   ')).not.toBe('');
    expect(noteProblem('CORRECTION', '')).not.toBe('');
    expect(noteProblem('REJECT', 'Dates clash with audit week')).toBe('');
    expect(noteProblem('REJECT', 'x'.repeat(501))).not.toBe('');
  });
});

describe('decision errors', () => {
  const http = (status: number, code: string, detail: string) => new HrHttpError(status, { code, detail });
  it('explains an already-decided request in plain words and refreshes the list', () => {
    const error = http(409, 'APPROVAL_ALREADY_DECIDED', 'This request has already been decided.');
    expect(decisionErrorMessage(error)).toMatch(/already been decided/);
    expect(staleAfterError(error)).toBe(true);
  });
  it('treats a hidden request as gone', () => {
    const error = http(404, 'HR_NOT_FOUND', 'Request not found.');
    expect(decisionErrorMessage(error)).toMatch(/no longer available/);
    expect(staleAfterError(error)).toBe(true);
  });
  it('explains a missing note and a low balance without refreshing', () => {
    const note = http(422, 'APPROVAL_NOTE_REQUIRED', 'Say why you are rejecting it.');
    expect(decisionErrorMessage(note)).toMatch(/reason/);
    expect(staleAfterError(note)).toBe(false);
    expect(decisionErrorMessage(http(409, 'LEAVE_BALANCE_TOO_LOW', 'x'))).toMatch(/balance/);
  });
  it('falls back to the shared HR message', () => {
    expect(decisionErrorMessage(http(403, 'HR_PERMISSION_DENIED', 'nope'))).toBe('You do not have access to this.');
    expect(decisionErrorMessage(new HrNetworkError('HR could not be reached.'))).toBe('HR could not be reached.');
    expect(staleAfterError(new HrNetworkError('x'))).toBe(false);
  });
});
