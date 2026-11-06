import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import '../../../styles/uc03-p2-journey-export.css';

import SectionCard from '../../../components/SectionCard';
import { AuditCoreHttpError } from '../../../services/audit-core/client';
import {
  getJourneyExportFileLink,
  getJourneyExports,
  getJourneyExportScope,
  rangeProblem,
  requestJourneyExport,
  type JourneyExport,
  type JourneyExportDateBasis,
} from '../../../services/audit-core/journeyExport';

const BASIS_LABEL: Record<JourneyExportDateBasis, string> = {
  BOOKING: 'Booking date', DELIVERY: 'Delivery date', UPLOADED: 'Upload date',
};

function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function monthStartIso(): string {
  return `${todayIso().slice(0, 8)}01`;
}

function errorText(cause: unknown, fallback: string): string {
  if (cause instanceof AuditCoreHttpError) return cause.problem?.detail || cause.problem?.title || fallback;
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

/** How far an export is, in words. */
export function exportProgress(item: Pick<JourneyExport, 'status' | 'total' | 'done' | 'rows' | 'error'>): string {
  if (item.status === 'PENDING') return 'Waiting to start…';
  if (item.status === 'RUNNING') return item.total ? `Building: ${item.done} of ${item.total} journeys` : 'Finding the journeys…';
  if (item.status === 'FAILED') return `Could not be built${item.error ? `: ${item.error}` : ''}`;
  const rows = item.rows ?? 0;
  return `${rows} journey${rows === 1 ? '' : 's'}${item.error ? ` · ${item.error}` : ''}`;
}

function DownloadLink({ tenantId, item, accessToken }: { tenantId: string; item: JourneyExport; accessToken?: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const download = async () => {
    setState('busy');
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
      const { url } = await getJourneyExportFileLink(tenantId, item.exportId, accessToken);
      if (tab) tab.location.href = url; else window.location.assign(url);
      setState('idle');
    } catch {
      tab?.close();
      setState('failed');
    }
  };
  return (
    <>
      <button type="button" className="p2w-button p2w-button--secondary" data-file-download disabled={state === 'busy'} onClick={() => void download()}>
        {state === 'busy' ? 'Opening…' : 'Download Excel'}
      </button>
      {state === 'failed' ? <span className="p2w-muted">could not be opened, try again</span> : null}
    </>
  );
}

/**
 * Journey export to Excel for Team Leads and above (product owner 2026-11-06):
 * every journey of a date range, a dealership, an outlet or all, in the columns
 * of the Deal Audit export. Built in the background (about a second a journey);
 * the list below shows progress and offers the file when it is ready.
 */
export default function JourneyExportPanel({ tenantId, accessToken }: { tenantId?: string; accessToken?: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [basis, setBasis] = useState<JourneyExportDateBasis>('BOOKING');
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const [dealerId, setDealerId] = useState('');
  const [outletId, setOutletId] = useState('');
  const [problem, setProblem] = useState<string>();

  const scope = useQuery({
    queryKey: ['journey-export-scope', tenantId],
    queryFn: () => getJourneyExportScope(tenantId!, accessToken),
    enabled: Boolean(tenantId && accessToken && open),
    staleTime: 300_000,
    retry: false,
  });
  const exports = useQuery({
    queryKey: ['journey-exports', tenantId],
    queryFn: () => getJourneyExports(tenantId!, accessToken),
    enabled: Boolean(tenantId && accessToken && open),
    // Poll while one is being built.
    refetchInterval: (query) => (query.state.data?.exports.some((e) => e.status === 'PENDING' || e.status === 'RUNNING')
      ? 4000 : false),
  });
  const dealers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of scope.data?.outlets ?? []) seen.set(o.dealerId, o.dealerName);
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [scope.data]);
  const outlets = (scope.data?.outlets ?? []).filter((o) => !dealerId || o.dealerId === dealerId);

  const ask = useMutation({
    mutationFn: () => requestJourneyExport(tenantId!, {
      dateBasis: basis,
      ...(from && to ? { dateFrom: from, dateTo: to } : {}),
      ...(dealerId ? { dealerId } : {}),
      ...(outletId ? { outletId } : {}),
    }, accessToken),
    onSuccess: () => {
      setProblem(undefined);
      void queryClient.invalidateQueries({ queryKey: ['journey-exports', tenantId] });
    },
    onError: (cause) => setProblem(errorText(cause, 'The export could not be started.')),
  });

  const submit = () => {
    const wrong = rangeProblem(from, to, scope.data?.maxRangeDays ?? 92);
    if (wrong) { setProblem(wrong); return; }
    ask.mutate();
  };

  if (!tenantId) return null;
  return (
    <SectionCard
      className="p2je"
      title="Export journeys to Excel"
      description={open ? 'Every journey of the dates, dealership or outlet you choose, in the Deal Audit columns: '
        + 'standard, actual and variance per charge and discount, and what was to be received against what was received.'
        : undefined}
      action={<button type="button" className="p2w-link" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Open'}</button>}
    >
      {open ? (
        <>
          {scope.isError ? (
            <div className="p2w-alert p2w-alert--error" role="alert">{errorText(scope.error, 'The export is not available.')}</div>
          ) : (
            <div className="p2je-form">
              <label className="p2je-field">
                Dates by
                <select value={basis} onChange={(e) => setBasis(e.target.value as JourneyExportDateBasis)}>
                  {(Object.keys(BASIS_LABEL) as JourneyExportDateBasis[]).map((b) => (
                    <option key={b} value={b}>{BASIS_LABEL[b]}</option>
                  ))}
                </select>
              </label>
              <label className="p2je-field">
                From
                <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="p2je-field">
                To
                <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </label>
              <label className="p2je-field">
                Dealership
                <select value={dealerId} onChange={(e) => { setDealerId(e.target.value); setOutletId(''); }}>
                  <option value="">All dealerships</option>
                  {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label className="p2je-field">
                Outlet
                <select value={outletId} onChange={(e) => setOutletId(e.target.value)}>
                  <option value="">All outlets</option>
                  {outlets.map((o) => <option key={o.outletId} value={o.outletId}>{o.outletName}</option>)}
                </select>
              </label>
              <button type="button" className="p2w-button p2w-button--secondary"
                onClick={() => { setFrom(''); setTo(''); }}>
                All dates
              </button>
              <button type="button" className="p2w-button p2w-button--primary" disabled={ask.isPending || scope.isLoading}
                onClick={submit}>
                {ask.isPending ? 'Starting…' : 'Export'}
              </button>
            </div>
          )}
          {problem ? <div className="p2w-alert p2w-alert--error" role="alert">{problem}</div> : null}
          {(exports.data?.exports.length ?? 0) > 0 ? (
            <ul className="p2je-list" aria-label="Your exports">
              {exports.data!.exports.map((item) => (
                <li key={item.exportId} className="p2je-item">
                  <span>
                    <span className="p2je-item__name">{item.fileName}</span>
                    <span className="p2w-muted"> · {exportProgress(item)}</span>
                  </span>
                  {item.status === 'RUNNING' && item.total ? (
                    <span className="p2je-bar" role="progressbar" aria-valuemin={0} aria-valuemax={item.total} aria-valuenow={item.done}>
                      <span style={{ width: `${Math.round((item.done / item.total) * 100)}%` }} />
                    </span>
                  ) : null}
                  {item.status === 'READY' ? <DownloadLink tenantId={tenantId} item={item} accessToken={accessToken} /> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </SectionCard>
  );
}
