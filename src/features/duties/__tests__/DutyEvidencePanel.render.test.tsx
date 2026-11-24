import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import DutyEvidencePanel from '../DutyEvidencePanel';
import { addDays, istToday } from '../dutiesFormat';
import type { DutyEvidence, EvidenceDuty } from '../../../services/audit-core/duties';

const duty = (over: Partial<EvidenceDuty> = {}): EvidenceDuty => ({ done: 0, late: 0, notReceived: 0, pending: 0, notDone: 0, ...over });
export const sample = (): DutyEvidence => {
  const today = istToday();
  const from = addDays(today, -6);
  return {
    from, to: today, today, days: [from, today],
    pcs: [
      { actorId: 'a1', name: 'PC One', outlets: ['Test Motors - Town'],
        summary: { gate: duty({ done: 5, notDone: 1 }), cash: { ...duty({ done: 4, notReceived: 1, notDone: 1 }), amount: 125000, transactions: 18 },
          statements: 1, photos: { drive: 6, camera: 2, unread: 3 } },
        days: [] },
      { actorId: 'a2', name: 'PC Two', outlets: ['Test Motors - Village'],
        summary: { gate: duty({ notDone: 6 }), cash: { ...duty({ notDone: 6 }), amount: 0, transactions: 0 },
          statements: 0, photos: { drive: 0, camera: 0, unread: 0 } },
        days: [] },
    ],
  };
};

function render(data: DutyEvidence): string {
  const client = new QueryClient();
  client.setQueryData(['duties', 'evidence', 'project', 't1', data.from, data.to], data);
  return renderToString(<QueryClientProvider client={client}><DutyEvidencePanel mode="project" tenantId="t1" accessToken="x" /></QueryClientProvider>);
}

describe('DutyEvidencePanel', () => {
  it('shows each PC: gate register, cash register with the amount, statements and photos by source', () => {
    const html = render(sample());
    expect(html).toContain('PC One');
    expect(html).toContain('5<!-- --> of <!-- -->6<!-- --> days');
    expect(html).toContain('₹<!-- -->1,25,000');
    expect(html).toContain('Drive photo folder');
    expect(html).toContain('Unread pages kept');
    // A PC who did nothing shows 0 of 6, flagged.
    expect(html).toContain('dty-tag--bad');
  });
});
