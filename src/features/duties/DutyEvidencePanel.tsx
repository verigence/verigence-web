import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  getDutyEvidence, type DutiesMode, type EvidenceDuty, type EvidencePc, type EvidencePhotos,
} from '../../services/audit-core/duties';
import { addDays, dayLabel, istToday } from './dutiesFormat';

const rupees = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/**
 * A gate register or cash register over the range. One outlet: days done of days due. Several
 * outlets: registers done of registers due, with the outlets and days it is made of.
 */
function DutyTotal({ duty, outlets, money }: {
  duty: EvidenceDuty & { amount?: number; transactions?: number }; outlets: number; money?: boolean;
}) {
  const noCounts = duty.noCounts ?? 0;
  const due = duty.done + duty.late + noCounts + duty.notDone + duty.notReceived;
  if (due === 0) return <span className="dty-muted">{duty.pending ? 'Not due yet' : '—'}</span>;
  const entered = duty.done + duty.late;
  const tone = entered === 0 ? 'bad' : entered < due - duty.notReceived ? 'warn' : 'ok';
  const unit = outlets > 1 ? 'registers' : 'days';
  return (
    <span className="dty-ev__stack">
      <span className={`dty-tag dty-tag--${tone}`}>{entered} of {due} {unit}</span>
      {outlets > 1 && duty.days ? <small>{outlets} outlets × {duty.days} days</small> : null}
      {money && entered ? <small>₹{rupees.format(duty.amount ?? 0)} · {duty.transactions ?? 0} txns</small> : null}
      {duty.late ? <small>{duty.late} uploaded late</small> : null}
      {noCounts ? <small>{noCounts} {noCounts === 1 ? 'register' : 'registers'} without counts</small> : null}
      {duty.notReceived ? <small>{duty.notReceived} not received</small> : null}
    </span>
  );
}

/** One day's gate register or cash register at the PC's outlets. */
function DutyDay({ duty, money }: { duty: EvidenceDuty; money?: boolean }) {
  const outlets = duty.outlets ?? [];
  if (!outlets.length) return <span className="dty-muted">—</span>;
  return (
    <span className="dty-ev__stack">
      {outlets.map((o, i) => {
        const [label, tone] = {
          DONE: ['Done', 'ok'], LATE: ['Done late', 'info'], NO_COUNTS: ['Counts not entered', 'warn'],
          NOT_RECEIVED: ['Not received', 'warn'], PENDING: ['Not due yet', ''], NOT_DONE: ['Not done', 'bad'],
        }[o.state];
        return (
          <span key={`${o.outletName}-${i}`}>
            <span className={`dty-tag${tone ? ` dty-tag--${tone}` : ''}`}>{label}</span>
            {outlets.length > 1 ? <small> {o.outletName}</small> : null}
            {money && (o.state === 'DONE' || o.state === 'LATE') && o.amount !== null
              ? <small> ₹{rupees.format(o.amount)} · {o.transactions ?? 0} txns</small> : null}
          </span>
        );
      })}
    </span>
  );
}

function Count({ n }: { n: number }) {
  return n ? <strong>{n}</strong> : <span className="dty-muted">0</span>;
}

function Photos({ photos }: { photos: EvidencePhotos }) {
  return (
    <>
      <td data-label="Drive photo folder" className="dty-ev__num"><Count n={photos.drive} /></td>
      <td data-label="Added in Verigence" className="dty-ev__num"><Count n={photos.camera} /></td>
      <td data-label="Unread pages kept" className="dty-ev__num"><Count n={photos.unread} /></td>
    </>
  );
}

function PcRows({ pc, open, onToggle }: { pc: EvidencePc; open: boolean; onToggle: () => void }) {
  return (
    <Fragment>
      <tr className={open ? 'is-open' : undefined}>
        <td>
          <button type="button" className="dty-ev__toggle" aria-expanded={open} onClick={onToggle}>
            <span aria-hidden="true">{open ? '▾' : '▸'}</span> {pc.name}
          </button>
          <small className="dty-ev__outlets">{pc.outlets.join(', ')}</small>
        </td>
        <td data-label="Gate register"><DutyTotal duty={pc.summary.gate} outlets={pc.outlets.length} /></td>
        <td data-label="Cash register"><DutyTotal duty={pc.summary.cash} outlets={pc.outlets.length} money /></td>
        <td data-label="Bank statements" className="dty-ev__num"><Count n={pc.summary.statements} /></td>
        <Photos photos={pc.summary.photos} />
      </tr>
      {open ? [...pc.days].reverse().map((d) => (
        <tr key={d.date} className="dty-ev__day">
          <td>{dayLabel(d.date)}</td>
          <td data-label="Gate register"><DutyDay duty={d.gate} /></td>
          <td data-label="Cash register"><DutyDay duty={d.cash} money /></td>
          <td data-label="Bank statements" className="dty-ev__num"><Count n={d.statements} /></td>
          <Photos photos={d.photos} />
        </tr>
      )) : null}
    </Fragment>
  );
}

