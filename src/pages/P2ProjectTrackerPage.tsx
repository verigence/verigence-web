import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-my-work.css';
import '../styles/uc03-p2-project-tracker.css';
import '../styles/uc03-p2-daily-report.css';
import '../styles/uc03-p2-gate-pass.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import SupervisorGatePass from '../features/uc03-p2/gatepass/SupervisorGatePass';
import PerformanceView from '../features/uc03-p2/performance/PerformanceView';
import { Segment, Tile } from '../features/uc03-p2/my-work/MyWorkParts';
import { DailyProcessingReport } from './P2DailyProcessingReportPage';
import { istDate } from '../services/audit-core/uc03MyWork';
import {
  dailyProcessingDay,
  FAILURE_WHY,
  getFailedUploads,
  getProjectTracker,
  hasNextPeriod,
  shiftPeriod,
  trackerFromSearch,
  trackerLabel,
  trackerRange,
  trackerSearch,
  trackerTabFromSearch,
  trackerTabHref,
  TRACKER_TABS,
  type ProjectTracker,
  type FailedRow,
  type TaskSection,
  type TrackerFigures,
  type TrackerPeriod,
  type TrackerSchedule,
  type TrackerTab,
} from '../services/audit-core/uc03ProjectTracker';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

type View = 'overview' | 'gatePass' | 'files' | 'drive' | 'reviews' | 'failures' | 'tasks' | 'recurring';
type TaskScope = 'all' | 'journey' | 'taskManager';

const PERIOD_OPTIONS: Array<{ key: TrackerPeriod; label: string }> = [
  { key: 'DAY', label: 'Day' },
  { key: 'WEEK', label: 'Week' },
  { key: 'MONTH', label: 'Month' },
];
const VIEW_OPTIONS: Array<{ key: View; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'gatePass', label: 'Gate pass' },
  { key: 'files', label: 'Files' },
  { key: 'drive', label: 'Drive uploads' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'failures', label: 'Failed uploads' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'recurring', label: 'Recurring tasks' },
];
const TASK_SCOPES: Array<{ key: TaskScope; label: string }> = [
  { key: 'all', label: 'All tasks' },
  { key: 'journey', label: 'Journey tasks' },
  { key: 'taskManager', label: 'Task Manager' },
];
const ROLE_LABELS: Record<string, string> = {
  PC: 'PC', TL: 'TL', PM: 'PM', EXECUTIVE: 'Executive', REVIEWER: 'Reviewer', CRM: 'CRM', OTHER: 'Other',
};

const NO_CHANNELS = { directFiles: 0, directPages: 0, bulkFiles: 0, bulkPages: 0, driveFiles: 0, drivePages: 0 };
const NO_REVIEWS = { stagesReviewedByReviewer: 0, stagesReviewedByLead: 0, stagesReviewedByOther: 0, stagesAwaitingReview: 0,
  closedByReviewer: 0, closedByLead: 0, closedByOther: 0, accepted: 0, rejected: 0, autoAccepted: 0,
  awaitingDecision: 0, awaitingReview: 0 };
const NO_FAILURES = { files: 0, pages: 0, quality: 0, notRead: 0, readFailed: 0, notUploaded: 0 };
const ch = (f: TrackerFigures) => f.channels ?? NO_CHANNELS;
const rv = (f: TrackerFigures) => f.reviews ?? NO_REVIEWS;
const fl = (f: TrackerFigures) => f.failures ?? NO_FAILURES;

type Column = {
  key: string;
  label: string;
  value: (f: TrackerFigures) => number;
  /** What the cell shows, when not the number itself. */
  show?: (f: TrackerFigures) => string;
  /** Highlight a non-zero figure. */
  attention?: boolean;
  /** The existing page with the detail. */
  to?: string;
  title?: string;
};

function taskColumns(scope: TaskScope, links: Links): Column[] {
  const pick = (f: TrackerFigures): TaskSection => f.tasks[scope];
  const to = scope === 'taskManager' ? links.taskManager : links.tasks;
  return [
    { key: 't-raised', label: 'Raised', value: (f) => pick(f).raised, to },
    { key: 't-closed', label: 'Closed', value: (f) => pick(f).closed, to },
    { key: 't-pc', label: 'Closed by PC', value: (f) => pick(f).closedByPc },
    { key: 't-lead', label: 'Closed by TL / PM / Exec', value: (f) => pick(f).closedByLead },
    { key: 't-rev', label: 'Closed by Reviewer', value: (f) => pick(f).closedByReviewer },
    { key: 't-sys', label: 'Closed by system', value: (f) => pick(f).closedBySystem,
      title: 'Closed by a machine re-check that found the problem gone' },
    { key: 't-open', label: 'Open at end', value: (f) => pick(f).open, to },
    { key: 't-over', label: 'Overdue', value: (f) => pick(f).overdue, attention: true, to },
    ...(scope === 'all' ? [{ key: 't-worked', label: 'Worked', value: (f: TrackerFigures) => f.tasks.worked.total,
      title: 'Tasks a person acted on in the period' }] : []),
  ];
}

