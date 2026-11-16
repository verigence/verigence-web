import { describe, expect, it } from 'vitest';

import { badgeLabel, itemLink, sourceLabel, timeAgo } from '../../../services/audit-core/notifications';

describe('the notification bell', () => {
  it('shows no number under one and 99+ past 99', () => {
    expect(badgeLabel(0)).toBeNull();
    expect(badgeLabel(undefined)).toBeNull();
    expect(badgeLabel(7)).toBe('7');
    expect(badgeLabel(140)).toBe('99+');
  });

  it('takes an upload that left no record to its booking, or to the bulk or Drive page', () => {
    // UTK-BP-261111-004 (16 Nov): DOC-20261112-WA0021.pdf was never split into pages.
    const base = { itemId: 'i', name: 'DOC-20261112-WA0021.pdf', reason: 'r', atUtc: '2026-11-12T10:04:24Z' };
    expect(itemLink({ ...base, source: 'UPLOAD', journeyId: 'j1' })).toBe('/p2/journeys/j1/documents?tab=files');
    expect(itemLink({ ...base, source: 'BULK' })).toBe('/p2/bulk-upload');
    expect(itemLink({ ...base, source: 'DRIVE' })).toBe('/p2/drive-uploads');
    expect(sourceLabel('DRIVE')).toBe('Google Drive');
  });

  it('says how long ago a message came', () => {
    const now = new Date('2026-11-16T12:00:00Z');
    expect(timeAgo('2026-11-16T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-11-16T11:55:00Z', now)).toBe('5 min ago');
    expect(timeAgo('2026-11-16T09:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-11-14T12:00:00Z', now)).toBe('2 d ago');
  });
});
