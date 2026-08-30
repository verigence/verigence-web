import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import {
  listAllTlSupervisoryCases,
  tlBusinessStage,
  tlPcLabel,
  type TlBusinessStage,
  type TlSupervisoryCase,
} from '../services/audit-core/uc03Tl';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

type StageFilter = 'ALL' | TlBusinessStage;

const STAGE_LABELS: Record<TlBusinessStage, string> = {
  BOOKING_SUBMITTED: 'Booking Submitted',
  DELIVERY_IN_PROGRESS: 'Delivery In Progress',
  DELIVERY_COMPLETED: 'Delivery Completed',
};

function friendlyStatus(value?: string | null): string {
  if (!value) return 'Not started';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDateTime(value: string | null, timezoneName: string): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezoneName,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatAge(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function stageClass(stage: TlBusinessStage): string {
  switch (stage) {
    case 'DELIVERY_COMPLETED': return 'is-complete';
    case 'DELIVERY_IN_PROGRESS': return 'is-progress';
    default: return 'is-submitted';
  }
}

function MetricCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <article className="uc03-tl-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

type BreakdownRow = {
  key: string;
  label: string;
  secondary?: string;
  count: number;
  booking: number;
  delivery: number;
  completed: number;
};

function BreakdownPanel({
  title,
  rows,
  selectedKey,
  onSelect,
}: {
  title: string;
  rows: BreakdownRow[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  return (
    <section className="uc03-tl-panel">
      <header className="uc03-tl-panel__header">
        <div>
          <h2>{title}</h2>
          <p>Click a row to filter the case list.</p>
        </div>
        {selectedKey && <button type="button" onClick={() => onSelect('')}>Clear</button>}
      </header>
      <div className="uc03-tl-breakdown">
        {rows.map((row) => (
          <button
            type="button"
            key={row.key}
            className={selectedKey === row.key ? 'is-selected' : ''}
            onClick={() => onSelect(selectedKey === row.key ? '' : row.key)}
          >
            <span className="uc03-tl-breakdown__identity">
              <strong>{row.label}</strong>
              {row.secondary && <small>{row.secondary}</small>}
            </span>
            <span className="uc03-tl-breakdown__total">{row.count}</span>
            <span className="uc03-tl-breakdown__mix">
              <small>B {row.booking}</small>
              <small>D {row.delivery}</small>
              <small>✓ {row.completed}</small>
            </span>
          </button>
        ))}
        {rows.length === 0 && <p className="uc03-tl-empty-inline">No submitted cases in this scope.</p>}
      </div>
    </section>
  );
}

function CaseRow({ item, timezoneName }: { item: TlSupervisoryCase; timezoneName: string }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const stage = tlBusinessStage(item);
  const rawStatus = stage === 'BOOKING_SUBMITTED'
    ? item.bookingBusinessStatus
    : item.deliveryBusinessStatus;

  return (
    <article className={`uc03-tl-case${expanded ? ' is-expanded' : ''}`}>
      <div className="uc03-tl-case__main">
        <div className="uc03-tl-case__customer">
          <strong>{item.customerDisplayName}</strong>
          <span>{item.bookingReference || 'Booking reference pending'}</span>
          <small>{item.productLabel || 'Vehicle not captured'}</small>
        </div>
        <div className="uc03-tl-case__scope">
          <strong>{item.outletName}</strong>
          <span>{item.dealerName}</span>
        </div>
        <div className="uc03-tl-case__pc">
          <strong>{tlPcLabel(item.responsiblePcActorId)}</strong>
          <span>{item.pcVerificationStatus ? `PC review ${friendlyStatus(item.pcVerificationStatus)}` : 'PC submission recorded'}</span>
        </div>
        <div className="uc03-tl-case__stage">
          <strong className={`uc03-tl-stage ${stageClass(stage)}`}>{STAGE_LABELS[stage]}</strong>
          <span>{friendlyStatus(rawStatus)}</span>
        </div>
        <div className="uc03-tl-case__attention">
          <strong>{item.openFlagCount > 0 ? `${item.openFlagCount} flag${item.openFlagCount === 1 ? '' : 's'}` : 'No open flags'}</strong>
          <span>{item.highestOpenSeverity ? `${friendlyStatus(item.highestOpenSeverity)} severity` : formatAge(item.latestActivityAtUtc)}</span>
        </div>
        <button type="button" className="uc03-tl-case__toggle" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Hide' : 'View'}
        </button>
      </div>

      {expanded && (
        <div className="uc03-tl-case__details">
          <div>
            <span>Booking submitted</span>
            <strong>{formatDateTime(item.bookingSubmittedAtUtc, timezoneName)}</strong>
          </div>
          <div>
            <span>Booking business date</span>
            <strong>{item.bookingBusinessDate || 'Not recorded'}</strong>
          </div>
          <div>
            <span>Delivery business date</span>
            <strong>{item.deliveryBusinessDate || 'Not started'}</strong>
          </div>
          <div>
            <span>Latest activity</span>
            <strong>{formatDateTime(item.latestActivityAtUtc, timezoneName)}</strong>
          </div>
          <div>
            <span>Customer mobile</span>
            <strong>{item.customerMobileLast4 ? `•••• ${item.customerMobileLast4}` : 'Not available'}</strong>
          </div>
          <div>
            <span>Responsible PC reference</span>
            <strong>{item.responsiblePcActorId || 'Not recorded'}</strong>
          </div>
          <div className="uc03-tl-case__review-action">
            <span>TL action</span>
            <button type="button" onClick={() => navigate(`/tl/cases/${item.journeyId}/review`)}>
              Review / Verify
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export default function TeamLeadDashboardPage() {
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [search, setSearch] = useState('');
  const [outletId, setOutletId] = useState('');
  const [pcActorId, setPcActorId] = useState('');
  const [stageFilter, setStageFilter] = useState<StageFilter>('ALL');

  const casesQuery = useQuery({
    queryKey: ['uc03-tl-supervisory-cases', project?.tenantId],
    queryFn: () => listAllTlSupervisoryCases(project!.tenantId, accessToken),
    enabled: Boolean(project?.tenantId && accessToken && project?.operatingRole === 'TL'),
    retry: 1,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const cases = casesQuery.data ?? [];
  const timezoneName = project?.timezoneName || 'UTC';

  const stageCounts = useMemo(() => {
    const result: Record<TlBusinessStage, number> = {
      BOOKING_SUBMITTED: 0,
      DELIVERY_IN_PROGRESS: 0,
      DELIVERY_COMPLETED: 0,
    };
    cases.forEach((item) => { result[tlBusinessStage(item)] += 1; });
    return result;
  }, [cases]);

  const outletRows = useMemo<BreakdownRow[]>(() => {
    const grouped = new Map<string, BreakdownRow>();
    cases.forEach((item) => {
      const stage = tlBusinessStage(item);
      const current = grouped.get(item.outletId) ?? {
        key: item.outletId,
        label: item.outletName,
        secondary: item.dealerName,
        count: 0,
        booking: 0,
        delivery: 0,
        completed: 0,
      };
      current.count += 1;
      if (stage === 'BOOKING_SUBMITTED') current.booking += 1;
      if (stage === 'DELIVERY_IN_PROGRESS') current.delivery += 1;
      if (stage === 'DELIVERY_COMPLETED') current.completed += 1;
      grouped.set(item.outletId, current);
    });
    return [...grouped.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  }, [cases]);

  const pcRows = useMemo<BreakdownRow[]>(() => {
    const grouped = new Map<string, BreakdownRow>();
    cases.forEach((item) => {
      const key = item.responsiblePcActorId || '__UNRECORDED__';
      const stage = tlBusinessStage(item);
      const current = grouped.get(key) ?? {
        key,
        label: tlPcLabel(item.responsiblePcActorId),
        count: 0,
        booking: 0,
        delivery: 0,
        completed: 0,
      };
      current.count += 1;
      if (stage === 'BOOKING_SUBMITTED') current.booking += 1;
      if (stage === 'DELIVERY_IN_PROGRESS') current.delivery += 1;
      if (stage === 'DELIVERY_COMPLETED') current.completed += 1;
      grouped.set(key, current);
    });
    return [...grouped.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  }, [cases]);

  const filteredCases = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return cases.filter((item) => {
      if (outletId && item.outletId !== outletId) return false;
      const itemPcKey = item.responsiblePcActorId || '__UNRECORDED__';
      if (pcActorId && itemPcKey !== pcActorId) return false;
      const stage = tlBusinessStage(item);
      if (stageFilter !== 'ALL' && stage !== stageFilter) return false;
      if (!normalizedSearch) return true;
      return [
        item.customerDisplayName,
        item.bookingReference,
        item.productLabel,
        item.dealerName,
        item.outletName,
        item.responsiblePcActorId,
      ].some((value) => value?.toLowerCase().includes(normalizedSearch));
    });
  }, [cases, outletId, pcActorId, search, stageFilter]);

  if (!project || project.operatingRole !== 'TL') return null;

  const dealerCount = new Set(cases.map((item) => item.dealerId)).size || project.scope.dealerCount;
  const outletCount = new Set(cases.map((item) => item.outletId)).size || project.scope.outletCount;
  const scopeSummary = project.scope.allDealers
    ? `All dealers · All outlets`
    : `${dealerCount} dealer${dealerCount === 1 ? '' : 's'} · ${outletCount} outlet${outletCount === 1 ? '' : 's'}`;
  const openFlags = cases.reduce((sum, item) => sum + item.openFlagCount, 0);
  const activeFilterCount = Number(Boolean(outletId)) + Number(Boolean(pcActorId)) + Number(stageFilter !== 'ALL') + Number(Boolean(search.trim()));

  const clearFilters = () => {
    setSearch('');
    setOutletId('');
    setPcActorId('');
    setStageFilter('ALL');
  };

  return (
    <div className="screen-stack uc03-tl-dashboard">
      <section className="uc03-tl-hero">
        <div>
          <span className="uc03-tl-hero__eyebrow">Team Lead · Supervisory View</span>
          <h1>Dealer Operations Overview</h1>
          <p>{scopeSummary}</p>
        </div>
        <div className="uc03-tl-hero__note">
          <strong>Submitted work only</strong>
          <span>PC drafts stay private until submitted. TL review is optional.</span>
        </div>
      </section>

      {casesQuery.isError ? (
        <section className="dashboard-load-state" role="alert">
          <div className="dashboard-load-state__mark" aria-hidden="true">!</div>
          <div className="dashboard-load-state__copy">
            <strong>We couldn't load the Team Lead overview.</strong>
            <p>Please try again. No supervisory counts were calculated from partial data.</p>
          </div>
          <button type="button" className="user-menu-button" onClick={() => casesQuery.refetch()}>Try Again</button>
        </section>
      ) : casesQuery.isPending ? (
        <div className="uc03-work-loading" role="status">Loading Team Lead overview…</div>
      ) : (
        <>
          <section className="uc03-tl-metrics" aria-label="Supervisory summary">
            <MetricCard label="Submitted / Progressed" value={cases.length} detail="All visible cases" />
            <MetricCard label="Booking Submitted" value={stageCounts.BOOKING_SUBMITTED} detail="Awaiting delivery progress" />
            <MetricCard label="Delivery In Progress" value={stageCounts.DELIVERY_IN_PROGRESS} detail="Delivery work underway" />
            <MetricCard label="Delivery Completed" value={stageCounts.DELIVERY_COMPLETED} detail="Business stage completed" />
            <MetricCard label="Open Flags" value={openFlags} detail="Across visible TL scope" />
          </section>

          <div className="uc03-tl-breakdown-grid">
            <BreakdownPanel title="Outlet-wise" rows={outletRows} selectedKey={outletId} onSelect={setOutletId} />
            <BreakdownPanel title="PC-wise" rows={pcRows} selectedKey={pcActorId} onSelect={setPcActorId} />
          </div>

          <section className="uc03-tl-panel uc03-tl-cases" aria-labelledby="uc03-tl-cases-title">
            <header className="uc03-tl-cases__header">
              <div>
                <h2 id="uc03-tl-cases-title">Submitted Cases</h2>
                <p>{filteredCases.length} of {cases.length} case{cases.length === 1 ? '' : 's'} shown</p>
              </div>
              {activeFilterCount > 0 && <button type="button" onClick={clearFilters}>Clear {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}</button>}
            </header>

            <div className="uc03-tl-filters">
              <label className="uc03-tl-search">
                <span>Search</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Customer, booking, vehicle, outlet or PC"
                />
              </label>
              <label>
                <span>Outlet</span>
                <select value={outletId} onChange={(event) => setOutletId(event.target.value)}>
                  <option value="">All outlets</option>
                  {outletRows.map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}
                </select>
              </label>
              <label>
                <span>Responsible PC</span>
                <select value={pcActorId} onChange={(event) => setPcActorId(event.target.value)}>
                  <option value="">All PCs</option>
                  {pcRows.map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}
                </select>
              </label>
              <label>
                <span>Business stage</span>
                <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value as StageFilter)}>
                  <option value="ALL">All stages</option>
                  <option value="BOOKING_SUBMITTED">Booking Submitted</option>
                  <option value="DELIVERY_IN_PROGRESS">Delivery In Progress</option>
                  <option value="DELIVERY_COMPLETED">Delivery Completed</option>
                </select>
              </label>
            </div>

            <div className="uc03-tl-case-list">
              {filteredCases.length > 0 && (
                <div className="uc03-tl-case-head" aria-hidden="true">
                  <span>Case</span><span>Outlet</span><span>PC</span><span>Business Stage</span><span>Attention</span><span />
                </div>
              )}
              {filteredCases.map((item) => <CaseRow key={item.journeyId} item={item} timezoneName={timezoneName} />)}
              {filteredCases.length === 0 && (
                <div className="uc03-work-empty">
                  <strong>No submitted cases match these filters.</strong>
                  <p>Clear one or more filters to return to the full Team Lead scope.</p>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