/**
 * What each PC actually did on their daily duties (product owner 2026-11-24: "show me if any PC
 * updates cash registers, bank statement, and or uploaded pics in the non extracted folder"):
 * one row a PC over the range, a click for their days.
 */
export default function DutyEvidencePanel({ mode, tenantId, accessToken, initialOpen = null }: {
  mode: DutiesMode; tenantId: string; accessToken?: string; initialOpen?: string | null;
}) {
  const today = istToday();
  const [range, setRange] = useState({ from: addDays(today, -6), to: today });
  const [open, setOpen] = useState<string | null>(initialOpen);
  const query = useQuery({
    queryKey: ['duties', 'evidence', mode, tenantId, range.from, range.to],
    queryFn: () => getDutyEvidence(mode, tenantId, range, accessToken),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 60_000,
  });
  const pick = (from: string, to: string) => setRange({ from: from > to ? to : from, to });
  const data = query.data;

  return (
    <div className="dty-stack">
      <div className="dty-toolbar">
        <label>From <input type="date" value={range.from} max={range.to}
          onChange={(e) => e.target.value && pick(e.target.value < addDays(range.to, -30) ? addDays(range.to, -30) : e.target.value, range.to)} /></label>
        <label>To <input type="date" value={range.to} max={today}
          onChange={(e) => e.target.value && pick(range.from < addDays(e.target.value, -30) ? addDays(e.target.value, -30) : range.from, e.target.value)} /></label>
        <button type="button" className="uc01-admin-button" onClick={() => pick(addDays(today, -1), addDays(today, -1))}>Yesterday</button>
        <button type="button" className="uc01-admin-button" onClick={() => pick(addDays(today, -6), today)}>Last 7 days</button>
        <button type="button" className="uc01-admin-button" onClick={() => pick(addDays(today, -29), today)}>Last 30 days</button>
      </div>
      <p className="dty-hint">
        Gate register: the registers uploaded, by the day each register is for, every day including Sunday; a day&apos;s
        register is due the next day, later is late. Cash register: the ledger entered for each day, counted from the day
        the cash duty started. A PC with several outlets is counted per outlet. Bank statements and photos: what the PC
        uploaded; photos come from the &quot;photo&quot; folder in a customer&apos;s Drive folder, were added in Verigence
        (camera or gallery), or are pages the system could not read and kept as photos.
      </p>

      {query.isLoading ? <div className="uc01-admin-state">Loading…</div> : null}
      {query.isError ? (
        <div className="uc01-admin-message uc01-admin-message--error" role="alert">
          Could not be loaded. {query.error instanceof Error ? query.error.message : ''}
        </div>
      ) : null}
      {data && data.pcs.length === 0 ? <div className="uc01-admin-state">No PCs mapped to the outlets.</div> : null}

      {data && data.pcs.length > 0 ? (
        <div className="dty-table-wrap">
          <table className="dty-table dty-ev">
            <thead>
              <tr>
                <th scope="col" rowSpan={2}>PC</th>
                <th scope="col" rowSpan={2} className="dty-ev__duty">Gate register</th>
                <th scope="col" rowSpan={2} className="dty-ev__duty">
                  Cash register
                  {data.cashFrom && data.cashFrom > data.from
                    ? <small className="dty-ev__since">Counted from {dayLabel(data.cashFrom)}</small> : null}
                </th>
                <th scope="col" rowSpan={2} className="dty-ev__num">Bank statements</th>
                <th scope="colgroup" colSpan={3} className="dty-ev__group">Photos</th>
              </tr>
              <tr>
                <th scope="col" className="dty-ev__num">Drive photo folder</th>
                <th scope="col" className="dty-ev__num">Added in Verigence</th>
                <th scope="col" className="dty-ev__num">Unread pages kept</th>
              </tr>
            </thead>
            <tbody>
              {data.pcs.map((pc) => (
                <PcRows key={pc.actorId} pc={pc} open={open === pc.actorId}
                  onToggle={() => setOpen(open === pc.actorId ? null : pc.actorId)} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
