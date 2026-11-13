import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import P2MyTrackerPage from '../P2MyTrackerPage';
import { istDate, periodRange, type MyWork } from '../../services/audit-core/uc03MyWork';
import type { ProjectTracker, TrackerFigures } from '../../services/audit-core/uc03ProjectTracker';
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
        pendingWithPc: 1, notIntimated: 2, gatePassId: 'g1', pages: 2, uploadedAtUtc: new Date().toISOString() },
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

const zeroTasks = { raised: 0, closed: 0, closedByPc: 0, closedByLead: 0, closedByReviewer: 0, closedByOther: 0,
  closedBySystem: 0, open: 0, overdue: 0 };
const mine: TrackerFigures = {
  gatePass: { due: 1, onTime: 1, late: 0, missing: 0, notYetDue: 0, countsPending: 0, onRegister: 5, intimated: 3,
    notNotified: 2, uploadedInTool: 2, pendingWithPc: 1, stockTransfers: 0 },
  uploads: { files: 9, pages: 40, documents: 30, journeys: 6, bookings: 2, deliveries: 4, newJourneys: 2 },
  closed: { deliveryFiles: 3, reviewer: 1 },
  tasks: { journey: { ...zeroTasks, closed: 7, open: 2 }, taskManager: zeroTasks, all: { ...zeroTasks, closed: 7, open: 2 },
    byRole: {}, worked: { total: 7, byPc: 7, byLead: 0, byReviewer: 0, byOther: 0 } },
  recurring: {},
  channels: { directFiles: 5, directPages: 20, bulkFiles: 3, bulkPages: 15, driveFiles: 1, drivePages: 5 },
  reviews: { stagesReviewedByReviewer: 0, stagesReviewedByLead: 0, stagesReviewedByOther: 0, stagesAwaitingReview: 4,
    closedByReviewer: 0, closedByLead: 0, closedByOther: 0, accepted: 0, rejected: 0, autoAccepted: 0,
    awaitingDecision: 0, awaitingReview: 1 },
  failures: { files: 2, pages: 3, quality: 1, notRead: 2, readFailed: 0, notUploaded: 0 },
};
const today = istDate();
const tracker = {
  period: { kind: 'DAY', date: today, first: today, last: today, label: 'Today', timezone: 'Asia/Kolkata',
    startUtc: '', endUtc: '', asOfUtc: new Date().toISOString(), current: true },
  scope: { projectWide: false, outlets: 1, dealers: 1, own: true },
  schedules: [], totals: mine, notes: [],
  dealers: [{ ...mine, dealerId: 'd1', dealerName: 'Adishakti', outlets: [{ ...mine, outletId: 'o1',
    outletName: 'Rasulgarh', classification: 'ONSITE', people: [{ ...mine, actorId: 'pc1', name: 'Ravi', role: 'PC' }] }] }],
} as unknown as ProjectTracker;

function render(path: string): string {
  const client = new QueryClient();
  client.setQueryData(['p2-project-tracker', 't1', 'DAY', today], tracker);
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
    // Uploaded today: its counts can be corrected (2026-11-03).
    expect(html).toContain('href="/p2/gate-pass?edit=g1"');
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

  it('shows the PC their own figures: files direct, bulk and Drive, reviews, journeys closed and failed uploads', () => {
    const html = render('/p2/tracker?tab=figures');
    expect(html).toMatch(/<button[^>]*aria-selected="true"[^>]*>My figures/);
    expect(html).toContain('My figures by outlet');
    expect(html).toContain('Only your own work is counted here.');
    expect(html).toContain('5 direct · 3 bulk upload · 1 Drive');
    expect(html).toContain('Failed uploads');
    expect(html).toContain('1 not clear · 2 not read in time');
    // The team's links are not shown in a team member's own view.
    expect(html).not.toContain('Daily processing of this day');
  });
});