function recurringColumns(schedules: TrackerSchedule[], links: Links): Column[] {
  return schedules.flatMap((s) => {
    const r = (f: TrackerFigures) => f.recurring[s.scheduleId] ?? { due: 0, onTime: 0, late: 0, incomplete: 0, overdue: 0, pending: 0 };
    return [
      { key: `r-${s.scheduleId}-done`, label: `${s.title}: done`, value: (f: TrackerFigures) => r(f).onTime + r(f).late,
        show: (f: TrackerFigures) => (r(f).due ? `${r(f).onTime + r(f).late} / ${r(f).due}` : '—'), to: links.taskManager,
        title: `${frequencyLabel(s.frequency)} · done (on time or late) of the occurrences due` },
      { key: `r-${s.scheduleId}-late`, label: 'Late', value: (f: TrackerFigures) => r(f).late },
      { key: `r-${s.scheduleId}-not`, label: 'Not done', value: (f: TrackerFigures) => r(f).incomplete + r(f).overdue,
        attention: true, title: 'Incomplete, or still open past its due time' },
      { key: `r-${s.scheduleId}-pending`, label: 'Not yet due', value: (f: TrackerFigures) => r(f).pending },
    ];
  });
}

function frequencyLabel(frequency: string): string {
  return frequency === 'DAILY' ? 'Daily' : frequency === 'WEEKLY' ? 'Weekly' : frequency === 'MONTHLY' ? 'Monthly' : frequency;
}

type Links = { gatePass: string; tasks?: string; taskManager: string; bookings?: string };

