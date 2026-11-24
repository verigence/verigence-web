import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import MissingDocumentsReport, { groupByOutlet } from '../MissingDocumentsReport';
import type { MissingDocumentsJourney, MissingDocumentsReport as Report } from '../../../../services/audit-core/uc03MissingDocuments';

const journey = (over: Partial<MissingDocumentsJourney>): MissingDocumentsJourney => ({
  journeyId: 'j1', reference: 'TST-AA-261124-001', customer: 'Customer One', dealerId: 'd1', dealerName: 'Test Motors',
  outletId: 'o1', outletName: 'Town', pcName: 'PC', basis: 'GATE_PASS', uploadDay: '2026-11-24',
  documents: ['Gate pass', 'RTO Challan'], requirementKeys: ['gate_pass', 'rto_challan'], ...over,
});
const report: Report = {
  from: '2026-11-18', to: '2026-11-24', scope: 'ALL', totals: { journeys: 2, documents: 3 },
  byDocument: [
    { name: 'Gate pass', requirementKey: 'gate_pass', count: 2, byOutlet: [
      { dealerId: 'd1', dealerName: 'Test Motors', outletId: 'o1', outletName: 'Town', count: 1 },
      { dealerId: 'd1', dealerName: 'Test Motors', outletId: 'o2', outletName: 'Village', count: 1 }] },
    { name: 'RTO Challan', requirementKey: 'rto_challan', count: 1, byOutlet: [] },
  ],
  byDealer: [], byOutlet: [], outlets: [],
  days: [{ date: '2026-11-24', label: '24 Nov', journeys: [
    journey({}),
    journey({ journeyId: 'j2', reference: 'TST-AA-261124-002', customer: 'Customer Two', outletId: 'o2', outletName: 'Village',
      documents: ['Gate pass'], requirementKeys: ['gate_pass'] }),
  ] }],
};

function render(): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['p2-missing-documents', 't1', '2026-11-18', '2026-11-24', null, null], report);
  return renderToString(
    <QueryClientProvider client={client}>
      <MemoryRouter><MissingDocumentsReport tenantId="t1" accessToken="x" from="2026-11-18" to="2026-11-24" /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MissingDocumentsReport', () => {
  it('lists each document of the list once, with its count', () => {
    const html = render();
    expect(html).toContain('Gate pass');
    expect(html).toContain('RTO Challan');
    expect(html).not.toContain('missing documents:');
    expect(html).toContain('By dealership and outlet');
  });

  it('groups delivery files by dealership and outlet, each with its documents and count', () => {
    const [dealer] = groupByOutlet(report);
    expect(dealer.name).toBe('Test Motors');
    expect(dealer.outlets.map((o) => [o.name, o.journeys.length, o.documents])).toEqual([['Town', 1, 2], ['Village', 1, 1]]);
    expect(dealer.outlets[0].journeys[0].reference).toBe('TST-AA-261124-001');
  });
});
