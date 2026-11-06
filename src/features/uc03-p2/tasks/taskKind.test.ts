import { describe, expect, it } from 'vitest';

import { taskKind } from './taskKind';

const task = (task_type: string, category = 'TASK_CONFIRMATION') => ({ task_type, category } as Parameters<typeof taskKind>[0]);

describe('the kind shown on a task card (2026-11-06)', () => {
  it('names review and closure work instead of "Check failed"', () => {
    expect(taskKind(task('CLOSURE_ACCEPTANCE')).label).toBe('Closure to accept');
    expect(taskKind(task('CLOSURE_REWORK')).label).toBe('Closure items rejected');
    expect(taskKind(task('DELIVERY_REVIEW')).label).toBe('Delivery review');
  });

  it('keeps "Check failed" for a failed audit check', () => {
    expect(taskKind(task('FINDING_REVIEW', 'PRICING')).label).toBe('Check failed');
  });
});
