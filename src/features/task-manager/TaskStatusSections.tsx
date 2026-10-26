import { Link } from 'react-router-dom';

import SectionCard from '../../components/SectionCard';
import type { TmStatusSection, TmTaskStatus } from '../../services/audit-core/taskManager';
import { FLAG_LABELS, formatWhen, personName, roleLabel } from './tmFormat';
import '../../styles/task-manager.css';

function Section({ title, hint, section, journeyLinks }: {
  title: string; hint: string; section: TmStatusSection; journeyLinks: boolean;
}) {
  const t = section.totals;
  const flagged = t.overdue + t.reviewOverdue + t.missed + t.incomplete;
  return (
    <SectionCard>
      <div className="p2w-card__title">
        <h3>{title}</h3>
        <p className="p2w-muted">{hint}</p>
      </div>
      <div className="tm-totals">
        <span><b>{t.open}</b> open</span>
        <span><b>{t.raisedOnDay}</b> raised</span>
        <span><b>{t.completedOnDay}</b> completed</span>
        <span className={t.completedLate ? 'tm-warn' : ''}><b>{t.completedLate}</b> completed late</span>
        <span className={t.overdue ? 'tm-bad' : ''}><b>{t.overdue}</b> overdue</span>
        <span className={t.reviewOverdue ? 'tm-warn' : ''}><b>{t.reviewOverdue}</b> review overdue</span>
        <span className={t.missed ? 'tm-bad' : ''}><b>{t.missed}</b> missed</span>
        <span className={t.incomplete ? 'tm-bad' : ''}><b>{t.incomplete}</b> incomplete</span>
      </div>
      {section.people.length ? (
        <div className="p2dr-scroll">
          <table className="p2dr-table">
            <thead>
              <tr><th>Person</th><th>Open</th><th>Raised</th><th>Completed</th><th>Late</th><th>Overdue</th><th>Review overdue</th><th>Missed</th><th>Incomplete</th></tr>
            </thead>
            <tbody>
              {section.people.map((p) => (
                <tr key={`${p.actorId ?? p.role}`}>
                  <td>{personName(p.name, p.actorId, p.role)}<span className="p2w-muted"> · {roleLabel(p.role)}</span></td>
                  <td>{p.open}</td><td>{p.raisedOnDay}</td><td>{p.completedOnDay}</td>
                  <td className={p.completedLate ? 'tm-warn' : ''}>{p.completedLate}</td>
                  <td className={p.overdue ? 'tm-bad' : ''}>{p.overdue}</td>
                  <td className={p.reviewOverdue ? 'tm-warn' : ''}>{p.reviewOverdue}</td>
                  <td className={p.missed ? 'tm-bad' : ''}>{p.missed}</td>
                  <td className={p.incomplete ? 'tm-bad' : ''}>{p.incomplete}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="p2w-muted">No tasks for this day.</p>}
      {flagged || section.flags.length ? (
        <details className="p2w-disclosure" open={flagged > 0 && flagged <= 20}>
          <summary>Flagged ({section.flags.length}{section.flagsTruncated ? '+' : ''})</summary>
          <div className="p2dr-scroll">
            <table className="p2dr-table">
              <thead><tr><th>Flag</th><th>Task</th><th>Assignee</th><th>Due</th><th>Reviewer</th><th>Completed</th></tr></thead>
              <tbody>
                {section.flags.map((f) => (
                  <tr key={f.taskId}>
                    <td>{f.flags.map((k) => <span key={k} className={`p2w-chip p2w-chip--${k === 'REVIEW_OVERDUE' || k === 'CLOSED_LATE' ? 'warning' : 'danger'}`}>{FLAG_LABELS[k] ?? k}</span>)}</td>
                    <td>
                      {journeyLinks && f.journeyId
                        ? <Link className="p2w-link" to={`/p2/journeys/${f.journeyId}/tasks?task=${f.taskId}`}>{f.title}</Link>
                        : f.title}
                      <span className="p2w-muted">{[f.customerName, f.journeyReference, f.outletName, f.recurring ? 'recurring' : null].filter(Boolean).map((v) => ` · ${v}`).join('')}</span>
                    </td>
                    <td>{personName(f.assigneeName, f.assigneeActorId, f.assigneeRole)}</td>
                    <td>{formatWhen(f.dueAtUtc)}</td>
                    <td>{f.reviewerRole ? `${personName(f.reviewerName, null, f.reviewerRole)}${f.reviewDueAtUtc ? ` · by ${formatWhen(f.reviewDueAtUtc)}` : ''}` : '—'}</td>
                    <td>{formatWhen(f.completedAtUtc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </SectionCard>
  );
}

/** Daily status of the two kinds of task (product owner 2026-10-26): every miss or overdue is flagged. */
export default function TaskStatusSections({ status, journeyLinks = true }: { status: TmTaskStatus; journeyLinks?: boolean }) {
  return (
    <>
      <Section title="Daily status: Journey tasks" journeyLinks={journeyLinks}
        hint={`Tasks on bookings and deliveries, as at ${formatWhen(status.asOfUtc)}.`} section={status.journeyTasks} />
      <Section title="Daily status: Task Manager tasks" journeyLinks={journeyLinks}
        hint="Tasks raised in the Task Manager, recurring tasks and the daily gate pass." section={status.taskManager} />
      <ul className="p2dr-notes">{status.notes.map((n) => <li key={n}>{n}</li>)}</ul>
    </>
  );
}
