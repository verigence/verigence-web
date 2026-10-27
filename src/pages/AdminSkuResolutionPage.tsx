import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '../components/PageHeader';
import {
  getSkuApplyCheck,
  getSkuResolutionRun,
  listSkuResolutionRuns,
  runSkuResolutionForProject,
  type SkuResolutionRunDetail,
  type SkuResolutionRunSummary,
  type SkuRunCursor,
  type SkuRunMode,
  type SkuRunOutcome,
} from '../services/audit-core/skuResolution';
import { listProjects } from '../services/audit-core/uc02Admin';
import { useSessionStore } from '../store/sessionStore';
import AdminSkuReviewTable from './AdminSkuReviewTable';
import { applyEnabled, checkSummaryLine, confirmLines, isReviewRun, runKindLabel } from './skuReview';

type ReviewMode = 'CHECK' | 'APPLY';

const MODE_OF: Record<ReviewMode, SkuRunMode> = { CHECK: 'RERESOLVE_DRY_RUN', APPLY: 'RERESOLVE_COMMIT' };

const OUTCOME_LABEL: Record<SkuRunOutcome, string> = {
  NEWLY_MATCHED: 'Matched now',
  ALREADY_HAD_SKU: 'Already had a SKU',
  STILL_UNMATCHED: 'Not matched',
  FAILED: 'Failed',
};

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

function RunSummary({ run, runs }: { run: SkuResolutionRunSummary; runs: SkuResolutionRunSummary[] }) {
  if (isReviewRun(run.runMode)) {
    const counts = run.actionCounts ?? {};
    const applied = run.runMode === 'RERESOLVE_COMMIT';
    const basedOn = run.checkedByRunId ? runs.find((r) => r.runId === run.checkedByRunId) : undefined;
    return (
      <p>
        <strong>{run.status === 'COMPLETE' ? 'Done' : 'Running'}.</strong> {runKindLabel(run.runMode)}:{' '}
        {run.journeysProcessed} of {run.journeysTotal} journeys {applied ? 'decided' : 'checked'}.
        <br />
        {applied ? 'Changed' : 'Will change'}: <strong>{counts.CHANGE ?? 0}</strong> · Needs PC confirmation:{' '}
        <strong>{counts.CONFIRM ?? 0}</strong> · Keep as it is: {counts.KEEP ?? 0} · Left alone: {counts.LEFT_ALONE ?? 0} ·
        Failed: <strong>{run.failed}</strong>
        {applied && run.checkedByRunId ? (
          <>
            <br />
            Applied the check of {basedOn ? when(basedOn.startedAtUtc) : run.checkedByRunId.slice(0, 8)}.
          </>
        ) : null}
        <br />
        Journeys with a SKU: {run.withSkuBefore} → {run.withSkuAfter}
      </p>
    );
  }
  return (
    <p>
      <strong>{run.status === 'COMPLETE' ? 'Done' : 'Running'}.</strong>{' '}
      {run.journeysProcessed} of {run.journeysTotal} Journeys processed.
      <br />
      Matched now: <strong>{run.newlyMatched}</strong> · Already had a SKU: {run.alreadyHadSku} · Not matched:{' '}
      <strong>{run.stillUnmatched}</strong> · Failed: <strong>{run.failed}</strong>
      <br />
      Journeys with a SKU: {run.withSkuBefore} → {run.withSkuAfter}
    </p>
  );
}

