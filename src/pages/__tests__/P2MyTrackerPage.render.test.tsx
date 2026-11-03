import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import P2MyTrackerPage from '../P2MyTrackerPage';
import { periodRange, type MyWork } from '../../services/audit-core/uc03MyWork';
import type { MissingDocumentsReport } from '../../services/audit-core/uc03MissingDocuments';

vi.mock('../../store/projectContextStore', () => {
  const state = () => ({ selectedProject: { tenantId: 't1', operatingRole: 'PC' }, projects: [] });
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

const figures = {
  journeysUploaded: 4, bookingsUploaded: 1, deliveriesUpdated: 3, journeysCompleted: 2, gateRegisterDays: 1,
  gateRegisterUploaded: 1, registerTotal: 5, registerIntimated: 3, uploadedInTool: 2, pendingDeliveryFiles: 1,
  tasksWorked: 6, tasksClosed: 5,
};
const week = periodRange('week');
const work = {
  role: 'PC', from: week.from, to: week.to, by: 'day',
  outlets: [{ outletId: 'o1', outletName: 'Rasulgarh', dealerId: 'd1', dealerName: 'Adishakti', classification: 'ONSITE',
    journeysTotal: 14, ...figures, gateRegisterMissed: 0, notIntimated: 2, tasksPending: 9, gateRegister: [
      { date: week.to, label: 'Tue 3 Nov', dueAtUtc: '', status: 'DONE', total: 5, intimated: 3, uploadedInTool: 2,
        pendingWithPc: 1, notIntimated: 2, gatePassId: 'g1', pages: 2, uploadedAtUtc: '' },
      { date: '2026-10-31', label: 'Sat 31 Oct', dueAtUtc: '', status: 'MISSED', total: null, intimated: null,
        uploadedInTool: 0, pendingWithPc: null, notIntimated: null, gatePassId: null, pages: 0, uploadedAtUtc: null },
    ] }],
  totals: { journeysTotal: 14, ...figures, gateRegisterMissed: 0, notIntimated: 2, tasksPending: 9 },
  periods: [{ from: week.to, to: week.to, label: 'Tue 3 Nov', totals: figures,
    outlets: [{ outletId: 'o1', outletName: 'Rasulgarh', classification: 'ONSITE', ...figures,
      gateRegister: { date: week.to, label: 'Tue 3 Nov', dueAtUtc: '', status: 'DONE', total: 5, intimated: 3,
        uploadedInTool: 2, pendingWithPc: 1, notIntimated: 2, gatePassId: 'g1' } }] }],
} as unknown as MyWork;

const missing = {
  from: week.from, to: week.to, scope: 'ALL', totals: { journeys: 1, documents: 1 },
  byDocument: [{ name: 'RSA Invoice', requirementKey: 'rsa_invoice', count: 1 }],
  byDealer: [], byOutlet: [], outlets: [],
  days: [{ date: week.to, label: 'Tue 3 Nov', journeys: [] }],
  closeToCompletion: { top: 30, eligible: 1, heldByOtherTasks: 0, journeys: [{
    journeyId: 'j1', reference: 'ADI-1', customer: 'Asha Das', dealerId: 'd1', dealerName: 'Adishakti', outletId: 'o1',
    outletName: 'Rasulgarh', pcName: 'Ravi', basis: 'GATE_PASS', uploadDay: week.to, documents: ['RSA Invoice'],
    requirementKeys: ['rsa_invoice'], otherOpenTasks: 0, deliveryDate: week.to, deliveryLabel: 'Tue 3 Nov' }] },
} as unknown as MissingDocumentsReport;

function render(path: string): string {
  const client = new QueryClient();
  const by = week.from === week.to ? 'day' : 'day';
  client.setQueryData(['p2-my-work', 't1', week.from, week.to, by], work);
  client.setQueryData(['p2-missing-documents', 't1', week.from, week.to, '', week.from === week.to ? 20 : 30], missing);
  const page = (node: ReactNode) => (
    <QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{node}</MemoryRouter></QueryClientProvider>
  );
  return renderToString(page(<P2MyTrackerPage />)).replaceAll('<!-- -->', '');
}

describe('My Tracker', () => {
  it('opens on Daily updates: date wise rows, the gate register of the day, and the outlet table', () => {
    const html = render('/p2/tracker');
    expect(html).toMatch(/<button[^>]*role="tab"[^>]*aria-selected="true"[^>]*>Daily updates/);
    expect(html).toMatch(/<button[^>]*role="tab"[^>]*aria-selected="false"[^>]*>Missing documents/);
    expect(html).toContain('Date range');
    expect(html).toContain('Journeys completed');
    expect(html).toContain('Tue 3 Nov');
    expect(html).toContain('5 total · 3 intimated · 2 in tool');
    expect(html).toContain('Rasulgarh');
  });

  it('shows the gate register date wise, with the uploaded register to open', () => {
    const html = render('/p2/tracker?tab=register');
    expect(html).toMatch(/<button[^>]*aria-selected="true"[^>]*>Gate register/);
    expect(html).toContain('A day');
    expect(html).toContain('Page 1');
    expect(html).toContain('Page 2');
    expect(html).toContain('Missed');
    expect(html.indexOf('Tue 3 Nov')).toBeLessThan(html.indexOf('Sat 31 Oct'));
  });

  it('shows the missing documents with the files closest to completion', () => {
    const html = render('/p2/tracker?tab=missing');
    expect(html).toMatch(/<button[^>]*aria-selected="true"[^>]*>Missing documents/);
    expect(html).toContain('Closest to completion');
    expect(html).toContain('Asha Das');
    expect(html).toContain('RSA Invoice');
    expect(html).toContain('href="/p2/journeys/j1/documents"');
  });
});
