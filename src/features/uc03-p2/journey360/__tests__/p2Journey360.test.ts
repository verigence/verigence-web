import { describe, expect, it } from 'vitest';

import { money, recordValue, signedMoney, varianceTone } from '../j360Format';
import { newPhotoItem, photoPreflight, runPhotoUploads, type PhotoTransport } from '../../photos/p2PhotoUploader';
import type { P2Task } from '../../../../services/audit-core/uc03P2';

describe('Journey 360 formatting', () => {
  it('never shows a missing amount as zero', () => {
    expect(money(null)).toBe('—');
    expect(money('0')).toContain('0');
    expect(signedMoney('5000')).toMatch(/^\+₹/);
    expect(signedMoney('-2000')).toMatch(/^−₹/);
    expect(signedMoney('0')).toBe('—');
  });

  it('colours variance by who it costs', () => {
    expect(varianceTone('-100')).toBe('is-adverse');
    expect(varianceTone('100', 'discount')).toBe('is-adverse');
    expect(varianceTone('100')).toBe('is-favourable');
    expect(varianceTone(null)).toBe('');
  });

  it('flattens add-on records for display', () => {
    expect(recordValue({ zero_dep: true, engine_protect: false })).toBe('Zero dep');
    expect(recordValue(['a', 'b'])).toBe('a, b');
    expect(recordValue(false)).toBe('No');
  });
});

describe('vehicle photo upload', () => {
  const photo = (name = 'front.jpg', type = 'image/jpeg') => new File([new Uint8Array([1, 2, 3])], name, { type, lastModified: 1 });

  it('accepts only photos', () => {
    expect(photoPreflight(photo())).toBeUndefined();
    expect(photoPreflight(photo('car.heic', ''))).toBeUndefined();
    expect(photoPreflight(photo('form.pdf', 'application/pdf'))).toMatch(/Only photos/);
  });

  it('keeps the same id for the same photo so retries never duplicate', () => {
    const file = photo();
    expect(newPhotoItem('j1', file).clientUploadId).toBe(newPhotoItem('j1', file).clientUploadId);
    expect(newPhotoItem('j1', file).clientUploadId).not.toBe(newPhotoItem('j2', file).clientUploadId);
  });

  it('uploads, retries a slow finalize and isolates failures', async () => {
    let finalizeCalls = 0;
    const transport: PhotoTransport = {
      intents: async (files) => files.map((f) => ({ clientUploadId: f.clientUploadId, uploadUrl: `u/${f.filename}`,
        uploadHeaders: {}, alreadyStored: false })),
      put: async (url) => { if (url.includes('bad')) throw new Error('network'); },
      finalize: async () => { finalizeCalls += 1; if (finalizeCalls === 1) throw new Error('not yet'); },
    };
    const good = newPhotoItem('j', photo('good.jpg'), 'FRONT', 0);
    const bad = newPhotoItem('j', photo('bad.jpg'), 'REAR', 1);
    const result = await runPhotoUploads([good, bad], transport, () => undefined, 2, async (f) => f);
    expect(result.find((i) => i.id === good.id)?.phase).toBe('DONE');
    expect(result.find((i) => i.id === bad.id)?.phase).toBe('FAILED');
    expect(finalizeCalls).toBe(2);
  });
});

describe('Task Queue grouping', () => {
  it('groups by journey, overdue journeys first', async () => {
    const { groupByJourney } = await import('../../tasks/p2TaskPlan');
    const base: Omit<P2Task, 'task_id' | 'journey_id' | 'title'> = { source_system: 'P2', round_number: 1, category: 'X',
      origin_kind: 'SYSTEM', source_type: 'RULE', description: '', reference: {}, severity: 'MEDIUM', assigned_role_code: 'PC',
      allowed_actions: [], completion_protocol: 'MACHINE_VERIFIED', task_status: 'READY',
      created_at_utc: '2026-09-01T00:00:00Z', updated_at_utc: '2026-09-01T00:00:00Z', task_type: 'T' };
    const now = Date.parse('2026-09-28T00:00:00Z');
    const groups = groupByJourney([
      { ...base, task_id: 'a', journey_id: 'j1', title: 'A', due_at_utc: '2026-10-01T00:00:00Z', customer_name: 'One' },
      { ...base, task_id: 'b', journey_id: 'j2', title: 'B', due_at_utc: '2026-09-20T00:00:00Z', customer_name: 'Two' },
      { ...base, task_id: 'c', journey_id: 'j1', title: 'C', due_at_utc: '2026-09-30T00:00:00Z' },
    ], now);
    expect(groups.map((g) => g.journeyId)).toEqual(['j2', 'j1']);
    expect(groups[0].overdue).toBe(1);
    expect(groups[1].tasks.map((t) => t.task_id)).toEqual(['c', 'a']);
  });
});

