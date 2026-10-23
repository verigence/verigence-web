import { describe, expect, it } from 'vitest';

import { canDeleteJourney, deleteReasonProblem, MIN_DELETE_REASON_LENGTH } from '../deleteJourney';

describe('deleting a journey', () => {
  it('is offered to a Team Lead and to nobody else', () => {
    expect(canDeleteJourney('TL')).toBe(true);
    for (const role of ['PC', 'PM', 'CRM', 'Executive', 'REVIEWER', null, undefined]) {
      expect(canDeleteJourney(role)).toBe(false);
    }
  });

  it('needs a reason of at least the length Audit Core accepts', () => {
    expect(deleteReasonProblem('')).toMatch(/Give the reason/);
    expect(deleteReasonProblem('   wrong  ')).toMatch(/at least 10 characters \(5 so far\)/);
    expect(deleteReasonProblem('x'.repeat(MIN_DELETE_REASON_LENGTH))).toBeUndefined();
    expect(deleteReasonProblem(`  ${'x'.repeat(MIN_DELETE_REASON_LENGTH - 1)}  `)).toBeDefined();
  });
});
