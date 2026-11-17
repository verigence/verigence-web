import { useRef, useState, type DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import SectionCard from '../../../components/SectionCard';
import { rupees } from '../../../services/audit-core/uc03BankStatements';
import { monthLabel } from '../../../services/audit-core/uc03ProjectTracker';
import {
  downloadSchemeReport,
  getSchemeReport,
  getSchemeSetup,
  listSchemeDumps,
  recheckSchemeDumps,
  uploadSchemeDump,
  type SchemeJourney,
  type SchemeKind,
  type SchemeRow,
} from '../../../services/audit-core/uc03SchemeDumps';

type Pending = { id: string; file: File; dealerId: string; state: 'ready' | 'uploading' | 'done' | 'failed'; message?: string };
type View = 'sync' | 'notBought' | 'notInDump' | 'notInVerigence';

const KINDS: { kind: SchemeKind; label: string }[] = [{ kind: 'EW', label: 'Extended warranty' }, { kind: 'RSA', label: 'RSA' }];

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function day(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(`${value}T00:00:00`));
}

function when(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .format(new Date(value));
}

/** A file named after its dealership ("Utkal_Mahindra_EW_Dump.xlsx") goes to that dealership. */
function dealerFromName(name: string, dealers: { dealerId: string; dealerName: string }[]): string {
  const lower = name.toLowerCase();
  const hit = dealers.filter((d) => lower.includes(d.dealerName.split(/\s+/)[0].toLowerCase()));
  return hit.length === 1 ? hit[0].dealerId : '';
}

const amount = (r: SchemeRow) => (r.schemeAmount === null ? '—' : rupees(r.schemeAmount + (r.taxAmount ?? 0)));

function Vehicle({ r }: { r: SchemeRow }) {
  return <>{r.model ?? '—'}<br /><small className="p2w-muted">{[r.chassis, r.registrationNumber].filter(Boolean).join(' · ')}</small></>;
}

function Scheme({ r }: { r: SchemeRow }) {
  return (
    <>
      {r.scheme ?? '—'}
      <br /><small className="p2w-muted">{[r.schemeNumber, day(r.schemeDate), r.schemeStatus && r.schemeStatus !== 'Completed' ? r.schemeStatus : null].filter(Boolean).join(' · ')}</small>
    </>
  );
}

function JourneyCell({ r }: { r: SchemeRow | SchemeJourney }) {
  return (
    <>
      <Link className="p2w-link" to={`/p2/journeys/${r.journeyId}/overview`}>{r.journeyReference ?? 'Journey'}</Link>
      <br /><small className="p2w-muted">{r.journeyCustomer ?? ''}</small>
    </>
  );
}

/**
 * Extended warranty and RSA on the Data uploads tab (product owner 17 Nov 2026): each dealership's
 * monthly scheme dump, matched to the journeys on file and set against what Verigence shows the
 * customer was charged for -- in sync; in the dump but not bought as per Verigence; bought as per
 * Verigence but not in the dump; and in the dump with no journey in Verigence.
 */
