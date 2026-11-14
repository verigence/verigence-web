import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import Dashboard, { viewHas, viewLabel, type View } from '../Dashboard';
import { byPeriod, trendOption } from '../dashboardCharts';
import {
  cardTotals, dutyDayState, periodsOf, sortRows, type DashCard, type Dashboard as Board,
} from '../../../../services/audit-core/uc03Performance';

const days = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
const card: DashCard = {
  key: 'pcs', title: 'PCs', sort: 'deliveries', spark: 'Journeys uploaded, day by day',
  columns: [{ key: 'deliveries', label: 'Deliveries uploaded', kind: 'bar' }, { key: 'overdue', label: 'Overdue tasks', kind: 'alert' },
    { key: 'firstTime', label: 'Pages right first time', kind: 'pct' }],
  rows: [
    { id: 'a', name: 'Ravi', sub: 'Rasulgarh', spark: [2, 3, 0, 4, 1], values: { deliveries: 10, overdue: 0, firstTime: 96 } },
    { id: 'b', name: 'Asha', sub: 'Patia', spark: [0, 0, 0, 0, 0], values: { deliveries: 14, overdue: 3, firstTime: null } },
  ],
};
const team: Board = {
  view: 'TEAM', title: 'Team dashboard', period: '9 Nov to 13 Nov', days, widgets: ['kpis', 'pending', 'attention', 'trend', 'tasks', 'team', 'duties', 'quality', 'channels'],
  kpis: { title: 'Done, 9 Nov to 13 Nov', tiles: [{ key: 'bookings', label: 'Bookings uploaded', value: 1234, hint: '30 on 13 Nov', tone: null },
    { key: 'registers', label: 'Gate registers missed', value: 2, hint: 'outlet days with no register', tone: 'bad' }] },
  pending: { title: 'Pending now', buckets: ['Today', '1-3 days', '4-7 days', 'Older'], kinds: [
    { key: 'tasksOpen', label: 'Open tasks (PC)', total: 9, buckets: [3, 2, 3, 1], within: null },
    { key: 'tasksOverdue', label: 'Overdue tasks', total: 4, buckets: [0, 2, 2, 0], within: 'tasksOpen' },
    { key: 'awaitingDecision', label: 'Awaiting TL / PM', total: 0, buckets: [0, 0, 0, 0], within: null }],
  cards: [{ key: 'pcs', title: 'PCs', sort: 'old', columns: [{ key: 'tasksOpen', label: 'Open tasks (PC)', kind: 'num' }, { key: 'old', label: 'Waiting over 3 days', kind: 'alert' }],
    rows: [{ id: 'a', name: 'Ravi', sub: 'Rasulgarh', values: { tasksOpen: 6, old: 1 } }, { id: 'b', name: 'Asha', sub: 'Patia', values: { tasksOpen: 3, old: 3 } }] }] },
  efficiency: { note: 'Efficiency is the plain average of four shares.', card: { key: 'efficiency', title: 'PCs', sort: 'score',
    columns: [{ key: 'score', label: 'Efficiency', kind: 'score' }, { key: 'firstTime', label: 'Pages right first time', kind: 'pct' }],
    rows: [{ id: 'a', name: 'Ravi', sub: 'Rasulgarh', values: { score: 81, firstTime: 96 } }, { id: 'b', name: 'Asha', sub: 'Patia', values: { score: 44, firstTime: 70 } }] } },
  attention: { total: 3, lines: [{ tone: 'bad', who: 'Patia', text: 'Gate register not uploaded on 2 days' }] },
  trend: { title: 'Bookings and deliveries', series: [{ name: 'Bookings uploaded', data: [5, 6, 7, 8, 9] },
    { name: 'Deliveries on gate register', kind: 'line', data: [4, 4, 4, 4, 4] }] },
  tasks: { raised: [1, 2, 3, 4, 5], closed: [1, 1, 1, 1, 1], open: 9, overdue: 4 },
  scorecards: [card, { ...card, key: 'outlets', title: 'Outlets' }],
  duties: { rows: [{ title: 'Daily gate register', frequency: 'DAILY', due: 10, onTime: 8, late: 1, notDone: 1, pending: 0,
    days: days.map((date, i) => ({ date, due: 2, onTime: i === 1 ? 1 : 2, late: 0, notDone: i === 1 ? 1 : 0, pending: 0 })),
    missedBy: [{ name: 'Asha', dates: ['2026-11-10'] }] }], planned: [{ title: 'Cash register' }] },
  quality: { pagesUploaded: 200, rejected: 30, rightFirstTime: 85, reasons: [{ key: 'blurred', label: 'Blurred', value: 30 }], duplicatePages: 7, duplicateFiles: 2 },
  channels: { direct: 60, bulk: 30, drive: 10 },
};
const periods = periodsOf(days, 'DAILY');
const VIEWS: View[] = ['overview', 'pending', 'team', 'efficiency', 'uploads', 'tasks', 'duties'];
const tab = (board: Board, view: View) => renderToString(
  <Dashboard board={board} view={view} periods={periods} asOf="2026-11-13T09:00:00Z" />,
).replaceAll('<!-- -->', '');
/** Every tab the board has, one after the other. */
const render = (board: Board) => VIEWS.filter((v) => viewHas(board, v)).map((v) => tab(board, v)).join('\n');

