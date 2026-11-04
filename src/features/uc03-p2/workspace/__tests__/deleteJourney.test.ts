import { describe, expect, it } from 'vitest';

import { canDeleteJourney, canOverrideReviewedStage, deleteReasonProblem, MIN_DELETE_REASON_LENGTH } from '../deleteJourney';

describe('deleting a journey', () => {
  it('is offered to a Team Lead and a Reviewer and to nobody else', () => {
    expect(canDeleteJourney('TL')).toBe(true);
    expect(canDeleteJourney('REVIEWER')).toBe(true);
    for (const role of ['PC', 'PM', 'CRM', 'Executive', null, undefined]) {
      expect(canDeleteJourney(role)).toBe(false);
    }
  });

  it('lets a Team Lead, PM or Reviewer override a reviewed stage', () => {
    for (const role of ['TL', 'PM', 'REVIEWER']) expect(canOverrideReviewedStage(role)).toBe(true);
    for (const role of ['PC', 'CRM', 'Executive', null]) expect(canOverrideReviewedStage(role)).toBe(false);
  });

  it('needs a reason of at least the length Audit Core accepts', () => {
    expect(deleteReasonProblem('')).toMatch(/Give the reason/);
    expect(deleteReasonProblem('   wrong  ')).toMatch(/at least 10 characters \(5 so far\)/);
    expect(deleteReasonProblem('x'.repeat(MIN_DELETE_REASON_LENGTH))).toBeUndefined();
    expect(deleteReasonProblem(`  ${'x'.repeat(MIN_DELETE_REASON_LENGTH - 1)}  `)).toBeDefined();
  });
});