function columnsFor(view: View, scope: TaskScope, data: ProjectTracker, links: Links): Column[] {
  const gp = links.gatePass;
  if (view === 'gatePass') {
    return [
      { key: 'g-due', label: 'Registers due', value: (f) => f.gatePass.due, to: gp },
      { key: 'g-on', label: 'On time', value: (f) => f.gatePass.onTime, to: gp },
      { key: 'g-late', label: 'Late', value: (f) => f.gatePass.late, to: gp },
      { key: 'g-miss', label: 'Missing', value: (f) => f.gatePass.missing, attention: true, to: gp },
      { key: 'g-wait', label: 'Not yet due', value: (f) => f.gatePass.notYetDue },
      { key: 'g-counts', label: 'Counts pending', value: (f) => f.gatePass.countsPending, attention: true },
      { key: 'g-reg', label: 'On register', value: (f) => f.gatePass.onRegister, title: 'Deliveries on the gate register' },
      { key: 'g-int', label: 'Intimated to PC', value: (f) => f.gatePass.intimated },
      { key: 'g-nn', label: 'Not notified', value: (f) => f.gatePass.notNotified, title: 'Deliveries not intimated to the PC' },
      { key: 'g-tool', label: 'In tool', value: (f) => f.gatePass.uploadedInTool, title: 'Delivery files with the vehicle gate pass of that day' },
      { key: 'g-pend', label: 'Pending with PC', value: (f) => f.gatePass.pendingWithPc, attention: true },
      { key: 'g-st', label: 'Stock transfers', value: (f) => f.gatePass.stockTransfers },
    ];
  }
  if (view === 'files') {
    const b = links.bookings;
    return [
      // How the files came in (product owner 2026-11-13).
      { key: 'f-direct', label: 'Direct', value: (f) => ch(f).directFiles, title: 'Files uploaded on their own, from the app or the web' },
      { key: 'f-bulk', label: 'Bulk upload', value: (f) => ch(f).bulkFiles, title: 'Files of a bulk (folder) upload' },
      { key: 'f-drive', label: 'Google Drive', value: (f) => ch(f).driveFiles, title: 'Files taken from the Project\'s Google Drive' },
      { key: 'f-new', label: 'New journeys', value: (f) => f.uploads.newJourneys, to: b },
      { key: 'f-j', label: 'Journeys uploaded', value: (f) => f.uploads.journeys, to: b },
      { key: 'f-b', label: 'Bookings', value: (f) => f.uploads.bookings, to: b },
      { key: 'f-d', label: 'Deliveries', value: (f) => f.uploads.deliveries, to: b },
      { key: 'f-files', label: 'Files', value: (f) => f.uploads.files },
      { key: 'f-pages', label: 'Pages', value: (f) => f.uploads.pages },
      { key: 'f-docs', label: 'Documents', value: (f) => f.uploads.documents },
      { key: 'f-dup', label: 'Duplicates deleted', value: (f) => f.uploads.duplicatesDeleted ?? 0, attention: true,
        to: '/p2/duplicate-bookings', title: 'Uploads the system deleted as the same file uploaded again (from 12 Nov 2026)' },
      { key: 'f-closed', label: 'Delivery files closed', value: (f) => f.closed.deliveryFiles, to: b },
      { key: 'f-rev', label: 'Closed by Reviewer', value: (f) => f.closed.reviewer },
    ];
  }
  if (view === 'drive') {
    // The files PCs keep in the Project's Google Drive (product owner 2026-11-12).
    const d = '/p2/drive-uploads';
    return [
      { key: 'd-files', label: 'Files received', value: (f) => f.drive?.files ?? 0, to: d },
      { key: 'd-taken', label: 'Taken', value: (f) => f.drive?.taken ?? 0, to: d },
      { key: 'd-wait', label: 'Waiting', value: (f) => f.drive?.waiting ?? 0, attention: true, to: d },
      { key: 'd-dup', label: 'Duplicates', value: (f) => f.drive?.duplicates ?? 0, title: 'Exact duplicates: not read again' },
      { key: 'd-aside', label: 'Not taken', value: (f) => f.drive?.setAside ?? 0, attention: true,
        title: 'Files that could not be taken: wrong type, no outlet, or the booking is closed' },
      { key: 'd-fail', label: 'Failed', value: (f) => f.drive?.failed ?? 0, attention: true },
      { key: 'd-pages', label: 'Pages', value: (f) => f.drive?.pages ?? 0 },
      { key: 'd-read', label: 'Pages read', value: (f) => f.drive?.pagesRead ?? 0 },
      { key: 'd-rescan', label: 'To scan again', value: (f) => f.drive?.pagesToRescan ?? 0, attention: true, to: d },
      { key: 'd-mv', label: 'Manual verification tasks', value: (f) => f.drive?.manualVerificationTasks ?? 0 },
    ];
  }
  if (view === 'reviews') {
    return [
      { key: 'r-sr', label: 'Reviewed by Reviewer', value: (f) => rv(f).stagesReviewedByReviewer,
        title: 'Booking or Delivery documents marked reviewed by a Reviewer, on the Reviewer\'s row' },
      { key: 'r-sl', label: 'Reviewed by TL / PM', value: (f) => rv(f).stagesReviewedByLead + rv(f).stagesReviewedByOther,
        title: 'Booking or Delivery documents marked reviewed by a TL, PM or Executive' },
      { key: 'r-sa', label: 'Awaiting review', value: (f) => rv(f).stagesAwaitingReview, attention: true,
        title: 'Booking or Delivery stages with documents and no reviewed mark yet (on the Journey\'s PC\'s row)' },
      { key: 'r-rev', label: 'Journeys closed by Reviewer', value: (f) => rv(f).closedByReviewer,
        title: 'Journeys a Reviewer closed in the period, on the Reviewer\'s row' },
      { key: 'r-lead', label: 'Closed by TL / PM', value: (f) => rv(f).closedByLead + rv(f).closedByOther,
        title: 'Journeys a TL, PM or Executive closed themselves' },
      { key: 'r-acc', label: 'Accepted by TL / PM', value: (f) => rv(f).accepted, title: 'On the row of the TL or PM who decided' },
      { key: 'r-auto', label: 'Auto-accepted', value: (f) => rv(f).autoAccepted, title: 'Not decided within 96 hours' },
      { key: 'r-rej', label: 'Rejected', value: (f) => rv(f).rejected, attention: true },
      { key: 'r-dec', label: 'Awaiting TL / PM', value: (f) => rv(f).awaitingDecision, attention: true,
        title: 'Closed by the Reviewer, not yet accepted or rejected' },
      { key: 'r-open', label: 'Ready to close', value: (f) => rv(f).awaitingReview, attention: true,
        title: 'Delivery files closed by the PC that no Reviewer has closed yet (on the Journey\'s PC\'s row)' },
      { key: 'r-closed', label: 'Delivery files closed', value: (f) => f.closed.deliveryFiles },
    ];
  }
  if (view === 'failures') {
    return [
      { key: 'x-files', label: 'Files failed', value: (f) => fl(f).files, attention: true,
        title: 'Files uploaded in the period with a page that failed for good' },
      { key: 'x-pages', label: 'Pages failed', value: (f) => fl(f).pages },
      { key: 'x-q', label: FAILURE_WHY.quality.label, value: (f) => fl(f).quality, title: FAILURE_WHY.quality.hint },
      { key: 'x-nr', label: FAILURE_WHY.notRead.label, value: (f) => fl(f).notRead, attention: true, title: FAILURE_WHY.notRead.hint },
      { key: 'x-rf', label: FAILURE_WHY.readFailed.label, value: (f) => fl(f).readFailed, attention: true, title: FAILURE_WHY.readFailed.hint },
      { key: 'x-nu', label: FAILURE_WHY.notUploaded.label, value: (f) => fl(f).notUploaded, attention: true, title: FAILURE_WHY.notUploaded.hint },
    ];
  }
  if (view === 'tasks') return taskColumns(scope, links);
  if (view === 'recurring') return recurringColumns(data.schedules, links);
  // The day of each person (product owner 2026-11-13): gate register, files by how they came in,
  // journeys closed, reviews, tasks and failed uploads.
  return [
    { key: 'o-gp', label: 'Gate register', value: (f) => f.gatePass.onTime + f.gatePass.late,
      show: (f) => (f.gatePass.due ? `${f.gatePass.onTime + f.gatePass.late} / ${f.gatePass.due}` : '—'), to: gp,
      title: 'Registers uploaded of the registers due' },
    { key: 'o-gpm', label: 'Missing', value: (f) => f.gatePass.missing, attention: true, to: gp },
    { key: 'o-direct', label: 'Direct', value: (f) => ch(f).directFiles, title: 'Files uploaded on their own, from the app or the web' },
    { key: 'o-bulk', label: 'Bulk upload', value: (f) => ch(f).bulkFiles, title: 'Files of a bulk (folder) upload' },
    { key: 'o-drive', label: 'Drive', value: (f) => ch(f).driveFiles, title: 'Files taken from the Project\'s Google Drive' },
    { key: 'o-j', label: 'Journeys uploaded', value: (f) => f.uploads.journeys, to: links.bookings },
    { key: 'o-closed', label: 'Delivery files closed', value: (f) => f.closed.deliveryFiles },
    { key: 'o-jc', label: 'Journeys closed', value: (f) => f.closed.reviewer, title: 'Journeys a Reviewer closed' },
    { key: 'o-rv', label: 'Reviews closed', value: (f) => rv(f).stagesReviewedByReviewer + rv(f).stagesReviewedByLead + rv(f).stagesReviewedByOther,
      title: 'Booking or Delivery documents marked reviewed by a Reviewer, TL or PM, on the row of who marked them; see Reviews for who' },
    { key: 'o-ro', label: 'Reviews open', value: (f) => rv(f).stagesAwaitingReview, attention: true,
      title: 'Booking or Delivery stages with documents and no reviewed mark yet' },
    { key: 'o-tc', label: 'Tasks closed', value: (f) => f.tasks.all.closed, to: links.tasks },
    { key: 'o-to', label: 'Tasks open', value: (f) => f.tasks.all.open, to: links.tasks },
    { key: 'o-fail', label: 'Failed uploads', value: (f) => fl(f).files, attention: true,
      title: 'Files uploaded with a page that failed for good: see Failed uploads for why' },
  ];
}

