import { describe, expect, it } from 'vitest';

import type { P2Task } from '../../../services/audit-core/uc03P2';
import { taskPlan } from './p2TaskPlan';

const finding = (assigned: string): P2Task => ({
  task_id: 't1', journey_id: 'j1', task_type: 'FINDING_REVIEW', task_status: 'READY', severity: 'MEDIUM', title: 'Finding',
  source_system: 'P2', reference: { findingId: 'f1' }, assigned_role_code: assigned, created_at_utc: '2026-11-02T00:00:00Z',
  allowed_actions: ['CONFIRM_BREACH', 'MARK_FALSE_POSITIVE', 'ACCEPT_EXCEPTION', 'ADD_COMMENT'],
} as P2Task);

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
