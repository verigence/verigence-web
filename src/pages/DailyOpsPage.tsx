import { Fragment, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import { createDailyOpsFlag } from '../services/audit-core/uc03Audit';
import { runtimeConfig } from '../services/runtime';
import { loadDailyOps } from '../services/webRepository';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-daily-ops.css';

// Daily Ops audit flags are a manual-only, PHYSICAL_OBSERVATION-style set --
// no automated Daily Ops rule engine exists yet (see uc03_daily_ops_flags.py).
// A narrower category list than the journey Audit view's (no
// DOCUMENT_EXCEPTION/CUSTOMER_IDENTITY_CONCERN/DELIVERY_EXCEPTION -- those
// only make sense against a journey's own documents/customer/delivery).
const DAILY_OPS_FLAG_CATEGORIES = [
  'PHYSICAL_OBSERVATION',
  'PAYMENT_EXCEPTION',
  'COMMERCIAL_EXCEPTION',
  'PROCESS_NON_COMPLIANCE',
  'OTHER',
] as const;
const SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

function friendlyCategory(value: string): string {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function RaiseFlagForm({
  runId,
  outletId,
  versionNo,
  onDone,
}: {
  runId: string;
  outletId: string;
  versionNo: number;
  onDone: (message: string, tone: 'ok' | 'err') => void;
}) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const [category, setCategory] = useState<(typeof DAILY_OPS_FLAG_CATEGORIES)[number]>('PROCESS_NON_COMPLIANCE');
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>('MEDIUM');
  const [summary, setSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!summary.trim()) return;
    setSubmitting(true);
    try {
      await createDailyOpsFlag(
        runtimeConfig.tenantId,
        outletId,
        runId,
        { category, severity, summary: summary.trim() },
        versionNo,
        accessToken,
      );
      onDone('Audit flag raised for this run.', 'ok');
    } catch (cause) {
      onDone(cause instanceof Error ? cause.message : 'The flag could not be raised.', 'err');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="daily-ops-flag-form">
      <label>
        <span>Category</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
          {DAILY_OPS_FLAG_CATEGORIES.map((c) => (
            <option key={c} value={c}>{friendlyCategory(c)}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Severity</span>
        <select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>{friendlyCategory(s)}</option>
          ))}
        </select>
      </label>
      <label className="daily-ops-flag-form__summary">
        <span>What happened</span>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="e.g. Cash count did not match the day's receipts"
        />
      </label>
      <button type="button" disabled={submitting || !summary.trim()} onClick={() => void submit()}>
        {submitting ? 'Raising…' : 'Raise Flag'}
      </button>
    </div>
  );
}

export default function DailyOpsPage() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['daily-ops'], queryFn: () => loadDailyOps({ accessToken }) });
  const items = query.data?.items || [];
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);

  const handleDone = (text: string, tone: 'ok' | 'err') => {
    setMessage({ text, tone });
    setOpenRunId(null);
    if (tone === 'ok') void queryClient.invalidateQueries({ queryKey: ['daily-ops'] });
  };

  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Outlet Operations" title="Daily Operations" description="Track the current day’s operating activity and review recent run history for your outlet." />
      <div className="metric-grid metric-grid--three">
        <article className="metric-card"><span className="metric-card__label">Business Date</span><strong className="metric-card__value metric-card__value--small">{new Date().toLocaleDateString('en-IN')}</strong><span className="metric-card__detail">Today</span></article>
        <article className="metric-card"><span className="metric-card__label">Runs Shown</span><strong className="metric-card__value">{items.length}</strong><span className="metric-card__detail">Recent outlet activity</span></article>
        <article className="metric-card"><span className="metric-card__label">Open Run</span><strong className="metric-card__value">{items.some((run) => run.status !== 'COMPLETED') ? '1' : '0'}</strong><span className="metric-card__detail">Needs completion</span></article>
      </div>
      {message && (
        <div className={`daily-ops-banner daily-ops-banner--${message.tone}`} role="status">{message.text}</div>
      )}
      <SectionCard title="Run History">
        <div className="adaptive-list__desktop">
          <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Business Date</th><th>Outlet</th><th>Process Coordinator</th><th>Started</th><th>Completed</th><th>Status</th><th>Audit</th></tr></thead><tbody>{items.map((run) => (
            <Fragment key={run.runId}>
              <tr>
                <td><strong>{run.businessDate}</strong></td>
                <td>{run.outletName || 'Current outlet'}</td>
                <td>{run.pcActorId ? 'Assigned' : 'Not assigned'}</td>
                <td>{new Date(run.startedAtUtc).toLocaleString('en-IN')}</td>
                <td>{run.completedAtUtc ? new Date(run.completedAtUtc).toLocaleString('en-IN') : '—'}</td>
                <td><StatusPill value={run.status} compact /></td>
                <td>
                  <button type="button" className="daily-ops-raise-btn" onClick={() => setOpenRunId(openRunId === run.runId ? null : run.runId)}>
                    {openRunId === run.runId ? 'Cancel' : 'Raise Flag'}
                  </button>
                </td>
              </tr>
              {openRunId === run.runId && (
                <tr>
                  <td colSpan={7}>
                    <RaiseFlagForm runId={run.runId} outletId={run.outletId} versionNo={run.versionNo} onDone={handleDone} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}</tbody></table></div>
        </div>
        <div className="adaptive-list adaptive-list__mobile">
          {items.map((run) => (
            <article className="adaptive-list-card" key={run.runId}>
              <div className="adaptive-list-card__head"><div><strong>{run.outletName || 'Current Outlet'}</strong><span>{run.businessDate}</span></div><StatusPill value={run.status} compact /></div>
              <div className="adaptive-list-card__details">
                <span>Coordinator <strong>{run.pcActorId ? 'Assigned' : 'Not assigned'}</strong></span>
                <span>Started <strong>{new Date(run.startedAtUtc).toLocaleString('en-IN')}</strong></span>
                <span>Completed <strong>{run.completedAtUtc ? new Date(run.completedAtUtc).toLocaleString('en-IN') : 'Not completed'}</strong></span>
              </div>
              <button type="button" className="daily-ops-raise-btn" onClick={() => setOpenRunId(openRunId === run.runId ? null : run.runId)}>
                {openRunId === run.runId ? 'Cancel' : 'Raise Flag'}
              </button>
              {openRunId === run.runId && (
                <RaiseFlagForm runId={run.runId} outletId={run.outletId} versionNo={run.versionNo} onDone={handleDone} />
              )}
            </article>
          ))}
          {items.length === 0 && <div className="adaptive-list-empty">No run history is available for this outlet.</div>}
        </div>
      </SectionCard>
    </div>
  );
}