function Cell({ column, figures, link }: { column: Column; figures: TrackerFigures; link: boolean }) {
  const value = column.value(figures);
  const text = column.show ? column.show(figures) : String(value);
  const className = column.attention && value > 0 ? 'p2mw-attn' : undefined;
  if (link && column.to && value > 0) {
    return <td className={className}><Link to={column.to}>{text}</Link></td>;
  }
  return <td className={className}>{text}</td>;
}

type Sort = { key: string; dir: 1 | -1 } | null;

function sorted<T extends TrackerFigures>(rows: T[], sort: Sort, columns: Column[], name: (row: T) => string): T[] {
  const column = sort ? columns.find((c) => c.key === sort.key) : undefined;
  const copy = [...rows];
  copy.sort((a, b) => {
    if (column && sort) {
      const diff = (column.value(a) - column.value(b)) * sort.dir;
      if (diff) return diff;
    }
    return name(a).localeCompare(name(b));
  });
  return copy;
}

function TrackerTable({ data, columns, links }: { data: ProjectTracker; columns: Column[]; links: boolean }) {
  const [sort, setSort] = useState<Sort>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [openOutlets, setOpenOutlets] = useState<Set<string>>(new Set());
  const toggle = (set: Set<string>, key: string, apply: (next: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    apply(next);
  };
  const sortBy = (key: string) => setSort((s) => (s?.key === key ? (s.dir === -1 ? { key, dir: 1 } : null) : { key, dir: -1 }));
  const dealers = sorted(data.dealers, sort, columns, (d) => (d.dealerId ? d.dealerName : '~'));
  const allOutletKeys = data.dealers.flatMap((d) => d.outlets.map((o) => `${d.dealerId}:${o.outletId}`));
  const everyOpen = allOutletKeys.length > 0 && allOutletKeys.every((k) => openOutlets.has(k));

  return (
    <>
      <div className="p2pt-table-actions">
        <button type="button" className="p2w-button p2w-button--ghost"
          onClick={() => setOpenOutlets(everyOpen ? new Set() : new Set(allOutletKeys))}>
          {everyOpen ? 'Collapse all PCs' : 'Expand all PCs'}
        </button>
      </div>
      <div className="p2pt-scroll">
        <table className="p2w-table p2mw-table p2pt-table" aria-label="Project Tracker by dealership, outlet and PC">
          <thead>
            <tr>
              <th scope="col" className="p2pt-name">Dealership / outlet / PC</th>
              {columns.map((c) => (
                <th key={c.key} scope="col" title={c.title}
                  aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="p2pt-sort" onClick={() => sortBy(c.key)}>
                    {c.label}
                    <span aria-hidden="true">{sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dealers.map((dealer) => {
              const dealerKey = String(dealer.dealerId);
              const dealerOpen = !collapsed.has(dealerKey);
              return (
                <Fragment key={dealerKey}>
                  <tr className="p2pt-dealer">
                    <th scope="row" className="p2pt-name">
                      <button type="button" className="p2pt-expand" aria-expanded={dealerOpen}
                        onClick={() => toggle(collapsed, dealerKey, setCollapsed)}>
                        <span aria-hidden="true">{dealerOpen ? '▾' : '▸'}</span> {dealer.dealerName}
                      </button>
                    </th>
                    {columns.map((c) => <Cell key={c.key} column={c} figures={dealer} link={links} />)}
                  </tr>
                  {dealerOpen ? sorted(dealer.outlets, sort, columns, (o) => (o.outletId ? o.outletName : '~')).map((outlet) => {
                    const outletKey = `${dealer.dealerId}:${outlet.outletId}`;
                    const outletOpen = openOutlets.has(outletKey);
                    return (
                      <Fragment key={outletKey}>
                        <tr className="p2pt-outlet">
                          <th scope="row" className="p2pt-name">
                            <button type="button" className="p2pt-expand" aria-expanded={outletOpen}
                              disabled={outlet.people.length === 0}
                              onClick={() => toggle(openOutlets, outletKey, setOpenOutlets)}>
                              <span aria-hidden="true">{outlet.people.length ? (outletOpen ? '▾' : '▸') : '·'}</span> {outlet.outletName}
                              {outlet.classification === 'SATELLITE' ? <span className="p2w-muted"> · Satellite</span> : null}
                            </button>
                          </th>
                          {columns.map((c) => <Cell key={c.key} column={c} figures={outlet} link={links} />)}
                        </tr>
                        {outletOpen ? sorted(outlet.people, sort, columns, (p) => (p.actorId ? p.name || p.actorId : '~')).map((person) => (
                          <tr key={`${outletKey}:${person.actorId ?? ''}`} className="p2pt-person">
                            <th scope="row" className="p2pt-name">
                              {person.actorId ? (person.name || 'Name not recorded') : <span className="p2w-muted">Not linked to a PC</span>}
                              {person.actorId && person.role && person.role !== 'PC'
                                ? <span className="p2pt-role">{ROLE_LABELS[person.role] ?? person.role}</span> : null}
                            </th>
                            {columns.map((c) => <Cell key={c.key} column={c} figures={person} link={false} />)}
                          </tr>
                        )) : null}
                      </Fragment>
                    );
                  }) : null}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="p2pt-name">Total</th>
              {columns.map((c) => <Cell key={c.key} column={c} figures={data.totals} link={links} />)}
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function RoleTable({ data }: { data: ProjectTracker }) {
  const roles = Object.entries(data.totals.tasks.byRole);
  if (!roles.length) return null;
  return (
    <div className="p2pt-scroll">
      <table className="p2w-table p2mw-table" aria-label="Tasks by assigned role">
        <thead><tr><th>Assigned to</th><th>Raised</th><th>Closed</th><th>Open at end</th><th>Overdue</th></tr></thead>
        <tbody>
          {roles.map(([role, r]) => (
            <tr key={role}>
              <td>{ROLE_LABELS[role] ?? role}</td><td>{r.raised}</td><td>{r.closed}</td><td>{r.open}</td>
              <td className={r.overdue ? 'p2mw-attn' : undefined}>{r.overdue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tiles({ data }: { data: ProjectTracker }) {
  const t = data.totals;
  const gpDone = t.gatePass.onTime + t.gatePass.late;
  const tiles: ReactNode[] = [
    <Tile key="gp" label="Gate pass" value={t.gatePass.due ? `${gpDone}/${t.gatePass.due}` : '—'}
      hint={`${t.gatePass.late} late · ${t.gatePass.missing} missing · ${t.gatePass.notYetDue} not yet due`}
      tone={t.gatePass.missing ? 'bad' : t.gatePass.late ? 'warn' : undefined} />,
    <Tile key="files" label="Files uploaded" value={ch(t).directFiles + ch(t).bulkFiles + ch(t).driveFiles}
      hint={`${ch(t).directFiles} direct · ${ch(t).bulkFiles} bulk upload · ${ch(t).driveFiles} Drive`} />,
    <Tile key="up" label="Journeys uploaded" value={t.uploads.journeys}
      hint={`${t.uploads.bookings} bookings · ${t.uploads.deliveries} deliveries · ${t.uploads.duplicatesDeleted ?? 0} duplicates deleted`} />,
    <Tile key="cl" label="Journeys closed" value={t.closed.reviewer} hint={`${t.closed.deliveryFiles} delivery files closed by the PC`} />,
    <Tile key="rv" label="Reviews closed" value={rv(t).stagesReviewedByReviewer + rv(t).stagesReviewedByLead + rv(t).stagesReviewedByOther}
      hint={`Reviewer ${rv(t).stagesReviewedByReviewer} · TL/PM ${rv(t).stagesReviewedByLead + rv(t).stagesReviewedByOther} · ${rv(t).stagesAwaitingReview} still open`}
      tone={rv(t).stagesAwaitingReview ? 'warn' : undefined} />,
    <Tile key="tc" label="Tasks closed" value={t.tasks.all.closed}
      hint={`PC ${t.tasks.all.closedByPc} · TL/PM/Exec ${t.tasks.all.closedByLead} · system ${t.tasks.all.closedBySystem}`} />,
    <Tile key="to" label="Tasks open" value={t.tasks.all.open} hint={`${t.tasks.all.overdue} overdue`}
      tone={t.tasks.all.overdue ? 'warn' : undefined} />,
    <Tile key="fail" label="Failed uploads" value={fl(t).files}
      hint={`${fl(t).quality} not clear · ${fl(t).notRead} not read in time · ${fl(t).readFailed} reading failed · ${fl(t).notUploaded} not received`}
      tone={fl(t).notRead + fl(t).readFailed + fl(t).notUploaded ? 'bad' : fl(t).files ? 'warn' : undefined} />,
  ];
  for (const s of data.schedules) {
    const r = t.recurring[s.scheduleId];
    if (!r || !r.due) continue;
    const notDone = r.incomplete + r.overdue;
    tiles.push(
      <Tile key={s.scheduleId} label={s.title} value={`${r.onTime + r.late}/${r.due}`}
        hint={`${frequencyLabel(s.frequency)} · ${r.late} late · ${notDone} not done`} tone={notDone ? 'warn' : undefined} />,
    );
  }
  return <div className="p2mw-tiles">{tiles}</div>;
}

function failedWhen(at: string | null): string {
  return at ? new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Kolkata' }) : '—';
}

/**
 * Why each failed upload of the period failed (product owner 2026-11-13: "if some files are failed
 * to be uploaded and all their retries are exhausted can we have information why that happened"):
 * the files uploaded in the period, page by page, with the reason, the attempts and a link to the page.
 */
function FailedList({ tenantId, accessToken, first, last }: {
  tenantId: string; accessToken: string | undefined; first: string; last: string;
}) {
  const query = useQuery({
    queryKey: ['p2-failed-uploads', tenantId, first, last],
    queryFn: () => getFailedUploads(tenantId, first, last, accessToken),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 30_000,
  });
  if (query.isLoading) return <p className="p2w-muted">Loading the failed uploads…</p>;
  if (query.isError) {
    return (
      <div className="p2w-alert p2w-alert--error" role="alert">
        The failed uploads could not be loaded.{' '}
        <button type="button" className="p2w-button p2w-button--ghost" onClick={() => query.refetch()}>Try again</button>
      </div>
    );
  }
  const rows: FailedRow[] = query.data?.rows ?? [];
  if (!rows.length) return <p className="p2w-muted">No upload of this period failed.</p>;
  return (
    <>
      <div className="p2pt-scroll">
        <table className="p2w-table p2mw-table" aria-label="Failed uploads and why">
          <thead>
            <tr><th>Uploaded</th><th>PC</th><th>Customer / file</th><th>Pages</th><th>Why</th><th>Reason</th><th>Tries</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const why = row.why ? FAILURE_WHY[row.why] : undefined;
              return (
                <tr key={`${row.kind}-${row.journeyId}-${row.filename}-${row.pageNumbers.join(',')}-${row.failedAtUtc}`}>
                  <td>{failedWhen(row.uploadedAtUtc)}</td>
                  <td>{row.uploadedByName || '—'}</td>
                  <td>
                    <Link to={`/p2/journeys/${row.journeyId}/documents`}>{row.customerName || row.journeyReference || 'Journey'}</Link>
                    <div className="p2w-muted">{row.filename}{row.outletName ? ` · ${row.outletName}` : ''}</div>
                  </td>
                  <td>{row.kind === 'FILE' ? 'Whole file' : row.pageNumbers.join(', ')}</td>
                  <td title={why?.hint}>{why?.label ?? '—'}</td>
                  <td>{row.reason}{row.clearedFromJourney ? <div className="p2w-muted">Cleared from the Journey until it is sent again.</div> : null}</td>
                  <td>{row.attempts ?? '—'}</td>
                  <td>{row.openUrl ? <a href={row.openUrl} target="_blank" rel="noreferrer">Open</a> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {query.data?.truncated ? <p className="p2w-muted">Showing the latest {rows.length}; choose a shorter period for the rest.</p> : null}
    </>
  );
}

/**
 * Project Tracker (product owner 2026-11-07): the situation of the whole Project -- gate pass,
 * files uploaded, files closed, tasks worked and recurring tasks -- for a day, a week or a calendar
 * month, dealership wise, outlet wise and PC wise. Team Lead, PM and Executive.
 */
export function TrackerView({ tenantId, accessToken, role, today, keep }: {
  tenantId: string; accessToken: string | undefined; role: string | undefined; today: string;
  /** Address parameters of the page it sits in, kept when the period or figures change (My Tracker's tab). */
  keep?: Record<string, string>;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { period, date } = trackerFromSearch(searchParams, today);
  const rawView = searchParams.get('view') as View | null;
  const view: View = VIEW_OPTIONS.some((v) => v.key === rawView) ? (rawView as View) : 'overview';
  const [taskScope, setTaskScope] = useState<TaskScope>('all');
  const range = trackerRange(period, date);

  const navigate = (next: { period?: TrackerPeriod; date?: string; view?: View }) => {
    const p = next.period ?? period;
    const d = next.date ?? date;
    const params = new URLSearchParams(trackerSearch(p, d, today));
    const v = next.view ?? view;
    if (v !== 'overview') params.set('view', v);
    for (const [key, value] of Object.entries(keep ?? {})) params.set(key, value);
    setSearchParams(params);
  };

  const query = useQuery({
    queryKey: ['p2-project-tracker', tenantId, period, range.first],
    queryFn: () => getProjectTracker(tenantId!, period, date, accessToken ?? undefined),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 30_000,
  });
  const data = query.data;
  const links: Links = useMemo(() => ({
    // The Daily gate pass is a tab of this page (2026-11-09): its figures switch tabs.
    gatePass: trackerTabHref('gate-pass'),
    taskManager: '/p2/task-manager',
    // An Executive has no Task Queue or Booking & Delivery list; a Team Lead's list is the TL overview.
    tasks: role === 'EXECUTIVE' ? undefined : '/p2/tasks',
    bookings: role === 'TL' ? '/dashboard' : role === 'PM' ? '/p2/bookings' : undefined,
  }), [role]);
  const columns = data ? columnsFor(view, taskScope, data, links) : [];
  // A PC's or Reviewer's own view (2026-11-13): only their own row is counted.
  const own = Boolean(data?.scope.own);

  return (
    <>
      <div className="p2mw-controls">
        <Segment label="Period" value={period} options={PERIOD_OPTIONS}
          onChange={(next) => navigate({ period: next, date: next === period ? date : today })} />
        <span className="p2mw-range">
          <button type="button" className="p2w-button p2w-button--ghost" aria-label="Previous period"
            onClick={() => navigate({ date: shiftPeriod(period, date, -1) })}>‹</button>
          {period === 'MONTH' ? (
            <label>Month <input type="month" value={date.slice(0, 7)} max={today.slice(0, 7)}
              onChange={(e) => e.target.value && navigate({ date: `${e.target.value}-01` })} /></label>
          ) : (
            <label>{period === 'WEEK' ? 'Week of' : 'Day'} <input type="date" value={date} max={today}
              onChange={(e) => e.target.value && navigate({ date: e.target.value })} /></label>
          )}
          <button type="button" className="p2w-button p2w-button--ghost" aria-label="Next period"
            disabled={!hasNextPeriod(period, date, today)}
            onClick={() => navigate({ date: shiftPeriod(period, date, 1) })}>›</button>
          <strong>{trackerLabel(period, date)}</strong>
          {range.first > today || range.last < today ? (
            <button type="button" className="p2w-button p2w-button--secondary" onClick={() => navigate({ date: today })}>
              {period === 'DAY' ? 'Today' : period === 'WEEK' ? 'This week' : 'This month'}
            </button>
          ) : null}
        </span>
      </div>

      {query.isLoading ? <SectionCard><p className="p2w-muted">Counting…</p></SectionCard> : null}
      {query.isError ? (
        <SectionCard>
          <div className="p2w-alert p2w-alert--error" role="alert">
            The Project Tracker could not be loaded.{' '}
            <button type="button" className="p2w-button p2w-button--ghost" onClick={() => query.refetch()}>Try again</button>
          </div>
        </SectionCard>
      ) : null}

      {data ? (
        <>
          <Tiles data={data} />
          <SectionCard>
            <div className="p2w-card__title p2mw-title-row">
              <div>
                <h3>{own ? 'My figures by outlet' : 'By dealership, outlet and PC'}</h3>
                <p className="p2w-muted">
                  {data.period.current ? `So far, as of ${new Date(data.period.asOfUtc).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} India time. ` : ''}
                  {own ? 'Only your own work is counted here.' : 'Open a dealership or outlet for its outlets and PCs; click a column to sort.'}
                </p>
              </div>
              <Segment label="Figures" value={view} options={VIEW_OPTIONS} onChange={(next) => navigate({ view: next })} />
            </div>
            {view === 'tasks' ? <Segment label="Tasks" value={taskScope} options={TASK_SCOPES} onChange={setTaskScope} /> : null}
            {view === 'recurring' && data.schedules.length === 0 ? (
              <p className="p2w-muted">No recurring task is scheduled in this Project.</p>
            ) : (
              <TrackerTable key={`${view}-${taskScope}`} data={data} columns={columns} links />
            )}
            {own ? null : <div className="p2mw-actions p2pt-links">
              <Link className="p2w-button p2w-button--secondary" to={trackerTabHref('gate-pass')}>Daily gate pass</Link>
              <Link className="p2w-button p2w-button--secondary" to={trackerTabHref('daily-processing', date)}>
                {period === 'DAY' ? 'Daily processing of this day' : 'Daily processing'}
              </Link>
              {links.tasks ? <Link className="p2w-button p2w-button--secondary" to={links.tasks}>Task Queue</Link> : null}
              <Link className="p2w-button p2w-button--secondary" to={links.taskManager}>Task Manager</Link>
              {links.bookings ? <Link className="p2w-button p2w-button--secondary" to={links.bookings}>Bookings &amp; Deliveries</Link> : null}
            </div>}
          </SectionCard>
          {view === 'failures' ? (
            <SectionCard>
              <div className="p2w-card__title">
                <h3>Why each upload failed</h3>
                <p className="p2w-muted">Files uploaded in {trackerLabel(period, date)} with a page that failed after every retry or was rejected on image quality.</p>
              </div>
              <FailedList tenantId={tenantId} accessToken={accessToken} first={range.first} last={range.last} />
            </SectionCard>
          ) : null}
          {view === 'tasks' && !own ? (
            <SectionCard>
              <div className="p2w-card__title"><h3>Tasks by assigned role</h3><p className="p2w-muted">Journey tasks and Task Manager tasks together.</p></div>
              <RoleTable data={data} />
            </SectionCard>
          ) : null}
          <SectionCard>
            <details>
              <summary><strong>How each figure is counted</strong></summary>
              <ul className="p2pt-notes">{data.notes.map((note) => <li key={note}>{note}</li>)}</ul>
            </details>
          </SectionCard>
        </>
      ) : null}
    </>
  );
}

/** The Daily processing tab: the report of one day, the day picked here (and kept in the address). */
function DailyProcessingTab({ today }: { today: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const day = dailyProcessingDay(searchParams, today);
  const go = (next: string) => setSearchParams(new URLSearchParams(trackerTabHref('daily-processing', next).split('?')[1]));
  return (
    <>
      <div className="p2mw-controls">
        <span className="p2mw-range">
          <button type="button" className="p2w-button p2w-button--ghost" aria-label="Previous day"
            onClick={() => go(shiftPeriod('DAY', day, -1))}>‹</button>
          <label>Day <input type="date" value={day} max={today} onChange={(e) => e.target.value && go(e.target.value)} /></label>
          <button type="button" className="p2w-button p2w-button--ghost" aria-label="Next day"
            disabled={!hasNextPeriod('DAY', day, today)} onClick={() => go(shiftPeriod('DAY', day, 1))}>›</button>
          <strong>{trackerLabel('DAY', day)}</strong>
          {day !== today ? <button type="button" className="p2w-button p2w-button--secondary" onClick={() => go(today)}>Today</button> : null}
        </span>
      </div>
      <DailyProcessingReport day={day} />
    </>
  );
}

/**
 * Project Tracker (product owner 2026-11-07), the one place for a Team Lead, PM or Executive
 * (2026-11-09: "merge Daily Processing, Daily Gatepass in Project tracker"). Three tabs:
 * - Project tracker: gate pass, files uploaded, files closed, tasks worked and recurring tasks
 *   for a day, a week or a calendar month, dealership wise, outlet wise and PC wise;
 * - Daily processing: the Daily processing report of the day picked;
 * - Daily gate pass: the supervisor's daily tasks, consolidated view and calendar (with each
 *   outlet's registers), each with its own date or month controls.
 * The tab is in the address (?tab=daily-processing&day=, ?tab=gate-pass); the old addresses of
 * the last two open them.
 */
export default function P2ProjectTrackerPage() {
  const project = useProjectContextStore((s) => s.selectedProject);
  const accessToken = useSessionStore((s) => s.accessToken);
  const tenantId = project?.tenantId;
  const role = project?.operatingRole;
  const team = role === 'TL' || role === 'PM' || role === 'EXECUTIVE';
  // A PC or Reviewer sees their own row (product owner 2026-11-13: "for each team member his own view").
  const member = role === 'PC' || role === 'REVIEWER';
  const allowed = team || member;
  const [searchParams, setSearchParams] = useSearchParams();
  const today = istDate();
  const tab = team ? trackerTabFromSearch(searchParams) : 'tracker';
  const selectTab = (next: TrackerTab) => {
    if (next === tab) return;
    // The day carries over: the tracker's date opens that day's Daily processing, and back.
    const day = tab === 'daily-processing' ? dailyProcessingDay(searchParams, today) : trackerFromSearch(searchParams, today).date;
    if (next === 'tracker') {
      const back = new URLSearchParams(trackerSearch('DAY', day, today));
      setSearchParams(day === today ? new URLSearchParams() : back);
      return;
    }
    setSearchParams(new URLSearchParams(trackerTabHref(next, day).split('?')[1]));
  };

  return (
    <div className="screen-stack p2-screen p2w p2mw p2pt">
      <PageHeader
        eyebrow="DealGuard"
        title={team ? 'Project Tracker' : 'My figures'}
        description={team
          ? 'The whole team in one place: gate register, files uploaded (direct, bulk upload, Drive), journeys and reviews closed, tasks and failed uploads by dealership, outlet and person; the day\'s processing; and the daily gate pass.'
          : 'Your own day, week or month: gate register, files uploaded (direct, bulk upload, Drive), journeys and reviews closed, tasks and failed uploads with why.'}
      />
      {team ? <div className="p2pt-tabs" role="tablist" aria-label="Project Tracker">
        {TRACKER_TABS.map((t) => (
          <button key={t.key} type="button" role="tab" id={`p2pt-tab-${t.key}`} aria-controls={`p2pt-panel-${t.key}`}
            aria-selected={tab === t.key} tabIndex={tab === t.key ? 0 : -1}
            className={tab === t.key ? 'is-active' : undefined} onClick={() => selectTab(t.key)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              const index = TRACKER_TABS.findIndex((x) => x.key === tab);
              const step = event.key === 'ArrowRight' ? 1 : -1;
              const next = TRACKER_TABS[(index + step + TRACKER_TABS.length) % TRACKER_TABS.length].key;
              selectTab(next);
              document.getElementById(`p2pt-tab-${next}`)?.focus();
            }}>
            {t.label}
          </button>
        ))}
      </div> : null}

      {!allowed ? (
        <SectionCard><p className="p2w-muted">The Project Tracker is for a Team Lead, PM, Executive, PC or Reviewer.</p></SectionCard>
      ) : !tenantId || !accessToken ? (
        <div className="p2w-alert p2w-alert--error" role="alert">Select a project to continue.</div>
      ) : (
        <div role="tabpanel" id={`p2pt-panel-${tab}`} aria-labelledby={`p2pt-tab-${tab}`} className="screen-stack">
          {tab === 'tracker' ? <TrackerView tenantId={tenantId} accessToken={accessToken} role={role} today={today} /> : null}
          {tab === 'performance' ? <PerformanceView tenantId={tenantId} accessToken={accessToken} today={today} /> : null}
          {tab === 'daily-processing' ? <DailyProcessingTab today={today} /> : null}
          {tab === 'gate-pass' ? <SupervisorGatePass tenantId={tenantId} accessToken={accessToken} /> : null}
        </div>
      )}
    </div>
  );
}
