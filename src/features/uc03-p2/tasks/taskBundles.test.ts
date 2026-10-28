import { describe, expect, it } from 'vitest';

import type { P2Task } from '../../../services/audit-core/uc03P2';
import { bundleSeverity, bundleTasks, entryCount, isBundle } from './taskBundles';

const task = (id: string, extra: Partial<P2Task>): P2Task => ({
  task_id: id, journey_id: 'j1', task_type: 'X', task_status: 'READY', severity: 'MEDIUM', title: id,
  source_system: 'P2', reference: {}, allowed_actions: [], created_at_utc: '2026-10-28T00:00:00Z',
  ...extra,
} as P2Task);

describe('task bundles (product owner 2026-10-28: fewer tasks for the PC)', () => {
  it('shows tasks of one kind on a booking as one entry, where the first was', () => {
    const tasks = [
      task('rto', { task_type: 'DOCUMENT_MISSING', source_code: 'DOCUMENT_MISSING', document_category: 'MISSING_DOCUMENT' }),
      task('sku', { task_type: 'SKU_NOT_SET' }),
      task('rsa', { task_type: 'DOCUMENT_MISSING', source_code: 'DOCUMENT_MISSING', document_category: 'MISSING_DOCUMENT' }),
      task('cash', { task_type: 'PC_CONFIRMATION', severity: 'HIGH' }),
      task('ins', { task_type: 'INSURANCE_SOURCE_CONFIRM' }),
      task('name', { task_type: 'DOCUMENT_MISSING', source_code: 'WRONG_CUSTOMER_NAME', document_category: 'MANUAL_VERIFICATION' }),
    ];
    const entries = bundleTasks('j1', tasks);
    expect(entries.map((e) => (isBundle(e) ? e.title : e.task_id))).toEqual([
      'Documents to upload (2)', 'sku', 'Questions to answer (2)', 'name',
    ]);
    expect(entryCount(tasks)).toBe(4);
    const questions = entries.find((e) => isBundle(e) && e.kind === 'questions');
    expect(questions && isBundle(questions) ? bundleSeverity(questions.tasks) : null).toBe('HIGH');
  });

  it('groups unrecognised pages per file', () => {
    const page = (id: string, file: string) => task(id, { task_type: 'PC_VERIFY_UNRECOGNIZED_DOCUMENT',
      document: { file, pages: [1], reason: null, documentId: null } as P2Task['document'] });
    const entries = bundleTasks('j1', [page('a', 'one.pdf'), page('b', 'two.pdf'), page('c', 'one.pdf')]);
    expect(entries.map((e) => (isBundle(e) ? e.title : e.task_id))).toEqual(['Set the document type: 2 pages of one.pdf', 'b']);
  });

  it('never bundles an existing (Phase 1) task', () => {
    const legacy = (id: string) => task(id, { source_system: 'LEGACY', task_type: 'PC_CONFIRMATION' });
    expect(entryCount([legacy('a'), legacy('b')])).toBe(2);
  });
});