describe('The dashboard of each role', () => {
  it('shows a lead what was done, what is pending by age, who needs attention and each person', () => {
    const html = render(team);
    expect(html).toContain('Team dashboard');
    expect(html).toContain('1,234');
    expect(html).toContain('Pending now');
    expect(html).toContain('of which overdue tasks');
    expect(html).toContain('4 over 3 days');                       // the open tasks older than three days
    expect(html).toMatch(/<strong>Patia<\/strong> Gate register not uploaded on 2 days/);
    expect(html).toContain('2 more in the tabs above.');
    expect(html).toContain('Who is doing what');
    expect(html).toMatch(/Asha<span class="p2db-sub">Patia<\/span>[\s\S]*Ravi<span class="p2db-sub">Rasulgarh/);   // most deliveries first
    expect(html).toContain('no activity');
    expect(html).toContain('8 of 10 on time');
    expect(html).toMatch(/<strong>Asha<\/strong> missed 10 Nov/);
    expect(html).toContain('Not set up yet');
    expect(html).toContain('85%');
    expect(html).toContain('Google Drive');
    expect(html).toContain('Failed, to upload again (now)');
  });

  it('is a tab at a time: each tab carries its own blocks and nothing of the others', () => {
    expect(VIEWS.filter((v) => viewHas(team, v))).toEqual(VIEWS);
    const overview = tab(team, 'overview');
    expect(overview).toContain('Bookings uploaded');
    expect(overview).toContain('Needs attention');
    expect(overview).not.toContain('Pending now');
    expect(overview).not.toContain('Who is doing what');
    expect(tab(team, 'uploads')).toContain('How files come in');
    expect(tab(team, 'uploads')).not.toContain('Needs attention');
    expect(tab(team, 'pending')).toContain('Pending now');
    expect(VIEWS.map((v) => viewLabel(v, team))).toEqual(['Overview', 'Pending', 'Team and outlets', 'Efficiency', 'Uploads, failures and duplicates', 'Tasks', 'Duties']);
    // The backlog of each PC under the pending work, most waiting over three days first.
    expect(tab(team, 'pending')).toMatch(/Backlog of each[\s\S]*Asha[\s\S]*Ravi/);
    // Each PC's efficiency, the best first, with how it is calculated.
    const efficiency = tab(team, 'efficiency');
    expect(efficiency).toMatch(/Ravi[\s\S]*81%[\s\S]*Asha[\s\S]*44%/);
    expect(efficiency).toContain('Efficiency is the plain average of four shares.');
    // The Reviewers beside the PCs (2026-11-14: "why no reviewer is being shown in reports to TL").
    const pcs = team.efficiency!.card!;
    const reviewers: DashCard = { key: 'reviewers', title: 'Reviewers', sort: 'score', columns: pcs.columns,
      rows: [{ id: 'r', name: 'Priyanka', sub: 'All outlets', values: { score: 26, firstTime: null } }] };
    const both = tab({ ...team, efficiency: { ...team.efficiency!, cards: [pcs, reviewers] } }, 'efficiency');
    expect(both).toContain('Efficiency of each person');
    expect(both).toMatch(/>Reviewers</);
    expect(viewHas({ ...team, efficiency: { note: '', cards: [{ ...pcs, rows: [] }, reviewers] } }, 'efficiency')).toBe(true);
    expect(viewLabel('pending', { ...team, view: 'PC' })).toBe('Waiting for me');
    expect(viewLabel('overview', { ...team, view: 'REVIEWER' })).toBe('What I did');
  });

  it('shows only the blocks the server sent (a SuperAdmin hid the rest for the role)', () => {
    const { pending: _p, scorecards: _s, attention: _a, ...rest } = team;
    const html = render({ ...rest, widgets: ['kpis', 'trend'] });
    expect(html).not.toContain('Pending now');
    expect(html).not.toContain('Who is doing what');
    expect(html).not.toContain('Needs attention');
    expect(html).toContain('Bookings and deliveries');
    expect(VIEWS.filter((v) => viewHas({ ...rest, widgets: ['kpis', 'trend'] }, v))).toEqual(['overview', 'efficiency', 'uploads', 'tasks', 'duties']);
    expect(VIEWS.some((v) => viewHas({ view: 'TEAM', title: 'Team dashboard', period: '13 Nov', days, widgets: [] }, v))).toBe(false);
  });

  it('shows a PC their own work and where they stand against unnamed peers', () => {
    const html = render({
      view: 'PC', title: 'My dashboard', period: '9 Nov to 13 Nov', days, widgets: ['kpis', 'pending', 'duties', 'team'],
      kpis: { title: 'What I did, 9 Nov to 13 Nov', tiles: [{ key: 'firstTime', label: 'Pages right first time', value: '88%', hint: '12 of 100 pages rejected', tone: 'warn' }] },
      pending: { title: 'Waiting for me now', buckets: ['Today', '1-3 days', '4-7 days', 'Older'], kinds: [
        { key: 'deliveryFilesOpen', label: 'Delivery files not closed', total: 0, buckets: [0, 0, 0, 0], within: null }] },
      duties: { rows: [{ title: 'Daily gate register', frequency: 'DAILY', due: 5, onTime: 4, late: 0, notDone: 1, pending: 0,
        days: days.map((date, i) => ({ date, due: 1, onTime: i === 2 ? 0 : 1, late: 0, notDone: i === 2 ? 1 : 0, pending: 0 })), missedBy: [] }], planned: [] },
      peers: { title: 'Me and my peers, a working day', people: 12, rows: [{ key: 'pagesRejected', label: 'Pages rejected', me: 8, peers: 3 }] },
      efficiency: { note: 'Efficiency is the plain average of four shares.', mine: { score: 72, peers: 80, daysToClose: 2.5, perDay: 6.4, daysWorked: 5,
        parts: [{ key: 'firstTime', label: 'Pages right first time', value: 88, detail: '12 of 100 pages rejected' },
          { key: 'inTime', label: 'Tasks closed in time', value: null, detail: '0 of 0 tasks with a due time' }] } },
    });
    expect(html).toContain('My efficiency');
    expect(html).toContain('72%');
    expect(html).toContain('the middle of my peers is 80%');
    expect(html).toContain('12 of 100 pages rejected');
    expect(html).toContain('My dashboard');
    expect(html).toContain('Nothing is waiting.');
    expect(html).toContain('My duties');
    expect(html).toContain('11 Nov: Missed');
    expect(html).toContain('Pages rejected (fewer is better)');
    expect(html).toContain('Nobody is named.');
  });
});

