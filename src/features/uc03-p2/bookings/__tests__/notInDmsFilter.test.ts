import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { journeyFilterParams } from '../../../../services/audit-core/uc03P2';

/** Not in DMS (product owner 2026-11-22): "a new filter or simply a switch not in dms". */
describe('the Not in DMS switch in the journey list', () => {
  it('sends not_in_dms only when the switch is on', () => {
    expect(journeyFilterParams({ notInDms: true }).get('not_in_dms')).toBe('true');
    expect(journeyFilterParams({ notInDms: false }).has('not_in_dms')).toBe(false);
    expect(journeyFilterParams({}).has('not_in_dms')).toBe(false);
  });

  it('offers the switch, clears it with the filters, and tags the row with the reason', () => {
    const list = readFileSync(join(__dirname, '..', 'JourneyListTabs.tsx'), 'utf8');
    const row = readFileSync(join(__dirname, '..', 'JourneyRow.tsx'), 'utf8');
    expect(list).toContain('role="switch" aria-checked={notInDms}');
    expect(list).toContain('setNotInDms(false)');
    expect(row).toContain('Not in DMS</span>');
    expect(row).toContain('item.not_in_dms_reason');
  });
});
