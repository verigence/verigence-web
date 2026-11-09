import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import P2ComplianceReportPage from '../P2ComplianceReportPage';

const stores = vi.hoisted(() => ({
  project: { tenantId: 't1' } as unknown,
  session: { accessToken: 'token' as string | undefined },
}));
vi.mock('../../store/projectContextStore', () => {
  const state = () => ({ selectedProject: stores.project, projects: [] });
  return {
    useProjectContextStore: Object.assign((select: (s: ReturnType<typeof state>) => unknown) => select(state()),
      { getState: state, subscribe: () => () => undefined }),
  };
});
vi.mock('../../store/sessionStore', () => {
  const state = () => stores.session;
  return {
    useSessionStore: Object.assign((select: (s: ReturnType<typeof state>) => unknown) => select(state()),
      { getState: state, subscribe: () => () => undefined }),
  };
});

const report = {
  generatedAtUtc: '2026-11-06T08:00:00Z',
  review: { status: 'REVIEWED', reviewedAtUtc: '2026-11-06T07:10:00Z', reviewerRole: 'TL', label: 'Reviewed by the Team Lead' },
  header: { customerDisplayName: 'BISWARAJ ENGINEERS', journeyReference: 'SHI-SS-261027-013' },
  summary: { totalFindings: 3, openFindings: 3, resolvedFindings: 0, highOrCriticalOpen: 0 },
  sections: [], resolvedHistory: [], duplicates: [], openTasks: [],
  verdict: { code: 'INCOMPLETE', label: 'Audit not complete', failedControls: 0, incompleteControls: 0, openTasks: 0, duplicatePairs: 0, highOrCriticalFindings: 0 },
  stage: { code: 'DELIVERY_COMPLETE', gates: {} },
  controls: {}, controlStatistics: { BOOKING: { pass: 0, total: 0 }, DELIVERY: { pass: 0, total: 0 } },
  deal: { summary: { net: {}, paid: {}, variance: {}, deliveryStarted: false }, sku: null, flaggedLines: [] },
  reviewerClosure: {
    closureId: 'c1', journeyId: 'j1', closedBy: 'r1', closedRole: 'REVIEWER', comment: 'No discount has been given here',
    itemCount: 1, counts: { OPEN_TASK: 1 }, deliveryOutcome: 'COMPLETED', closedAtUtc: '2026-11-06T08:20:00Z',
    acceptanceStatus: 'PENDING', acceptanceDueUtc: '2026-11-10T08:20:00Z', acceptanceTaskId: 't9',
    decidedBy: null, decidedRole: null, decidedAtUtc: null, rejections: [],
    items: [{ key: 'task:1', kind: 'OPEN_TASK', label: 'Fix pages that could not be processed', stage: 'DELIVERY',
      answer: 'The insurance re-scan is on file', answerSource: 'REVIEWER' }],
  },
};

function page(overrides: Record<string, unknown> = {}): string {
  const client = new QueryClient();
  client.setQueryData(['p2-360', 't1', 'j1', 'compliance-report'], { ...report, ...overrides });
  return renderToString(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/p2/journeys/j1/compliance-report']}>
        <Routes><Route path="/p2/journeys/:journeyId/compliance-report" element={<P2ComplianceReportPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  ).replaceAll('<!-- -->', '');
}

describe('the audit report (product owner 2026-11-06, crisp 2026-11-09)', () => {
  it('reads an older closure: its comment, and each answer as a justification, ahead of the details', () => {
    const html = page();
    expect(html).toContain('Audit report');
    expect(html).toContain('Remarks and sign-off');
    expect(html).toContain('No discount has been given here');
    expect(html).toContain('Not taken as observations');
    expect(html).toContain('The insurance re-scan is on file');
    expect(html).toContain('Closed by the Reviewer on');
    expect(html.indexOf('Remarks and sign-off')).toBeLessThan(html.indexOf('Details: journey, deal, checks and history'));
  });

  it('leads with observations by severity, what is missed and what is on file', () => {
    const html = page({
      documentChecklist: [
        { key: 'rto_challan', label: 'RTO Challan', stage: 'DELIVERY', requirement: 'MANDATORY', onFile: false },
        { key: 'customer_invoice', label: 'Customer Invoice (DMS)', stage: 'DELIVERY', requirement: 'MANDATORY', onFile: true },
      ],
      reviewerClosure: {
        ...report.reviewerClosure, remarks: 'Outlet asked to collect the signed NDC.',
        observations: [
          { key: 'finding:1', kind: 'OPEN_FINDING', label: 'Deal charged below the standard price', stands: true,
            severity: 'HIGH', justification: null, note: 'Insurance below standard', source: 'SYSTEM', tlRejection: null },
          { key: 'added:reviewer:1', kind: 'ADDED', label: 'Customer signature missing on the NDC', stands: true,
            severity: 'LOW', justification: null, note: null, source: 'REVIEWER', tlRejection: null },
          { key: 'task:1', kind: 'OPEN_TASK', label: 'Fix pages that could not be processed', stands: false,
            severity: null, justification: 'The insurance re-scan is on file', note: null, source: 'SYSTEM', tlRejection: null },
        ],
      },
    });
    expect(html).toContain('Documents on file</dt><dd>1 of 2');
    expect(html).toContain('High observations</dt><dd>1');
    expect(html).toContain('Low observations</dt><dd>1');
    expect(html).toContain('What is missed · 1');
    expect(html).toContain('RTO Challan');
    expect(html).toContain('Insurance below standard');
    expect(html).toContain('Outlet asked to collect the signed NDC.');
    expect(html.indexOf('aria-label="Observations"')).toBeLessThan(html.indexOf('aria-label="What is missed"'));
  });

  it('shows provisional observations before the journey is closed', () => {
    const html = page({
      reviewerClosure: null,
      observationCandidates: [{ key: 'finding:1', kind: 'OPEN_FINDING', label: 'Deal charged below the standard price',
        suggestedSeverity: 'HIGH', suggestedStands: true }],
    });
    expect(html).toContain('Provisional');
    expect(html).toContain('Deal charged below the standard price');
  });

  it('links to the uploaded files', () => {
    expect(page()).toContain('href="/p2/journeys/j1/overview?tab=files"');
  });
});
