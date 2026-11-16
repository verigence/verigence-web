import { describe, expect, it } from 'vitest';

import { badgeLabel, journeyStatusLine, timeAgo } from '../../../services/audit-core/notifications';

describe('the notification bell', () => {
  it('shows no number under one and 99+ past 99', () => {
    expect(badgeLabel(0)).toBeNull();
    expect(badgeLabel(undefined)).toBeNull();
    expect(badgeLabel(7)).toBe('7');
    expect(badgeLabel(140)).toBe('99+');
  });

  it('says what a booking still needs, the file never read first', () => {
    // UTK-BP-261111-004 (16 Nov): DOC-20261112-WA0021.pdf was never split into pages.
    expect(journeyStatusLine({
      journeyId: 'j', reference: 'UTK-BP-261111-004', beingRead: 0, stuck: 0, failedPages: 0,
      filesNotRead: 1, files: ['DOC-20261112-WA0021.pdf'], uploadTasks: 1,
    })).toBe('1 file not read, 1 task to upload again');
    expect(journeyStatusLine({
      journeyId: 'j', beingRead: 3, stuck: 1, failedPages: 2, filesNotRead: 0, files: [], uploadTasks: 0,
    })).toBe('2 pages failed, 3 pages being read (1 for over 6 h)');
  });

  it('says how long ago a message came', () => {
    const now = new Date('2026-11-16T12:00:00Z');
    expect(timeAgo('2026-11-16T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-11-16T11:55:00Z', now)).toBe('5 min ago');
    expect(timeAgo('2026-11-16T09:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-11-14T12:00:00Z', now)).toBe('2 d ago');
  });
});
