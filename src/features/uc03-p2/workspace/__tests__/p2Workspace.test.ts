import { describe, expect, it } from 'vitest';

import type { P2DocumentBatch, P2DocumentReviewField, P2Template } from '../../../../services/audit-core/uc03P2';
import { buildFieldViews } from '../P2DocumentEditor';
import { buildDocumentRows } from '../P2DocumentList';
import { evidenceBox } from '../P2PagePreview';
import { displayValue, formatInr, humanizeKey, relativeDue } from '../p2Format';
import { preflightError, runUploads, stableClientUploadId, type UploadItem, type UploadTransport } from '../p2Uploader';

const file = (name: string, size = 10, type = 'application/pdf') =>
  new File([new Uint8Array(size)], name, { type, lastModified: 1 });

function item(f: File): UploadItem {
  return { id: f.name, file: f, clientUploadId: stableClientUploadId('j1', f), phase: 'WAITING', progress: 0 };
}

describe('upload engine', () => {
  it('uploads independently: one failure never stops the others', async () => {
    const puts: string[] = [];
    const transport: UploadTransport = {
      init: async (files) => files.map((f) => ({
        batchId: `b-${f.filename}`, clientUploadId: f.clientUploadId, filename: f.filename, status: 'AWAITING_UPLOAD',
        alreadyAccepted: false, uploadUrl: `https://s3/${f.filename}`, uploadHeaders: {},
      })),
      put: async (url, _headers, _file, onProgress) => {
        puts.push(url);
        onProgress(0.5);
        if (url.endsWith('bad.pdf')) throw new Error('network down');
      },
      finalize: async () => undefined,
    };
    const results = await runUploads([item(file('a.pdf')), item(file('bad.pdf')), item(file('c.pdf'))], transport, () => undefined, 2);
    expect(Object.fromEntries(results.map((r) => [r.file.name, r.phase]))).toEqual({
      'a.pdf': 'ACCEPTED', 'bad.pdf': 'FAILED', 'c.pdf': 'ACCEPTED',
    });
    expect(results.find((r) => r.file.name === 'bad.pdf')?.error).toBe('network down');
    expect(puts).toHaveLength(3);
  });

  it('skips files the server already accepted (retry safety)', async () => {
    let put = 0;
    const transport: UploadTransport = {
      init: async (files) => files.map((f) => ({
        batchId: 'b', clientUploadId: f.clientUploadId, filename: f.filename, status: 'UPLOADED',
        alreadyAccepted: true, uploadUrl: null, uploadHeaders: {},
      })),
      put: async () => { put += 1; },
      finalize: async () => undefined,
    };
    const [result] = await runUploads([item(file('a.pdf'))], transport, () => undefined);
    expect(result.phase).toBe('ACCEPTED');
    expect(put).toBe(0);
  });

  it('rejects unsupported and empty files before any network call', () => {
    expect(preflightError(file('x.docx', 10, 'application/msword'))).toMatch(/PDF, JPG or PNG/);
    expect(preflightError(file('x.pdf', 0))).toMatch(/empty/);
    expect(preflightError(file('x.jpg', 10, 'image/jpeg'))).toBeUndefined();
  });

  it('keeps a stable identity per file so retries dedupe', () => {
    expect(stableClientUploadId('j1', file('a.pdf'))).toBe(stableClientUploadId('j1', file('a.pdf')));
    expect(stableClientUploadId('j1', file('a.pdf'))).not.toBe(stableClientUploadId('j2', file('a.pdf')));
  });
});

