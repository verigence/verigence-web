import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { BreakdownPanel } from '../bookings/JourneyListTabs';
import { getP2JourneyCounts } from '../../../services/audit-core/uc03P2';
import { istMonth, monthLabel, monthsUpTo } from '../../../services/audit-core/uc03ProjectTracker';
import SectionCard from '../../../components/SectionCard';

/**
 * Journeys, Dealership-wise / Outlet-wise / PC-wise (product owner 2026-11-13: "attached view should
 * be in the project tracker, so lets remove it from TL view"). The same counts the Team Lead's
 * dashboard showed -- bookings open, deliveries open, closed, overdue -- of a calendar month
 * (bookings by booking date, deliveries by delivery date). A row opens the journey list already
 * narrowed to it.
 */
export default function JourneyBreakdownTab({ tenantId, accessToken, listPath }: {
  tenantId: string; accessToken: string; listPath: string;
}) {
  const navigate = useNavigate();
  const current = useMemo(() => istMonth(), []);
  const months = useMemo(() => monthsUpTo(current), [current]);
  const [month, setMonth] = useState(current);
  const counts = useQuery({
    queryKey: ['p2-journey-counts', tenantId, 'overview', true, month],
    queryFn: () => getP2JourneyCounts(tenantId, accessToken, {
      search: '', month, dealerId: '', outletId: '', pcActorId: '', ...(month ? { monthBasis: 'business' as const } : {}),
    }, true),
    staleTime: 15_000,
  });
  const open = (key: 'dealer' | 'outlet' | 'pc', value: string) => {
    if (!value) return;
    const params = new URLSearchParams({ [key]: value, month });
    navigate(`${listPath}?${params.toString()}`);
  };
  const data = counts.data;
  const dealers = data?.byDealer ?? [];
  const hint = 'Click a row to open its journeys.';
  return (
    <div className="screen-stack">
      <SectionCard>
        <div className="p2du-toolbar">
          <label>Month
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              <option value="">All months</option>
            </select>
          </label>
          <span className="p2w-muted">
            {month ? `${monthLabel(month)}: bookings by their booking date, deliveries by their delivery date (India time).`
              : 'Every journey, whatever its month.'}
            {' '}B = bookings open · D = deliveries open · ✓ = closed · ! = overdue.
          </span>
        </div>
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
