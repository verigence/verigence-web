import { describe, expect, it } from 'vitest';

import { gapSplit } from '../GatePassCalendar';

describe('gate pass calendar gap split (2026-10-29)', () => {
  it('uses the split Audit Core gives', () => {
    expect(gapSplit({ missing: 4, notNotified: 3, toUpload: 1 })).toEqual({ notNotified: 3, toUpload: 1 });
  });
  it('treats the whole gap as to upload when no split is given yet', () => {
    expect(gapSplit({ missing: 24 })).toEqual({ notNotified: 0, toUpload: 24 });
  });
});
