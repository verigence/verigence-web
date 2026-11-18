import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { journeyFilterParams } from '../../../../services/audit-core/uc03P2';

/** Observation severity (product owner 2026-11-18): column, row colour, filter. */
describe('observation severity in the journey list', () => {
  it('sends the severity filter, and nothing when All', () => {
    expect(journeyFilterParams({ severity: 'HIGH' }).get('severity')).toBe('HIGH');
    expect(journeyFilterParams({ severity: 'NONE' }).get('severity')).toBe('NONE');
    expect(journeyFilterParams({ severity: '' }).has('severity')).toBe(false);
  });

  it('offers the filter and the column, and colours the whole row', () => {
    const list = readFileSync(join(__dirname, '..', 'JourneyListTabs.tsx'), 'utf8');
    const row = readFileSync(join(__dirname, '..', 'JourneyRow.tsx'), 'utf8');
    expect(list).toContain('<span>Observation</span>');
    expect(list).toContain('<th className="col-severity">Observation</th>');
    expect(row).toContain('has-severity-${item.observation_severity.toLowerCase()}');
  });
});
