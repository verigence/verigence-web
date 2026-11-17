import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import SectionCard from '../../../components/SectionCard';
import {
  downloadInsuranceReport,
  downloadOdGridTemplate,
  getInsuranceReport,
  getInsuranceSetup,
  getOdGrid,
  listInsuranceDumps,
  saveOdGrid,
  uploadInsuranceDump,
  uploadOdGrid,
  type OdGrid,
  type Tenure,
} from '../../../services/audit-core/uc03InsuranceDumps';
import { monthLabel } from '../../../services/audit-core/uc03ProjectTracker';

type Pending = { id: string; file: File; dealerId: string; state: 'ready' | 'uploading' | 'done' | 'failed'; message?: string };
type View = 'over' | 'self' | 'nolimit';
type SegmentDraft = Record<string, Record<Tenure, string>>;
type ModelDraft = { key: string; model: string; tenure: Tenure | ''; pct: string };

const TENURES: { code: Tenure; label: string }[] = [{ code: '1Y', label: '1 year' }, { code: '3+3', label: '3+3' }];

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

const pct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${Number(value)}%`);
const tenureLabel = (t: string | null) => (t === '1Y' ? '1 year' : t === '3+3' ? '3+3' : '—');

/** A file named after its dealership ("Shivnath_Insurance_Dump.csv") goes to that dealership. */
function dealerFromName(name: string, dealers: { dealerId: string; dealerName: string }[]): string {
  const lower = name.toLowerCase();
  const hit = dealers.filter((d) => lower.includes(d.dealerName.split(/\s+/)[0].toLowerCase()));
  return hit.length === 1 ? hit[0].dealerId : '';
}

function draftOf(grid: OdGrid | undefined, segments: string[]): { segments: SegmentDraft; models: ModelDraft[] } {
  const out: SegmentDraft = {};
  const codes = new Set([...segments, ...(grid?.segments ?? []).map((s) => s.segment)]);
  for (const code of codes) out[code] = { '1Y': '', '3+3': '' };
  for (const s of grid?.segments ?? []) out[s.segment][s.tenure] = String(s.pct);
  return {
    segments: out,
    models: (grid?.models ?? []).map((m, i) => ({ key: `m${i}`, model: m.model, tenure: m.tenure ?? '', pct: String(m.pct) })),
  };
}

/**
 * Insurance on the Data uploads tab (product owner 16 Nov 2026): each dealership's monthly insurance
 * dump, the month's OD discount grid (keyed in or uploaded as Excel) and the two reports -- policies
 * given more OD discount than agreed, and journeys Verigence shows as Self insurance while the
 * dealership's dump carries the policy.
 */
export default function InsuranceDumpsSection({ tenantId, accessToken, months, onError }: {
  tenantId?: string;
  accessToken?: string;
  months: { value: string; label: string }[];
  onError: (message: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const enabled = Boolean(tenantId && accessToken);
  // The dump comes monthly for the month just ended: start there.
  const [month, setMonth] = useState(months[1]?.value ?? months[0]?.value ?? '');
  const [pending, setPending] = useState<Pending[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>('over');
  const [scope, setScope] = useState('');
  const [segments, setSegments] = useState<SegmentDraft>({});
  const [models, setModels] = useState<ModelDraft[]>([]);
  const [gridNote, setGridNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const gridInput = useRef<HTMLInputElement>(null);

  const setup = useQuery({ queryKey: ['ins-setup', tenantId], queryFn: () => getInsuranceSetup(tenantId!, accessToken), enabled });
  const uploads = useQuery({
    queryKey: ['ins-dumps', tenantId, month], queryFn: () => listInsuranceDumps(tenantId!, month, accessToken),
    enabled: enabled && Boolean(month),
  });
  const grid = useQuery({
    queryKey: ['ins-grid', tenantId, month, scope], queryFn: () => getOdGrid(tenantId!, month, scope || null, accessToken),
    enabled: enabled && Boolean(month),
  });
  const report = useQuery({
    queryKey: ['ins-report', tenantId, month], queryFn: () => getInsuranceReport(tenantId!, month, accessToken),
    enabled: enabled && Boolean(month),
  });
  const dealers = setup.data?.dealers ?? [];
  const segmentCodes = useMemo(() => (setup.data?.segments ?? []).map((s) => s.code), [setup.data]);
  const canEdit = Boolean(setup.data?.canEditGrid);

  useEffect(() => {
    const d = draftOf(grid.data, segmentCodes);
    setSegments(d.segments);
    setModels(d.models);
    setGridNote(null);
  }, [grid.data, segmentCodes]);

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const list = [...files].filter((f) => /\.(xlsx|xlsm|csv)$/i.test(f.name));
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
    queryClient.invalidateQueries({ queryKey: ['ins-dumps', tenantId] }),
    queryClient.invalidateQueries({ queryKey: ['ins-report', tenantId] }),
    queryClient.invalidateQueries({ queryKey: ['ins-grid', tenantId] }),
  ]);
  const uploadAll = async () => {
    setBusy(true);
    onError(null);
    let lastMonth: string | null = null;
    for (const p of ready) {
      if (!p.dealerId) { update(p.id, { state: 'failed', message: 'Choose the dealership.' }); continue; }
      update(p.id, { state: 'uploading', message: undefined });
      try {
        const d = await uploadInsuranceDump(tenantId!, { file: p.file, dealerId: p.dealerId }, accessToken);
        lastMonth = d.periodMonth;
        update(p.id, {
          state: 'done',
          message: `${monthLabel(d.periodMonth)} · ${d.rows} policies${d.duplicates ? ` · ${d.duplicates} repeated rows left out` : ''} · ${d.matched} matched to a journey`,
        });
      } catch (cause) {
        update(p.id, { state: 'failed', message: cause instanceof Error ? cause.message : 'Could not be uploaded.' });
      }
    }
    setBusy(false);
    if (lastMonth && months.some((m) => m.value === lastMonth)) setMonth(lastMonth);
    await refresh();
  };

  const gridBody = () => ({
    month,
    dealerId: scope || null,
    segments: Object.entries(segments).flatMap(([segment, byTenure]) => TENURES
      .filter((t) => byTenure[t.code].trim() !== '')
      .map((t) => ({ segment, tenure: t.code, pct: byTenure[t.code].trim() }))),
    models: models.filter((m) => m.model.trim() || m.pct.trim())
      .map((m) => ({ model: m.model.trim(), tenure: (m.tenure || null) as Tenure | null, pct: m.pct.trim() })),
  });
  const saveGrid = async () => {
    setBusy(true);
    onError(null);
    try {
      await saveOdGrid(tenantId!, gridBody(), accessToken);
      setGridNote('Saved. The report below now uses this grid.');
      await refresh();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'The grid could not be saved.');
    } finally {
      setBusy(false);
    }
  };
  const copyPrevious = async () => {
    if (!grid.data?.previousMonth) return;
    onError(null);
    try {
      const previous = await getOdGrid(tenantId!, grid.data.previousMonth, scope || null, accessToken);
      const d = draftOf(previous, segmentCodes);
      setSegments(d.segments);
      setModels(d.models);
      setGridNote(`Copied from ${monthLabel(grid.data.previousMonth)} — change what differs, then save.`);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'The previous grid could not be read.');
    }
  };
  const uploadGrid = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    onError(null);
    try {
      await uploadOdGrid(tenantId!, { file, month, dealerId: scope || null }, accessToken);
      setGridNote(`${file.name} saved as the ${monthLabel(month)} grid.`);
      await refresh();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'The grid could not be read.');
    } finally {
      setBusy(false);
    }
  };
  const template = async () => {
    onError(null);
    try {
      save(await downloadOdGridTemplate(tenantId!, month, scope || null, accessToken), `OD-Discount-Grid_${month}.xlsx`);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'The template could not be downloaded.');
    }
  };
  const exportExcel = async () => {
    onError(null);
    try {
      save(await downloadInsuranceReport(tenantId!, month, accessToken), `Insurance-Report_${month}.xlsx`);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'The report could not be downloaded.');
    }
  };

  const r = report.data;
  const totals = (r?.dealers ?? []).reduce((acc, d) => ({
    policies: acc.policies + d.policies, over: acc.over + d.over, noLimit: acc.noLimit + d.noLimit,
    matched: acc.matched + d.matched, self: acc.self + d.selfButDealer, notNew: acc.notNew + (d.notNew ?? 0),
  }), { policies: 0, over: 0, noLimit: 0, matched: 0, self: 0, notNew: 0 });
  const segmentLabel = (code: string) => setup.data?.segments.find((s) => s.code === code)?.label ?? code;
  const ownGrid = new Set(grid.data?.dealersWithOwnGrid ?? []);
  const current = (uploads.data?.uploads ?? []).filter((u) => u.status === 'ACTIVE');

  return (
    <>
      {setup.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{setup.error instanceof Error ? setup.error.message : 'Not available.'}</div> : null}
      <SectionCard>
        <div className="p2du-toolbar">
          <label>Month
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <div className="p2du-toolbar__end">
            <button type="button" className="p2w-button p2w-button--secondary" disabled={!enabled || !totals.policies} onClick={() => void exportExcel()}>
              Export to Excel
            </button>
          </div>
        </div>
      </SectionCard>

      {setup.data?.canUpload ? (
        <SectionCard>
          <div className="p2w-card__title">
            <h3>Upload insurance dumps</h3>
            <p className="p2w-muted">
              Each dealership's monthly insurance report (Policy Details Report) as it comes, Excel or CSV. The month is read from
              the policies; uploading the same dealership's month again replaces the earlier upload. Policies repeated in the file
              are counted once. The reports read the New policies only (Policy Type); renewals and rollovers are left out.
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
            <strong>Drag and drop insurance dumps here or click to choose</strong>
            <span className="p2w-muted">Excel (.xlsx) · CSV · up to 15 MB each</span>
            <input ref={input} type="file" accept=".xlsx,.xlsm,.csv" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
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
                        : <button type="button" className="p2w-link" onClick={() => setPending((all) => all.filter((x) => x.id !== p.id))}>Remove</button>}
                    </span>
                  </div>
                );
              })}
              <div className="p2du-toolbar">
                <button type="button" className="p2w-button p2w-button--primary" disabled={busy || !ready.length} onClick={() => void uploadAll()}>
                  {busy ? 'Reading and matching…' : `Upload ${ready.length} file${ready.length === 1 ? '' : 's'}`}
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
          <h3>OD discount grid · {monthLabel(month)}</h3>
          <p className="p2w-muted">
            The agreed maximum OD discount for the month, per segment for 1-year and 3+3 policies; a model addition is added to its
            segment's limit (for both tenures unless one is chosen). A dealership's own grid, where set, replaces the common one for it.
            Leave a cell empty when there is no agreed limit.
          </p>
        </div>
        <div className="p2du-toolbar">
          {dealers.length > 1 ? (
            <label>Applies to
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="">All dealerships (common grid)</option>
                {dealers.map((d) => <option key={d.dealerId} value={d.dealerId}>{d.dealerName}{ownGrid.has(d.dealerId) ? ' · own grid' : ''}</option>)}
              </select>
            </label>
          ) : null}
          <div className="p2du-toolbar__end">
            {canEdit && grid.data?.previousMonth ? (
              <button type="button" className="p2w-button p2w-button--secondary" disabled={busy} onClick={() => void copyPrevious()}>
                Copy {monthLabel(grid.data.previousMonth)}
              </button>
            ) : null}
            <button type="button" className="p2w-button p2w-button--secondary" disabled={!enabled} onClick={() => void template()}>Download Excel</button>
            {canEdit ? (
              <>
                <button type="button" className="p2w-button p2w-button--secondary" disabled={busy} onClick={() => gridInput.current?.click()}>Upload Excel</button>
                <input ref={gridInput} type="file" accept=".xlsx,.xlsm" hidden onChange={(e) => { void uploadGrid(e.target.files?.[0]); e.target.value = ''; }} />
              </>
            ) : null}
          </div>
        </div>
        {scope && !ownGrid.has(scope) ? (
          <p className="p2w-muted">This dealership has no grid of its own for {monthLabel(month)}: the common grid applies. Saving here gives it its own.</p>
        ) : null}
        <div className="p2du-scroll">
          <table className="p2du-table p2ins-grid">
            <thead>
              <tr><th>Segment</th>{TENURES.map((t) => <th key={t.code} className="num">{t.label} · max OD %</th>)}</tr>
            </thead>
            <tbody>
              {Object.keys(segments).map((code) => (
                <tr key={code}>
                  <td>{segmentLabel(code)}</td>
                  {TENURES.map((t) => (
                    <td key={t.code} className="num">
                      <input type="number" inputMode="decimal" min={0} max={100} step="0.5" aria-label={`${code} ${t.label}`}
                        value={segments[code][t.code]} disabled={!canEdit}
                        onChange={(e) => setSegments((all) => ({ ...all, [code]: { ...all[code], [t.code]: e.target.value } }))} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h4 className="p2ins-sub">Additional OD discount for models</h4>
        {models.length ? (
          <div className="p2du-scroll">
            <table className="p2du-table p2ins-grid">
              <thead><tr><th>Model</th><th>Tenure</th><th className="num">Additional OD %</th>{canEdit ? <th /> : null}</tr></thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.key}>
                    <td><input aria-label="Model" value={m.model} disabled={!canEdit} placeholder="e.g. XEV 9S"
                      onChange={(e) => setModels((all) => all.map((x) => (x.key === m.key ? { ...x, model: e.target.value } : x)))} /></td>
                    <td>
                      <select aria-label="Tenure" value={m.tenure} disabled={!canEdit}
                        onChange={(e) => setModels((all) => all.map((x) => (x.key === m.key ? { ...x, tenure: e.target.value as Tenure | '' } : x)))}>
                        <option value="">Both</option>
                        {TENURES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                      </select>
                    </td>
                    <td className="num"><input type="number" inputMode="decimal" min={0} max={100} step="0.5" aria-label="Additional OD %"
                      value={m.pct} disabled={!canEdit}
                      onChange={(e) => setModels((all) => all.map((x) => (x.key === m.key ? { ...x, pct: e.target.value } : x)))} /></td>
                    {canEdit ? <td><button type="button" className="p2w-link" onClick={() => setModels((all) => all.filter((x) => x.key !== m.key))}>Remove</button></td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="p2w-muted">No model additions.</p>}
        {canEdit ? (
          <div className="p2du-toolbar">
            <button type="button" className="p2w-link" onClick={() => setModels((all) => [...all, { key: `n${Date.now()}`, model: '', tenure: '', pct: '' }])}>
              + Add a model
            </button>
            <div className="p2du-toolbar__end">
              <button type="button" className="p2w-button p2w-button--primary" disabled={busy} onClick={() => void saveGrid()}>Save grid</button>
            </div>
          </div>
        ) : null}
        {gridNote ? <p className="p2w-muted" role="status">{gridNote}</p> : null}
      </SectionCard>

      <SectionCard>
        <div className="p2w-card__title">
          <h3>Insurance report · {monthLabel(month)}</h3>
          {r && !r.gridSet && totals.policies ? (
            <p className="p2w-muted">No OD discount grid is set for {monthLabel(month)} yet: key it in above to see the policies over the limit.</p>
          ) : null}
        </div>
        <div className="p2du-tiles">
          <div className="p2du-tile"><span>New policies in the dumps</span><strong>{totals.policies}</strong><small>{totals.notNew ? `${totals.notNew} not New left out · ` : ''}{current.length} dealership upload{current.length === 1 ? '' : 's'}</small></div>
          <div className="p2du-tile p2du-tile--bad"><span>OD over the agreed limit</span><strong>{totals.over}</strong><small>{totals.noLimit} with no limit in the grid</small></div>
          <div className="p2du-tile"><span>Matched to a journey</span><strong>{totals.matched}</strong><small>by VIN, mobile or name and model</small></div>
          <div className="p2du-tile p2du-tile--warn"><span>Self in Verigence, dealer policy</span><strong>{totals.self}</strong><small>insured by the dealership</small></div>
        </div>
        {report.isLoading ? <p className="p2w-muted">Loading…</p> : null}
        {r && !totals.policies ? <p className="p2w-empty">{totals.notNew ? `The dumps of ${monthLabel(month)} carry no New policy (${totals.notNew} of another Policy Type left out).` : `No insurance dump uploaded for ${monthLabel(month)} yet.`}</p> : null}
        {r && totals.policies ? (
          <>
            <div className="p2du-switcher p2du-switcher--sm" role="tablist" aria-label="Report">
              <button type="button" role="tab" aria-selected={view === 'over'} onClick={() => setView('over')}>OD over the limit<b>{r.odOverLimit.length}</b></button>
              <button type="button" role="tab" aria-selected={view === 'self'} onClick={() => setView('self')}>Self vs dealership<b>{r.selfButDealer.length}</b></button>
              <button type="button" role="tab" aria-selected={view === 'nolimit'} onClick={() => setView('nolimit')}>No limit in grid<b>{r.noLimit.length}</b></button>
            </div>
            <div className="p2du-scroll">
              {view === 'over' ? (
                r.odOverLimit.length ? (
                  <table className="p2du-table p2du-table--stack">
                    <thead>
                      <tr><th>Policy</th><th>Dealership</th><th>Model</th><th>Segment · tenure</th><th className="num">Given</th>
                        <th className="num">Allowed</th><th className="num">Excess</th><th>Journey</th></tr>
                    </thead>
                    <tbody>
                      {r.odOverLimit.map((p) => (
                        <tr key={`${p.dealerId}:${p.policyNumber}`}>
                          <td data-label="Policy">{p.insuredName ?? '—'}<br /><small className="p2w-muted">{p.policyNumber} · {day(p.policyDate)} · {p.insurer ?? ''}</small></td>
                          <td data-label="Dealership">{p.dealerName}</td>
                          <td data-label="Model">{p.model ?? '—'}<br /><small className="p2w-muted">{p.variant ?? ''}</small></td>
                          <td data-label="Segment">{p.segment ?? '—'} · {tenureLabel(p.tenure)}</td>
                          <td data-label="Given" className="num">{pct(p.odDiscount)}</td>
                          <td data-label="Allowed" className="num">{pct(p.allowed)}{p.modelExtra ? <><br /><small className="p2w-muted">{pct(p.segmentLimit)} + {pct(p.modelExtra)}</small></> : null}</td>
                          <td data-label="Excess" className="num"><span className="p2du-tag p2du-tag--bad">+{p.excess} pts</span></td>
                          <td data-label="Journey">{p.journeyId ? <Link className="p2w-link" to={`/p2/journeys/${p.journeyId}/overview`}>{p.journeyReference ?? 'Journey'}</Link> : <span className="p2w-muted">Not in Verigence</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="p2w-empty">{r.gridSet ? 'No policy is over the agreed OD discount.' : 'Set the grid to check the OD discount.'}</p>
              ) : null}
              {view === 'self' ? (
                r.selfButDealer.length ? (
                  <table className="p2du-table p2du-table--stack">
                    <thead>
                      <tr><th>Journey</th><th>Dealership</th><th>Model · VIN</th><th>Matched on</th><th>Verigence says</th><th>Dealer's policy</th></tr>
                    </thead>
                    <tbody>
                      {r.selfButDealer.map((p) => (
                        <tr key={`${p.dealerId}:${p.policyNumber}`}>
                          <td data-label="Journey"><Link className="p2w-link" to={`/p2/journeys/${p.journeyId}/overview`}>{p.journeyReference ?? 'Journey'}</Link><br /><small className="p2w-muted">{p.journeyCustomer ?? p.insuredName ?? ''}</small></td>
                          <td data-label="Dealership">{p.dealerName}</td>
                          <td data-label="Model">{p.model ?? '—'}<br /><small className="p2w-muted">{p.vin ?? ''}</small></td>
                          <td data-label="Matched on">{p.matchBasis === 'VIN' ? 'VIN' : p.matchBasis === 'MOBILE' ? 'Mobile' : p.matchBasis === 'NAME_MODEL' ? 'Name and model' : p.matchBasis ?? '—'}</td>
                          <td data-label="Verigence says"><span className="p2du-tag p2du-tag--warn">Self</span><br /><small className="p2w-muted">{p.decidedByLabel ?? ''}</small></td>
                          <td data-label="Dealer's policy">{p.policyNumber}<br /><small className="p2w-muted">{p.insurer ?? ''} · {day(p.policyDate)} · OD {pct(p.odDiscount)}</small></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="p2w-empty">No journey shows Self insurance while the dealership's dump carries its policy.</p>
              ) : null}
              {view === 'nolimit' ? (
                r.noLimit.length ? (
                  <table className="p2du-table p2du-table--stack">
                    <thead><tr><th>Policy</th><th>Dealership</th><th>Model</th><th>Segment · tenure</th><th className="num">Given</th><th>Why</th></tr></thead>
                    <tbody>
                      {r.noLimit.map((p) => (
                        <tr key={`${p.dealerId}:${p.policyNumber}`}>
                          <td data-label="Policy">{p.insuredName ?? '—'}<br /><small className="p2w-muted">{p.policyNumber} · {day(p.policyDate)}</small></td>
                          <td data-label="Dealership">{p.dealerName}</td>
                          <td data-label="Model">{p.model ?? '—'}</td>
                          <td data-label="Segment">{p.segment ?? '—'} · {tenureLabel(p.tenure)}</td>
                          <td data-label="Given" className="num">{pct(p.odDiscount)}</td>
                          <td data-label="Why">{p.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="p2w-empty">Every policy had a limit in the grid.</p>
              ) : null}
            </div>
          </>
        ) : null}
        {current.length ? (
          <div className="p2du-panel">
            <header><strong>Uploads for {monthLabel(month)}</strong></header>
            <div className="p2du-scroll">
              <table className="p2du-table">
                <thead><tr><th>Dealership</th><th>File</th><th className="num">Policies</th><th className="num">Matched</th><th>Uploaded</th></tr></thead>
                <tbody>
                  {current.map((u) => (
                    <tr key={u.dumpId}>
                      <td>{u.dealerName}</td>
                      <td>{u.fileName}{u.duplicates ? <><br /><small className="p2w-muted">{u.duplicates} repeated rows left out</small></> : null}</td>
                      <td className="num">{u.rows}</td>
                      <td className="num">{u.matched}</td>
                      <td>{u.uploadedBy}<br /><small className="p2w-muted">{new Date(u.uploadedAtUtc).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></td>
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