describe('document-driven tasks', () => {
  const base: Omit<P2Task, 'task_id' | 'journey_id' | 'title' | 'task_type' | 'allowed_actions'> = {
    source_system: 'P2', round_number: 1, category: 'X', origin_kind: 'SYSTEM', source_type: 'EVIDENCE', description: '',
    reference: {}, severity: 'HIGH', assigned_role_code: 'PC', completion_protocol: 'MACHINE_VERIFIED',
    task_status: 'READY', created_at_utc: '2026-09-01T00:00:00Z', updated_at_utc: '2026-09-01T00:00:00Z',
  };

  it('offers photos or a VIN / engine number when the car has no pictures', async () => {
    const { taskPlan } = await import('../../tasks/p2TaskPlan');
    const plan = taskPlan({ ...base, task_id: 't', journey_id: 'j1', title: 'Add pictures',
      task_type: 'DELIVERY_VEHICLE_PHOTOS_MISSING', allowed_actions: ['UPLOAD_DOCUMENT', 'PROVIDE_VEHICLE_ID', 'ADD_COMMENT'] }, 'PC');
    expect(plan.vehicleId).toBe(true);
    expect(plan.primary?.to).toBe('/p2/journeys/j1/documents?tab=photos');
  });

  it('lets the Team Lead mark a completed delivery reviewed', async () => {
    const { taskPlan } = await import('../../tasks/p2TaskPlan');
    const plan = taskPlan({ ...base, task_id: 't', journey_id: 'j1', title: 'Review', source_type: 'REVIEW',
      assigned_role_code: 'TL', task_type: 'DELIVERY_REVIEW', allowed_actions: ['COMPLETE_ACTION', 'ADD_COMMENT'] }, 'TL');
    expect(plan.primary).toMatchObject({ label: 'Mark delivery reviewed', action: 'COMPLETE_ACTION' });
    expect(plan.secondary.map((a) => a.label)).toContain('Compliance report');
  });

  it('turns a check\'s question into one button per answer, yes first', async () => {
    const { taskPlan } = await import('../../tasks/p2TaskPlan');
    const plan = taskPlan({ ...base, task_id: 't', journey_id: 'j1', title: 'Confirm the cash collection was intimated',
      task_type: 'PC_CONFIRMATION', allowed_actions: ['COMPLETE_ACTION', 'ADD_COMMENT'],
      reference: { question: 'Was it intimated?', answers: [
        { value: 'YES', label: 'Yes, it was intimated' },
        { value: 'NO', label: 'No, it was not intimated', requiresComment: true },
      ] } }, 'PC');
    expect(plan.primary).toMatchObject({ label: 'Yes, it was intimated', action: 'COMPLETE_ACTION', details: { answer: 'YES' } });
    expect(plan.secondary[0]).toMatchObject({ label: 'No, it was not intimated', details: { answer: 'NO' }, requiresComment: true });
    expect(plan.secondary.map((a) => a.label)).toContain('Comment');
  });

  it('lets the Team Lead confirm or reject the finding behind a violation', async () => {
    const { taskPlan } = await import('../../tasks/p2TaskPlan');
    const plan = taskPlan({ ...base, task_id: 't', journey_id: 'j1', title: 'Deal charged below the standard price',
      assigned_role_code: 'TL', task_type: 'FINDING_REVIEW',
      allowed_actions: ['CONFIRM_BREACH', 'MARK_FALSE_POSITIVE', 'ACCEPT_EXCEPTION', 'ADD_COMMENT'],
      reference: { findingId: 'f1', sourceCode: 'DEAL_UNDERCHARGED' } }, 'TL');
    expect(plan.primary).toMatchObject({ label: 'Confirm breach', action: 'CONFIRM_BREACH', requiresComment: true });
    expect(plan.secondary[0]).toMatchObject({ label: 'Reject as false positive', action: 'MARK_FALSE_POSITIVE',
      details: { rejectionCategory: 'OTHER' } });
  });

  it('validates the vehicle number like the server', async () => {
    const { vehicleIdentityError } = await import('../../tasks/p2TaskPlan');
    expect(vehicleIdentityError({ vin: '', chassisNumber: '', engineNumber: '' })).toMatch(/Enter/);
    expect(vehicleIdentityError({ vin: 'MA3SHORT', chassisNumber: '', engineNumber: '' })).toMatch(/17/);
    expect(vehicleIdentityError({ vin: '', chassisNumber: '', engineNumber: 'k12n-7654321' })).toBeUndefined();
  });

  it('shows PAN or Aadhaar as one requirement met by either', async () => {
    const { checklistRequirements } = await import('../../workspace/P2DocumentList');
    const rows = checklistRequirements([
      { templateKey: 'pan_card', displayName: 'PAN Card', stage: 'BOOKING', requirement: 'REQUIRED', group: 'KYC',
        groupLabel: 'PAN Card or Aadhaar', status: 'MISSING', readyCount: 0, documentIds: [] },
      { templateKey: 'aadhaar', displayName: 'Aadhaar', stage: 'BOOKING', requirement: 'REQUIRED', group: 'KYC',
        groupLabel: 'PAN Card or Aadhaar', status: 'RECEIVED', readyCount: 1, documentIds: ['d1'] },
      { templateKey: 'corporate_id', displayName: 'Corporate ID', stage: 'DELIVERY', requirement: 'REQUIRED', conditional: true,
        reason: 'The booking form shows a corporate discount.', status: 'MISSING', readyCount: 0, documentIds: [] },
    ]);
    // Aadhaar is in: it gets its own card; PAN is covered by it and only
    // shows if a PAN page is uploaded too (Issue 4, 2026-09-30).
    expect(rows.map((r) => [r.label, r.status, Boolean(r.covered)])).toEqual([
      ['PAN Card', 'MISSING', true], ['Aadhaar', 'RECEIVED', false], ['Corporate ID', 'MISSING', false]]);
    expect(rows[1].documentIds).toEqual(['d1']);
    expect(rows[0].groupKey).toBe('BOOKING:KYC');
    expect(rows[1].groupKey).toBe('BOOKING:KYC');
    expect(rows[2].conditional).toBe(true);
  });

  it('asks for PAN or Aadhaar on one card while neither is in', async () => {
    const { checklistRequirements } = await import('../../workspace/P2DocumentList');
    const rows = checklistRequirements([
      { templateKey: 'pan_card', displayName: 'PAN Card', stage: 'BOOKING', requirement: 'REQUIRED', group: 'KYC',
        groupLabel: 'PAN Card or Aadhaar', status: 'MISSING', readyCount: 0, documentIds: [] },
      { templateKey: 'aadhaar', displayName: 'Aadhaar', stage: 'BOOKING', requirement: 'REQUIRED', group: 'KYC',
        groupLabel: 'PAN Card or Aadhaar', status: 'MISSING', readyCount: 0, documentIds: [] },
    ]);
    expect(rows.map((r) => [r.label, r.status, r.templateKeys])).toEqual([
      ['PAN Card or Aadhaar', 'MISSING', ['pan_card', 'aadhaar']]]);
  });

  it('shows PAN and Aadhaar as two cards when the customer gave both', async () => {
    const { checklistRequirements } = await import('../../workspace/P2DocumentList');
    const rows = checklistRequirements([
      { templateKey: 'pan_card', displayName: 'PAN Card', stage: 'BOOKING', requirement: 'REQUIRED', group: 'KYC',
        groupLabel: 'PAN Card or Aadhaar', status: 'RECEIVED', readyCount: 1, documentIds: ['p1'] },
      { templateKey: 'aadhaar', displayName: 'Aadhaar', stage: 'BOOKING', requirement: 'REQUIRED', group: 'KYC',
        groupLabel: 'PAN Card or Aadhaar', status: 'RECEIVED', readyCount: 1, documentIds: ['a1'] },
    ]);
    expect(rows.map((r) => [r.label, r.status, r.documentIds, Boolean(r.covered)])).toEqual([
      ['PAN Card', 'RECEIVED', ['p1'], false], ['Aadhaar', 'RECEIVED', ['a1'], false]]);
  });
});
