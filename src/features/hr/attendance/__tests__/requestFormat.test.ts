import { describe, expect, it } from 'vitest';

import { correctionAskedText } from '../requestFormat';

describe('what a correction asks for (16 Nov 2026)', () => {
  it('names the day counts, a missed check-out and time or location corrections', () => {
    expect(correctionAskedText({ requested: 'FULL_DAY' })).toBe('Full day');
    expect(correctionAskedText({ requested: 'CHECK_OUT', checkOutAt: '2026-11-10T13:10:00Z' })).toBe('Check-out at 6:40 pm');
    expect(correctionAskedText({ requested: 'ADJUST', checkInAt: '2026-11-10T04:50:00Z', locationCheckIn: true })).toBe(
      'Check-in at 10:20 am; check-in location at the outlet',
    );
    expect(correctionAskedText({ requested: 'ADJUST', locationCheckIn: true, locationCheckOut: true })).toBe(
      'Check-in and check-out location at the outlet',
    );
  });
});
