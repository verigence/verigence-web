import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { getDmsOutletMap, saveDmsOutletMap, type DmsOutletMap } from '../../../services/audit-core/uc03DmsDumps';

/**
 * How each dealership's DMS names its locations and which Verigence outlets each covers
 * (product owner 16 Nov 2026). The PCs' Booking / Delivery Intimation lists and the DMS report
 * group rows by it.
 */
export default function OutletMapCard({ tenantId, accessToken, onError }: { tenantId?: string; accessToken?: string; onError: (m: string | null) => void }) {
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
        queryClient.invalidateQueries({ queryKey: ['dms-intimations', tenantId] }),
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
