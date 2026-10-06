import { describe, expect, it } from 'vitest';

import type { OemMasterUploadPreview } from '../../../services/audit-core/oemMasters';
import {
  addFiles,
  applyDateToAll,
  batchSummary,
  isPublishable,
  publishOrder,
  statusAfterCheck,
  withDate,
  type BatchItem,
} from '../batch';

const file = (name: string, size = 10) => new File(['x'.repeat(size)], name, { lastModified: 1 });
const preview = (errors: string[] = []) => ({ errors, warnings: [], effectiveFrom: null }) as unknown as OemMasterUploadPreview;
const item = (name: string, over: Partial<BatchItem> = {}): BatchItem => ({
  id: name, file: file(name), date: '', status: 'WAITING', ...over,
});

describe('price master batch', () => {
  it('adds several files once each', () => {
    const first = addFiles([], [file('thar.xlsx'), file('veero.xlsx'), file('thar.xlsx')]);
    expect(first.map((i) => i.file.name)).toEqual(['thar.xlsx', 'veero.xlsx']);
    expect(addFiles(first, [file('veero.xlsx'), file('ev.xlsx')]).map((i) => i.file.name)).toEqual(['thar.xlsx', 'veero.xlsx', 'ev.xlsx']);
  });

  it('a file with errors is never publishable, even with a date', () => {
    expect(statusAfterCheck(preview(['row 3: repeats the vehicle']), '2026-09-23')).toBe('HAS_ERRORS');
    expect(isPublishable(item('a.xlsx', { status: 'HAS_ERRORS', date: '2026-09-23', preview: preview(['x']) }))).toBe(false);
  });

  it('a clean file needs a date, and typing one makes it ready', () => {
    expect(statusAfterCheck(preview(), '')).toBe('NO_DATE');
    expect(statusAfterCheck(preview(), '2026-09-23')).toBe('READY');
    const waiting = item('a.xlsx', { status: 'NO_DATE', preview: preview() });
    expect(withDate(waiting, '2026-09-01').status).toBe('READY');
    expect(withDate({ ...waiting, status: 'READY', date: '2026-09-01' }, '').status).toBe('NO_DATE');
  });

  it('publishes only ready files, oldest date first', () => {
    const items = [
      item('thar.xlsx', { status: 'READY', date: '2026-09-23', preview: preview() }),
      item('ev.xlsx', { status: 'READY', date: '2026-09-01', preview: preview() }),
      item('bad.xlsx', { status: 'HAS_ERRORS', date: '2026-09-01', preview: preview(['e']) }),
      item('nodate.xlsx', { status: 'NO_DATE', preview: preview() }),
    ];
    expect(publishOrder(items).map((i) => i.file.name)).toEqual(['ev.xlsx', 'thar.xlsx']);
  });

  it('one date can be applied to every checked file and the summary counts them', () => {
    const items = applyDateToAll(
      [item('a.xlsx', { status: 'NO_DATE', preview: preview() }), item('b.xlsx', { status: 'HAS_ERRORS', preview: preview(['e']) })],
      '2026-09-14',
    );
    expect(items.map((i) => i.status)).toEqual(['READY', 'HAS_ERRORS']);
    expect(batchSummary(items)).toMatchObject({ total: 2, ready: 1, withErrors: 1, needDate: 0 });
  });
});