describe('Dashboard figures', () => {
  it('orders a scorecard by a column, with no figure last', () => {
    expect(sortRows(card.rows, 'deliveries', true).map((r) => r.id)).toEqual(['b', 'a']);
    expect(sortRows(card.rows, 'name', false).map((r) => r.name)).toEqual(['Asha', 'Ravi']);
    expect(sortRows(card.rows, 'firstTime', true).map((r) => r.id)).toEqual(['a', 'b']);
  });
  it('totals the countable columns only', () => {
    expect(cardTotals(card)).toEqual({ deliveries: 24, overdue: 3, firstTime: null });
  });
  it('reads a duty day: missed before late before open', () => {
    expect(dutyDayState({ date: 'd', due: 0 })).toBe('none');
    expect(dutyDayState({ date: 'd', due: 3, onTime: 1, late: 1, notDone: 1 })).toBe('missed');
    expect(dutyDayState({ date: 'd', due: 2, onTime: 1, late: 1 })).toBe('late');
    expect(dutyDayState({ date: 'd', due: 1, pending: 1 })).toBe('pending');
    expect(dutyDayState({ date: 'd', due: 1, onTime: 1 })).toBe('done');
  });
  it('adds the days of a week together and draws what it is measured against as a line', () => {
    const weekly = periodsOf(days, 'WEEKLY');
    expect(byPeriod(team.trend!.series, weekly)[0].data).toEqual([35]);
    const option = trendOption(team.trend!.series, periods)!;
    expect(option.series.map((s) => s.type)).toEqual(['bar', 'line']);
    expect(trendOption([{ name: 'x', data: [0, 0, 0, 0, 0] }], periods)).toBeNull();
  });
});
