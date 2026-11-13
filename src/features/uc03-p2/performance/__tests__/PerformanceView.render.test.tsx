import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
  sections: [{ key: 'pending', label: '' }, { key: 'flow', label: '' }, { key: 'trend', label: '' }, { key: 'efficiency', label: '' }, { key: 'duties', label: '' }],
  pending: {
    kinds: [{ key: 'deliveryFilesOpen', label: 'Delivery files not closed' }, { key: 'tasksOverdue', label: 'Overdue tasks' }],
    buckets: ['Today', '1-3 days', '4-7 days', 'Older'],
    outlets: [{ ...place, counts: { deliveryFilesOpen: [2, 3, 1, 1], tasksOverdue: [0, 0, 0, 0] } }],
    people: [{ actorId: 'a', name: 'Ravi', role: 'PC', counts: { deliveryFilesOpen: [2, 3, 1, 1] } }],
  },
  flow: { outlets: [{ ...place, days: { '2026-11-13': { bookings: 5, deliveries: 3, onRegister: 6, inTool: 4, notNotified: 1, registerMissing: 0 } } }] },
  efficiency: { people: [{ actorId: 'a', name: 'Ravi', daysWorked: 6, deliveryStarted: 10, deliveryClosed: 4, closedShare: 40, daysToClose: 2.5,
    pagesUploaded: 200, pagesRejected: 10, firstTimeRight: 95, tasksWithDue: 10, tasksInTime: 9, tasksInTimeShare: 90, journeysPerDay: 7.5 }] },
  delinquency: { lines: [{ actorId: 'b', name: 'Asha', role: 'PC', scheduleId: 's1', due: 6, onTime: 4, late: 1, notDone: 1, pending: 0,
    missedDates: ['2026-11-12'], lateDates: [] }] },
};

function render(data: Performance): string {
  const client = new QueryClient();
  client.setQueryData(['p2-performance', 't1', '2026-11-13', '7'], data);
  return renderToString(
    <QueryClientProvider client={client}><PerformanceView tenantId="t1" accessToken="token" today="2026-11-13" /></QueryClientProvider>,
  ).replaceAll('<!-- -->', '');
}

describe('Performance view', () => {
  it('answers the five questions: pending, bookings and deliveries, day to day, efficiency, delinquencies', () => {
    const html = render(base);
    // Pending work, with what is older than three days.
    expect(html).toContain('Pending work');
    expect(html).toContain('2 older than 3 days');
    // Bookings and deliveries, with the gate register gap (6 on the register, 4 in Verigence).
    expect(html).toContain('Bookings and deliveries');
    expect(html).toContain('B 5 · D 3');
    expect(html).toContain('1 not notified to PC');
    // Day to day: a day under half of the person's own average is marked; Sunday is not.
    expect(html).toContain('Day to day');
    expect(html).toMatch(/<td class="p2pf-low">2<\/td>/);
    expect(html).not.toMatch(/<td class="p2pf-low">—<\/td>/);
    // PC efficiency and delinquencies.
    expect(html).toContain('40%');
    expect(html).toContain('4 of 10');
    expect(html).toContain('Delinquencies');
    expect(html).toContain('12 Nov');
    expect(html).toContain('Not set up yet: Cash register (daily).');
  });

  it('leaves out the sections a SuperAdmin has switched off for the role', () => {
    const html = render({ ...base, sections: [{ key: 'trend', label: '' }], pending: undefined, flow: undefined, efficiency: undefined, delinquency: undefined });
    expect(html).toContain('Day to day');
    expect(html).not.toContain('Pending work');
    expect(html).not.toContain('PC efficiency');
    expect(html).not.toContain('Delinquencies');
  });
});
