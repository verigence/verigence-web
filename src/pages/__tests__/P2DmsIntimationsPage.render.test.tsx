import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import P2DmsIntimationsPage from '../P2DmsIntimationsPage';
import type { IntimationList, IntimationSetup } from '../../services/audit-core/uc03DmsIntimations';

vi.mock('../../store/projectContextStore', () => {
  const state = () => ({ selectedProject: { tenantId: 't1' }, projects: [] });
  return {
    useProjectContextStore: Object.assign((select: (s: ReturnType<typeof state>) => unknown) => select(state()),
      { getState: state, subscribe: () => () => undefined }),
  };
});
vi.mock('../../store/sessionStore', () => {
  const state = () => ({ accessToken: 'token' });
  return {
    useSessionStore: Object.assign((select: (s: ReturnType<typeof state>) => unknown) => select(state()),
      { getState: state, subscribe: () => () => undefined }),
  };
});

const setup: IntimationSetup = {
  dealers: [{ dealerId: 'd1', dealerName: 'Utkal', groups: [], groupOutlets: [],
    booking: { dumpDate: '2026-11-20', previousDumpDate: '2026-11-19' },
    delivery: { dumpDate: null, previousDumpDate: null } }],
  canMark: true, canSeeCounter: false, today: '2026-11-20',
};

function render(report: IntimationList['report']): string {
  const client = new QueryClient();
  client.setQueryData(['dms-intimation-setup', 't1'], setup);
  client.setQueryData(['dms-intimations', 't1', 'BOOKING', 'd1', 'new', ''], {
    kind: 'BOOKING', dealerId: 'd1', dealerName: 'Utkal', view: 'new',
    dump: { dumpId: 'u1', dumpDate: '2026-11-20', previousDumpDate: '2026-11-19', matchedAtUtc: '2026-11-20T08:25:06Z' }, report,
    counts: { new: 0, open: 0, month: 0 }, newStates: { IN_VERIGENCE: 0, INTIMATED: 0, OPEN: 0 }, items: [],
  } satisfies IntimationList);
  return renderToString(
    <QueryClientProvider client={client}><MemoryRouter initialEntries={['/p2/dms-intimations']}>
      <P2DmsIntimationsPage />
    </MemoryRouter></QueryClientProvider>,
  ).replaceAll('<!-- -->', '');
}

describe('Booking Intimation once the DMS report is generated (20 Nov 2026)', () => {
  it('notes and pops that the report has already been generated', () => {
    const html = render({ reportId: 'r1', reportDate: '2026-11-20', generatedBy: 'Priyanka Baral',
      generatedAtUtc: '2026-11-20T11:00:00Z' });
    expect(html).toContain('The DMS report has already been generated');
    expect(html).toMatch(/role="alertdialog"[^>]*>.*Report has already been generated/s);
    expect(html).toContain('let the Reviewer / TL know so that they can re-generate the report');
    expect(html).toContain('wait for the next dump to be uploaded to sync with Verigence');
    expect(html).toContain('Priyanka Baral');
  });

  it('offers Refresh from Verigence and says when the dump was last checked (21 Nov 2026)', () => {
    const html = render(null);
    expect(html).toContain('Refresh from Verigence');
    expect(html).toContain('Checked with Verigence 20 Nov');
  });

  it('says nothing before a report is generated', () => {
    const html = render(null);
    expect(html).not.toContain('already been generated');
    expect(html).not.toContain('alertdialog');
  });
});
