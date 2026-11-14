import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import PerformanceView from '../PerformanceView';
import type { Performance, PerformancePerson } from '../../../../services/audit-core/uc03Performance';

const days = ['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
const zero = { filesUploaded: 0, journeysUploaded: 0, journeysClosed: 0, reviews: 0, tasksClosed: 0, pagesRejected: 0, activeMinutes: 0 };
function person(actorId: string, name: string, files: number[]): PerformancePerson {
  return {
    actorId, name, role: 'PC', activeToday: true, today: { ...zero, filesUploaded: files[6] }, usual: { ...zero }, standing: {} as PerformancePerson['standing'],
    series: { ...Object.fromEntries(Object.keys(zero).map((k) => [k, [0, 0, 0, 0, 0, 0, 0]])), filesUploaded: files } as PerformancePerson['series'],
    dutiesToday: {}, dutiesWindow: {},
  };
}
const place = { outletId: 'o1', outletName: 'Rasulgarh', dealerId: 'd1', dealerName: 'Adishakti' };
const base: Performance = {
  date: '2026-11-13', first: days[0], days, timezone: 'Asia/Kolkata', current: true, asOfUtc: '', own: false,
  measures: [{ key: 'filesUploaded', label: 'Files uploaded', group: 'OUTPUT', roles: ['PC'] }],
  schedules: [{ scheduleId: 's1', title: 'Daily gate pass', frequency: 'DAILY', status: 'ACTIVE', assignedRole: 'PC' }],
  plannedDuties: [{ title: 'Cash register', frequency: 'DAILY' }], peers: {}, notes: [],
  people: [person('a', 'Ravi', [10, 0, 12, 11, 9, 2, 10]), person('b', 'Asha', [4, 0, 5, 6, 5, 4, 5])],
  sections: [{ key: 'pending', label: '' }, { key: 'flow', label: '' }, { key: 'uploads', label: '' }, { key: 'quality', label: '' }, { key: 'tasks', label: '' }, { key: 'trend', label: '' },
    { key: 'efficiency', label: '' }, { key: 'duties', label: '' }],
  pending: {
    kinds: [{ key: 'deliveriesNotUploaded', label: 'Deliveries not uploaded' }, { key: 'deliveryFilesOpen', label: 'Delivery files not closed' },
      { key: 'paymentsNotReconciled', label: 'Payments not reconciled' }],
    buckets: ['Today', '1-3 days', '4-7 days', 'Older'],
    outlets: [{ ...place, counts: { deliveriesNotUploaded: [1, 0, 0, 0], deliveryFilesOpen: [2, 3, 1, 1], paymentsNotReconciled: [0, 4, 0, 0] } }],
    people: [{ actorId: 'a', name: 'Ravi', role: 'PC', counts: { deliveryFilesOpen: [2, 3, 1, 1] } }],
  },
  flow: { outlets: [{ ...place, days: { '2026-11-13': { bookings: 5, deliveries: 3, onRegister: 6, inTool: 4, notNotified: 1, notUploaded: 2, registerMissing: 0 } } }] },
  tasks: {
    outlets: [{ ...place, raised: [0, 0, 3, 2, 4, 1, 5], closed: [0, 0, 2, 2, 1, 1, 3], open: 12, overdue: 4 }],
    people: [{ actorId: 'a', name: 'Ravi', role: 'PC', raised: [0, 0, 3, 2, 4, 1, 5], closed: [0, 0, 2, 2, 1, 1, 3], open: 12, overdue: 4 }],
  },
  efficiency: { people: [{ actorId: 'a', name: 'Ravi', daysWorked: 6, deliveryStarted: 10, deliveryClosed: 4, closedShare: 40, daysToClose: 2.5,
    pagesUploaded: 200, pagesRejected: 10, firstTimeRight: 95, tasksWithDue: 10, tasksInTime: 9, tasksInTimeShare: 90, journeysPerDay: 7.5 }] },
  delinquency: { lines: [{ actorId: 'b', name: 'Asha', role: 'PC', scheduleId: 's1', due: 6, onTime: 4, late: 1, notDone: 1, pending: 0,
    missedDates: ['2026-11-12'], lateDates: [] }] },
  uploads: { outlets: [{ ...place, direct: [0, 0, 5, 5, 5, 5, 10], bulk: [0, 0, 0, 0, 0, 5, 5], drive: [0, 0, 0, 0, 0, 0, 10] }],
    people: [{ actorId: 'a', name: 'Ravi', role: 'PC', direct: [0, 0, 5, 5, 5, 5, 10], bulk: [0, 0, 0, 0, 0, 5, 5], drive: [0, 0, 0, 0, 0, 0, 10] }] },
  quality: { outlets: [{ ...place, pagesUploaded: 200, blurred: 12, faded: 10, tooSmall: 3, otherQuality: 0, duplicatePages: 7, duplicateFiles: 2 }],
    people: [{ actorId: 'a', name: 'Ravi', role: 'PC', pagesUploaded: 200, blurred: 12, faded: 10, tooSmall: 3, otherQuality: 0, duplicatePages: 7, duplicateFiles: 2 }] },
};

type TabKey = NonNullable<Parameters<typeof PerformanceView>[0]['initialDetail']>;
type ViewKey = NonNullable<Parameters<typeof PerformanceView>[0]['initialView']>;
const SECTION: Record<TabKey, string> = { backlog: 'pending', bookings: 'flow', deliveries: 'flow', uploads: 'uploads', quality: 'quality', failed: 'quality', tasks: 'tasks', trend: 'trend',
  efficiency: 'efficiency', duties: 'duties' };
const VIEW: Record<TabKey, ViewKey> = { backlog: 'pending', bookings: 'overview', deliveries: 'overview', uploads: 'uploads', quality: 'uploads', failed: 'uploads', tasks: 'tasks', trend: 'overview',
  efficiency: 'efficiency', duties: 'duties' };

/** The detail under a dashboard tab, opened. */
function render(data: Performance, tab: TabKey, dashboard?: Performance): string {
  const client = new QueryClient();
  client.setQueryData(['p2-performance', 't1', '2026-11-07', '2026-11-13', SECTION[tab]], data);
  if (dashboard) client.setQueryData(['p2-performance', 't1', '2026-11-07', '2026-11-13', 'dashboard'], dashboard);
  return renderToString(
    <QueryClientProvider client={client}>
      <PerformanceView tenantId="t1" accessToken="token" today="2026-11-13" initialView={VIEW[tab]} initialDetail={tab} />
    </QueryClientProvider>,
  ).replaceAll('<!-- -->', '');
}

describe('Performance view', () => {
  it('shows one tab at a time over a date range', () => {
    const html = render(base, 'backlog');
    expect(html).toContain('value="2026-11-07"');
    expect(html).toContain('value="2026-11-13"');
    // The dashboard a tab at a time; the detail of the open tab is a button under it.
    for (const tab of ['Overview', 'Pending', 'PC efficiency', 'Uploads, failures and duplicates', 'Tasks', 'Duties']) {
      expect(html).toMatch(new RegExp(`role="tab"[^>]*>${tab}<`));
    }
    expect(html).toMatch(/aria-pressed="true"[^>]*>Each kind with what is over 3 days</);
    expect(html).not.toContain('Bookings by outlet');
    // The backlog, with what is older than three days; nothing of the other tabs.
    expect(html).toContain('Deliveries not uploaded');
    expect(html).toContain('Payments not reconciled');
    expect(html).toContain('2 older than 3 days');
    expect(html).not.toContain('Deliveries per day');
    expect(html).not.toContain('Pages right first time');
  });

  it('shows each PC\'s files per channel with that channel\'s duplicates and errors (2026-11-14)', () => {
    const issues = { duplicates: { direct: 2, bulk: 1, drive: 0 }, errors: { direct: 3, bulk: 0, drive: 4 } };
    const data: Performance = { ...base, uploads: { outlets: [{ ...base.uploads!.outlets[0], ...issues }],
      people: [{ ...base.uploads!.people[0], ...issues }] } };
    const html = render(data, 'uploads');
    for (const head of ['Direct', 'Bulk upload', 'Google Drive', 'Files', 'Duplicates', 'Errors']) expect(html).toContain(`>${head}</th>`);
    // Rasulgarh (outlet first): direct 30 files, 2 duplicates, 3 errors; bulk 10, 1, 0; Drive 10, 0, 4.
    expect(html).toMatch(/Adishakti<\/div><\/th><td>30<\/td><td class="p2pf-warn">2<\/td><td class="p2pf-low">3<\/td><td>10<\/td><td class="p2pf-warn">1<\/td><td class="p2pf-zero">0<\/td><td>10<\/td><td class="p2pf-zero">0<\/td><td class="p2pf-low">4<\/td><td><strong>50<\/strong><\/td>/);
  });

  it('does not mark today while it is still going on, and names the dates (2026-11-14)', () => {
    const data: Performance = { ...base, people: [person('a', 'Ravi', [10, 0, 12, 11, 9, 2, 1])] };
    const html = render(data, 'trend');
    expect(html).toContain('Day to day · 7 Nov to 13 Nov');
    // Thu 12 (2, under half the usual) is marked; Fri 13, today (1 so far), is not.
    expect(html).toMatch(/<td class="p2pf-low">2<\/td><td>1<\/td>/);
  });

  it('keeps bookings and deliveries apart, the deliveries against the gate register day by day', () => {
    const bookings = render(base, 'bookings');
    expect(bookings).toContain('Bookings uploaded');
    expect(bookings).not.toContain('On register');
    const deliveries = render(base, 'deliveries');
    for (const head of ['Deliveries uploaded', 'On register', 'Not intimated', 'Not uploaded', 'Registers missed']) expect(deliveries).toContain(head);
    expect(deliveries).toMatch(/Fri 13<\/th><td><strong>3<\/strong><\/td><td>6<\/td><td class="p2mw-attn">1<\/td><td class="p2pf-low">2<\/td>/);
  });

  it('shows how direct, bulk and Drive uploads are used, and the duplicates and quality issues', () => {
    const uploads = render(base, 'uploads');
    expect(uploads).toContain('60% of 50 files');     // direct
    expect(uploads).toContain('Google Drive');
    const quality = render(base, 'quality');
    expect(quality).toContain('Duplicate files');
    expect(quality).toMatch(/<td class="p2pf-low">13%<\/td>/);   // 25 of 200 pages rejected
  });

  it('lists why each upload failed under uploads, read from the failed-uploads report only', () => {
    const client = new QueryClient();
    client.setQueryData(['p2-failed-uploads', 't1', '2026-11-07', '2026-11-13'], {
      from: '2026-11-07', to: '2026-11-13', truncated: false,
      rows: [{ kind: 'PAGE', journeyId: 'j1', journeyReference: 'OTF-1', customerName: 'Ravi Kumar', dealerName: 'Adishakti',
        outletName: 'Rasulgarh', filename: 'delivery.pdf', uploadedBy: 'a', uploadedByName: 'Ravi', uploadedAtUtc: '2026-11-12T05:00:00Z',
        failedAtUtc: '2026-11-12T05:30:00Z', pageNumbers: [3], attempts: 5, reason: 'Reading failed after 5 tries', code: 'DI_TIMEOUT',
        why: 'readFailed', clearedFromJourney: false, openUrl: null }],
    });
    const html = renderToString(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PerformanceView tenantId="t1" accessToken="token" today="2026-11-13" initialView="uploads" initialDetail="failed" />
        </MemoryRouter>
      </QueryClientProvider>,
    ).replaceAll('<!-- -->', '');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Why each upload failed</);
    expect(html).toContain('Reading failed after 5 tries');
    expect(html).toContain('Ravi Kumar');
    // No Performance section is read for it: the quality query stays disabled.
    expect(client.getQueryState(['p2-performance', 't1', '2026-11-07', '2026-11-13', 'quality'])?.fetchStatus ?? 'idle').toBe('idle');
    expect(client.getQueryData(['p2-performance', 't1', '2026-11-07', '2026-11-13', 'quality'])).toBeUndefined();
  });

  it('shows tasks new, closed, open and overdue, and whether the backlog grew', () => {
    const html = render(base, 'tasks');
    expect(html).toContain('New in the period');
    expect(html).toContain('Backlog change');
    expect(html).toContain('+6');     // 15 new, 9 closed
  });

  it('marks a day under half of a person\'s own average, not a Sunday', () => {
    const html = render(base, 'trend');
    expect(html).toMatch(/<td class="p2pf-low">2<\/td>/);
    expect(html).not.toMatch(/<td class="p2pf-low">—<\/td>/);
  });

  it('shows PC efficiency and delinquencies with the dates', () => {
    expect(render(base, 'efficiency')).toContain('4 of 10');
    const duties = render(base, 'duties');
    expect(duties).toContain('12 Nov');
    expect(duties).toContain('Not set up yet: Cash register (daily).');
  });

  it('leaves out the tabs a SuperAdmin has switched off for the role', () => {
    const html = render({ ...base, sections: [{ key: 'trend', label: '' }] }, 'trend');
    expect(html).toMatch(/role="tab"[^>]*>Overview</);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Each person, day by day</);
    expect(html).not.toMatch(/role="tab"[^>]*>Pending</);
    expect(html).not.toMatch(/role="tab"[^>]*>PC efficiency</);
  });

  it('opens on the dashboard of the role, a tab at a time, and reads no detail until asked', () => {
    const board: Performance = { ...base, people: [], sections: base.sections, dashboard: {
      view: 'PC', title: 'My dashboard', period: '7 Nov to 13 Nov', days, widgets: ['kpis', 'pending', 'tasks'],
      kpis: { title: 'What I did, 7 Nov to 13 Nov', tiles: [{ key: 'tasksClosed', label: 'Tasks closed', value: 38, hint: '4 on 13 Nov', tone: null }] },
      pending: { title: 'Waiting for me now', buckets: ['Today', '1-3 days', '4-7 days', 'Older'], kinds: [] },
      tasks: { raised: [0, 0, 3, 2, 4, 1, 5], closed: [0, 0, 2, 2, 1, 1, 3], open: 12, overdue: 4 },
    } };
    const client = new QueryClient();
    client.setQueryData(['p2-performance', 't1', '2026-11-07', '2026-11-13', 'dashboard'], board);
    const html = renderToString(
      <QueryClientProvider client={client}><PerformanceView tenantId="t1" accessToken="token" today="2026-11-13" /></QueryClientProvider>,
    ).replaceAll('<!-- -->', '');
    for (const tab of ['What I did', 'Waiting for me', 'Tasks']) expect(html).toMatch(new RegExp(`role="tab"[^>]*>${tab}<`));
    expect(html).toMatch(/aria-selected="true"[^>]*>What I did</);
    expect(html).toContain('Tasks closed');
    expect(html).toContain('38');
    expect(html).not.toContain('Waiting for me now');               // that is the next tab
    expect(html).toMatch(/aria-pressed="false"[^>]*>Each person, day by day</);
    expect(html).not.toContain('p2pf-table');                       // no detail table until one is opened
  });
});
