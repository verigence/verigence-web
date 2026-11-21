import { describe, expect, it } from 'vitest';

import { asCautionDay, cautionInput, emptyHolidayDraft, nextSundayIso, validateHoliday } from '../settingsForm';

describe('caution day draft (21 Nov 2026)', () => {
  it('works the coming Sunday unless another is chosen', () => {
    expect(nextSundayIso('2026-11-20')).toBe('2026-11-22'); // Friday -> Sunday
    expect(nextSundayIso('2026-11-21')).toBe('2026-11-22'); // Saturday
    expect(nextSundayIso('2026-11-16')).toBe('2026-11-22'); // Monday
    expect(nextSundayIso('not a date')).toBe('');
    const draft = asCautionDay({ ...emptyHolidayDraft(2026), date: '2026-11-20' });
    expect(draft).toMatchObject({ kind: 'CAUTION', status: 'DECLARED', appliesTo: 'SELECTED', workingSunday: '2026-11-22' });
  });

  it('checks the day, the Sunday and the reason', () => {
    const base = { ...asCautionDay({ ...emptyHolidayDraft(2026), date: '2026-11-20' }), name: 'Cyclone warning', scope: ['t\u0000'] };
    expect(validateHoliday(base)).toEqual({});
    expect(validateHoliday({ ...base, date: '2026-11-22' }).date).toMatch(/cannot be a Sunday/);
    expect(validateHoliday({ ...base, workingSunday: '2026-11-21' }).workingSunday).toMatch(/Sunday after/);
    expect(validateHoliday({ ...base, workingSunday: '2027-01-03' }).workingSunday).toMatch(/within a month/);
    expect(validateHoliday({ ...base, name: 'x' }).name).toMatch(/reason/);
  });

  it('sends the reason and the chosen people', () => {
    const draft = { ...asCautionDay({ ...emptyHolidayDraft(2026), date: '2026-11-20' }), name: ' Cyclone ', scope: ['tenant-a\u0000'] };
    expect(cautionInput(draft)).toEqual({
      date: '2026-11-20',
      reason: 'Cyclone',
      workingSunday: '2026-11-22',
      appliesTo: 'SELECTED',
      scope: [{ tenantId: 'tenant-a', outletId: null }],
    });
  });
});
