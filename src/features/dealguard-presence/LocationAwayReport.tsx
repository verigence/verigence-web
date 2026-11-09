import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import '../../styles/dealguard-presence.css';
import '../../styles/location-away.css';
import SectionCard from '../../components/SectionCard';
import {
  formatDistance,
  getLocationAway,
  type AwayInstance,
  type AwayReport,
} from '../../services/audit-core/locationChecks';
import type { TaskManagerMode } from '../../services/audit-core/taskManager';
import {
  AWAY_THRESHOLDS_KM,
  DEFAULT_AWAY_KM,
  RANGE_PRESETS,
  awayCsv,
  dateLabel,
  deviceLabel,
  groupByDate,
  pcName,
  presetOf,
  presetRange,
  roughKm,
} from './awayReport';
import { istParts } from './presenceSchedule';

/** The server's limit: 'to' at most 92 days after 'from'. */
const MAX_SPAN_DAYS = 92;

function spanDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function downloadCsv(report: AwayReport) {
  const blob = new Blob([`﻿${awayCsv(report.instances)}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `location-away-over-${report.minKm}km-${report.from}-to-${report.to}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function Instance({ item }: { item: AwayInstance }) {
  return (
    <li className="la-instance">
      <span className="la-instance__time">{item.time}</span>
      <span className="la-instance__main">
        <strong>{pcName(item)}</strong>
        {' · '}
        <span className="la-km">{roughKm(item.distanceKm)}</span>
        {' from '}
        {item.outletName || 'the nearest outlet'}
      </span>
      <small className="la-instance__meta">
        {deviceLabel(item)}
        {item.accuracyM !== null && item.accuracyM !== undefined ? ` · accuracy ±${formatDistance(item.accuracyM)}` : ''}
      </small>
    </li>
  );
}

/**
 * Every DealGuard location check that found a PC more than N km (5 by default) from
 * their nearest outlet, date-wise, with roughly how far (product owner, 2026-11-09).
 * Executive (DealGuard) and SuperAdmin (Reports); Audit Core enforces who reads it.
 */
export default function LocationAwayReport({ mode, tenantId, accessToken }: {
  mode: TaskManagerMode; tenantId: string; accessToken?: string;
}) {
  const today = istParts(Date.now()).date;
  const [range, setRange] = useState(() => presetRange('this-month', today));
  const [minKm, setMinKm] = useState<number>(DEFAULT_AWAY_KM);
  const preset = presetOf(range, today);
  const span = spanDays(range.from, range.to);
  const rangeError = !range.from || !range.to
    ? 'Choose both dates.'
    : span < 0
      ? "'To' is before 'From'."
      : span > MAX_SPAN_DAYS
        ? `Choose at most ${MAX_SPAN_DAYS + 1} days at a time.`
        : null;

  const query = useQuery({
    queryKey: ['location-checks-away', mode, tenantId, range.from, range.to, minKm],
    queryFn: () => getLocationAway(mode, tenantId, { ...range, minKm }, accessToken),
    enabled: Boolean(tenantId && accessToken) && !rangeError,
    staleTime: 60_000,
  });
  const data = rangeError ? undefined : query.data;
  const groups = useMemo(() => groupByDate(data?.instances ?? []), [data]);

  return (
    <>
      <SectionCard>
        <div className="lc-toolbar la-toolbar">
          <div className="p2w-segment la-presets" role="group" aria-label="Quick dates">
            {RANGE_PRESETS.map((p) => (
              <button key={p.key} type="button" aria-pressed={preset === p.key}
                className={preset === p.key ? 'is-active' : ''}
                onClick={() => setRange(presetRange(p.key, today))}>{p.label}</button>
            ))}
          </div>
          <label>
            <span>From</span>
            <input type="date" value={range.from} max={today} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={range.to} max={today} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          </label>
          <label>
            <span>Away more than</span>
            <select value={minKm} onChange={(e) => setMinKm(Number(e.target.value))}>
              {AWAY_THRESHOLDS_KM.map((km) => <option key={km} value={km}>{km} km</option>)}
            </select>
          </label>
          {data?.instances.length ? (
            <button type="button" className="uc01-admin-button la-download" onClick={() => downloadCsv(data)}>
              Download CSV ({data.instances.length})
            </button>
          ) : null}
        </div>
        {rangeError ? <p className="la-error" role="alert">{rangeError}</p> : null}
        {data ? (
          <p className="lc-summary">
            <span><strong>{data.totals.instances}</strong> time{data.totals.instances === 1 ? '' : 's'} away more than {data.minKm} km</span>
            <span><strong>{data.totals.pcs}</strong> PC{data.totals.pcs === 1 ? '' : 's'}</span>
            <span><strong>{data.totals.days}</strong> day{data.totals.days === 1 ? '' : 's'}</span>
            {data.totals.furthestKm !== null ? <span>Furthest <strong>{roughKm(data.totals.furthestKm)}</strong></span> : null}
          </p>
        ) : null}
        {data ? (
          <p className="p2w-muted">
            Each line is one DealGuard check that found the PC more than {data.minKm} km from their nearest outlet,
            with roughly how far (straight line). A reading less accurate than {formatDistance(data.accuracyLimitM)} (usually a
            computer) is unclear, never away, so it is not listed here. Times are IST.
          </p>
        ) : null}
      </SectionCard>

      {query.isLoading && !rangeError ? <SectionCard><p>Reading location checks…</p></SectionCard> : null}
      {query.isError && !rangeError ? <SectionCard><div className="form-alert form-alert--error">Location checks could not be read.</div></SectionCard> : null}

      {data && !data.totals.instances ? (
        <SectionCard>
          <div className="la-empty">
            <strong>Nobody was more than {data.minKm} km away</strong>
            <p className="p2w-muted">No check between {dateLabel(data.from)} and {dateLabel(data.to)} found a PC more than {data.minKm} km from their nearest outlet.</p>
          </div>
        </SectionCard>
      ) : null}

      {data && data.byPc.length ? (
        <SectionCard>
          <h3 className="la-heading">By PC</h3>
          <div className="uc01-admin-table-wrap">
            <table className="uc01-admin-table la-table">
              <thead>
                <tr><th scope="col">PC</th><th scope="col" className="la-num">Times</th><th scope="col" className="la-num">Days</th><th scope="col" className="la-num">Furthest</th><th scope="col">Last seen away</th></tr>
              </thead>
              <tbody>
                {data.byPc.map((p) => (
                  <tr key={p.actorId}>
                    <td data-label="PC"><strong>{pcName(p)}</strong></td>
                    <td data-label="Times" className="la-num">{p.instances}</td>
                    <td data-label="Days" className="la-num">{p.days}</td>
                    <td data-label="Furthest" className="la-num">{roughKm(p.furthestKm)}</td>
                    <td data-label="Last seen away">
                      {dateLabel(p.last.date)}, {p.last.time}
                      <small>{roughKm(p.last.distanceKm)} from {p.last.outletName || 'the nearest outlet'}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      {data?.truncated ? (
        <div className="p2w-alert" role="status">
          Showing the first {data.instances.length} of {data.totals.instances}. Choose fewer days or a larger distance to see them all.
        </div>
      ) : null}

      {groups.length ? (
        <section className="la-days" aria-label="Date-wise">
          {groups.map((group) => (
            <article key={group.date} className="la-day">
              <header className="la-day__head">
                <h3>{dateLabel(group.date)}</h3>
                <span className="la-tag">{group.instances.length} time{group.instances.length === 1 ? '' : 's'}</span>
                <span className="la-day__meta">
                  {group.pcs} PC{group.pcs === 1 ? '' : 's'} · furthest {roughKm(group.furthestKm)}
                </span>
              </header>
              <ol className="la-instances">
                {group.instances.map((item) => <Instance key={item.checkId} item={item} />)}
              </ol>
            </article>
          ))}
        </section>
      ) : null}
    </>
  );
}
