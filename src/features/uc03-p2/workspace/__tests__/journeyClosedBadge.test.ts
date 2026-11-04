import { describe, expect, it } from 'vitest';

import { closureLabel } from '../JourneyClosedBadge';

describe('a closed journey reads the same on every view (product owner 2026-11-04)', () => {
  it('names the Reviewer closure and where the TL decision stands, else Closed, else nothing', () => {
    expect(closureLabel({ status: 'PENDING' })).toBe('Closed by Reviewer · awaiting TL');
    expect(closureLabel({ status: 'AUTO_ACCEPTED' }, true)).toBe('Closed by Reviewer · auto-approved');
    expect(closureLabel({ status: 'REJECTED' }, false)).toBe('Sent back to Reviewer');
    expect(closureLabel(null, true)).toBe('Closed');
    expect(closureLabel(null, false)).toBeUndefined();
  });
});
