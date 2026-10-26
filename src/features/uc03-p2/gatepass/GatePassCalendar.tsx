import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import {
  gatePassErrorText, getGatePassCalendar, getGatePassImageUrl, getGatePassOutlets, type GatePassDay,
} from '../../../services/audit-core/uc03GatePass';

type Props = { tenantId: string; accessToken: string; refreshKey: number };

function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Weekday of the 1st (Monday = 0) and number of days of a YYYY-MM month. */
function monthShape(month: string) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  return { lead: (first.getUTCDay() + 6) % 7, days: new Date(Date.UTC(y, m, 0)).getUTCDate() };
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Deliveries done against delivery files uploaded, per day. Photos can be opened only
 * when a single outlet is chosen; the dealer and the all-outlets views show counts only.
 */
export default function GatePassCalendar({ tenantId, accessToken, refreshKey }: Props) {
  const [month, setMonth] = useState(thisMonth());
  const [filter, setFilter] = useState('all');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const outletsQuery = useQuery({
    queryKey: ['gate-pass-outlets', tenantId],
    queryFn: () => getGatePassOutlets(tenantId, accessToken),
    staleTime: 60_000,
  });
  const outlets = useMemo(() => outletsQuery.data?.outlets ?? [], [outletsQuery.data]);
  const dealers = useMemo(() => {
    const seen = new Map<string, string>();
    outlets.forEach((o) => seen.set(o.dealerId, o.dealerName));
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [outlets]);

  const [kind, id] = filter.split(':');
  const calendar = useQuery({
    queryKey: ['gate-pass-calendar', tenantId, month, filter, refreshKey],
    queryFn: () => getGatePassCalendar(tenantId, {
      month, outletId: kind === 'outlet' ? id : undefined, dealerId: kind === 'dealer' ? id : undefined,
    }, accessToken),
    staleTime: 30_000,
  });
  const data = calendar.data;
  const byDate = useMemo(() => new Map((data?.days ?? []).map((d) => [d.date, d])), [data]);
  const { lead, days } = monthShape(month);
  const outletView = data?.scope === 'OUTLET';

  async function openPhoto(day: GatePassDay) {
    if (!day.gatePassId) return;
    setOpening(day.gatePassId);
    setPhotoError(null);
    try {
      const { url } = await getGatePassImageUrl(tenantId, day.gatePassId, accessToken);
      window.open(url, '_blank', 'noopener');
    } catch (cause) {
      setPhotoError(gatePassErrorText(cause, 'The gate pass photo could not be opened.'));
    } finally {
      setOpening(null);
    }
  }

  return (
    <SectionCard>
      <div className="p2w-card__title">
        <h3>Deliveries and delivery files</h3>
        <p className="p2w-muted">
          For each day: deliveries reported on the gate pass, delivery files uploaded, and the difference.
          Choose a single outlet to open its gate pass photos.
        </p>
      </div>
      <div className="p2w-listbar">
        <label className="p2gp-filter"><span>Month</span>
          <input type="month" value={month} max={thisMonth()} onChange={(event) => event.target.value && setMonth(event.target.value)} />
        </label>
        <label className="p2gp-filter"><span>Show</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">All outlets</option>
            {dealers.length > 1 || outlets.length > 1 ? (
              <optgroup label="Dealer">
                {dealers.map(([dealerId, name]) => <option key={dealerId} value={`dealer:${dealerId}`}>{name}</option>)}
              </optgroup>
            ) : null}
            <optgroup label="Outlet">
              {outlets.map((o) => <option key={o.outletId} value={`outlet:${o.outletId}`}>{o.outletName}</option>)}
            </optgroup>
          </select>
        </label>
        {calendar.isFetching ? <span className="p2w-muted">Loading…</span> : null}
      </div>

      {calendar.isError ? (
        <div className="p2w-alert p2w-alert--error" role="alert">{gatePassErrorText(calendar.error, 'The calendar could not be loaded.')}</div>
      ) : null}
      {photoError ? <div className="p2w-alert p2w-alert--error" role="alert">{photoError}</div> : null}

      {data ? (
        <>
          <p className="p2gp-totals">
            <span>Deliveries reported <strong>{data.totals.declared}</strong></span>
            <span>Delivery files <strong>{data.totals.uploaded}</strong></span>
            <span className={data.totals.missing ? 'p2gp-bad' : undefined}>Missing <strong>{data.totals.missing}</strong></span>
          </p>
          <div className="p2gp-grid" role="grid" aria-label={`Gate passes, ${month}`}>
            {WEEKDAYS.map((w) => <div key={w} className="p2gp-head" role="columnheader">{w}</div>)}
            {Array.from({ length: lead }, (_, i) => <div key={`pad${i}`} className="p2gp-cell p2gp-cell--pad" aria-hidden="true" />)}
            {Array.from({ length: days }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, '0')}`;
              const day = byDate.get(date);
              const quiet = !day || (!day.declared && !day.uploaded && !day.gatePasses);
              return (
                <div key={date} className={`p2gp-cell${day?.missing ? ' p2gp-cell--missing' : ''}`} role="gridcell">
                  <span className="p2gp-date">{i + 1}</span>
                  {quiet ? null : (
                    <>
                      <span title="Deliveries reported on the gate pass">Done {day!.declared}</span>
                      <span title="Delivery files uploaded">Files {day!.uploaded}</span>
                      <span className={day!.missing ? 'p2gp-bad' : undefined} title="Deliveries without a delivery file">Missing {day!.missing}</span>
                      {outletView && day!.gatePassId ? (
                        <button type="button" className="p2w-link" disabled={opening === day!.gatePassId} onClick={() => void openPhoto(day!)}>
                          {opening === day!.gatePassId ? 'Opening…' : 'View photo'}
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </SectionCard>
  );
}
