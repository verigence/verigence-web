import { useMemo, useRef, useState, type DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-data-uploads.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import {
  DMS_MATCH_BASIS,
  DMS_OUTCOME_LABELS,
  dateFromFileName,
  dealerFromFileName,
  downloadDmsReport,
  getDmsDump,
  getDmsSetup,
  kindFromFileName,
  listDmsDumps,
  rematchDmsDump,
  uploadDmsDump,
  type DmsDump,
  type DmsDumpKind,
  type DmsRowOutcome,
} from '../services/audit-core/uc03DmsDumps';
import { istMonth, monthLabel, monthsUpTo } from '../services/audit-core/uc03ProjectTracker';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

type Pending = { id: string; file: File; dealerId: string; date: string; kind: DmsDumpKind | ''; state: 'ready' | 'uploading' | 'done' | 'failed'; message?: string };

function when(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .format(new Date(value));
}

function day(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(`${value}T00:00:00`));
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Data uploads (product owner 13 Nov 2026): one tab for the documents that come daily, weekly or
 * monthly, starting with the dealers' DMS booking and delivery dumps. A Team Lead or Reviewer
 * uploads each dealership's month-to-date report; every row is matched against the journeys on
 * file, the ones not found are listed and exported to Excel, and the journeys found are marked
 * synced.
 */
export default function P2DataUploadsPage() {
  const project = useProjectContextStore((s) => s.selectedProject);
  const accessToken = useSessionStore((s) => s.accessToken) ?? undefined;
  const tenantId = project?.tenantId;
  const queryClient = useQueryClient();
  const currentMonth = useMemo(() => istMonth(), []);
  const months = useMemo(() => monthsUpTo(currentMonth), [currentMonth]);
  const [month, setMonth] = useState(currentMonth);
  const [dealerId, setDealerId] = useState('');
  const [kindView, setKindView] = useState<DmsDumpKind | ''>('');
  const [pending, setPending] = useState<Pending[]>([]);
  const [over, setOver] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<DmsRowOutcome | ''>('MISSING');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const enabled = Boolean(tenantId && accessToken);

  const setup = useQuery({ queryKey: ['dms-setup', tenantId], queryFn: () => getDmsSetup(tenantId!, accessToken), enabled });
  const dumps = useQuery({
    queryKey: ['dms-dumps', tenantId, month, dealerId],
    queryFn: () => listDmsDumps(tenantId!, month, accessToken, dealerId || undefined),
    enabled,
  });
  const detail = useQuery({
    queryKey: ['dms-dump', tenantId, selected],
    queryFn: () => getDmsDump(tenantId!, selected!, accessToken),
    enabled: enabled && Boolean(selected),
  });
  const dealers = setup.data?.dealers ?? [];
  const today = setup.data?.today ?? '';
  const items = (dumps.data?.items ?? []).filter((d) => !kindView || d.kind === kindView);
  const current = items.filter((d) => d.status === 'ACTIVE');
  // The month's figures: the latest dump of each dealership and kind is the month to date.
  const latest = useMemo(() => {
    const seen = new Map<string, DmsDump>();
    for (const d of current) {
      const key = `${d.dealerId}:${d.kind}`;
      const before = seen.get(key);
      if (!before || before.businessDate < d.businessDate) seen.set(key, d);
    }
    return [...seen.values()];
  }, [current]);
  const sum = (key: 'rows' | 'matched' | 'missing' | 'notInTool', kind?: DmsDumpKind) =>
    latest.filter((d) => !kind || d.kind === kind).reduce((n, d) => n + d[key], 0);

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const list = [...files].filter((f) => /\.xlsx?m?$/i.test(f.name));
    setPending((before) => [...before, ...list.map((file): Pending => ({
      id: `${file.name}:${file.size}:${Math.random()}`,
      file,
      dealerId: dealerFromFileName(file.name, dealers),
      date: dateFromFileName(file.name) || today,
      kind: kindFromFileName(file.name) ?? '',
      state: 'ready',
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
    setError(null);
    for (const p of ready) {
      if (!p.dealerId || !p.date) { update(p.id, { state: 'failed', message: 'Choose the dealership and the date.' }); continue; }
      update(p.id, { state: 'uploading', message: undefined });
      try {
        const dump = await uploadDmsDump(tenantId!, { file: p.file, dealerId: p.dealerId, businessDate: p.date, kind: p.kind || undefined }, accessToken);
        update(p.id, { state: 'done', message: `${dump.kind === 'BOOKING' ? 'Booking' : 'Delivery'} dump · ${dump.rows} rows · ${dump.missing} not in Verigence${dump.kind === 'DELIVERY' ? ` · ${dump.notInTool} delivery not uploaded` : ''}` });
      } catch (cause) {
        update(p.id, { state: 'failed', message: cause instanceof Error ? cause.message : 'Could not be uploaded.' });
      }
    }
    setBusy(false);
    await queryClient.invalidateQueries({ queryKey: ['dms-dumps', tenantId] });
  };
  const exportExcel = async (dumpId?: string) => {
    setError(null);
    try {
      save(await downloadDmsReport(tenantId!, month, accessToken, dumpId), `DMS-Dump-Variance_${month}${dumpId ? '_upload' : ''}.xlsx`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The report could not be downloaded.');
    }
  };
  const recheck = async (dumpId: string) => {
    setBusy(true);
    setError(null);
    try {
      await rematchDmsDump(tenantId!, dumpId, accessToken);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dms-dumps', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['dms-dump', tenantId, dumpId] }),
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not be checked again.');
    } finally {
      setBusy(false);
    }
  };

  const rows = (detail.data?.items ?? []).filter((r) => !outcome || r.outcome === outcome);
  const counts = (detail.data?.items ?? []).reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.outcome]: (acc[r.outcome] ?? 0) + 1 }), {});

  return (
    <div className="screen-stack p2-screen p2w">
      <PageHeader
        eyebrow="Booking & Delivery"
        title="Data uploads"
        description="The dealers' daily DMS booking and delivery reports, matched against the journeys on file. What is not found is listed here and in Export to Excel; the journeys found are marked synced."
        actions={(
          <button type="button" className="p2w-button p2w-button--secondary" disabled={!enabled} onClick={() => void exportExcel()}>
            Export to Excel
          </button>
        )}
      />
      {error ? <div className="p2w-alert p2w-alert--error" role="alert">{error}</div> : null}
      {setup.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{setup.error instanceof Error ? setup.error.message : 'Not available.'}</div> : null}

      <SectionCard>
        <div className="p2w-card__title"><h3>What can be uploaded</h3></div>
        <div className="p2du-types">
          {(setup.data?.types ?? []).map((t) => (
            <div key={t.key} className="p2du-type">{t.label}<small>{t.frequency === 'DAILY' ? 'Daily · month to date' : t.frequency.toLowerCase()}</small></div>
          ))}
        </div>
      </SectionCard>

      {setup.data?.canUpload ? (
        <SectionCard>
          <div className="p2w-card__title">
            <h3>Upload</h3>
            <p className="p2w-muted">Drop all of today's files at once (.xlsx). The dealership, date and type are taken from each file's name and columns; check them before uploading. Uploading the same dealership, type and day again replaces the earlier upload.</p>
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
            <strong>Drag and drop files here or click to choose</strong>
            <span className="p2w-muted">DMS booking report · dealer's delivery report · Excel up to 15 MB each</span>
            <input ref={input} type="file" accept=".xlsx,.xlsm" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </div>
          {pending.length ? (
            <div className="p2du-files">
              {pending.map((p) => (
                <div key={p.id} className="p2du-file">
                  <span className="p2du-file__name" title={p.file.name}>{p.file.name}
                    {p.message ? <span className="p2du-file__state"><br />{p.message}</span> : null}
                  </span>
                  <select aria-label="Dealership" value={p.dealerId} disabled={p.state === 'done' || p.state === 'uploading'}
                    onChange={(e) => update(p.id, { dealerId: e.target.value })}>
                    <option value="">Dealership…</option>
                    {dealers.map((d) => <option key={d.dealerId} value={d.dealerId}>{d.dealerName}</option>)}
                  </select>
                  <select aria-label="Type" value={p.kind} disabled={p.state === 'done' || p.state === 'uploading'}
                    onChange={(e) => update(p.id, { kind: e.target.value as DmsDumpKind | '' })}>
                    <option value="">Read from the file</option>
                    <option value="BOOKING">Booking dump</option>
                    <option value="DELIVERY">Delivery dump</option>
                  </select>
                  <input type="date" aria-label="Dump date" value={p.date} max={today || undefined}
                    disabled={p.state === 'done' || p.state === 'uploading'} onChange={(e) => update(p.id, { date: e.target.value })} />
                  <span>
                    {p.state === 'done' ? <span className="p2du-tag p2du-tag--ok">Uploaded</span>
                      : p.state === 'uploading' ? <span className="p2du-tag p2du-tag--busy">Uploading…</span>
                      : p.state === 'failed' ? <span className="p2du-tag p2du-tag--bad">Failed</span>
                      : <button type="button" className="p2w-link" onClick={() => setPending((all) => all.filter((x) => x.id !== p.id))}>Remove</button>}
                  </span>
                </div>
              ))}
              <div className="p2du-toolbar">
                <button type="button" className="p2w-button p2w-button--primary" disabled={busy || !ready.length} onClick={() => void uploadAll()}>
                  {busy ? 'Uploading…' : `Upload ${ready.length} file${ready.length === 1 ? '' : 's'}`}
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
          <h3>{monthLabel(month)}</h3>
          <p className="p2w-muted">The latest dump of each dealership is the month to date.</p>
        </div>
        <div className="p2du-tiles">
          <div className="p2du-tile"><span>Bookings in DMS</span><strong>{sum('rows', 'BOOKING')}</strong><small>{sum('matched', 'BOOKING')} synced</small></div>
          <div className="p2du-tile p2du-tile--bad"><span>Bookings not in Verigence</span><strong>{sum('missing', 'BOOKING')}</strong><small>Missing booking</small></div>
          <div className="p2du-tile"><span>Deliveries in DMS</span><strong>{sum('rows', 'DELIVERY')}</strong><small>{sum('matched', 'DELIVERY')} synced</small></div>
          <div className="p2du-tile p2du-tile--bad"><span>Deliveries not in Verigence</span><strong>{sum('missing', 'DELIVERY')}</strong><small>No journey at all</small></div>
          <div className="p2du-tile p2du-tile--warn"><span>Delivery not uploaded</span><strong>{sum('notInTool', 'DELIVERY')}</strong><small>Booking on file, delivery file not</small></div>
        </div>

        <div className="p2du-toolbar">
          <label>Month
            <select value={month} onChange={(e) => { setMonth(e.target.value); setSelected(null); }}>
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          {dealers.length > 1 ? (
            <label>Dealership
              <select value={dealerId} onChange={(e) => { setDealerId(e.target.value); setSelected(null); }}>
                <option value="">All dealerships</option>
                {dealers.map((d) => <option key={d.dealerId} value={d.dealerId}>{d.dealerName}</option>)}
              </select>
            </label>
          ) : null}
          <div className="p2du-switcher" role="tablist" aria-label="Dump type">
            {([['', 'All'], ['BOOKING', 'Booking'], ['DELIVERY', 'Delivery']] as const).map(([value, label]) => (
              <button key={label} type="button" role="tab" aria-selected={kindView === value} onClick={() => setKindView(value)}>{label}</button>
            ))}
          </div>
        </div>

        {dumps.isLoading ? <p className="p2w-muted">Loading…</p> : null}
        {dumps.data && !items.length ? <p className="p2w-empty">No dump uploaded for {monthLabel(month)} yet.</p> : null}
        {items.length ? (
          <div className="p2du-scroll">
            <table className="p2du-table">
              <thead>
                <tr>
                  <th>Dump date</th><th>Dealership</th><th>Type</th><th className="num">Rows</th><th className="num">Synced</th>
                  <th className="num">Not in Verigence</th><th className="num">Delivery not uploaded</th><th>Uploaded</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.dumpId} className={`is-clickable${selected === d.dumpId ? ' is-selected' : ''}${d.status === 'SUPERSEDED' ? ' is-superseded' : ''}`}
                    onClick={() => { setSelected(selected === d.dumpId ? null : d.dumpId); setOutcome('MISSING'); }}>
                    <td>{day(d.businessDate)}</td>
                    <td>{d.dealerName}</td>
                    <td>{d.kind === 'BOOKING' ? 'Booking' : 'Delivery'}</td>
                    <td className="num">{d.rows}</td>
                    <td className="num">{d.matched}</td>
                    <td className="num">{d.missing ? <span className="p2du-tag p2du-tag--bad">{d.missing}</span> : 0}</td>
                    <td className="num">{d.kind === 'DELIVERY' ? (d.notInTool ? <span className="p2du-tag p2du-tag--warn">{d.notInTool}</span> : 0) : '—'}</td>
                    <td><span title={d.fileName}>{d.uploadedBy}</span><br /><small className="p2w-muted">{when(d.uploadedAtUtc)}</small></td>
                    <td>{d.status === 'ACTIVE' ? <span className="p2du-tag p2du-tag--ok">Current</span> : <span className="p2du-tag">Replaced</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {selected && detail.data ? (
          <div className="p2du-panel">
            <header>
              <div>
                <strong>{detail.data.dealerName} · {detail.data.kind === 'BOOKING' ? 'Booking' : 'Delivery'} dump of {day(detail.data.businessDate)}</strong>
                <div className="p2w-muted">{detail.data.fileName}{detail.data.matchedAtUtc ? ` · checked ${when(detail.data.matchedAtUtc)}` : ''}</div>
              </div>
              <div className="p2du-toolbar__end">
                {setup.data?.canUpload ? (
                  <button type="button" className="p2w-button p2w-button--secondary" disabled={busy} onClick={() => void recheck(detail.data!.dumpId)}>
                    Check again
                  </button>
                ) : null}
                <button type="button" className="p2w-button p2w-button--secondary" onClick={() => void exportExcel(detail.data!.dumpId)}>
                  Download this report
                </button>
              </div>
            </header>
            <div className="p2du-toolbar">
              <div className="p2du-switcher" role="tablist" aria-label="Rows">
                {(['MISSING', ...(detail.data.kind === 'DELIVERY' ? ['NOT_IN_TOOL'] : []), 'MATCHED', ...(detail.data.kind === 'BOOKING' ? ['CANCELLED'] : []), ''] as (DmsRowOutcome | '')[]).map((o) => (
                  <button key={o || 'all'} type="button" role="tab" aria-selected={outcome === o} onClick={() => setOutcome(o)}>
                    {o ? DMS_OUTCOME_LABELS[o].label : 'All'}<b>{o ? counts[o] ?? 0 : detail.data!.items.length}</b>
                  </button>
                ))}
              </div>
            </div>
            {!rows.length ? <p className="p2w-empty">No row here.</p> : (
              <div className="p2du-scroll">
                <table className="p2du-table">
                  <thead>
                    <tr>
                      <th>Date</th><th>Customer</th><th>Mobile</th>
                      <th>{detail.data.kind === 'BOOKING' ? 'Booking no. / OTF' : 'Chassis'}</th>
                      <th>Model</th><th>Outlet</th><th>Consultant</th><th>Status</th><th>Journey</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.rowNo}>
                        <td>{day(r.eventDate)}</td>
                        <td>{r.customerName ?? '—'}</td>
                        <td>{r.mobile ?? '—'}</td>
                        <td>{detail.data!.kind === 'BOOKING' ? <>{r.bookingNumber ?? '—'}<br /><small className="p2w-muted">{r.otf}</small></> : r.chassis ?? '—'}</td>
                        <td>{r.model ?? '—'}{r.variant ? <><br /><small className="p2w-muted">{r.variant}</small></> : null}</td>
                        <td>{r.outletName ?? r.outletLabel ?? '—'}</td>
                        <td>{r.consultant ?? '—'}</td>
                        <td><span className={`p2du-tag p2du-tag--${DMS_OUTCOME_LABELS[r.outcome].tone}`}>{DMS_OUTCOME_LABELS[r.outcome].label}</span>
                          {r.stage && detail.data!.kind === 'BOOKING' ? <><br /><small className="p2w-muted">DMS: {r.stage}</small></> : null}</td>
                        <td>{r.journeyId
                          ? <><Link className="p2w-link" to={`/p2/journeys/${r.journeyId}/overview`}>{r.journeyReference}</Link>
                            {r.matchBasis ? <><br /><small className="p2w-muted">on {DMS_MATCH_BASIS[r.matchBasis] ?? r.matchBasis}</small></> : null}</>
                          : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : selected && detail.isLoading ? <p className="p2w-muted">Loading…</p> : null}
      </SectionCard>
    </div>
  );
}
