import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { BreakdownPanel } from '../bookings/JourneyListTabs';
import { getP2JourneyCounts } from '../../../services/audit-core/uc03P2';
import { istDate } from '../../../services/audit-core/uc03MyWork';
import SectionCard from '../../../components/SectionCard';

/**
 * Journeys, Dealership-wise / Outlet-wise / PC-wise (product owner 2026-11-13: "attached view should
 * be in the project tracker, so lets remove it from TL view"). The same counts the Team Lead's
 * dashboard showed -- bookings open, deliveries open, closed, overdue -- of a calendar month
 * (bookings by booking date, deliveries by delivery date). A row opens the journey list already
 * narrowed to it. Over a date range (product owner 2026-11-14: "Journeys should have date range"),
 * this month by default: a journey whose booking date or delivery date is in it.
 */
export default function JourneyBreakdownTab({ tenantId, accessToken, listPath }: {
  tenantId: string; accessToken: string; listPath: string;
}) {
  const navigate = useNavigate();
  const today = useMemo(() => istDate(), []);
  const firstOfMonth = `${today.slice(0, 8)}01`;
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const valid = from <= to && to <= today;
  const counts = useQuery({
    queryKey: ['p2-journey-counts', tenantId, 'overview', true, from, to],
    queryFn: () => getP2JourneyCounts(tenantId, accessToken, {
      search: '', month: '', dealerId: '', outletId: '', pcActorId: '', dateFrom: from, dateTo: to,
    }, true),
    enabled: valid,
    staleTime: 15_000,
  });
  const open = (key: 'dealer' | 'outlet' | 'pc', value: string) => {
    if (!value) return;
    const params = new URLSearchParams({ [key]: value, from, to });
    navigate(`${listPath}?${params.toString()}`);
  };
  const pick = (f: string, t: string) => { setFrom(f); setTo(t); };
  const shift = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const data = counts.data;
  const dealers = data?.byDealer ?? [];
  const hint = 'Click a row to open its journeys.';
  return (
    <div className="screen-stack">
      <SectionCard>
        <div className="p2mw-controls">
          <span className="p2mw-range">
            <label>From <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
            <label>To <input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
            <button type="button" className="p2w-button p2w-button--ghost" onClick={() => pick(today, today)}>Today</button>
            <button type="button" className="p2w-button p2w-button--ghost" onClick={() => pick(shift(today, -6), today)}>Last 7 days</button>
            <button type="button" className="p2w-button p2w-button--ghost" onClick={() => pick(firstOfMonth, today)}>This month</button>
          </span>
        </div>
        <p className="p2w-muted">
          Journeys whose booking date or delivery date is in the range (India time).
          {' '}B = bookings open · D = deliveries open · ✓ = closed · ! = overdue.
        </p>
        {valid ? null : <div className="p2w-alert p2w-alert--error" role="alert">Choose a range ending today or earlier.</div>}
        {counts.isLoading ? <p className="p2w-muted">Loading…</p> : null}
        {counts.isError ? <div className="p2w-alert p2w-alert--error" role="alert">The journeys could not be counted.</div> : null}
      </SectionCard>
      {data ? (
        <div className={`uc03-tl-breakdown-grid${dealers.length > 1 ? ' uc03-tl-breakdown-grid--three' : ''}`}>
          {dealers.length > 1 ? (
            <BreakdownPanel title="Dealership-wise" hint={hint} selectedKey=""
              rows={dealers.map((d) => ({ key: d.dealer_id, label: d.dealer_name || 'Dealership', ...d }))}
              onSelect={(key) => open('dealer', key)} />
          ) : null}
          <BreakdownPanel title="Outlet-wise" hint={hint} selectedKey=""
            rows={(data.byOutlet ?? []).map((o) => ({ key: o.outlet_id, label: o.outlet_name ?? o.outlet_code ?? 'Outlet',
              secondary: o.outlet_code ?? undefined, ...o }))}
            onSelect={(key) => open('outlet', key)} />
          <BreakdownPanel title="PC-wise" hint={hint} selectedKey=""
            rows={(data.byPc ?? []).map((p) => ({ key: p.pc_actor_id ?? '', label: p.pc_name || 'PC not recorded', ...p }))}
            onSelect={(key) => open('pc', key)} />
        </div>
      ) : null}
    </div>
  );
}
