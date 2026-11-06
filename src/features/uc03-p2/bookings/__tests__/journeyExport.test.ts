import { describe, expect, it } from 'vitest';

import { rangeProblem } from '../../../../services/audit-core/journeyExport';
import { exportProgress } from '../JourneyExportPanel';

describe('journey export to Excel (2026-11-06)', () => {
  it('checks the date range the way Audit Core does', () => {
    expect(rangeProblem('', '', 92)).toBeUndefined();
    expect(rangeProblem('2026-11-01', '2026-11-06', 92)).toBeUndefined();
    expect(rangeProblem('2026-11-06', '2026-11-01', 92)).toMatch(/before/);
    expect(rangeProblem('2026-01-01', '2026-11-06', 92)).toMatch(/92 days/);
    expect(rangeProblem('2026-11-01', '', 92)).toMatch(/both dates/);
  });

  it('says how far an export is', () => {
    expect(exportProgress({ status: 'RUNNING', total: 40, done: 10, rows: null, error: null })).toBe('Building: 10 of 40 journeys');
    expect(exportProgress({ status: 'READY', total: 1, done: 1, rows: 1, error: null })).toBe('1 journey');
    expect(exportProgress({ status: 'FAILED', total: null, done: 0, rows: null, error: 'boom' })).toMatch(/boom/);
  });
});
