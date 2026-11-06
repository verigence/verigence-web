import { describe, expect, it } from 'vitest';

import type { P2Task } from '../../../services/audit-core/uc03P2';
import { canDecideClaim, claimState, NOT_REQUIRED_CHOICE, taskPlan } from './p2TaskPlan';

const finding = (assigned: string): P2Task => ({
  task_id: 't1', journey_id: 'j1', task_type: 'FINDING_REVIEW', task_status: 'READY', severity: 'MEDIUM', title: 'Finding',
  source_system: 'P2', reference: { findingId: 'f1' }, assigned_role_code: assigned, created_at_utc: '2026-11-02T00:00:00Z',
  allowed_actions: ['CONFIRM_BREACH', 'MARK_FALSE_POSITIVE', 'ACCEPT_EXCEPTION', 'ADD_COMMENT'],
} as unknown as P2Task);

const actions = (task: P2Task, role: string) => {
  const plan = taskPlan(task, role);
  return [plan.primary, ...plan.secondary].map((a) => a && 'action' in a ? a.action : null).filter(Boolean);
};

describe('a Reviewer closes the Team Lead\'s tasks of their outlets (product owner 2026-11-02)', () => {
  it('offers the Reviewer the Team Lead\'s exception on a TL task', () => {
    expect(actions(finding('TL'), 'REVIEWER')).toContain('ACCEPT_EXCEPTION');
    expect(actions(finding('TL'), 'TL')).toContain('ACCEPT_EXCEPTION');
  });

  it('but not on a task of another role', () => {
    expect(actions(finding('PC'), 'REVIEWER')).not.toContain('ACCEPT_EXCEPTION');
  });
});

const missing = (status = 'READY', result?: Record<string, unknown>): P2Task => ({
  task_id: 't2', journey_id: 'j1', task_type: 'DOCUMENT_MISSING', source_code: 'DOCUMENT_MISSING', task_status: status,
  severity: 'HIGH', title: 'Upload the RSA Invoice', source_system: 'P2', reference: {}, assigned_role_code: 'PC',
  created_at_utc: '2026-11-04T00:00:00Z', allowed_actions: ['ADD_COMMENT'], completion_result: result,
} as unknown as P2Task);

describe('not mandatory is the PC\'s claim, for the Reviewer (product owner 2026-11-04)', () => {
  it('asks the PC for a reason on "not required" but not on "uploaded"', () => {
    const plan = taskPlan(missing(), 'PC');
    const notRequired = plan.secondary.find((a) => a.label === NOT_REQUIRED_CHOICE);
    const uploaded = plan.secondary.find((a) => a.label === 'Document uploaded');
    expect(notRequired?.requiresComment).toBe(true);
    expect(uploaded?.requiresComment).toBeFalsy();
  });

  it('shows a claim waiting for the Reviewer, and one sent back', () => {
    const waiting = missing('AWAITING_REQUESTER_REVIEW', { outcome: 'NOT_MANDATORY_CLAIMED' });
    expect(claimState(waiting)).toBe('WAITING');
    expect(taskPlan(waiting, 'PC').waiting).toMatch(/Reviewer/);
    expect(claimState(missing('RETURNED', { outcome: 'NOT_MANDATORY_REJECTED' }))).toBe('REJECTED');
    expect(claimState(missing())).toBeUndefined();
  });

  it('the Reviewer, TL and PM decide the claim on the PC\'s task itself (2026-11-06)', () => {
    const waiting = missing('AWAITING_REQUESTER_REVIEW', { outcome: 'NOT_MANDATORY_CLAIMED' });
    for (const role of ['REVIEWER', 'TL', 'PM']) {
      expect(canDecideClaim(role)).toBe(true);
      expect(taskPlan(waiting, role).waiting).toMatch(/Accept or reject it below/);
    }
    expect(canDecideClaim('PC')).toBe(false);
    expect(taskPlan(waiting, 'PC').waiting).toMatch(/Waiting for the Reviewer/);
  });
});
