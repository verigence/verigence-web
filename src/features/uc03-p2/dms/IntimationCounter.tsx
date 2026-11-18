import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import type { DmsDumpKind } from '../../../services/audit-core/uc03DmsDumps';
import { getIntimationCounter } from '../../../services/audit-core/uc03DmsIntimations';

function when(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .format(new Date(value));
}

/**
 * Which PC has marked how many (product owner 18 Nov 2026: "a counter or table which should tell
 * which PC has intimated how many bookings ... on demand so as Reviewer/TL who is going to
 * generate the report knows which all PC have updated and how much number").
 */
export default function IntimationCounter({ tenantId, accessToken, kind }: { tenantId?: string; accessToken?: string; kind: DmsDumpKind }) {
  const [asked, setAsked] = useState(false);
  const word = kind === 'BOOKING' ? 'booking' : 'delivery';
  const counter = useQuery({
    queryKey: ['dms-intimation-counter', tenantId, kind],
    queryFn: () => getIntimationCounter(tenantId!, kind, accessToken),
    enabled: asked && Boolean(tenantId && accessToken),
  });
  return (
    <SectionCard>
      <div className="p2w-card__title">
        <h3>PC {word} intimations</h3>
        <p className="p2w-muted">Rows of each dealership's latest {word} dump: in Verigence (no mark needed), marked intimated by a PC, and not marked by anyone.</p>
      </div>
      <div className="p2du-toolbar">
        <button type="button" className="p2w-button p2w-button--secondary" disabled={!tenantId || counter.isFetching}
          onClick={() => { if (asked) void counter.refetch(); else setAsked(true); }}>
          {counter.isFetching ? 'Counting…' : asked ? 'Count again' : 'Show PC intimations'}
        </button>
      </div>
      {counter.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{counter.error instanceof Error ? counter.error.message : 'Not available.'}</div> : null}
      {counter.data?.dealers.map((d) => (
        <div key={d.dealerId} className="dmsi-counter">
          <h4>{d.dealerName} <small className="p2w-muted">{d.dumpDate ? `dump of ${d.dumpDate}${d.previousDumpDate ? ` · new since ${d.previousDumpDate}: ${d.totals.newRows}` : ''}` : 'no dump yet'}</small></h4>
          {d.dumpDate ? (
            <>
              <div className="p2du-tiles">
                <div className="p2du-tile"><span>Rows</span><strong>{d.totals.rows}</strong></div>
                <div className="p2du-tile"><span>In Verigence</span><strong>{d.totals.inVerigence}</strong></div>
                <div className="p2du-tile p2du-tile--warn"><span>Marked intimated</span><strong>{d.totals.intimated}</strong></div>
                <div className="p2du-tile p2du-tile--bad"><span>Not marked</span><strong>{d.totals.open}</strong>
                  <small>{d.openByLocation.map((l) => `${l.location} ${l.open}`).join(' · ')}</small></div>
              </div>
              <div className="p2du-scroll">
                <table className="p2du-table">
                  <thead><tr><th>PC</th><th>Outlets</th><th className="num">Marked</th><th className="num">Since last dump</th><th>Last marked</th></tr></thead>
                  <tbody>
                    {d.pcs.map((pc) => (
                      <tr key={pc.actorId} className={pc.marked ? '' : 'is-superseded'}>
                        <td>{pc.name}</td>
                        <td>{pc.outlets.join(', ') || '—'}</td>
                        <td className="num">{pc.marked}</td>
                        <td className="num">{pc.markedNew}</td>
                        <td>{when(pc.lastAtUtc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      ))}
    </SectionCard>
  );
}
