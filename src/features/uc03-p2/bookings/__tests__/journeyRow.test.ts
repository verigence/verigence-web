import { describe, expect, it } from 'vitest';

import type { P2JourneyListItem } from '../../../../services/audit-core/uc03P2';
import { holds, lacks, nextAction } from '../JourneyRow';

const item = (extra: Partial<P2JourneyListItem> = {}): P2JourneyListItem => ({
  journey_id: 'j1', customer_name: 'Asha Rao', dealer_name: 'D', outlet_name: 'O',
  current_stage: 'DELIVERY_DOCUMENT_UPLOAD', booking_completion_state: 'COMPLETE', delivery_completion_state: 'IN_PROGRESS',
  booking_receipt_total: '0', manual_verification_pending_count: 0, documents: 0, total_tasks: 0, open_tasks: 0,
  overdue_tasks: 0, open_findings: 0, updated_at_utc: '2026-10-03T00:00:00Z', phase2: true, closed: false,
  ...extra,
}) as P2JourneyListItem;

describe('what a journey holds and lacks (no stage)', () => {
  it('reads KYC and required documents from the gate records', () => {
    expect(holds(item({ kyc_status: 'PASS', docs_required: 8, docs_received: 3 }))).toEqual({
      kyc: 'in', documents: { received: 3, required: 8 },
    });
  });

  it('never guesses before the gates are evaluated', () => {
    expect(holds(item())).toEqual({ kyc: null, documents: null });
    expect(lacks(item())).toBeNull();
  });

  it('names KYC first, then the missing documents, then nothing', () => {
    expect(lacks(item({ kyc_status: 'WAITING', docs_required: 8, docs_received: 3 }))?.title).toBe('KYC missing');
    expect(lacks(item({ kyc_status: 'PASS', docs_required: 8, docs_received: 3 }))).toEqual({
      title: '5 required documents missing', detail: '3 of 8 in',
    });
    expect(lacks(item({ kyc_status: 'PASS', docs_required: 8, docs_received: 8 }))).toBeNull();
  });

  it('the next action names what is lacking, and is otherwise unchanged', () => {
    expect(nextAction(item({ kyc_status: 'WAITING', docs_required: 8, docs_received: 3 }), 'PC'))
      .toMatchObject({ priority: 'action', title: 'KYC missing' });
    expect(nextAction(item({ kyc_status: 'PASS', docs_required: 8, docs_received: 3 }), 'PC'))
      .toMatchObject({ priority: 'action', title: '5 required documents missing', detail: '3 of 8 in' });
    // Nothing lacking (or not a Phase 2 journey): the same text as before.
    expect(nextAction(item({ kyc_status: 'PASS', docs_required: 8, docs_received: 8, documents: 8 }), 'PC').title)
      .toBe('Add the delivery documents');
    expect(nextAction(item({ phase2: false, kyc_status: 'WAITING' }), 'PC').title).toBe('Add the delivery documents');
  });

  it('a task for you still ranks ahead of a missing document', () => {
    const withTask = nextAction(item({ kyc_status: 'WAITING', pc_open_tasks: 2, open_tasks: 2 }), 'PC');
    expect(withTask).toMatchObject({ priority: 'action', title: '2 tasks waiting for you' });
  });
});
