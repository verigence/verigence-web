import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import PerformanceView from '../PerformanceView';
import type { Performance, PerformancePerson } from '../../../../services/audit-core/uc03Performance';

const days = ['2026-11-11', '2026-11-12', '2026-11-13'];
const zero = { filesUploaded: 0, journeysUploaded: 0, journeysClosed: 0, reviews: 0, tasksClosed: 0, pagesRejected: 0, activeMinutes: 0 };
function person(actorId: string, name: string, role: string, files: number, standing: 'above' | 'below'): PerformancePerson {
  return {
    actorId, name, role, activeToday: true,
    today: { ...zero, filesUploaded: files, activeMinutes: 200 },
    usual: { ...zero, filesUploaded: 4 },
    series: Object.fromEntries(Object.keys(zero).map((k) => [k, k === 'filesUploaded' ? [2, 6, files] : [0, 0, 0]])) as PerformancePerson['series'],
    standing: { ...Object.fromEntries(Object.keys(zero).map((k) => [k, null])), filesUploaded: standing } as PerformancePerson['standing'],
    dutiesToday: { s1: { due: 1, onTime: 1, late: 0, notDone: 0, pending: 0 } },
    dutiesWindow: { s1: { due: 3, onTime: 2, late: 0, notDone: 1, pending: 0 } },
  };
}
const base: Performance = {
  date: '2026-11-13', first: '2026-11-11', days, timezone: 'Asia/Kolkata', current: true, asOfUtc: '', own: false,
  measures: [
    { key: 'filesUploaded', label: 'Files uploaded', group: 'OUTPUT', roles: ['PC'] },
    { key: 'pagesRejected', label: 'Pages rejected', group: 'QUALITY', roles: ['PC'], lowerIsBetter: true },
    { key: 'activeMinutes', label: 'Active time', group: 'UTILISATION', roles: ['PC', 'TL'], unit: 'MINUTES' },
  ],
  schedules: [{ scheduleId: 's1', title: 'Daily gate pass', frequency: 'DAILY', status: 'ACTIVE', assignedRole: 'PC' }],
  plannedDuties: [{ title: 'Cash register', frequency: 'DAILY' }],
  peers: { PC: { people: 2, activeToday: 2, median: { ...zero, filesUploaded: 6 }, usualMedian: { ...zero, filesUploaded: 4 } } },
  people: [person('a', 'Ravi', 'PC', 9, 'above'), person('b', 'Asha', 'PC', 3, 'below')],
  notes: ['How it is counted.'],
};

function render(data: Performance): string {
  const client = new QueryClient();
  client.setQueryData(['p2-performance', 't1', '2026-11-13', '14'], data);
  return renderToString(
    <QueryClientProvider client={client}><PerformanceView tenantId="t1" accessToken="token" today="2026-11-13" /></QueryClientProvider>,
  ).replaceAll('<!-- -->', '');
}

describe('Performance view', () => {
  it('shows a lead their people by name, against their usual and their peers, with the duties', () => {
    const html = render(base);
    expect(html).toContain('Ravi');
    expect(html).toContain('Asha');
    expect(html).toContain('Above peers');
    expect(html).toContain('Below peers');
    expect(html).toContain('3h 20m');
    expect(html).toContain('Peers&#x27; median');
    expect(html).toContain('Daily gate pass');
    expect(html).toContain('Cash register');
    expect(html).toContain('Not set up yet');
  });

  it('shows a PC only their own day and the unnamed peer median', () => {
    const html = render({ ...base, own: true, people: [base.people[1]] });
    expect(html).toContain('My day');
    expect(html).toContain('Nobody else is named.');
    expect(html).toContain('Below peers');
    expect(html).not.toContain('Ravi');
    expect(html).not.toContain('Asha');
  });
});
