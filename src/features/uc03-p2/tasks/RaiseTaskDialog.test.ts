import { describe, expect, it } from 'vitest';

import { assigneeLabel, raiseTaskProblem } from './RaiseTaskDialog';

describe('raise a task (TL / PMO)', () => {
  it('needs a journey, then a description for the PC tasks', () => {
    expect(raiseTaskProblem({ journeyId: '', kind: 'DOCUMENT_UPLOAD', description: 'Upload Form 22', amount: '', reason: '' })).toMatch(/journey/);
    expect(raiseTaskProblem({ journeyId: 'j1', kind: 'DOCUMENT_UPLOAD', description: 'no', amount: '', reason: '' })).toMatch(/Describe/);
    expect(raiseTaskProblem({ journeyId: 'j1', kind: 'DATA_VIOLATION', description: 'Fix the booking date', amount: '', reason: '' })).toBeUndefined();
  });

  it('the System task (Enable MR) needs the amount and the reason, not a description', () => {
    expect(raiseTaskProblem({ journeyId: 'j1', kind: 'SYSTEM_MR', description: '', amount: '', reason: 'Dealer principal' })).toMatch(/amount/);
    expect(raiseTaskProblem({ journeyId: 'j1', kind: 'SYSTEM_MR', description: '', amount: '15000', reason: 'ok' })).toMatch(/reason/);
    expect(raiseTaskProblem({ journeyId: 'j1', kind: 'SYSTEM_MR', description: '', amount: '15000', reason: 'Dealer principal' })).toBeUndefined();
  });

  it('names the journey PC and falls back to the actor id', () => {
    expect(assigneeLabel({ actorId: 'u1', displayName: 'Asha', roleCode: 'PC', journeyPc: true })).toBe("Asha · this journey's PC");
    expect(assigneeLabel({ actorId: 'u2', displayName: null, roleCode: 'PC', journeyPc: false })).toBe('u2');
  });
});
