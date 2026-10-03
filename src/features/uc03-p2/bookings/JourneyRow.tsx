import { Link } from 'react-router-dom';

import type { P2JourneyListItem } from '../../../services/audit-core/uc03P2';
import { signedMoney, varianceTone } from '../journey360/j360Format';

/** The six steps of a Journey, Booking then Delivery. */
export const JOURNEY_STEPS = [
  'Booking documents',
  'Booking verified',
  'Booking complete',
  'Delivery documents',
  'Delivery verified',
  'Delivered',
] as const;

/** Index of the step in progress (6 = every step done). */
export function activeStep(stage: string, delivered?: boolean): number {
  if (delivered) return 6;
  switch (stage) {
    case 'BOOKING_DOCUMENT_UPLOAD': return 0;
    case 'BOOKING_VERIFY_DOCUMENTS': return 1;
    case 'BOOKING_COMPLETE': return 3;
    case 'DELIVERY_DOCUMENT_UPLOAD': return 3;
    case 'DELIVERY_VERIFY_DOCUMENTS': return 4;
    case 'DELIVERY_COMPLETE': return 6;
    default: return 0;
  }
}

const STEP_NOW: Record<number, string> = {
  0: 'Add the booking documents',
  1: 'Verify the booking documents',
  2: 'Booking is completing',
  3: 'Add the delivery documents',
  4: 'Verify the delivery documents',
  5: 'Delivery is completing',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A journey created before the customer was named carries an id where the
 * name should be; say so instead of showing the id. */
export function customerLabel(name: string | null | undefined): { text: string; known: boolean } {
  const trimmed = (name ?? '').trim();
  if (!trimmed || UUID.test(trimmed)) return { text: 'Customer not named yet', known: false };
  return { text: trimmed, known: true };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "27 Sep 2026": the full date, as the list shows every date. */
export function fullDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export type Priority = 'overdue' | 'action' | 'waiting' | 'ok' | 'closed';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What a Phase 2 journey holds and lacks, from the stage engine's gate records:
 * customer KYC read or missing, required documents in against required, and the
 * vehicle proof. Each is null until the gate has been evaluated (never a guess). */
export function holds(item: P2JourneyListItem): {
  kyc: 'in' | 'missing' | null;
  documents: { received: number; required: number } | null;
  vehicleProof: 'in' | 'missing' | null;
} {
  return {
    kyc: item.kyc_status ? (item.kyc_status === 'PASS' ? 'in' : 'missing') : null,
    documents: item.docs_required == null ? null : { received: item.docs_received ?? 0, required: item.docs_required },
    vehicleProof: item.vehicle_proof_status ? (item.vehicle_proof_status === 'PASS' ? 'in' : 'missing') : null,
  };
}

/** The most important thing a Phase 2 journey still lacks, or null when nothing is missing. */
export function lacks(item: P2JourneyListItem): { title: string; detail: string } | null {
  const h = holds(item);
  if (h.kyc === 'missing') return { title: 'KYC missing', detail: "Upload the customer's PAN card or Aadhaar" };
  if (h.documents && h.documents.received < h.documents.required) {
    const missing = h.documents.required - h.documents.received;
    return { title: `${plural(missing, 'required document')} missing`, detail: `${h.documents.received} of ${h.documents.required} in` };
  }
  return null;
}

/**
 * What this journey needs next and from whom, ranked so the list can put
 * the most urgent first. `role` is the signed-in user's operating role.
 */
export function nextAction(item: P2JourneyListItem, role?: string): { priority: Priority; title: string; detail?: string } {
  const delivered = Boolean(item.delivery_completed_at);
  const active = activeStep(item.current_stage, delivered);
  const pc = item.pc_open_tasks ?? 0;
  const tl = item.tl_open_tasks ?? 0;
  const overdue = item.overdue_tasks ?? 0;
  const toVerify = item.manual_verification_pending_count ?? 0;
  const mine = role === 'TL' ? tl : role === 'PC' ? pc : pc + tl;
  const others = role === 'TL' ? pc : role === 'PC' ? tl : 0;
  const othersRole = role === 'TL' ? 'PC' : 'TL';

  if (item.cancelled) return { priority: 'closed', title: 'Cancelled' };
  if (delivered || item.closed) {
    return { priority: 'closed', title: 'Delivered', detail: item.delivery_reviewed_at ? 'Reviewed by TL' : 'Awaiting TL review' };
  }
  // A page that could not be processed is work to do (its task says which
  // page to upload again), not an overdue task; overdue means a missed SLA.
  if (item.failed_pages) {
    return { priority: 'action', title: `Upload ${plural(item.failed_pages, 'page')} again`, detail: 'See the task for which page' };
  }
  if (item.retrying_pages) {
    return { priority: 'waiting', title: 'Documents being retried', detail: `${plural(item.retrying_pages, 'page')} retrying automatically, check back in 60 minutes` };
  }
  if (overdue) {
    return { priority: 'overdue', title: `Clear ${plural(overdue, 'overdue task')}`, detail: mine ? `${plural(mine, 'task')} for you` : `With ${othersRole}` };
  }
  if (mine) {
    return { priority: 'action', title: `${plural(mine, 'task')} waiting for you`, detail: toVerify ? `${plural(toVerify, 'document')} to verify` : undefined };
  }
  if (toVerify && role !== 'PC') {
    return { priority: 'action', title: `Verify ${plural(toVerify, 'document')}` };
  }
  if (others) {
    return { priority: 'waiting', title: `${plural(others, 'task')} with ${othersRole}`, detail: item.phase2 ? lacks(item)?.title : STEP_NOW[active] };
  }
  if (toVerify) {
    return { priority: 'waiting', title: `${plural(toVerify, 'document')} being verified`, detail: 'Nothing for you right now' };
  }
  if (item.phase2) {
    // No stage: what the journey lacks, or nothing.
    const missing = lacks(item);
    if (missing) return { priority: 'action', title: missing.title, detail: missing.detail };
    return {
      priority: 'ok', title: 'Nothing for you right now',
      detail: item.documents ? `${plural(item.documents, 'document')} in so far` : undefined,
    };
  }
  const upload = active === 0 || active === 3;
  return {
    priority: upload ? 'action' : 'ok',
    title: STEP_NOW[active],
    detail: upload ? (item.documents ? `${plural(item.documents, 'document')} in so far` : 'Nothing uploaded yet') : 'Nothing for you right now',
  };
}

/** What the journey holds and lacks, in place of a step bar. */
function HoldsCell({ item }: { item: P2JourneyListItem }) {
  const h = holds(item);
  if (!h.kyc && !h.documents && !h.vehicleProof) return <span className="p2w-muted">Not checked yet</span>;
  return (
    <div className="p2w-holds">
      {h.kyc ? <span className={`p2w-chip ${h.kyc === 'in' ? 'p2w-chip--success' : 'p2w-chip--warning'}`}>{h.kyc === 'in' ? 'KYC in' : 'KYC missing'}</span> : null}
      {h.documents ? <span className="p2w-muted">{h.documents.received} of {h.documents.required} required documents</span> : null}
      {h.vehicleProof ? <span className="p2w-muted">Vehicle proof {h.vehicleProof === 'in' ? 'in' : 'missing'}</span> : null}
    </div>
  );
}

/** Six small steps, Booking then Delivery: green done, outlined in hand,
 * grey to come, plus "n of 6 done" for anyone who prefers words. */
function Steps({ active, cancelled }: { active: number; cancelled: boolean }) {
  const done = cancelled ? 0 : Math.min(active, 6);
  return (
    <div className="p2w-jsteps" role="img" aria-label={cancelled ? 'Cancelled' : `${done} of 6 steps done`}>
      <ol>
        {JOURNEY_STEPS.map((step, index) => {
          const state = cancelled ? 'todo' : index < active ? 'done' : index === active ? 'active' : 'todo';
          return <li key={step} className={`is-${state}${index === 3 ? ' is-delivery' : ''}`} title={step} />;
        })}
      </ol>
    </div>
  );
}

/**
 * One journey per row: who and which car, the price against standard, how
 * far along (a PC) or which PC and outlet (a TL or PM), what it needs next,
 * the booking confirmation (minimum amount received) and gate pass dates,
 * when the journey opened and closed for
 * the reader's role, for a TL or PM the dealer and outlet, and an Actions
 * menu (Complete journey, Journey 360, the tasks for your role).
 *
 * The PC's journey opens with the first upload and closes when the rule
 * engine completes the delivery. The TL's journey starts there and closes
 * with the TL's delivery review (its own closing rules are still to come).
 */
export default function JourneyRow({ item, role }: { item: P2JourneyListItem; role?: string }) {
  const delivered = Boolean(item.delivery_completed_at);
  const cancelled = Boolean(item.cancelled);
  const active = cancelled ? -1 : activeStep(item.current_stage, delivered);
  const customer = customerLabel(item.customer_name);
  const next = nextAction(item, role);  // its priority colours the row
  const overview = `/p2/journeys/${item.journey_id}/overview`;
  const documents = `/p2/journeys/${item.journey_id}/documents`;
  const tasks = `/p2/journeys/${item.journey_id}/tasks`;
  const myTasks = role === 'TL' ? (item.tl_open_tasks ?? 0) : role === 'PC' ? (item.pc_open_tasks ?? 0) : (item.open_tasks ?? 0);
  const stageChip = cancelled ? <span className="p2w-chip p2w-chip--neutral">Cancelled</span>
    : delivered ? <span className="p2w-chip p2w-chip--success">Delivered</span>
      : active >= 3 ? <span className="p2w-chip p2w-chip--info">Delivery</span>
        : <span className="p2w-chip p2w-chip--progress">Booking</span>;

  return (
    <tr className={`p2w-jrow is-${next.priority}`}>
      <td className="p2w-jrow__who" data-label="Customer">
        <Link to={item.closed ? overview : documents} className={`p2w-jrow__name${customer.known ? '' : ' is-unknown'}`}>{customer.text}</Link>
        <span className={item.vehicle ? '' : 'is-unknown'}>{item.vehicle || 'Vehicle not identified yet'}</span>
      </td>
      <td className="p2w-jrow__price" data-label="Price variance">
        {item.price_variance === null || item.price_variance === undefined ? (
          <span className="p2w-muted">Not priced yet</span>
        ) : (
          <>
            <strong className={varianceTone(item.price_variance)}>{signedMoney(item.price_variance)}</strong>
            <span className="p2w-muted">{Number(item.price_variance) === 0 ? 'At standard' : Number(item.price_variance) < 0 ? 'Below standard' : 'Above standard'}</span>
          </>
        )}
      </td>
      {role === 'PC' ? (
        <td className="p2w-jrow__stage" data-label="Status">
          {item.phase2 && !item.closed ? <HoldsCell item={item} /> : (
            <>
              {item.phase2 ? <span className={`p2w-chip ${cancelled ? 'p2w-chip--neutral' : 'p2w-chip--success'}`}>{cancelled ? 'Cancelled' : 'Delivered'}</span> : stageChip}
              {item.phase2 ? null : <Steps active={active} cancelled={cancelled} />}
            </>
          )}
        </td>
      ) : (
        <td className="p2w-jrow__stage" data-label="PC and outlet">
          <span className={item.pc_name ? '' : 'is-unknown'}>{item.pc_name || 'PC not recorded'}</span>
          <span className="p2w-muted">{item.outlet_code ? `Outlet ${item.outlet_code}` : 'Outlet ID not recorded'}</span>
        </td>
      )}
      <td className="p2w-jrow__next" data-label="Open tasks">
        {item.closed ? (
          <strong>{cancelled ? 'Cancelled' : 'Delivered'}</strong>
        ) : (
          <Link to={tasks} className="p2w-jrow__count" aria-label={`${myTasks} open ${role === 'TL' || role === 'PM' ? role : 'PC'} task${myTasks === 1 ? '' : 's'}`}>
            <strong>{myTasks}</strong>
          </Link>
        )}
        {!item.closed && role !== 'PC' ? <span className="p2w-muted">PC {item.pc_open_tasks ?? 0}</span> : null}
        {!item.closed && item.overdue_tasks ? <span className="p2w-jrow__overdue">{item.overdue_tasks} overdue</span> : null}
      </td>
      <td className="p2w-jrow__when" data-label="Deal period">
        <span>{item.booking_confirm_date ? `Booking ${fullDate(item.booking_confirm_date)}` : 'Not booked yet'}</span>
        <span className="p2w-muted">{item.delivered_at ? `Delivery ${fullDate(item.delivered_at)}` : 'No gate pass yet'}</span>
      </td>
      <td className="p2w-jrow__journey" data-label="Audit timeline">
        {role === 'PC' ? (
          <>
            <span>{item.opened_at ? `Open ${fullDate(item.opened_at)}` : 'Not opened yet'}</span>
            <span className="p2w-muted">{item.delivery_completed_at ? `Close ${fullDate(item.delivery_completed_at)}` : cancelled ? 'Cancelled' : 'Not closed yet'}</span>
          </>
        ) : (
          <>
            <span>{item.delivery_completed_at ? `Open ${fullDate(item.delivery_completed_at)}` : cancelled ? 'Cancelled' : 'Not open yet, with PC'}</span>
            <span className="p2w-muted">{item.delivery_reviewed_at ? `Close ${fullDate(item.delivery_reviewed_at)}` : 'Not closed yet'}</span>
          </>
        )}
      </td>
      {role !== 'PC' ? (
        <td className="p2w-jrow__where" data-label="Where">
          <span>{item.dealer_name}</span>
          <span className="p2w-muted">{item.outlet_name}</span>
        </td>
      ) : null}
      <td className="p2w-jrow__act">
        <details className="p2w-menu">
          <summary className="p2w-button p2w-button--secondary" aria-label={`Actions for ${customer.text}`}>Actions</summary>
          <div className="p2w-menu__list" role="menu">
            {!item.closed ? <Link role="menuitem" to={documents}>Upload / edit documents</Link> : null}
            <Link role="menuitem" to={overview}>View Journey 360</Link>
            <Link role="menuitem" to={`/p2/journeys/${item.journey_id}/compliance-report`}>View compliance report</Link>
            {!item.closed ? (
              <Link role="menuitem" to={tasks}>View {role ? `${role} tasks` : 'tasks'}{myTasks ? <b>{myTasks}</b> : null}</Link>
            ) : null}
          </div>
        </details>
      </td>
    </tr>
  );
}