describe('display', () => {
  it('never changes the case of values', () => {
    expect(displayValue('OD02AB1234')).toBe('OD02AB1234');
    expect(displayValue(null)).toBe('—');
    expect(humanizeKey('grand_total_amount')).toBe('Grand total amount');
    expect(formatInr('2510000')).toBe('₹25,10,000');
  });

  it('describes SLA relative to now', () => {
    const now = Date.parse('2026-09-27T10:00:00Z');
    expect(relativeDue('2026-09-27T08:00:00Z', now)).toEqual({ label: '2h overdue', overdue: true });
    expect(relativeDue('2026-09-27T10:30:00Z', now)).toEqual({ label: 'due in 30m', overdue: false });
  });

  it('only accepts real DI boxes', () => {
    expect(evidenceBox({ type: 'BOX_2D', coordinateSystem: 'NORMALIZED_1000', box: [100, 200, 150, 400] }))
      .toEqual({ x: 0.2, y: 0.1, w: 0.2, h: 0.05 });
    expect(evidenceBox({ type: 'BOX_2D', coordinateSystem: 'NORMALIZED_1000', box: [150, 200, 100, 400] })).toBeNull();
    expect(evidenceBox(null)).toBeNull();
  });
});

describe('document rows', () => {
  const batch = (over: Partial<P2DocumentBatch>): P2DocumentBatch => ({
    batchId: 'b1', original_filename: 'packet.pdf', size_bytes: 1, page_count: 3, batch_status: 'PROCESSING',
    created_at_utc: '', updated_at_utc: '', pages: [], ...over,
  });

  it('shows documents, not merged fragment pages', () => {
    const page = (n: number, status: string, extra = {}) => ({
      queueId: `q${n}`, page_number: n, client_upload_id: `c${n}`, queue_status: status, attempt_count: 0,
      extracted_field_count: 0, created_at_utc: '', updated_at_utc: '', ...extra,
    });
    const rows = buildDocumentRows([batch({
      pages: [page(1, 'MERGED'), page(2, 'MERGED'), page(3, 'READY', { diDocumentId: 'd3', displayName: 'PAN Card' })],
      documents: [
        { ...page(9, 'EXTRACTING', { unitKind: 'GROUP', pageNumbers: [1, 2], displayName: 'Aadhaar' }), memberPages: [page(1, 'MERGED'), page(2, 'MERGED')] },
        { ...page(3, 'READY', { diDocumentId: 'd3', displayName: 'PAN Card' }), memberPages: [] },
      ],
    })], []);
    expect(rows.map((r) => [r.name, r.subtitle, r.status])).toEqual([
      ['Aadhaar', 'packet.pdf · pages 1, 2', 'EXTRACTING'],
      ['PAN Card', 'packet.pdf · page 3', 'READY'],
    ]);
  });
});

describe('field review', () => {
  const template: P2Template = {
    key: 'dealer_receipt', displayName: 'Booking Payment Receipt', stage: 'BOOKING', requirement: 'REQUIRED',
    pageShape: 'SINGLE', maxPages: 1, diTypes: ['dealer_receipt'], reviewThreshold: 90, keyFields: ['amount_paid'],
    fields: [{ key: 'amount_paid', label: 'Amount paid', type: 'decimal', required: true, isKey: true, reviewThreshold: 97 }],
  };
  const field = (key: string, confidence: number | null, extra: Partial<P2DocumentReviewField> = {}): P2DocumentReviewField => ({
    canonicalFieldId: key, fieldKey: key, sourceFactVersion: 1, extractedValue: 'x', modifiedValue: null,
    effectiveValue: 'x', confidenceScore: confidence, isModified: false, pageNo: 1, evidenceRegion: null, ...extra,
  });

  it('applies strict thresholds and puts review work first', () => {
    const views = buildFieldViews([field('receipt_date', 92), field('amount_paid', 95)], template);
    expect(views.map((v) => [v.fieldKey, v.needsReview])).toEqual([['amount_paid', true], ['receipt_date', false]]);
  });

  it('treats confirmed or corrected fields as reviewed', () => {
    const views = buildFieldViews([
      field('amount_paid', 50, { reviewedAtUtc: '2026-09-27' }),
      field('receipt_number', 40, { isModified: true }),
    ], template);
    expect(views.every((v) => !v.needsReview)).toBe(true);
  });
});
