import { Fragment, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import {
  downloadDmsOutletReport,
  getDmsOutletMap,
  getDmsOutletReport,
  saveDmsOutletMap,
  type DmsOutletFigures,
  type DmsOutletMap,
} from '../../../services/audit-core/uc03DmsDumps';

type Key = keyof DmsOutletFigures;
type Column = { key: Key; label: string; dms?: boolean; tone?: 'bad' | 'warn' };

// The dealers' own daily sheet, with what Verigence knows beside it.
const GROUPS: { title: string; columns: Column[] }[] = [
  {
    title: 'Booking',
    columns: [
      { key: 'bookingDms', label: 'As per DMS', dms: true },
      { key: 'bookingInVerigence', label: 'In Verigence' },
      { key: 'bookingSynced', label: 'Synced', dms: true },
      { key: 'bookingNotInVerigence', label: 'Not in Verigence', dms: true, tone: 'bad' },
      { key: 'bookingGap', label: 'DMS less Verigence', dms: true },
    ],
  },
  {
    title: 'Total delivery',
    columns: [
      { key: 'gateRegister', label: 'Gate out register' },
      { key: 'deliveryDump', label: 'As per dump', dms: true },
      { key: 'deliveryInVerigence', label: 'In Verigence' },
      { key: 'deliverySynced', label: 'Synced', dms: true },
      { key: 'pendingWithPc', label: 'Pending with PC', tone: 'warn' },
      { key: 'notIntimated', label: 'Not intimated (client)', tone: 'warn' },
      { key: 'deliveryNotUploaded', label: 'Delivery not uploaded', dms: true, tone: 'warn' },
      { key: 'deliveryNotInVerigence', label: 'Not in Verigence', dms: true, tone: 'bad' },
      { key: 'deliveryNotInDms', label: 'In Verigence, not in dump', tone: 'warn' },
    ],
  },
  {
    title: 'Delivery bifurcation (Verigence)',
    columns: [
      { key: 'inscope', label: 'Inscope' },
      { key: 'outscope', label: 'Outscope' },
      { key: 'otherDealType', label: 'MR / Lease / Bulk' },
      { key: 'dealTypePending', label: 'Type pending' },
    ],
  },
];
const COLUMNS = GROUPS.flatMap((g) => g.columns);

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

function Cells({ figures, dms }: { figures: DmsOutletFigures; dms: boolean }) {
  return (
    <>
      {COLUMNS.map((c) => {
        if (c.dms && !dms) return <td key={c.key} className="num p2or-none">·</td>;
        const value = figures[c.key] ?? 0;
        const tone = value > 0 && c.tone ? ` p2or-${c.tone}` : '';
        return <td key={c.key} className={`num${tone}`}>{value}</td>;
      })}
    </>
  );
}

/**
 * Outlet report on the Data uploads tab (product owner 16 Nov 2026): the dealers' DMS dumps outlet
 * wise, day by day, against Verigence and the gate register. Where the DMS keeps several outlets
 * under one location (Utkal's ANANDAPUR under KEONJHAR, every Aditya outlet but JAJPUR under
 * CUTTACK) each outlet shows its Verigence figures and the location's row compares the DMS with
 * their total.
 */
export default function DmsOutletReportSection({ tenantId, accessToken, today, onError }: {
  tenantId?: string;
  accessToken?: string;
  today: string;
  onError: (message: string | null) => void;
}) {
  const [date, setDate] = useState('');
  const [showMap, setShowMap] = useState(false);
  const asAt = date || today;
  const enabled = Boolean(tenantId && accessToken && asAt);
  const report = useQuery({
    queryKey: ['dms-outlet-report', tenantId, asAt],
    queryFn: () => getDmsOutletReport(tenantId!, asAt, accessToken),
    enabled,
  });
  const exportExcel = async () => {
    onError(null);
    try {
      save(await downloadDmsOutletReport(tenantId!, asAt, accessToken), `DMS-Outlet-Report_${asAt}.xlsx`);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'The report could not be downloaded.');
    }
  };
  const data = report.data;

  return (
    <>
      <SectionCard>
        <div className="p2w-card__title">
          <h3>Outlet report</h3>
          <p className="p2w-muted">
            Month to date, outlet wise: the DMS dumps against Verigence and the gate register. Each dealership's
            Verigence figures run to the last day its latest dump covers, so both sides count the same days.
            Where the DMS keeps outlets under one location, each outlet shows its own Verigence count and the
            location's row compares the DMS with their total.
          </p>
        </div>
        <div className="p2du-toolbar">
          <label>As at
            <input type="date" value={asAt} max={today || undefined} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="p2du-toolbar__end">
            <button type="button" className="p2w-button p2w-button--secondary" onClick={() => setShowMap((v) => !v)}>
              {showMap ? 'Hide DMS locations' : 'DMS locations'}
            </button>
            <button type="button" className="p2w-button p2w-button--secondary" disabled={!enabled} onClick={() => void exportExcel()}>
              Export to Excel
            </button>
          </div>
        </div>
        {report.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{report.error instanceof Error ? report.error.message : 'Not available.'}</div> : null}
        {report.isLoading ? <p className="p2w-muted">Loading…</p> : null}
        {data ? (
          <div className="p2du-scroll p2or-scroll">
            <table className="p2du-table p2or-table">
              <thead>
                <tr>
                  <th rowSpan={2} className="p2or-sticky">Dealer / location</th>
                  {GROUPS.map((g) => <th key={g.title} colSpan={g.columns.length} className={`p2or-group p2or-group--${g.columns.length}`}>{g.title}</th>)}
                </tr>
                <tr>{COLUMNS.map((c) => <th key={c.key} className={`num${c.dms ? ' p2or-dmshead' : ''}`}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {data.dealers.map((dealer) => (
                  <Fragment key={dealer.dealerId}>
                    {dealer.locations.map((location) => location.outlets.length === 1 ? (
                      <tr key={location.dmsOutletId}>
                        <td className="p2or-sticky">{location.name}</td>
                        <Cells figures={location.figures} dms />
                      </tr>
                    ) : (
                      <Fragment key={location.dmsOutletId}>
                        {location.outlets.map((o) => (
                          <tr key={o.outletId} className="p2or-member">
                            <td className="p2or-sticky">{o.outletName}<small className="p2w-muted"> · in DMS under {location.name}</small></td>
                            <Cells figures={o.figures} dms={false} />
                          </tr>
                        ))}
                        <tr className="p2or-location">
                          <td className="p2or-sticky">{location.name} <small className="p2w-muted">DMS location · {location.outlets.map((o) => o.outletName).join(' + ')}</small></td>
                          <Cells figures={location.figures} dms />
                        </tr>
                      </Fragment>
                    ))}
                    {dealer.unmapped.map((u) => (
                      <tr key={`${dealer.dealerId}:${u.label}`}>
                        <td className="p2or-sticky"><span className="p2du-tag p2du-tag--warn">Not mapped</span> {u.label}</td>
                        <Cells figures={u.figures} dms />
                      </tr>
                    ))}
                    <tr className="p2or-total">
                      <td className="p2or-sticky">
                        {dealer.dealerName} — Total
                        <small className="p2or-note">
                          Bookings to {day(dealer.bookingsTo)}{dealer.bookingDumpDate ? ` (dump of ${day(dealer.bookingDumpDate)})` : ' (no booking dump)'}
                          {' · '}Deliveries to {day(dealer.deliveriesTo)}{dealer.deliveryDumpDate ? ` (dump of ${day(dealer.deliveryDumpDate)})` : ' (no delivery dump)'}
                        </small>
                      </td>
                      <Cells figures={dealer.figures} dms />
                    </tr>
                  </Fragment>
                ))}
                <tr className="p2or-grand">
                  <td className="p2or-sticky">Project — Total</td>
                  <Cells figures={data.figures} dms />
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}
        {data ? (
          <p className="p2w-muted p2or-foot">
            In Verigence (bookings): booking form date in the period, else the day the booking documents were uploaded
            ({data.figures.bookingDatedByUpload ?? 0} dated that way). In Verigence (deliveries): delivery files dated in the
            period by the gate pass, else the NDC's delivery date, else the latest payment receipt
            ({data.figures.deliveryDatedWithoutGatePass ?? 0} without a gate pass), up to the last day the dump covers. Pending with PC and not intimated come from the PCs' daily gate register.
            Cancelled DMS bookings are left out.
          </p>
        ) : null}
      </SectionCard>
      {showMap ? <OutletMapCard tenantId={tenantId} accessToken={accessToken} onError={onError} /> : null}
    </>
  );
}

function OutletMapCard({ tenantId, accessToken, onError }: { tenantId?: string; accessToken?: string; onError: (m: string | null) => void }) {
  const queryClient = useQueryClient();
  const map = useQuery({
    queryKey: ['dms-outlet-map', tenantId],
    queryFn: () => getDmsOutletMap(tenantId!, accessToken),
    enabled: Boolean(tenantId && accessToken),
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ dmsOutletId: string; labels: string; catchAll: boolean }>({ dmsOutletId: '', labels: '', catchAll: false });
  const [busy, setBusy] = useState(false);

  const start = (o: DmsOutletMap['dealers'][number]['outlets'][number]) => {
    setEditing(o.outletId);
    setDraft({ dmsOutletId: o.dmsOutletId, labels: o.labels.join(', '), catchAll: o.catchAll });
  };
  const submit = async (outletId: string) => {
    setBusy(true);
    onError(null);
    try {
      await saveDmsOutletMap(tenantId!, outletId, {
        dmsOutletId: draft.dmsOutletId,
        labels: draft.labels.split(',').map((x) => x.trim()).filter(Boolean),
        catchAll: draft.catchAll,
      }, accessToken);
      setEditing(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dms-outlet-map', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['dms-outlet-report', tenantId] }),
      ]);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard>
      <div className="p2w-card__title">
        <h3>DMS locations</h3>
        <p className="p2w-muted">
          How each dealership's DMS names its locations, and which Verigence outlets each one covers. A dump row
          whose location names no outlet goes to the dealership's catch-all location, else shows as not mapped.
        </p>
      </div>
      {map.isLoading ? <p className="p2w-muted">Loading…</p> : null}
      {map.data?.dealers.map((dealer) => {
        const names = new Map(dealer.outlets.map((o) => [o.outletId, o.outletName]));
        const anchors = dealer.outlets.filter((o) => o.dmsOutletId === o.outletId);
        return (
          <div key={dealer.dealerId} className="p2or-map">
            <h4>{dealer.dealerName}</h4>
            <div className="p2du-scroll">
              <table className="p2du-table">
                <thead>
                  <tr><th>Verigence outlet</th><th>In DMS under</th><th>DMS location names</th><th>Catch-all</th>{map.data!.canEdit ? <th /> : null}</tr>
                </thead>
                <tbody>
                  {dealer.outlets.map((o) => editing === o.outletId ? (
                    <tr key={o.outletId}>
                      <td>{o.outletName}</td>
                      <td>
                        <select aria-label="In DMS under" value={draft.dmsOutletId} onChange={(e) => setDraft({ ...draft, dmsOutletId: e.target.value })}>
                          {[o, ...anchors.filter((a) => a.outletId !== o.outletId)].map((a) => (
                            <option key={a.outletId} value={a.outletId}>{a.outletId === o.outletId ? 'Its own location' : a.outletName}</option>
                          ))}
                        </select>
                      </td>
                      <td><input aria-label="DMS location names" value={draft.labels} placeholder="e.g. CSA_SEC_10_SH, CDA"
                        onChange={(e) => setDraft({ ...draft, labels: e.target.value })} /></td>
                      <td><input type="checkbox" aria-label="Catch-all" checked={draft.catchAll} onChange={(e) => setDraft({ ...draft, catchAll: e.target.checked })} /></td>
                      <td className="p2or-actions">
                        <button type="button" className="p2w-button p2w-button--primary" disabled={busy} onClick={() => void submit(o.outletId)}>Save</button>
                        <button type="button" className="p2w-link" onClick={() => setEditing(null)}>Cancel</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={o.outletId}>
                      <td>{o.outletName}</td>
                      <td>{o.dmsOutletId === o.outletId ? <span className="p2w-muted">Its own</span> : names.get(o.dmsOutletId) ?? '—'}</td>
                      <td>{o.labels.length ? o.labels.join(', ') : <span className="p2w-muted">Outlet name</span>}</td>
                      <td>{o.catchAll ? <span className="p2du-tag p2du-tag--open">Yes</span> : ''}</td>
                      {map.data!.canEdit ? <td><button type="button" className="p2w-link" onClick={() => start(o)}>Change</button></td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {dealer.labelsSeen.length ? (
              <p className="p2w-muted p2or-seen">
                Location names in recent dumps:{' '}
                {dealer.labelsSeen.map((l, i) => (
                  <span key={l.label}>{i ? ' · ' : ''}{l.label} ({l.rows}) → {l.dmsLocation
                    ? <strong>{l.dmsLocation}</strong>
                    : <span className="p2du-tag p2du-tag--warn">not mapped</span>}</span>
                ))}
              </p>
            ) : null}
          </div>
        );
      })}
    </SectionCard>
  );
}