export default function SchemeDumpsSection({ tenantId, accessToken, months, onError }: {
  tenantId?: string;
  accessToken?: string;
  months: { value: string; label: string }[];
  onError: (message: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const enabled = Boolean(tenantId && accessToken);
  // The dumps come monthly for the month just ended: start there.
  const [month, setMonth] = useState(months[1]?.value ?? months[0]?.value ?? '');
  const [kind, setKind] = useState<SchemeKind>('EW');
  const [view, setView] = useState<View>('notBought');
  const [pending, setPending] = useState<Pending[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const setup = useQuery({ queryKey: ['scheme-setup', tenantId], queryFn: () => getSchemeSetup(tenantId!, accessToken), enabled });
  const uploads = useQuery({
    queryKey: ['scheme-dumps', tenantId, month], queryFn: () => listSchemeDumps(tenantId!, month, accessToken),
    enabled: enabled && Boolean(month),
  });
  const report = useQuery({
    queryKey: ['scheme-report', tenantId, month, kind], queryFn: () => getSchemeReport(tenantId!, month, kind, accessToken),
    enabled: enabled && Boolean(month),
  });
  const dealers = setup.data?.dealers ?? [];
  const canUpload = Boolean(setup.data?.canUpload);

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const list = [...files].filter((f) => /\.(xlsx|xlsm|xls|csv)$/i.test(f.name));
    setPending((before) => [...before, ...list.map((file): Pending => ({
      id: `${file.name}:${file.size}:${Math.random()}`, file,
      dealerId: dealerFromName(file.name, dealers) || (dealers.length === 1 ? dealers[0].dealerId : ''), state: 'ready',
    }))]);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    addFiles(event.dataTransfer.files);
  };
  const update = (id: string, patch: Partial<Pending>) => setPending((all) => all.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const ready = pending.filter((p) => p.state === 'ready' || p.state === 'failed');
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['scheme-dumps', tenantId] }),
    queryClient.invalidateQueries({ queryKey: ['scheme-report', tenantId] }),
  ]);
  const uploadAll = async () => {
    setBusy(true);
    onError(null);
    setNote(null);
    let last: { month: string; kind: SchemeKind } | null = null;
    for (const p of ready) {
      if (!p.dealerId) { update(p.id, { state: 'failed', message: 'Choose the dealership.' }); continue; }
      update(p.id, { state: 'uploading', message: undefined });
      try {
        const d = await uploadSchemeDump(tenantId!, { file: p.file, dealerId: p.dealerId }, accessToken);
        last = { month: d.periodMonth, kind: d.kind };
        update(p.id, {
          state: 'done',
          message: `${d.kindLabel} · ${monthLabel(d.periodMonth)} · ${d.rows} registrations (${d.sales} by sales, ${d.service} by service)`
            + `${d.duplicates ? ` · ${d.duplicates} repeated rows left out` : ''} · ${d.matched} matched to a journey`
            + `${d.locations.length ? ` · ${d.locations.join(', ')}` : ''}`
            + `${d.unmappedLocations.length ? ` · location not mapped to an outlet: ${d.unmappedLocations.join(', ')}` : ''}`,
        });
      } catch (cause) {
        update(p.id, { state: 'failed', message: cause instanceof Error ? cause.message : 'Could not be uploaded.' });
      }
    }
    setBusy(false);
    if (last) {
      if (months.some((m) => m.value === last!.month)) setMonth(last.month);
      setKind(last.kind);
    }
    await refresh();
  };
  const recheck = async () => {
    setBusy(true);
    onError(null);
    setNote(null);
    try {
      const done = await recheckSchemeDumps(tenantId!, { month }, accessToken);
      setNote(done.dumps
        ? `Checked again: ${done.dumps} dump${done.dumps === 1 ? '' : 's'} matched to the journeys as they stand now, ${done.journeys} journeys read.`
        : `No dump is on file for ${monthLabel(month)}.`);
      await refresh();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not be checked again.');
    } finally {
      setBusy(false);
    }
  };
  const exportExcel = async () => {
    onError(null);
    try {
      save(await downloadSchemeReport(tenantId!, month, accessToken), `EW-RSA-Report_${month}.xlsx`);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'The report could not be downloaded.');
    }
  };

  const r = report.data;
  const totals = (r?.dealers ?? []).reduce((acc, d) => ({
    rows: acc.rows + d.rows, sales: acc.sales + d.sales, service: acc.service + d.service, inSync: acc.inSync + d.inSync,
    notBought: acc.notBought + d.notBought, papersPending: acc.papersPending + d.papersPending,
    notInDump: acc.notInDump + d.notInDump, notInVerigence: acc.notInVerigence + d.notInVerigence,
    serviceOnly: acc.serviceOnly + d.serviceOnly, cancelled: acc.cancelled + d.cancelled,
    uploaded: acc.uploaded + (d.uploaded ? 1 : 0),
  }), { rows: 0, sales: 0, service: 0, inSync: 0, notBought: 0, papersPending: 0, notInDump: 0, notInVerigence: 0,
    serviceOnly: 0, cancelled: 0, uploaded: 0 });
  const kindLabel = KINDS.find((k) => k.kind === kind)!.label;
  const all = uploads.data?.uploads ?? [];
  const anyUpload = all.some((u) => u.status === 'ACTIVE');

  return (
    <>
      {setup.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{setup.error instanceof Error ? setup.error.message : 'Not available.'}</div> : null}
      <SectionCard>
        <div className="p2du-toolbar">
          <label>Month
            <select value={month} onChange={(e) => { setMonth(e.target.value); setNote(null); }}>
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <div className="p2du-switcher" role="tablist" aria-label="Scheme">
            {KINDS.map((k) => (
              <button key={k.kind} type="button" role="tab" aria-selected={kind === k.kind} onClick={() => setKind(k.kind)}>{k.label}</button>
            ))}
          </div>
          <div className="p2du-toolbar__end">
            {canUpload ? (
              <button type="button" className="p2w-button p2w-button--secondary" disabled={!enabled || busy || !anyUpload} onClick={() => void recheck()}>
                {busy ? 'Checking…' : 'Check again'}
              </button>
            ) : null}
            <button type="button" className="p2w-button p2w-button--secondary" disabled={!enabled || !anyUpload} onClick={() => void exportExcel()}>
              Export to Excel
            </button>
          </div>
        </div>
        {note ? <p className="p2w-muted" role="status">{note}</p> : null}
      </SectionCard>

      {canUpload ? (
        <SectionCard>
          <div className="p2w-card__title">
            <h3>Upload extended warranty and RSA dumps</h3>
            <p className="p2w-muted">
              Each dealership's monthly scheme register as it comes from the DMS, Excel (.xlsx or .xls) or CSV. Whether a file is the
              extended warranty or the RSA dump, and its month, are read from the file. Uploading the same dealership, type, month and
              location again replaces the earlier upload.
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
            <strong>Drag and drop EW and RSA dumps here or click to choose</strong>
            <span className="p2w-muted">Excel (.xlsx, .xls) · CSV · up to 15 MB each</span>
            <input ref={input} type="file" accept=".xlsx,.xlsm,.xls,.csv" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </div>
          {pending.length ? (
            <div className="p2du-files">
              {pending.map((p) => {
                const locked = p.state === 'done' || p.state === 'uploading';
                return (
                  <div key={p.id} className="p2du-file p2ins-file">
                    <span className="p2du-file__name" title={p.file.name}>{p.file.name}
                      {p.message ? <span className="p2du-file__state"><br />{p.message}</span> : null}
                    </span>
                    <select aria-label="Dealership" value={p.dealerId} disabled={locked} onChange={(e) => update(p.id, { dealerId: e.target.value })}>
                      <option value="">Dealership…</option>
                      {dealers.map((x) => <option key={x.dealerId} value={x.dealerId}>{x.dealerName}</option>)}
                    </select>
                    <span>
                      {p.state === 'done' ? <span className="p2du-tag p2du-tag--ok">Uploaded</span>
                        : p.state === 'uploading' ? <span className="p2du-tag p2du-tag--busy">Reading…</span>
                        : p.state === 'failed' ? <span className="p2du-tag p2du-tag--bad">Failed</span>
                        : <button type="button" className="p2w-link" onClick={() => setPending((list) => list.filter((x) => x.id !== p.id))}>Remove</button>}
                    </span>
                  </div>
                );
              })}
              <div className="p2du-toolbar">
                <button type="button" className="p2w-button p2w-button--primary" disabled={busy || !ready.length} onClick={() => void uploadAll()}>
                  {busy ? 'Reading and matching…' : `Upload ${ready.length} file${ready.length === 1 ? '' : 's'}`}
                </button>
                {pending.some((p) => p.state === 'done') ? (
                  <button type="button" className="p2w-link" onClick={() => setPending((list) => list.filter((p) => p.state !== 'done'))}>Clear uploaded</button>
                ) : null}
              </div>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      <SectionCard>
        <div className="p2w-card__title">
          <h3>{kindLabel} · {monthLabel(month)}</h3>
          <p className="p2w-muted">
            A customer has bought it, as per Verigence, when the NDC / customer ledger, the cost sheet or a customer invoice charges for it
            (never the booking form).
            {r?.checkedAtUtc ? ` Checked against Verigence ${when(r.checkedAtUtc)}; it is checked again every night and on “Check again”.` : ''}
          </p>
        </div>
        <div className="p2du-tiles">
          <div className="p2du-tile"><span>In the dump</span><strong>{totals.rows}</strong><small>{totals.sales} by sales · {totals.service} by service</small></div>
          <div className="p2du-tile p2du-tile--ok"><span>Bought and in sync</span><strong>{totals.inSync}</strong><small>in the dump and charged in Verigence</small></div>
          <div className="p2du-tile p2du-tile--warn"><span>Not bought as per Verigence</span><strong>{totals.notBought}</strong><small>{totals.papersPending} with the NDC / ledger not on file</small></div>
          <div className="p2du-tile p2du-tile--bad"><span>Bought, not in the dump</span><strong>{totals.notInDump}</strong><small>charged in Verigence, not registered</small></div>
          <div className="p2du-tile p2du-tile--warn"><span>Not in Verigence</span><strong>{totals.notInVerigence}</strong><small>sold by sales, no journey found</small></div>
        </div>
        {report.isLoading ? <p className="p2w-muted">Loading…</p> : null}
        {report.isError ? <p className="p2w-empty">{report.error instanceof Error ? report.error.message : 'Not available.'}</p> : null}
        {r && !totals.uploaded ? <p className="p2w-empty">No {kindLabel.toLowerCase()} dump uploaded for {monthLabel(month)} yet.</p> : null}
        {r && totals.uploaded ? (
          <>
            <div className="p2du-switcher p2du-switcher--sm" role="tablist" aria-label="Report">
              <button type="button" role="tab" aria-selected={view === 'sync'} onClick={() => setView('sync')}>In sync<b>{r.inSync.length}</b></button>
              <button type="button" role="tab" aria-selected={view === 'notBought'} onClick={() => setView('notBought')}>Not bought as per Verigence<b>{r.notBought.length}</b></button>
              <button type="button" role="tab" aria-selected={view === 'notInDump'} onClick={() => setView('notInDump')}>Bought, not in the dump<b>{r.notInDump.length}</b></button>
              <button type="button" role="tab" aria-selected={view === 'notInVerigence'} onClick={() => setView('notInVerigence')}>Not in Verigence<b>{r.notInVerigence.length}</b></button>
            </div>
            <div className="p2du-scroll">
              {view === 'sync' ? (
                r.inSync.length ? (
                  <table className="p2du-table p2du-table--stack">
                    <thead><tr><th>Journey</th><th>Dealership · outlet</th><th>Vehicle</th><th>Scheme in the dump</th><th className="num">Scheme amount</th><th>Matched on</th><th>Verigence shows</th></tr></thead>
                    <tbody>
                      {r.inSync.map((x) => (
                        <tr key={`${x.dealerId}:${x.schemeNumber}:${x.chassis}`}>
                          <td data-label="Journey"><JourneyCell r={x} /></td>
                          <td data-label="Dealership">{x.dealerName}<br /><small className="p2w-muted">{x.outletName ?? ''}</small></td>
                          <td data-label="Vehicle"><Vehicle r={x} /></td>
                          <td data-label="Scheme"><Scheme r={x} /></td>
                          <td data-label="Scheme amount" className="num">{amount(x)}</td>
                          <td data-label="Matched on">{x.matchBasisLabel ?? '—'}</td>
                          <td data-label="Verigence shows">
                            {x.focCharged ? <><span className="p2du-tag p2du-tag--warn">Free (FOC) in the dump, charged</span><br /></> : null}
                            <small className="p2w-muted">{x.verigenceReason ?? ''}</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="p2w-empty">No scheme in the dumps is on a journey that shows the charge yet.</p>
              ) : null}
              {view === 'notBought' ? (
                r.notBought.length ? (
                  <table className="p2du-table p2du-table--stack">
                    <thead><tr><th>Journey</th><th>Dealership · outlet</th><th>Vehicle</th><th>Scheme in the dump</th><th className="num">Scheme amount</th><th>Matched on</th><th>Verigence shows</th></tr></thead>
                    <tbody>
                      {r.notBought.map((x) => (
                        <tr key={`${x.dealerId}:${x.schemeNumber}:${x.chassis}`}>
                          <td data-label="Journey"><JourneyCell r={x} /></td>
                          <td data-label="Dealership">{x.dealerName}<br /><small className="p2w-muted">{x.outletName ?? ''}</small></td>
                          <td data-label="Vehicle"><Vehicle r={x} /></td>
                          <td data-label="Scheme"><Scheme r={x} /><br /><small className="p2w-muted">{x.channelLabel}{x.category ? ` · ${x.category}` : ''}</small></td>
                          <td data-label="Scheme amount" className="num">{amount(x)}</td>
                          <td data-label="Matched on">{x.matchBasisLabel ?? '—'}</td>
                          <td data-label="Verigence shows">
                            {x.foc ? <span className="p2du-tag">Free (FOC): no charge expected</span>
                              : x.papersOnFile ? <span className="p2du-tag p2du-tag--warn">NDC / ledger on file: no such charge</span>
                              : <span className="p2du-tag">NDC / ledger not on file yet</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="p2w-empty">Every journey found for the dump shows the charge.</p>
              ) : null}
              {view === 'notInDump' ? (
                r.notInDump.length ? (
                  <table className="p2du-table p2du-table--stack">
                    <thead><tr><th>Journey</th><th>Dealership · outlet</th><th>Vehicle</th><th>Sale date</th><th>Verigence shows</th><th>Note</th></tr></thead>
                    <tbody>
                      {r.notInDump.map((x) => (
                        <tr key={x.journeyId}>
                          <td data-label="Journey"><JourneyCell r={x} /></td>
                          <td data-label="Dealership">{x.dealerName}<br /><small className="p2w-muted">{x.outletName ?? ''}</small></td>
                          <td data-label="Vehicle">{x.model ?? '—'}<br /><small className="p2w-muted">{x.chassis ?? ''}</small></td>
                          <td data-label="Sale date">{day(x.journeyDate)}</td>
                          <td data-label="Verigence shows"><small className="p2w-muted">{x.verigenceReason ?? ''}</small></td>
                          <td data-label="Note">
                            {x.cancelledInDump ? <span className="p2du-tag p2du-tag--bad">Cancelled in the dump{x.cancelledOn ? ` · ${day(x.cancelledOn)}` : ''}</span>
                              : x.monthEnd ? <span className="p2du-tag">Month end: may be in next month's dump</span> : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="p2w-empty">No journey of {monthLabel(month)} shows a charge for a vehicle the dumps do not carry.</p>
              ) : null}
              {view === 'notInVerigence' ? (
                <>
                  {r.notInVerigence.length ? (
                    <table className="p2du-table p2du-table--stack">
                      <thead><tr><th>Vehicle</th><th>Dealership</th><th>Scheme in the dump</th><th className="num">Scheme amount</th><th>DMS customer id</th><th>Sold by</th><th>Note</th></tr></thead>
                      <tbody>
                        {r.notInVerigence.map((x) => (
                          <tr key={`${x.dealerId}:${x.schemeNumber}:${x.chassis}`}>
                            <td data-label="Vehicle"><Vehicle r={x} /></td>
                            <td data-label="Dealership">{x.dealerName}<br /><small className="p2w-muted">{x.location ?? ''}</small></td>
                            <td data-label="Scheme"><Scheme r={x} /></td>
                            <td data-label="Scheme amount" className="num">{amount(x)}</td>
                            <td data-label="DMS customer id">{x.customerCode ?? '—'}</td>
                            <td data-label="Sold by">{x.channelLabel}</td>
                            <td data-label="Note">{x.severalJourneys ? <span className="p2du-tag p2du-tag--warn">More than one journey has this chassis</span> : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="p2w-empty">Every scheme sold by sales is on a journey.</p>}
                  {totals.serviceOnly || totals.cancelled ? (
                    <p className="p2w-muted">
                      {totals.serviceOnly ? `${totals.serviceOnly} scheme${totals.serviceOnly === 1 ? '' : 's'} sold by service on older vehicles ${totals.serviceOnly === 1 ? 'is' : 'are'} not expected in Verigence. ` : ''}
                      {totals.cancelled ? `${totals.cancelled} cancelled registration${totals.cancelled === 1 ? '' : 's'}. ` : ''}
                      Both are in the Excel.
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
            <div className="p2du-panel">
              <header><strong>By dealership</strong></header>
              <div className="p2du-scroll">
                <table className="p2du-table">
                  <thead>
                    <tr><th>Dealership</th><th>Dump covers</th><th className="num">In the dump</th><th className="num">In sync</th><th className="num">Not bought</th>
                      <th className="num">Bought, not in dump</th><th className="num">Not in Verigence</th><th className="num">By service</th></tr>
                  </thead>
                  <tbody>
                    {r.dealers.map((d) => (
                      <tr key={d.dealerId}>
                        <td>{d.dealerName}</td>
                        <td>{!d.uploaded ? <span className="p2du-tag">Not uploaded</span> : d.coverage === null ? 'All outlets' : d.coverage.map((o) => o.split(' - ').pop()).join(', ')}</td>
                        <td className="num">{d.rows}</td>
                        <td className="num">{d.inSync}</td>
                        <td className="num">{d.notBought}</td>
                        <td className="num">{d.notInDump ? <span className="p2du-tag p2du-tag--bad">{d.notInDump}</span> : 0}</td>
                        <td className="num">{d.notInVerigence}</td>
                        <td className="num">{d.serviceOnly}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
        {all.length ? (
          <div className="p2du-panel">
            <header><strong>Uploads for {monthLabel(month)}</strong></header>
            <div className="p2du-scroll">
              <table className="p2du-table">
                <thead><tr><th>Type</th><th>Dealership</th><th>File</th><th className="num">Registrations</th><th className="num">Matched</th><th>Uploaded</th><th>Status</th></tr></thead>
                <tbody>
                  {all.map((u) => (
                    <tr key={u.dumpId} className={u.status === 'SUPERSEDED' ? 'is-superseded' : undefined}>
                      <td>{u.kindLabel}</td>
                      <td>{u.dealerName}<br /><small className="p2w-muted">{u.locations.length ? u.locations.join(', ') : 'All outlets'}</small></td>
                      <td>{u.fileName}
                        {u.duplicates ? <><br /><small className="p2w-muted">{u.duplicates} repeated rows left out</small></> : null}
                        {u.unmappedLocations.length ? <><br /><span className="p2du-tag p2du-tag--warn">Location not mapped to an outlet: {u.unmappedLocations.join(', ')}</span></> : null}
                      </td>
                      <td className="num">{u.rows}<br /><small className="p2w-muted">{u.sales} sales · {u.service} service</small></td>
                      <td className="num">{u.matched}</td>
                      <td>{u.uploadedBy}<br /><small className="p2w-muted">{when(u.uploadedAtUtc)}</small></td>
                      <td>{u.status === 'ACTIVE' ? <span className="p2du-tag p2du-tag--ok">Current</span> : <span className="p2du-tag">Replaced</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </SectionCard>
    </>
  );
}
