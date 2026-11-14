import { useMemo, useRef, useState, type DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import SectionCard from '../../../components/SectionCard';
import {
  JOURNEY_STATUSES,
  RECEIPT_OUTCOMES,
  dealerFromStatementName,
  downloadBankReport,
  getBankSetup,
  getBankStatement,
  listBankStatements,
  rematchBankStatement,
  rupees,
  uploadBankStatement,
  type BankStatement,
  type JourneyStatus,
  type ReceiptOutcome,
} from '../../../services/audit-core/uc03BankStatements';
import { monthLabel } from '../../../services/audit-core/uc03ProjectTracker';

type Pending = { id: string; file: File; dealerId: string; outletId: string; state: 'ready' | 'uploading' | 'done' | 'failed'; message?: string };
type View = 'journeys' | 'receipts' | 'credits';

function day(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(`${value}T00:00:00`));
}

function when(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .format(new Date(value));
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const n = (value: number | undefined) => value ?? 0;
const period = (s: BankStatement) => (s.periodFrom === s.periodTo ? day(s.periodFrom) : `${day(s.periodFrom)} – ${day(s.periodTo)}`);

/**
 * Bank statements on the Data uploads tab (product owner 14 Nov 2026): the dealership's own
 * account statement, per dealership or per outlet, any bank, PDF or Excel. The receipts dated
 * within the statement's period +/- 5 days are checked against its credits: how many are not
 * found in the bank, which journeys are fully or partly verified, how much is verified and how
 * much is left -- and which credits no receipt on file stands for.
 */
export default function BankStatementsSection({ tenantId, accessToken, month, dealerId, onError }: {
  tenantId?: string;
  accessToken?: string;
  month: string;
  dealerId: string;
  onError: (message: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const enabled = Boolean(tenantId && accessToken);
  const [pending, setPending] = useState<Pending[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>('journeys');
  const [outcome, setOutcome] = useState<ReceiptOutcome | ''>('NOT_FOUND');
  const [journeyStatus, setJourneyStatus] = useState<JourneyStatus | ''>('');
  const [creditView, setCreditView] = useState<'UNIDENTIFIED' | 'MATCHED' | ''>('UNIDENTIFIED');
  const input = useRef<HTMLInputElement>(null);

  const setup = useQuery({ queryKey: ['bank-setup', tenantId], queryFn: () => getBankSetup(tenantId!, accessToken), enabled });
  const statements = useQuery({
    queryKey: ['bank-statements', tenantId, month, dealerId],
    queryFn: () => listBankStatements(tenantId!, month, accessToken, dealerId || undefined),
    enabled,
  });
  const detail = useQuery({
    queryKey: ['bank-statement', tenantId, selected],
    queryFn: () => getBankStatement(tenantId!, selected!, accessToken),
    enabled: enabled && Boolean(selected),
  });
  const dealers = setup.data?.dealers ?? [];
  const windowDays = setup.data?.windowDays ?? 5;
  const items = statements.data?.items ?? [];
  const current = items.filter((s) => s.status === 'ACTIVE');
  const total = useMemo(() => {
    const sum = (key: keyof BankStatement['counts']) => current.reduce((acc, s) => acc + Number(s.counts[key] ?? 0), 0);
    return {
      receipts: sum('receipts'), matched: sum('matched'), notFound: sum('notFound'), notFoundAmount: sum('notFoundAmount'),
      verifiedAmount: sum('verifiedAmount'), leftAmount: sum('leftAmount'), journeysVerified: sum('journeysVerified'),
      journeysPartial: sum('journeysPartial'), journeysNotVerified: sum('journeysNotVerified'),
      creditsNamingCustomer: sum('creditsNamingCustomer'), creditsNamingCustomerAmount: sum('creditsNamingCustomerAmount'),
    };
  }, [current]);

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const list = [...files].filter((f) => /\.(pdf|xlsx|xlsm|xls|csv)$/i.test(f.name));
    setPending((before) => [...before, ...list.map((file): Pending => ({
      id: `${file.name}:${file.size}:${Math.random()}`, file,
      dealerId: dealerId || dealerFromStatementName(file.name, dealers) || (dealers.length === 1 ? dealers[0].dealerId : ''),
      outletId: '', state: 'ready',
    }))]);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    addFiles(event.dataTransfer.files);
  };
  const update = (id: string, patch: Partial<Pending>) => setPending((all) => all.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const ready = pending.filter((p) => p.state === 'ready' || p.state === 'failed');
  const uploadAll = async () => {
    setBusy(true);
    onError(null);
    for (const p of ready) {
      if (!p.dealerId) { update(p.id, { state: 'failed', message: 'Choose the dealership.' }); continue; }
      update(p.id, { state: 'uploading', message: undefined });
      try {
        const s = await uploadBankStatement(tenantId!, { file: p.file, dealerId: p.dealerId, outletId: p.outletId || undefined }, accessToken);
        const c = s.counts;
        update(p.id, {
          state: 'done',
          message: `${s.bankName ?? 'Bank'} ${s.accountNumber ?? ''} · ${period(s)} · ${s.creditCount} credits · ${n(c.matched)} of ${n(c.receipts)} receipts found · ${n(c.notFound)} not found${s.readingCheck === 'MISMATCH' ? ' · reading does not agree with the statement totals' : ''}`,
        });
      } catch (cause) {
        update(p.id, { state: 'failed', message: cause instanceof Error ? cause.message : 'Could not be uploaded.' });
      }
    }
    setBusy(false);
    await queryClient.invalidateQueries({ queryKey: ['bank-statements', tenantId] });
  };
  const exportExcel = async (statementId?: string) => {
    onError(null);
    try {
      save(await downloadBankReport(tenantId!, month, accessToken, statementId), `Bank-Reconciliation_${month}${statementId ? '_statement' : ''}.xlsx`);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'The report could not be downloaded.');
    }
  };
  const recheck = async (statementId: string) => {
    setBusy(true);
    onError(null);
    try {
      await rematchBankStatement(tenantId!, statementId, accessToken);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bank-statements', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['bank-statement', tenantId] }),
      ]);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not be checked again.');
    } finally {
      setBusy(false);
    }
  };

  const d = detail.data;
  const receiptCounts = (d?.receipts ?? []).reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.outcome]: (acc[r.outcome] ?? 0) + 1 }), {});
  const journeyCounts = (d?.journeys ?? []).reduce<Record<string, number>>((acc, j) => ({ ...acc, [j.status]: (acc[j.status] ?? 0) + 1 }), {});
  const credits = (d?.transactions ?? []).filter((t) => t.direction === 'CR');
  const creditCounts = credits.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.outcome ?? '']: (acc[t.outcome ?? ''] ?? 0) + 1 }), {});

  return (
    <>
      {setup.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{setup.error instanceof Error ? setup.error.message : 'Not available.'}</div> : null}
      {setup.data?.canUpload ? (
        <SectionCard>
          <div className="p2w-card__title">
            <h3>Upload bank statements</h3>
            <p className="p2w-muted">
              The dealership's own account statement, any bank, as downloaded (PDF or Excel). Choose the outlet only when the
              account is one outlet's. Receipts dated within the statement's period ±{windowDays} days are checked against its
              credits. Uploading the same account and period again replaces the earlier upload.
            </p>
          </div>
          <div
            className={`p2du-drop${over ? ' is-over' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            <strong>Drag and drop statements here or click to choose</strong>
            <span className="p2w-muted">PDF (as downloaded, not scanned) · Excel (.xlsx, .xls) · CSV · up to 20 MB each</span>
            <input ref={input} type="file" accept=".pdf,.xlsx,.xlsm,.xls,.csv" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </div>
          {pending.length ? (
            <div className="p2du-files">
              {pending.map((p) => {
                const outlets = dealers.find((x) => x.dealerId === p.dealerId)?.outlets ?? [];
                const locked = p.state === 'done' || p.state === 'uploading';
                return (
                  <div key={p.id} className="p2du-file p2bs-file">
                    <span className="p2du-file__name" title={p.file.name}>{p.file.name}
                      {p.message ? <span className="p2du-file__state"><br />{p.message}</span> : null}
                    </span>
                    <select aria-label="Dealership" value={p.dealerId} disabled={locked} onChange={(e) => update(p.id, { dealerId: e.target.value, outletId: '' })}>
                      <option value="">Dealership…</option>
                      {dealers.map((x) => <option key={x.dealerId} value={x.dealerId}>{x.dealerName}</option>)}
                    </select>
                    <select aria-label="Outlet" value={p.outletId} disabled={locked || !p.dealerId} onChange={(e) => update(p.id, { outletId: e.target.value })}>
                      <option value="">All outlets</option>
                      {outlets.map((o) => <option key={o.outletId} value={o.outletId}>{o.outletName}</option>)}
                    </select>
                    <span>
                      {p.state === 'done' ? <span className="p2du-tag p2du-tag--ok">Uploaded</span>
                        : p.state === 'uploading' ? <span className="p2du-tag p2du-tag--busy">Reading…</span>
                        : p.state === 'failed' ? <span className="p2du-tag p2du-tag--bad">Failed</span>
                        : <button type="button" className="p2w-link" onClick={() => setPending((all) => all.filter((x) => x.id !== p.id))}>Remove</button>}
                    </span>
                  </div>
                );
              })}
              <div className="p2du-toolbar">
                <button type="button" className="p2w-button p2w-button--primary" disabled={busy || !ready.length} onClick={() => void uploadAll()}>
                  {busy ? 'Reading and checking…' : `Upload ${ready.length} statement${ready.length === 1 ? '' : 's'}`}
                </button>
                {pending.some((p) => p.state === 'done') ? (
                  <button type="button" className="p2w-link" onClick={() => setPending((all) => all.filter((p) => p.state !== 'done'))}>Clear uploaded</button>
                ) : null}
              </div>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      <SectionCard>
        <div className="p2w-card__title">
          <h3>Bank reconciliation · {monthLabel(month)}</h3>
          <p className="p2w-muted">The current statements of the month. Each receipt is counted once per statement whose range it falls in.</p>
          <div className="p2du-toolbar__end">
            <button type="button" className="p2w-button p2w-button--secondary" disabled={!enabled || !current.length} onClick={() => void exportExcel()}>
              Export to Excel
            </button>
          </div>
        </div>
        <div className="p2du-tiles">
          <div className="p2du-tile"><span>Receipts checked</span><strong>{total.receipts}</strong><small>{total.matched} found in bank</small></div>
          <div className="p2du-tile p2du-tile--bad"><span>Not found in bank</span><strong>{total.notFound}</strong><small>{rupees(total.notFoundAmount)}</small></div>
          <div className="p2du-tile p2du-tile--ok"><span>Journeys fully verified</span><strong>{total.journeysVerified}</strong><small>{rupees(total.verifiedAmount)} verified</small></div>
          <div className="p2du-tile p2du-tile--warn"><span>Partly / not verified</span><strong>{total.journeysPartial} / {total.journeysNotVerified}</strong><small>{rupees(total.leftAmount)} left</small></div>
          <div className="p2du-tile p2du-tile--warn"><span>Money in, no receipt</span><strong>{total.creditsNamingCustomer}</strong><small>{rupees(total.creditsNamingCustomerAmount)} from customers on file</small></div>
        </div>

        {statements.isLoading ? <p className="p2w-muted">Loading…</p> : null}
        {statements.data && !items.length ? <p className="p2w-empty">No bank statement uploaded for {monthLabel(month)} yet.</p> : null}
        {items.length ? (
          <div className="p2du-scroll">
            <table className="p2du-table">
              <thead>
                <tr>
                  <th>Period</th><th>Dealership</th><th>Account</th><th className="num">Credits</th><th className="num">Receipts</th>
                  <th className="num">Found</th><th className="num">Not found</th><th className="num">Journeys</th><th>Reading</th><th>Uploaded</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.statementId} className={`is-clickable${selected === s.statementId ? ' is-selected' : ''}${s.status === 'SUPERSEDED' ? ' is-superseded' : ''}`}
                    onClick={() => { setSelected(selected === s.statementId ? null : s.statementId); setView('journeys'); setOutcome('NOT_FOUND'); }}>
                    <td>{period(s)}<br /><small className="p2w-muted">checks {day(s.checkFrom)} – {day(s.checkTo)}</small></td>
                    <td>{s.dealerName}<br /><small className="p2w-muted">{s.outletName ?? 'All outlets'}</small></td>
                    <td>{s.bankName ?? 'Bank'}<br /><small className="p2w-muted">{s.accountNumber ?? '—'}</small></td>
                    <td className="num">{s.creditCount}<br /><small className="p2w-muted">{rupees(s.creditTotal)}</small></td>
                    <td className="num">{n(s.counts.receipts)}</td>
                    <td className="num">{n(s.counts.matched)}</td>
                    <td className="num">{s.counts.notFound ? <span className="p2du-tag p2du-tag--bad">{s.counts.notFound}</span> : 0}</td>
                    <td className="num">{n(s.counts.journeysVerified)} / {n(s.counts.journeys)}<br /><small className="p2w-muted">fully verified</small></td>
                    <td>{s.readingCheck === 'VERIFIED' ? <span className="p2du-tag p2du-tag--ok" title="The statement's own totals agree with what was read">Totals agree</span>
                      : s.readingCheck === 'MISMATCH' ? <span className="p2du-tag p2du-tag--bad" title="The statement's totals or balances do not agree with what was read">Check reading</span>
                      : <span className="p2du-tag" title="The statement prints no totals or balances to check against">No totals</span>}</td>
                    <td><span title={s.fileName}>{s.uploadedBy}</span><br /><small className="p2w-muted">{when(s.uploadedAtUtc)}</small></td>
                    <td>{s.status === 'ACTIVE' ? <span className="p2du-tag p2du-tag--ok">Current</span> : <span className="p2du-tag">Replaced</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {selected && d ? (
          <div className="p2du-panel">
            <header>
              <div>
                <strong>{d.dealerName} · {d.bankName ?? 'Bank'} {d.accountNumber ?? ''} · {period(d)}</strong>
                <div className="p2w-muted">
                  {d.accountHolder ?? ''}{d.outletName ? ` · ${d.outletName}` : ''} · receipts of {day(d.checkFrom)} – {day(d.checkTo)} checked
                  {d.reconciledAtUtc ? ` · checked ${when(d.reconciledAtUtc)}` : ''}
                </div>
              </div>
              <div className="p2du-toolbar__end">
                {setup.data?.canUpload ? (
                  <button type="button" className="p2w-button p2w-button--secondary" disabled={busy} onClick={() => void recheck(d.statementId)}>Check again</button>
                ) : null}
                <button type="button" className="p2w-button p2w-button--secondary" onClick={() => void exportExcel(d.statementId)}>Download this report</button>
              </div>
            </header>
            <div className="p2du-tiles">
              <div className="p2du-tile"><span>Receipts in range</span><strong>{n(d.counts.receipts)}</strong><small>{rupees(d.counts.receiptsAmount)}</small></div>
              <div className="p2du-tile p2du-tile--ok"><span>Found in bank</span><strong>{n(d.counts.matched)}</strong><small>{rupees(d.counts.matchedAmount)}</small></div>
              <div className="p2du-tile p2du-tile--bad"><span>Not found in bank</span><strong>{n(d.counts.notFound) + n(d.counts.ambiguous)}</strong><small>{rupees(Number(d.counts.notFoundAmount ?? 0) + Number(d.counts.ambiguousAmount ?? 0))}</small></div>
              <div className="p2du-tile"><span>Outside statement dates</span><strong>{n(d.counts.outsideDates)}</strong><small>{rupees(d.counts.outsideDatesAmount)}</small></div>
              <div className="p2du-tile"><span>Cash / card</span><strong>{n(d.counts.cash) + n(d.counts.card)}</strong><small>not traceable one by one</small></div>
            </div>
            <div className="p2du-toolbar">
              <div className="p2du-switcher" role="tablist" aria-label="View">
                {([['journeys', `Journeys`, d.journeys.length], ['receipts', 'Receipts', d.receipts.length], ['credits', 'Bank credits', credits.length]] as const).map(([value, label, count]) => (
                  <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)}>{label}<b>{count}</b></button>
                ))}
              </div>
            </div>

            {view === 'journeys' ? (
              <>
                <div className="p2du-toolbar">
                  <div className="p2du-switcher p2du-switcher--sm" role="tablist" aria-label="Journey status">
                    {(['', 'NOT_VERIFIED', 'PARTIAL', 'VERIFIED', 'CASH_ONLY'] as (JourneyStatus | '')[]).map((st) => (
                      <button key={st || 'all'} type="button" role="tab" aria-selected={journeyStatus === st} onClick={() => setJourneyStatus(st)}>
                        {st ? JOURNEY_STATUSES[st].label : 'All'}<b>{st ? journeyCounts[st] ?? 0 : d.journeys.length}</b>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p2du-scroll">
                  <table className="p2du-table p2du-table--stack">
                    <thead><tr><th>Journey</th><th>Customer</th><th>Outlet</th><th>Status</th><th className="num">Bank receipts</th><th className="num">Verified</th><th className="num">Left</th><th className="num">Cash</th></tr></thead>
                    <tbody>
                      {d.journeys.filter((j) => !journeyStatus || j.status === journeyStatus).map((j) => (
                        <tr key={j.journeyId}>
                          <td data-label="Journey"><Link className="p2w-link" to={`/p2/journeys/${j.journeyId}/overview`}>{j.journeyReference ?? 'Journey'}</Link></td>
                          <td data-label="Customer">{j.customer ?? '—'}</td>
                          <td data-label="Outlet">{j.outletName ?? '—'}</td>
                          <td data-label="Status"><span className={`p2du-tag p2du-tag--${JOURNEY_STATUSES[j.status].tone}`}>{JOURNEY_STATUSES[j.status].label}</span></td>
                          <td data-label="Bank receipts" className="num">{rupees(j.bankReceipts)}</td>
                          <td data-label="Verified" className="num">{rupees(j.verified)}</td>
                          <td data-label="Left" className="num">{Number(j.left) > 0 ? <strong>{rupees(j.left)}</strong> : rupees(0)}</td>
                          <td data-label="Cash" className="num">{Number(j.cash) ? rupees(j.cash) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {view === 'receipts' ? (
              <>
                <div className="p2du-toolbar">
                  <div className="p2du-switcher p2du-switcher--sm" role="tablist" aria-label="Receipts">
                    {(['NOT_FOUND', 'AMBIGUOUS', 'OUTSIDE_DATES', 'MATCHED', 'CASH', 'CARD', ''] as (ReceiptOutcome | '')[]).map((o) => (
                      <button key={o || 'all'} type="button" role="tab" aria-selected={outcome === o} onClick={() => setOutcome(o)}>
                        {o ? RECEIPT_OUTCOMES[o].label : 'All'}<b>{o ? receiptCounts[o] ?? 0 : d.receipts.length}</b>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p2du-scroll">
                  <table className="p2du-table p2du-table--stack">
                    <thead><tr><th>Receipt date</th><th>Journey</th><th>Customer</th><th>Receipt</th><th className="num">Amount</th><th>Mode / reference</th><th>Result</th><th>Bank credit</th></tr></thead>
                    <tbody>
                      {d.receipts.filter((r) => !outcome || r.outcome === outcome).map((r) => (
                        <tr key={`${r.journeyId}:${r.receiptKey}`}>
                          <td data-label="Receipt date">{day(r.receiptDate)}</td>
                          <td data-label="Journey"><Link className="p2w-link" to={`/p2/journeys/${r.journeyId}/overview`}>{r.journeyReference ?? 'Journey'}</Link></td>
                          <td data-label="Customer">{r.customer ?? '—'}<br /><small className="p2w-muted">{r.outletName}</small></td>
                          <td data-label="Receipt">{r.receiptNumber ?? '—'}{r.source === 'LEDGER' ? <><br /><small className="p2w-muted">Customer ledger / NDC</small></> : null}</td>
                          <td data-label="Amount" className="num">{rupees(r.amount)}</td>
                          <td data-label="Mode / reference">{r.mode ?? '—'}{r.reference ? <><br /><small className="p2w-muted">{r.reference}</small></> : null}</td>
                          <td data-label="Result"><span className={`p2du-tag p2du-tag--${RECEIPT_OUTCOMES[r.outcome].tone}`}>{RECEIPT_OUTCOMES[r.outcome].label}</span>
                            {r.basisLabel ? <><br /><small className="p2w-muted">on {r.basisLabel}</small></> : null}
                            {r.outcome !== 'MATCHED' && r.note ? <span className="p2du-why p2w-muted">{r.note}</span> : null}</td>
                          <td data-label="Bank credit">{r.credits.length ? r.credits.map((c, i) => (
                            <span key={i} className="p2du-why">{day(c.date)} · {rupees(c.amount)}{c.onThisStatement ? '' : ' · other statement'}<br /><small className="p2w-muted">{c.narration}</small></span>
                          )) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {view === 'credits' ? (
              <>
                <div className="p2du-toolbar">
                  <div className="p2du-switcher p2du-switcher--sm" role="tablist" aria-label="Credits">
                    {([['UNIDENTIFIED', 'No receipt'], ['MATCHED', 'Tied to receipt'], ['', 'All']] as const).map(([o, label]) => (
                      <button key={label} type="button" role="tab" aria-selected={creditView === o} onClick={() => setCreditView(o)}>
                        {label}<b>{o ? creditCounts[o] ?? 0 : credits.length}</b>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p2du-scroll">
                  <table className="p2du-table p2du-table--stack">
                    <thead><tr><th>Date</th><th>Narration</th><th className="num">Amount</th><th>Kind</th><th>Result</th></tr></thead>
                    <tbody>
                      {credits.filter((t) => !creditView || t.outcome === creditView).map((t) => (
                        <tr key={t.rowNo}>
                          <td data-label="Date">{day(t.date)}</td>
                          <td data-label="Narration">{t.narration}{t.reference ? <><br /><small className="p2w-muted">{t.reference}</small></> : null}</td>
                          <td data-label="Amount" className="num">{rupees(t.amount)}</td>
                          <td data-label="Kind">{t.kindLabel ?? '—'}</td>
                          <td data-label="Result">
                            {t.outcome === 'MATCHED' && t.journeyId
                              ? <><Link className="p2w-link" to={`/p2/journeys/${t.journeyId}/overview`}>{t.journeyReference}</Link>{t.basisLabel ? <><br /><small className="p2w-muted">on {t.basisLabel}</small></> : null}</>
                              : t.outcome === 'OWN_TRANSFER' ? <span className="p2du-tag">Own transfer</span>
                              : t.outcome === 'DUPLICATE' ? <span className="p2du-tag">On another upload</span>
                              : t.namedJourneyId
                                ? <><span className="p2du-tag p2du-tag--warn">No receipt on file</span><br /><small className="p2w-muted">names </small>
                                  <Link className="p2w-link" to={`/p2/journeys/${t.namedJourneyId}/overview`}>{t.namedJourneyReference}</Link>
                                  <small className="p2w-muted"> · {t.namedCustomer}</small></>
                                : <span className="p2du-tag">No receipt</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        ) : selected && detail.isLoading ? <p className="p2w-muted">Loading…</p> : null}
      </SectionCard>
    </>
  );
}
