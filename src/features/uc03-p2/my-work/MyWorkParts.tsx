import { useState } from 'react';

import { gatePassErrorText, getGatePassImageUrl } from '../../../services/audit-core/uc03GatePass';
import { Link } from 'react-router-dom';

import { istDate, type MyWorkPeriod, type PcFigures, type PcOutlet, type GateRegisterDay } from '../../../services/audit-core/uc03MyWork';

/** Pieces shared by PC Home and My Tracker (product owner 2026-11-02 / 11-03). */

export const PERIODS: Array<{ key: MyWorkPeriod; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This week' },
  { key: 'lastWeek', label: 'Last week' },
  { key: 'month', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
];

export const STATUS: Record<GateRegisterDay['status'], { label: string; tone: 'ok' | 'warn' | 'bad' | 'open' }> = {
  DONE: { label: 'Uploaded', tone: 'ok' },
  ANSWER_PENDING: { label: 'Answer pending', tone: 'warn' },
  COUNTS_PENDING: { label: 'Counts pending', tone: 'warn' },
  NOT_UPLOADED: { label: 'Not uploaded', tone: 'open' },
  MISSED: { label: 'Missed', tone: 'bad' },
};

export function Tile({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: 'warn' | 'bad' }) {
  return (
    <div className={`p2mw-tile${tone ? ` p2mw-tile--${tone}` : ''}`}>
      <span className="p2mw-tile__label">{label}</span>
      <strong className="p2mw-tile__value">{value}</strong>
      {hint ? <span className="p2mw-tile__hint">{hint}</span> : null}
    </div>
  );
}

export function Segment<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: Array<{ key: T; label: string }>; onChange: (next: T) => void;
}) {
  return (
    <div className="p2w-segment" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button key={option.key} type="button" role="tab" aria-selected={value === option.key}
          className={value === option.key ? 'is-active' : ''} onClick={() => onChange(option.key)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function registerUploaded(outlet: PcOutlet): string {
  if (!outlet.gateRegisterDays) return '—';
  if (outlet.gateRegisterDays === 1) return outlet.gateRegisterUploaded ? 'Yes' : 'No';
  return `${outlet.gateRegisterUploaded} of ${outlet.gateRegisterDays} days`;
}

export function PcTracker({ outlets, totals, compact = false }: { outlets: PcOutlet[]; totals: PcFigures; compact?: boolean }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="p2w-table p2mw-table">
        <thead>
          <tr>
            <th>Outlet</th>
            {compact ? null : <th>Journeys (all time)</th>}
            <th>Bookings uploaded</th>
            <th>Deliveries updated</th>
            <th>Journeys completed</th>
            <th>Gate register uploaded</th>
            <th>Pending delivery files</th>
            <th>Tasks worked</th>
            <th>Tasks closed</th>
            <th>Tasks pending</th>
          </tr>
        </thead>
        <tbody>
          {outlets.map((o) => (
            <tr key={o.outletId}>
              <td>{o.outletName}{o.classification === 'SATELLITE' ? <span className="p2w-muted"> · Satellite</span> : null}</td>
              {compact ? null : <td>{o.journeysTotal}</td>}
              <td>{o.bookingsUploaded}</td>
              <td>{o.deliveriesUpdated}</td>
              <td>{o.journeysCompleted}</td>
              <td className={o.gateRegisterUploaded < o.gateRegisterDays ? 'p2mw-attn' : undefined}>{registerUploaded(o)}</td>
              <td className={o.pendingDeliveryFiles ? 'p2mw-attn' : undefined}>{o.pendingDeliveryFiles}</td>
              <td>{o.tasksWorked}</td>
              <td>{o.tasksClosed}</td>
              <td className={o.tasksPending ? 'p2mw-attn' : undefined}>{o.tasksPending}</td>
            </tr>
          ))}
        </tbody>
        {outlets.length > 1 ? (
          <tfoot>
            <tr>
              <th>Total</th>
              {compact ? null : <th>{totals.journeysTotal}</th>}
              <th>{totals.bookingsUploaded}</th>
              <th>{totals.deliveriesUpdated}</th>
              <th>{totals.journeysCompleted}</th>
              <th>{totals.gateRegisterUploaded} of {totals.gateRegisterDays}</th>
              <th>{totals.pendingDeliveryFiles}</th>
              <th>{totals.tasksWorked}</th>
              <th>{totals.tasksClosed}</th>
              <th>{totals.tasksPending}</th>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}


/**
 * The gate register date wise (product owner 2026-11-03: "date wise and not outlet wise"): newest day
 * first, every outlet the PC is mapped to under it, and the uploaded register opens on click.
 */
export function GateRegisterTable({ outlets, tenantId, accessToken }: {
  outlets: PcOutlet[]; tenantId: string; accessToken?: string;
}) {
  const [photoError, setPhotoError] = useState<string | null>(null);
  const byDate = new Map<string, { label: string; rows: Array<{ outlet: PcOutlet; day: GateRegisterDay }> }>();
  for (const outlet of outlets) {
    for (const day of outlet.gateRegister) {
      const entry = byDate.get(day.date) ?? { label: day.label, rows: [] };
      entry.rows.push({ outlet, day });
      byDate.set(day.date, entry);
    }
  }
  const dates = [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  async function openPage(gatePassId: string, page: number) {
    setPhotoError(null);
    try {
      const { url } = await getGatePassImageUrl(tenantId, gatePassId, accessToken, page);
      window.open(url, '_blank', 'noopener');
    } catch (cause) {
      setPhotoError(gatePassErrorText(cause, 'The gate register could not be opened.'));
    }
  }

  if (!dates.length) return <p className="p2w-muted">No gate register day in this period (Sunday is off).</p>;
  return (
    <>
      {photoError ? <div className="p2w-alert p2w-alert--error" role="alert">{photoError}</div> : null}
      <div style={{ overflowX: 'auto' }}>
        <table className="p2w-table p2mw-table" aria-label="Gate register date wise">
          <thead>
            <tr>
              <th>Day</th><th>Outlet</th><th>Status</th><th>Total</th><th>Intimated</th><th>Uploaded in tool</th>
              <th>Pending with you</th><th>Not intimated</th><th>Register</th>
            </tr>
          </thead>
          <tbody>
            {dates.flatMap(([date, { label, rows }]) => rows
              .sort((a, b) => a.outlet.outletName.localeCompare(b.outlet.outletName))
              .map(({ outlet, day }, i) => {
                const status = STATUS[day.status];
                const pages = day.gatePassId ? Math.max(day.pages ?? 1, 1) : 0;
                return (
                  <tr key={`${date}-${outlet.outletId}`} className={i === 0 ? 'p2mw-day-first' : undefined}>
                    {i === 0 ? <td rowSpan={rows.length}><strong>{label}</strong></td> : null}
                    <td>{outlet.outletName}{outlet.classification === 'SATELLITE' ? <span className="p2w-muted"> · Satellite</span> : null}</td>
                    <td><span className={`p2mw-chip p2mw-chip--${status.tone}`}>{status.label}</span></td>
                    <td>{day.total ?? '—'}</td>
                    <td>{day.intimated ?? '—'}</td>
                    <td>{day.uploadedInTool}</td>
                    <td className={day.pendingWithPc ? 'p2mw-attn' : undefined}>{day.pendingWithPc ?? '—'}</td>
                    <td>{day.notIntimated ?? '—'}</td>
                    <td>
                      {day.gatePassId ? (
                        <span className="p2mw-pages">
                          {day.uploadedAtUtc && istDate(new Date(day.uploadedAtUtc)) === istDate() ? (
                            <Link className="p2w-link" to={`/p2/gate-pass?edit=${day.gatePassId}`}
                              title="Correct the numbers: allowed on the day the register was uploaded">Edit counts</Link>
                          ) : null}
                          {Array.from({ length: pages }, (_, n) => (
                            <button key={n} type="button" className="p2w-link" onClick={() => void openPage(day.gatePassId!, n + 1)}>
                              {pages === 1 ? 'View' : `Page ${n + 1}`}
                            </button>
                          ))}
                        </span>
                      ) : <span className="p2w-muted">—</span>}
                    </td>
                  </tr>
                );
              }))}
          </tbody>
        </table>
      </div>
    </>
  );
}