function RunDetail({ run }: { run: SkuResolutionRunDetail }) {
  if (isReviewRun(run.runMode)) return <AdminSkuReviewTable run={run} />;
  return (
    <div className="oem-masters__table-wrap">
      <table className="oem-masters__table">
        <thead>
          <tr><th>Journey</th><th>Vehicle (as booked)</th><th>Result</th><th>SKU</th><th>Note</th></tr>
        </thead>
        <tbody>
          {run.items.map((item) => (
            <tr key={item.journeyId}>
              <td>{item.journeyLabel || item.journeyId.slice(0, 8)}</td>
              <td>{item.modelLabel || '—'}</td>
              <td>{OUTCOME_LABEL[item.outcome]}</td>
              <td>{item.skuCode || '—'}</td>
              <td>{item.detail || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function historyLine(item: SkuResolutionRunSummary) {
  if (isReviewRun(item.runMode)) {
    const counts = item.actionCounts ?? {};
    const verb = item.runMode === 'RERESOLVE_COMMIT' ? 'changed' : 'will change';
    return `${when(item.startedAtUtc)} · ${runKindLabel(item.runMode)} · ${counts.CHANGE ?? 0} ${verb} · ${counts.CONFIRM ?? 0} need confirmation · ${item.failed} failed${item.status === 'RUNNING' ? ' · not finished' : ''}`;
  }
  return `${when(item.startedAtUtc)} · ${runKindLabel(item.runMode)} · ${item.journeysProcessed}/${item.journeysTotal} processed · ${item.stillUnmatched} not matched · ${item.failed} failed`;
}

/** The "are you sure" before anything is written: says what the check found, in numbers. */
function ConfirmApply({
  lines,
  busy,
  onCancel,
  onConfirm,
}: {
  lines: string[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => previous?.focus?.();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);
  return (
    <div
      className="uc01-admin-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section ref={panel} tabIndex={-1} className="uc01-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="sku-confirm-title">
        <div>
          <span className="eyebrow">Apply the checked changes</span>
          <h2 id="sku-confirm-title">Change the SKUs now?</h2>
        </div>
        <ul className="sku-confirm__lines">
          {lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
        <div className="sku-confirm__actions">
          <button type="button" className="button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="button button--primary" onClick={onConfirm} disabled={busy}>Apply changes</button>
        </div>
      </section>
    </div>
  );
}

export default function AdminSkuResolutionPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [tenantId, setTenantId] = useState('');
  const [reviewMode, setReviewMode] = useState<ReviewMode>('CHECK');
  const [confirming, setConfirming] = useState(false);
  const cursor = useRef<SkuRunCursor>({ offset: 0, processed: 0, total: 0 });
  const startedMode = useRef<ReviewMode>('CHECK');
  const [progress, setProgress] = useState<SkuRunCursor>();
  const [openRunId, setOpenRunId] = useState<string>();

  const projectsQuery = useQuery({
    queryKey: ['admin-sku-resolution-projects'],
    queryFn: () => listProjects(accessToken),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
    retry: 1,
  });
  const runsQuery = useQuery({
    queryKey: ['admin-sku-resolution-runs', tenantId],
    queryFn: () => listSkuResolutionRuns(tenantId, accessToken!),
    enabled: Boolean(tenantId && accessToken),
    retry: 1,
  });
  const gateQuery = useQuery({
    queryKey: ['admin-sku-resolution-apply-check', tenantId],
    queryFn: () => getSkuApplyCheck(tenantId, accessToken!),
    enabled: Boolean(tenantId && accessToken),
    retry: 1,
  });
  const detailQuery = useQuery({
    queryKey: ['admin-sku-resolution-run', tenantId, openRunId],
    queryFn: () => getSkuResolutionRun(tenantId, openRunId!, accessToken!),
    enabled: Boolean(tenantId && openRunId && accessToken),
    retry: 1,
  });
  const run = useMutation({
    mutationFn: (mode: ReviewMode) => {
      startedMode.current = mode;
      return runSkuResolutionForProject(tenantId, accessToken!, cursor.current, setProgress, MODE_OF[mode]);
    },
    onSuccess: (runId) => {
      cursor.current = { offset: 0, processed: 0, total: 0 };
      setProgress(undefined);
      setOpenRunId(runId);
      // After an Apply the check is used up; after a Check, Apply can now be pressed.
      setReviewMode('CHECK');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-sku-resolution-runs', tenantId] });
      void queryClient.invalidateQueries({ queryKey: ['admin-sku-resolution-apply-check', tenantId] });
      void queryClient.invalidateQueries({ queryKey: ['admin-sku-resolution-run'] });
    },
  });

  const gate = gateQuery.data;
  const check = gate?.check ?? null;
  const canApply = applyEnabled(gate, run.isPending);
  const resuming = run.isError && Boolean(progress);

  const start = (mode: ReviewMode) => {
    setConfirming(false);
    run.mutate(mode);
  };

  return (
    <section className="admin-landing screen-stack">
      <PageHeader
        eyebrow="Administration · SKU Resolution"
        title="Run SKU Resolution"
        description="Re-checks every Journey's vehicle against the price list in force on its booking date. First check, read what would change, then apply. A check changes nothing; a SKU a PC or Team Lead set is never changed."
      />
      <div className="uc01-admin-config-grid">
        <article className="uc01-admin-config-card">
          <span className="eyebrow">Project</span>
          <h2>Check and apply SKUs for a Project</h2>
          <label className="uc03-booking-field">
            <span>Project / Tenant</span>
            <select
              value={tenantId}
              disabled={projectsQuery.isPending || run.isPending}
              onChange={(event) => {
                setTenantId(event.target.value);
                setOpenRunId(undefined);
                setReviewMode('CHECK');
                cursor.current = { offset: 0, processed: 0, total: 0 };
                setProgress(undefined);
                run.reset();
              }}
            >
              <option value="">Select Project</option>
              {(projectsQuery.data ?? []).map((p) => (
                <option key={p.tenantId} value={p.tenantId}>{p.projectName} · {p.projectCode}</option>
              ))}
            </select>
          </label>
          {projectsQuery.isError ? (
            <div className="uc01-admin-message uc01-admin-message--error">Projects could not be loaded.</div>
          ) : null}

          <fieldset className="sku-mode" disabled={!tenantId || run.isPending || resuming}>
            <legend>What do you want to do?</legend>
            <label className={`sku-mode__option${reviewMode === 'CHECK' ? ' is-selected' : ''}`}>
              <input type="radio" name="sku-mode" checked={reviewMode === 'CHECK'} onChange={() => setReviewMode('CHECK')} />
              <strong>Check only — no changes</strong>
              <small>Reads every journey and lists what would happen to its SKU. Nothing is saved on any journey.</small>
            </label>
            <label className={`sku-mode__option${reviewMode === 'APPLY' ? ' is-selected' : ''}`}>
              <input type="radio" name="sku-mode" checked={reviewMode === 'APPLY'} onChange={() => setReviewMode('APPLY')} />
              <strong>Apply the checked changes</strong>
              <small>Writes the decisions of a finished check, started in the last 24 hours. It is available only after a check.</small>
              {tenantId && gateQuery.isPending ? <span className="sku-mode__note">Looking for a check…</span> : null}
              {tenantId && gateQuery.isError ? <span className="sku-mode__note sku-mode__note--warn">Could not look for a check. Reload the page.</span> : null}
              {tenantId && gate ? (
                <span className={`sku-mode__note${gate.allowed ? '' : ' sku-mode__note--warn'}`}>
                  {gate.allowed && check ? checkSummaryLine(check) : gate.message}
                </span>
              ) : null}
            </label>
          </fieldset>

          <div className="sku-actions">
            {reviewMode === 'CHECK' || resuming ? (
              <button
                type="button"
                className="button button--primary"
                disabled={!tenantId || !accessToken || run.isPending}
                onClick={() => (resuming ? start(startedMode.current) : start('CHECK'))}
              >
                {run.isPending
                  ? (progress ? `${startedMode.current === 'APPLY' ? 'Applying' : 'Checking'}… ${progress.processed} of ${progress.total} journeys` : 'Starting…')
                  : resuming
                    ? `Resume (${progress?.processed} of ${progress?.total} done)`
                    : 'Check SKUs'}
              </button>
            ) : (
              <button
                type="button"
                className="button button--primary"
                disabled={!tenantId || !accessToken || !canApply}
                onClick={() => setConfirming(true)}
              >
                {run.isPending
                  ? (progress ? `Applying… ${progress.processed} of ${progress.total} journeys` : 'Starting…')
                  : 'Apply'}
              </button>
            )}
          </div>
          {run.isError ? (
            <div className="uc01-admin-message uc01-admin-message--error" role="alert">
              {run.error instanceof Error ? run.error.message : 'The run could not be completed.'}
              {progress ? ` Stopped after ${progress.processed} of ${progress.total} journeys. Press Resume to carry on from there; what was done is kept.` : ''}
            </div>
          ) : null}
          {run.isSuccess ? (
            <div className="uc01-admin-message" role="status">
              Done. The result is listed below{startedMode.current === 'CHECK' ? ': read it, then choose "Apply the checked changes".' : '.'}
            </div>
          ) : null}
        </article>

        {tenantId ? (
          <article className="uc01-admin-config-card">
            <span className="eyebrow">History</span>
            <h2>Previous runs</h2>
            {runsQuery.isPending ? <p>Loading…</p> : null}
            {runsQuery.isError ? <div className="uc01-admin-message uc01-admin-message--error">Runs could not be loaded.</div> : null}
            {runsQuery.data?.length === 0 ? <p>No runs yet for this Project.</p> : null}
            {(runsQuery.data ?? []).map((item) => (
              <div key={item.runId} className="sku-history__row">
                <button type="button" className="button" onClick={() => setOpenRunId(openRunId === item.runId ? undefined : item.runId)}>
                  {historyLine(item)}
                </button>
                {openRunId === item.runId ? (
                  <>
                    <RunSummary run={item} runs={runsQuery.data ?? []} />
                    {detailQuery.isPending ? <p>Loading Journeys…</p> : null}
                    {detailQuery.isError ? <div className="uc01-admin-message uc01-admin-message--error">This run could not be loaded.</div> : null}
                    {detailQuery.data ? <RunDetail run={detailQuery.data} /> : null}
                  </>
                ) : null}
              </div>
            ))}
          </article>
        ) : null}
      </div>
      {confirming && check ? (
        <ConfirmApply
          lines={confirmLines(check)}
          busy={run.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => start('APPLY')}
        />
      ) : null}
    </section>
  );
}
