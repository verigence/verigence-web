import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import '../../styles/dealguard-presence.css';
import SectionCard from '../../components/SectionCard';
import {
  formatDistance,
  getLocationChecks,
  STATUS_LABELS,
  type LocationCheckItem,
  type LocationCheckPerson,
} from '../../services/audit-core/locationChecks';
import type { TaskManagerMode } from '../../services/audit-core/taskManager';
import { SOURCE_LABELS } from '../task-manager/activityTally';
import { istParts } from './presenceSchedule';

function istTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
}

function where(item: LocationCheckItem): string {
  if (item.status === 'AT_OUTLET' || item.status === 'AWAY' || item.status === 'UNCLEAR') {
    return `${formatDistance(item.distanceM)} from ${item.outletName || 'the nearest outlet'}`;
  }
  return '';
}

function ItemLine({ item }: { item: LocationCheckItem }) {
  const device = item.deviceType ? SOURCE_LABELS[item.deviceType] ?? item.deviceType : item.source === 'NATIVE' ? 'App' : 'Browser';
  return (
    <li className="lc-item">
      <span>{istTime(item.checkedAtUtc)}</span>
      <span className={`lc-status lc-status--${item.status}`}>{STATUS_LABELS[item.status] ?? item.status}</span>
      {where(item) ? <span>{where(item)}</span> : null}
      {item.accuracyM !== null && item.accuracyM !== undefined ? <span>accuracy {formatDistance(item.accuracyM)}</span> : null}
      <span>{device}</span>
    </li>
  );
}

function PersonRow({ person }: { person: LocationCheckPerson }) {
  const [open, setOpen] = useState(false);
  const last = person.last;
  return (
    <li className={`lc-person${person.away ? ' lc-person--away' : ''}`}>
      <button type="button" className="lc-person__head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="lc-person__name">{person.name || person.actorId}</span>
        <span className="lc-person__counts">{person.checks} check{person.checks === 1 ? '' : 's'} · {person.away} away</span>
        <span className="lc-person__last">
          Last: {istTime(last.checkedAtUtc)} · {STATUS_LABELS[last.status] ?? last.status}
          {where(last) ? ` · ${where(last)}` : ''}
        </span>
      </button>
      {open ? (
        person.items.length
          ? <ul className="lc-items">{person.items.map((item) => <ItemLine key={item.checkId} item={item} />)}</ul>
          : <p className="lc-items">No checks to list.</p>
      ) : null}
    </li>
  );
}

/**
 * The day's DealGuard location checks of the Project's PCs (product owner,
 * 2026-11-05): TL, PM and Executive from DealGuard, SuperAdmin from Reports.
 */
export default function LocationChecksLog({ mode, tenantId, accessToken }: {
  mode: TaskManagerMode; tenantId: string; accessToken?: string;
}) {
  const [day, setDay] = useState(() => istParts(Date.now()).date);
  const [awayOnly, setAwayOnly] = useState(false);
  const query = useQuery({
    queryKey: ['location-checks', mode, tenantId, day, awayOnly],
    queryFn: () => getLocationChecks(mode, tenantId, day, awayOnly, accessToken),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
  const data = query.data;

  return (
    <>
      <SectionCard>
        <div className="lc-toolbar">
          <label>
            <span>Day</span>
            <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          </label>
          <label className="lc-check">
            <input type="checkbox" checked={awayOnly} onChange={(e) => setAwayOnly(e.target.checked)} />
            <span>Only away</span>
          </label>
        </div>
        {data ? (
          <p className="lc-summary">
            <span><strong>{data.totals.pcs}</strong> PCs checked</span>
            <span><strong>{data.totals.checks}</strong> checks</span>
            <span><strong>{data.totals.AWAY}</strong> away</span>
            <span><strong>{data.totals.AT_OUTLET}</strong> at outlet</span>
            <span><strong>{data.totals.UNCLEAR}</strong> unclear</span>
            <span><strong>{data.totals.DENIED + data.totals.UNAVAILABLE}</strong> no location</span>
          </p>
        ) : null}
        {data ? (
          <p className="p2w-muted">
            Checked at random 1–3 times an hour, {data.window.from}–{data.window.to} IST, while a PC uses DealGuard.
            Away means more than {formatDistance(data.radiusM)} from their nearest outlet; a reading less accurate
            than {formatDistance(data.accuracyLimitM)} (usually a computer) is unclear, not away.
          </p>
        ) : null}
      </SectionCard>
      {query.isLoading ? <SectionCard><p>Reading location checks…</p></SectionCard> : null}
      {query.isError ? <SectionCard><div className="form-alert form-alert--error">Location checks could not be read.</div></SectionCard> : null}
      {data && !data.people.length ? (
        <SectionCard><p className="p2w-muted">{awayOnly ? 'Nobody was found away on this day.' : 'No checks on this day.'}</p></SectionCard>
      ) : null}
      {data && data.people.length ? (
        <ul className="lc-people">
          {data.people.map((person) => <PersonRow key={person.actorId} person={person} />)}
        </ul>
      ) : null}
    </>
  );
}
