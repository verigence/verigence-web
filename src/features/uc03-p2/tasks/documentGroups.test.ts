import { describe, expect, it } from 'vitest';

import type { P2DocumentCategory, P2Task, P2TaskTab } from '../../../services/audit-core/uc03P2';
import {
  DOCUMENT_CATEGORIES, documentCategoryLabel, documentCounts, documentFilter, documentOpenLink, pagesText, visibleTasks,
} from './documentGroups';
import { taskPlan } from './p2TaskPlan';

const base: Omit<P2Task, 'task_id' | 'task_type' | 'queue_tab'> = {
  source_system: 'P2', journey_id: 'j1', round_number: 1, category: 'X', origin_kind: 'SYSTEM', source_type: 'DOCUMENT',
  title: 'A task', description: 'Something to do.', reference: {}, severity: 'HIGH', assigned_role_code: 'PC',
  allowed_actions: ['ADD_COMMENT'], completion_protocol: 'MACHINE_VERIFIED', task_status: 'READY',
  created_at_utc: '2026-10-21T00:00:00Z', updated_at_utc: '2026-10-21T00:00:00Z',
};

function task(id: string, tab: P2TaskTab | 'OTHER', category?: P2DocumentCategory, extra: Partial<P2Task> = {}): P2Task {
  return {
    ...base, task_id: id, task_type: 'T', queue_tab: tab === 'ALL' ? 'OTHER' : tab, document_category: category ?? null,
    document: category ? { category, categoryLabel: category, file: 'scan.pdf', pages: [2], reason: 'Why.' } : null,
    ...extra,
  };
}

describe('the Documents group of the Task Queue (2026-10-21)', () => {
  const all = [
    task('review', 'DOCUMENTS', 'MANUAL_VERIFICATION'),
    task('blur', 'DOCUMENTS', 'IMAGE_QUALITY'),
    task('failed', 'DOCUMENTS', 'FAILED_TO_READ'),
    task('missing', 'DOCUMENTS', 'MISSING_DOCUMENT'),
    task('sku', 'MANUAL_VERIFICATION'),
    task('check', 'OTHER'),
  ];

  it('has the four categories in the product owner order', () => {
    expect(DOCUMENT_CATEGORIES.map((item) => item.label)).toEqual(
      ['Manual verification', 'Failed to read', 'Image quality', 'Missing documents']);
    expect(documentCategoryLabel('MISSING_DOCUMENT')).toBe('Missing document');
  });

  it('filters by tab, then by category on the Documents tab only', () => {
    expect(visibleTasks(all, 'DOCUMENTS', 'ALL').map((t) => t.task_id)).toEqual(['review', 'blur', 'failed', 'missing']);
    expect(visibleTasks(all, 'DOCUMENTS', 'IMAGE_QUALITY').map((t) => t.task_id)).toEqual(['blur']);
    expect(visibleTasks(all, 'MANUAL_VERIFICATION', 'IMAGE_QUALITY').map((t) => t.task_id)).toEqual(['sku']);
    expect(visibleTasks(all, 'ALL', 'IMAGE_QUALITY')).toHaveLength(6);
  });

  it('reads the category from the address and ignores anything else', () => {
    expect(documentFilter('image_quality')).toBe('IMAGE_QUALITY');
    expect(documentFilter('FAILED_TO_READ')).toBe('FAILED_TO_READ');
    expect(documentFilter('nonsense')).toBe('ALL');
    expect(documentFilter(null)).toBe('ALL');
  });

  it('counts from the server when it sent counts, else from the tasks', () => {
    expect(documentCounts(all)).toEqual({ TOTAL: 4, MANUAL_VERIFICATION: 1, FAILED_TO_READ: 1, IMAGE_QUALITY: 1, MISSING_DOCUMENT: 1 });
    const server = { TOTAL: 9, MANUAL_VERIFICATION: 2, FAILED_TO_READ: 3, IMAGE_QUALITY: 4, MISSING_DOCUMENT: 0 };
    expect(documentCounts(all, server)).toBe(server);
  });

  it('says the pages in plain words', () => {
    expect(pagesText([3])).toBe('Page 3');
    expect(pagesText([5, 7])).toBe('Pages 5 and 7');
    expect(pagesText([2, 3, 4])).toBe('Pages 2, 3 and 4');
    expect(pagesText([])).toBeNull();
  });

  it('links to the document only when one was read', () => {
    expect(documentOpenLink(task('blur', 'DOCUMENTS', 'IMAGE_QUALITY'))).toBeUndefined();
    const read = task('review', 'DOCUMENTS', 'MANUAL_VERIFICATION');
    read.document = { ...read.document!, documentId: 'd1' };
    expect(documentOpenLink(read)).toBe('/p2/journeys/j1/documents/d1');
  });

  it('asks for a re-scan on an image-quality task', () => {
    const plan = taskPlan({ ...task('blur', 'DOCUMENTS', 'IMAGE_QUALITY'), task_type: 'PC_PAGE_QUALITY_REJECTED',
      allowed_actions: ['REUPLOAD_DOCUMENT', 'ADD_COMMENT'] }, 'PC');
    expect(plan.primary).toMatchObject({ label: 'Upload the re-scan', to: '/p2/journeys/j1/documents' });
    expect(plan.secondary[0]).toMatchObject({ label: "I've uploaded it — re-check", action: 'REUPLOAD_DOCUMENT' });
  });
});
