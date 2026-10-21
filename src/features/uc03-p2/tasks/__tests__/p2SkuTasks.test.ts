import { describe, expect, it } from 'vitest';

import { taskPlan } from '../p2TaskPlan';
import { skuStatusText } from '../../journey360/DealControls';
import type { P2Task } from '../../../../services/audit-core/uc03P2';

// 2026-10-20 product owner rules: a SKU named by the documents' words is an
// automatic match (never "Confirmed"); a price that differs is the PC's task;
// a SKU a PC / TL set is only changed by the Team Lead.
const base: Omit<P2Task, 'task_id' | 'journey_id' | 'title' | 'task_type' | 'allowed_actions'> = {
  source_system: 'P2', round_number: 1, category: 'CORRECTION_APPROVAL', origin_kind: 'SYSTEM', source_type: 'RESOLVER',
  description: '', reference: {}, severity: 'MEDIUM', assigned_role_code: 'PC', completion_protocol: 'MACHINE_VERIFIED',
  task_status: 'READY', created_at_utc: '2026-10-20T00:00:00Z', updated_at_utc: '2026-10-20T00:00:00Z',
};

describe('SKU tasks and status', () => {
  it('lets the PC keep the vehicle the words named or pick another when the price differs', () => {
    const plan = taskPlan({ ...base, task_id: 't', journey_id: 'j1', title: 'SKU price differs from booking',
      task_type: 'SKU_PRICE_MISMATCH', allowed_actions: ['ACCEPT', 'ADD_COMMENT'] }, 'PC');
    expect(plan.primary).toMatchObject({ label: 'Keep this vehicle', action: 'ACCEPT' });
    expect(plan.secondary[0]).toMatchObject({ label: 'Pick the SKU', to: '/p2/journeys/j1/overview?tab=deal' });
  });

  it('leaves a confirmed SKU against an invoice to the Team Lead', () => {
    const task = { ...base, task_id: 't', journey_id: 'j1', title: 'Invoice names a different SKU', assigned_role_code: 'TL',
      task_type: 'SKU_INVOICE_REVIEW', allowed_actions: ['ACCEPT', 'REJECT', 'ADD_COMMENT'] };
    expect(taskPlan(task, 'PC').waiting).toContain('Team Lead');
    const plan = taskPlan(task, 'TL');
    expect(plan.primary).toMatchObject({ action: 'ACCEPT' });
    expect(plan.secondary[0]).toMatchObject({ action: 'REJECT', requiresComment: true });
  });

  it('asks the PC to keep or replace an automatic SKU the documents no longer name', () => {
    const plan = taskPlan({ ...base, task_id: 't', journey_id: 'j1',
      title: 'SKU not clearly identified from the documents \u2014 confirm or set it',
      task_type: 'SKU_NOT_CONFIRMED', allowed_actions: ['ACCEPT', 'ADD_COMMENT'] }, 'PC');
    expect(plan.primary).toMatchObject({ label: 'Keep this vehicle', action: 'ACCEPT' });
    expect(plan.secondary[0]).toMatchObject({ label: 'Pick the SKU' });
  });

  it('offers a pick per vehicle and a cancellation per document when documents disagree', () => {
    const reference = {
      skuOptions: [{ skuId: 's-lx', skuCode: 'LX1', vehicle: 'THAR LX' }, { skuId: 's-ax', skuCode: 'AX1', vehicle: 'THAR AX' }],
      documents: [{ documentId: 'd1', invoiceNumber: 'INV-LX', skuCode: 'LX1' }, { documentId: 'd2', invoiceNumber: 'INV-AX', skuCode: 'AX1' }],
    };
    const plan = taskPlan({ ...base, task_id: 't', journey_id: 'j1', title: 'Vehicle invoices name different vehicles',
      task_type: 'SKU_INVOICES_DISAGREE', reference, allowed_actions: ['ACCEPT', 'REJECT', 'ADD_COMMENT'] }, 'PC');
    expect(plan.primary).toMatchObject({ label: 'Sold: THAR LX (LX1)', action: 'ACCEPT', details: { skuId: 's-lx' } });
    expect(plan.secondary[0]).toMatchObject({ label: 'Sold: THAR AX (AX1)', details: { skuId: 's-ax' } });
    expect(plan.secondary[1]).toMatchObject({ label: 'INV-LX (LX1) was cancelled', action: 'REJECT',
      details: { documentId: 'd1' }, requiresComment: true });
    const forms = taskPlan({ ...base, task_id: 't2', journey_id: 'j1', title: 'Booking forms name different vehicles',
      task_type: 'SKU_BOOKING_FORMS_DISAGREE', reference: { ...reference, documents: [{ documentId: 'd3' }] },
      allowed_actions: ['ACCEPT', 'REJECT', 'ADD_COMMENT'] }, 'PC');
    expect(forms.secondary.find((a) => a.action === 'REJECT')).toMatchObject({ label: 'This booking form was cancelled' });
  });

  it('keeps a PC decision when a booking form names another vehicle, and asks for a missing SKU', () => {
    const differs = taskPlan({ ...base, task_id: 't', journey_id: 'j1', title: 'A booking form names a different vehicle',
      task_type: 'SKU_BOOKING_FORM_DIFFERS', allowed_actions: ['ACCEPT', 'ADD_COMMENT'] }, 'PC');
    expect(differs.primary).toMatchObject({ label: 'Keep the confirmed vehicle', action: 'ACCEPT' });
    expect(differs.secondary[0]).toMatchObject({ label: 'Propose a correction' });
    const notSet = taskPlan({ ...base, task_id: 't2', journey_id: 'j1', title: 'No SKU on this Journey',
      task_type: 'SKU_NOT_SET', allowed_actions: ['ADD_COMMENT'] }, 'PC');
    expect(notSet.primary).toBeUndefined();
    expect(notSet.secondary[0]).toMatchObject({ label: 'Pick the SKU', to: '/p2/journeys/j1/overview?tab=deal' });
  });

  it('never calls an automatic match confirmed', () => {
    expect(skuStatusText({ selectionStatus: 'TENTATIVE', matchBasis: 'AUTO_MATCHED',
      matchLabel: 'Matched automatically by its words; booking price agrees' }))
      .toBe(' · Matched automatically by its words; booking price agrees');
    expect(skuStatusText({ selectionStatus: 'TENTATIVE' })).toBe(' · Matched automatically');
    expect(skuStatusText({})).toBe('');
  });
});
