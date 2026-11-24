import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import P2DataUploadsPage from '../P2DataUploadsPage';
import type { DmsDump, DmsDumpRow } from '../../services/audit-core/uc03DmsDumps';

vi.mock('../../store/projectContextStore', () => {
  const state = () => ({ selectedProject: { tenantId: 't1', operatingRole: 'REVIEWER', scope: { outlets: [] } }, projects: [] });
  return {
    useProjectContextStore: Object.assign((select: (s: ReturnType<typeof state>) => unknown) => select(state()),
      { getState: state, subscribe: () => () => undefined }),
  };
});
vi.mock('../../store/sessionStore', () => {
  const state = () => ({ accessToken: 'token', displayName: 'Reviewer' });
  return {
    useSessionStore: Object.assign((select: (s: ReturnType<typeof state>) => unknown) => select(state()),
      { getState: state, subscribe: () => () => undefined }),
  };
});

const dump: DmsDump = {
  dumpId: 'd1', kind: 'DELIVERY', dealerId: 'dl1', dealerName: 'Test Motors', businessDate: '2026-11-23',
  periodMonth: '2026-11-01', fileName: 'delivery.xlsx', format: 'XLSX', status: 'ACTIVE', rows: 3, matched: 2,
  notInTool: 0, missing: 1, cancelled: 0, uploadedBy: 'Reviewer', uploadedAtUtc: '2026-11-23T10:00:00Z',
  matchedAtUtc: '2026-11-23T10:01:00Z', modelDiffers: 1,
};
const row = (over: Partial<DmsDumpRow>): DmsDumpRow => ({
  rowNo: 1, kind: 'DELIVERY', outcome: 'MATCHED', matchBasis: 'CHASSIS', dealerName: 'Test Motors', outletName: null,
  outletLabel: 'Town', eventDate: '2026-11-22', bookingNumber: null, otf: null, customerName: 'Customer A', mobile: null,
  chassis: 'T2K00001', invoiceNumber: null, registrationNumber: null, model: 'THAR ROXX', variant: null, stage: null,
  consultant: null, journeyId: 'j1', journeyReference: 'J-1', dumpDate: '2026-11-23', ...over,
});
const items = [
  row({ rowNo: 1, customerName: 'Model Differs Customer', modelDiffers: true, journeyModel: 'Scorpio N' }),
  row({ rowNo: 2, customerName: 'Same Model Customer' }),
  row({ rowNo: 3, outcome: 'MISSING', customerName: 'Missing Customer', journeyId: null, journeyReference: null }),
];

function render(url: string): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['dms-dump', 't1', 'd1'], { ...dump, items });
  return renderToString(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}><P2DataUploadsPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('P2DataUploadsPage: a dump opened from the model-differs alert', () => {
  it('opens on the Model differs rows only', () => {
    const html = render('/p2/data-uploads?type=delivery&dumpId=d1&view=model');
    expect(html).toContain('Model differs');
    expect(html).toContain('Model Differs Customer');
    expect(html).toContain('Verigence: <!-- -->Scorpio N');
    expect(html).not.toContain('Same Model Customer');
    expect(html).not.toContain('Missing Customer');
  });

  it('the alerts already out (no view, no type) open there too', () => {
    const html = render('/p2/data-uploads?dumpId=d1');
    expect(html).toContain('Model Differs Customer');
    expect(html).not.toContain('Missing Customer');
  });

  it('view=rows opens on the rows not in Verigence', () => {
    const html = render('/p2/data-uploads?type=delivery&dumpId=d1&view=rows');
    expect(html).toContain('Missing Customer');
    expect(html).not.toContain('Model Differs Customer');
  });
});

describe('P2DataUploadsPage: rows to correct in the dealership\'s sheet (24 Nov 2026)', () => {
  function renderWith(sheetIssueRows: DmsDump['sheetIssueRows']): string {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['dms-dump', 't1', 'd1'], { ...dump, sheetIssues: sheetIssueRows?.length ?? 0, sheetIssueRows, items });
    return renderToString(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/p2/data-uploads?type=delivery&dumpId=d1&view=rows']}><P2DataUploadsPage /></MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('lists each row with its Excel row, column, value and what is wrong', () => {
    const html = renderWith([
      { sheetRow: 95, customer: 'Shri Babula Dehuri', chassis: 'T6K14763', field: 'BOOKING DATE', value: '7/20/0025', issue: 'is not a date' },
      { sheetRow: 2, customer: 'M/s.Tridev Associates', chassis: 'T6K14760', field: 'BOOKING DATE', value: '23 Nov 2026',
        issue: 'is after the DELIVERY DATE 01 Nov 2026' },
    ]);
    expect(html).toContain('to correct in the dealership&#x27;s sheet');
    expect(html).toContain('Shri Babula Dehuri');
    expect(html).toContain('7/20/0025');
    expect(html).toContain('is after the DELIVERY DATE 01 Nov 2026');
    expect(html).toContain('>95<');
  });

  it('shows nothing when the sheet has no row to correct', () => {
    expect(renderWith([])).not.toContain('to correct in the dealership');
  });
});
