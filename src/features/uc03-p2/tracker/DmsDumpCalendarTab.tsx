import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import SectionCard from '../../../components/SectionCard';
import { DATA_UPLOADS_PATH, getDmsCalendar, type DmsDayCell } from '../../../services/audit-core/uc03DmsDumps';
import { istMonth, monthLabel, monthsUpTo } from '../../../services/audit-core/uc03ProjectTracker';
import '../../../styles/uc03-p2-data-uploads.css';

const STATUS_TEXT: Record<DmsDayCell['status'], string> = {
  UPLOADED: 'Uploaded', MISSED: 'Not uploaded', DUE: 'Due today', AHEAD: 'Not due yet',
};

function cellTitle(kind: string, date: string, cell: DmsDayCell): string {
  const base = `${kind} dump, ${date}: ${STATUS_TEXT[cell.status]}`;
  if (cell.status !== 'UPLOADED') return base;
  return `${base} · ${cell.rows ?? 0} rows · ${cell.missing ?? 0} not in Verigence${kind === 'Delivery' ? ` · ${cell.notInTool ?? 0} delivery not uploaded` : ''}`;
}

/**
 * The DMS booking and delivery dumps, day by day, like the gate register (product owner
 * 2026-11-13: "in project tracker the status of these dumps should also be shown same way as gate
 * register. This is supposed to come daily. But this is only for TL"). One row per dealership,
 * one column per day: B the booking dump, D the delivery dump -- uploaded (with how many rows
 * were not found), not uploaded, due today, not due yet.
 */
export default function DmsDumpCalendarTab({ tenantId, accessToken }: { tenantId: string; accessToken: string }) {
  const current = useMemo(() => istMonth(), []);
  const months = useMemo(() => monthsUpTo(current), [current]);
  const [month, setMonth] = useState(current);
  const calendar = useQuery({
    queryKey: ['dms-calendar', tenantId, month],
    queryFn: () => getDmsCalendar(tenantId, month, accessToken),
    staleTime: 30_000,
  });
  const data = calendar.data;
  const days = data?.dealers[0]?.days.map((d) => d.date) ?? [];
  return (
    <SectionCard>
      <div className="p2w-card__title">
        <h3>DMS dumps · {monthLabel(month)}</h3>
        <p className="p2w-muted">Each dealership's booking (B) and delivery (D) dump is due every day. <Link className="p2w-link" to={DATA_UPLOADS_PATH}>Open Data uploads</Link></p>
      </div>
      <div className="p2du-toolbar">
        <label>Month
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
      </div>
      {calendar.isLoading ? <p className="p2w-muted">Loading…</p> : null}
      {calendar.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{calendar.error instanceof Error ? calendar.error.message : 'Not available.'}</div> : null}
      {data ? (
        <>
          <div className="p2du-tiles">
            <div className="p2du-tile"><span>Dumps due so far</span><strong>{data.totals.due}</strong><small>Booking and delivery, each dealership</small></div>
            <div className="p2du-tile p2du-tile--ok"><span>Uploaded</span><strong>{data.totals.uploaded}</strong><small>On file</small></div>
            <div className="p2du-tile p2du-tile--bad"><span>Not uploaded</span><strong>{data.totals.missed}</strong><small>Past days with none</small></div>
          </div>
          <div className="p2du-legend">
            <span><i className="dot--UPLOADED" style={{ background: '#a7f0ba' }} />Uploaded (number: rows not in Verigence)</span>
            <span><i style={{ background: '#ffd7d9' }} />Not uploaded</span>
            <span><i style={{ background: '#fcf4d6' }} />Due today</span>
            <span><i style={{ background: '#f4f4f4' }} />Not due yet</span>
          </div>
          <div className="p2du-scroll">
            <table className="p2du-cal">
              <thead>
                <tr><th>Dealership</th>{days.map((d) => <th key={d}>{Number(d.slice(8))}</th>)}</tr>
              </thead>
              <tbody>
                {data.dealers.map((dealer) => (
                  <tr key={dealer.dealerId}>
                    <td>{dealer.dealerName}</td>
                    {dealer.days.map((d) => (
                      <td key={d.date}>
                        {([['B', 'Booking', d.booking], ['D', 'Delivery', d.delivery]] as const).map(([letter, kind, cell]) => (
                          <span key={letter} className={`dot dot--${cell.status}`} title={cellTitle(kind, d.date, cell)}>
                            {cell.status === 'UPLOADED' ? `${letter}${(cell.missing ?? 0) + (cell.notInTool ?? 0) ? ` ${(cell.missing ?? 0) + (cell.notInTool ?? 0)}` : ''}` : letter}
                          </span>
                        ))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </SectionCard>
  );
}
