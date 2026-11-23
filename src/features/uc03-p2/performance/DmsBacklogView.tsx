import { useMemo, useState } from 'react';

import SectionCard from '../../../components/SectionCard';
import { Segment } from '../my-work/MyWorkParts';
import type { DmsBacklog, DmsFigures } from '../../../services/audit-core/uc03Performance';

const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const share = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : '—');

type Kind = 'all' | 'bookings' | 'deliveries';
const KINDS: Array<{ key: Kind; label: string }> = [
  { key: 'all', label: 'Both' }, { key: 'bookings', label: 'Bookings' }, { key: 'deliveries', label: 'Deliveries' },
];

function Cells({ f, kind }: { f: DmsFigures; kind: 'booking' | 'delivery' }) {
  const dms = kind === 'booking' ? f.bookingDms : f.deliveryDms;
  const synced = kind === 'booking' ? f.bookingSynced : f.deliverySynced;
  const pending = kind === 'booking' ? f.bookingPending : f.deliveryPending;
  const withPc = kind === 'booking' ? f.bookingIntimated : f.deliveryIntimated;
  const notIntimated = kind === 'booking' ? f.bookingNotIntimated : f.deliveryNotIntimated;
  return (
    <>
      <td className={dms ? undefined : 'p2pf-zero'}>{dms}</td>
      <td className={synced ? undefined : 'p2pf-zero'}>{synced}<span className="p2w-muted p2pf-sub"> {share(synced, dms)}</span></td>
      <td className={pending ? 'p2pf-low' : 'p2pf-zero'}><strong>{pending}</strong></td>
      <td className={withPc ? 'p2mw-attn' : 'p2pf-zero'}>{withPc}</td>
      <td className={notIntimated ? 'p2pf-warn' : 'p2pf-zero'}>{notIntimated}</td>
      {kind === 'delivery' ? <td className={f.deliveryNotUploaded ? 'p2pf-low' : 'p2pf-zero'}>{f.deliveryNotUploaded}</td> : null}
    </>
  );
}

const HEADS = (kind: 'booking' | 'delivery') => (
  <>
    <th scope="col" title="In the latest DMS dump of the month">In DMS</th>
    <th scope="col" title="Found in Verigence, and the share of the DMS">In Verigence</th>
    <th scope="col" title={kind === 'booking' ? 'In the DMS, not in Verigence' : 'In the DMS, the delivery file not in Verigence'}>Pending</th>
    <th scope="col" title="Of the pending: the PC marked it as intimated to them">With PC</th>
    <th scope="col" title="Of the pending: not marked as intimated (with the dealership)">Not intimated</th>
    {kind === 'delivery' ? <th scope="col" title="Of the pending: the booking is in Verigence, the delivery file is not">Booking in, delivery not uploaded</th> : null}
  </>
);

/**
 * Each PC against the DMS, month wise (product owner 2026-11-23): what the DMS says the PC's
 * locations booked and delivered in the month, how much of it is in Verigence, and what is pending
 * -- with the PC (intimated) or not intimated. A location with several PCs shows its full count on
 * every PC tagged to it, so the rows are not added up into a total.
 */
export default function DmsBacklogView({ dms, own, onMonth }: { dms: DmsBacklog; own: boolean; onMonth: (m: string) => void }) {
  const [kind, setKind] = useState<Kind>('all');
  const rows = useMemo(() => [...dms.people].sort((a, b) =>
    (b.bookingPending + b.deliveryPending) - (a.bookingPending + a.deliveryPending) || (a.name ?? '').localeCompare(b.name ?? '')), [dms.people]);
  const showB = kind !== 'deliveries';
  const showD = kind !== 'bookings';
  const unmapped = dms.dealers.flatMap((d) => d.unmapped.map((u) => ({ ...u, dealerName: d.dealerName })));

  if (!dms.month) {
    return <SectionCard><p className="p2w-muted">No DMS dump has been uploaded yet for {own ? 'your dealership' : 'these dealerships'}.</p></SectionCard>;
  }
  return (
    <SectionCard>
      <div className="p2w-card__title p2mw-title-row">
        <div>
          <h3>{own ? 'Me against the DMS' : 'Each PC against the DMS'}, {monthLabel(dms.month)}</h3>
          <p className="p2w-muted">
            What the DMS says was booked and delivered at {own ? 'my' : 'each PC’s'} locations this month, how much of it is in Verigence, and
            what is still pending. A location with more than one PC shows the same count for every PC tagged to it.
          </p>
        </div>
        <div className="p2mw-controls">
          {dms.months.length > 1 ? (
            <label className="p2pf-pick">DMS month{' '}
              <select value={dms.month} onChange={(e) => onMonth(e.target.value)}>
                {dms.months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </label>
          ) : null}
          <Segment label="Show" value={kind} options={KINDS} onChange={setKind} />
        </div>
      </div>

      {rows.length ? (
        <div className="p2pt-scroll">
          <table className="p2w-table p2mw-table p2pf-table p2pf-table--num" aria-label="Each PC against the DMS">
            <thead>
              <tr>
                <th scope="col" rowSpan={2}>PC</th>
                {showB ? <th scope="colgroup" colSpan={5} className="p2pf-group">Bookings</th> : null}
                {showD ? <th scope="colgroup" colSpan={6} className="p2pf-group">Deliveries</th> : null}
              </tr>
              <tr>{showB ? HEADS('booking') : null}{showD ? HEADS('delivery') : null}</tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.actorId}>
                  <th scope="row">{p.name || 'Name not recorded'}{p.locations.length ? <div className="p2w-muted p2pf-sub">{p.locations.join(', ')}</div> : null}</th>
                  {showB ? <Cells f={p} kind="booking" /> : null}
                  {showD ? <Cells f={p} kind="delivery" /> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="p2w-muted">No PC is mapped to a DMS location in this view.</p>}

      <p className="p2w-muted p2pf-planned">
        DMS dumps used: {dms.dealers.map((d) => `${d.dealerName ?? 'Dealership'} — bookings ${d.bookingDumpDate ? `to ${shortDate(d.bookingDumpDate)}` : 'none'}, deliveries ${d.deliveryDumpDate ? `to ${shortDate(d.deliveryDumpDate)}` : 'none'}`).join('; ')}.
      </p>
      {!own && dms.notMapped.length ? (
        <p className="p2w-muted">No DMS figures (no outlet mapped): {dms.notMapped.map((p) => p.name || p.actorId).join(', ')}.</p>
      ) : null}
      {!own && unmapped.length ? (
        <p className="p2w-muted">
          Rows naming no DMS location (on no PC): {unmapped.map((u) => `${u.dealerName ?? ''} ${u.label}: ${u.bookingDms} bookings, ${u.deliveryDms} deliveries`).join('; ')}.
          Map the location in the DMS outlet map to put them on a PC.
        </p>
      ) : null}
    </SectionCard>
  );
}
