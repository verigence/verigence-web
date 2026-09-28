import { Link } from 'react-router-dom';

import type { P2JourneyListItem } from '../../../services/audit-core/uc03P2';
import { formatInr } from '../workspace/p2Format';

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

/** What the journey is waiting for, in the PC's words. */
const STEP_NOW: Record<number, string> = {
  0: 'Booking: add documents',
  1: 'Booking: verify documents',
  2: 'Booking: completing',
  3: 'Delivery: add documents',
  4: 'Delivery: verify documents',
  5: 'Delivery: completing',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A journey created before the customer was named carries an id where the
 * name should be; say so instead of showing the id. */
export function customerLabel(name: string | null | undefined): { text: string; known: boolean } {
  const trimmed = (name ?? '').trim();
  if (!trimmed || UUID.test(trimmed)) return { text: 'Customer not named yet', known: false };
  return { text: trimmed, known: true };
}

export function shortDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

/**
 * One journey, kept to what a PC scans for: who, which car, how far along,
 * what money is in, and whether anything waits on them. One action.
 */
export default function JourneyCard({ item, mode }: {
  item: P2JourneyListItem;
  supervisor?: boolean;
  mode: 'bookings' | 'journey360';
}) {
  const delivered = Boolean(item.delivery_completed_at);
  const cancelled = Boolean(item.cancelled);
  const active = cancelled ? -1 : activeStep(item.current_stage, delivered);
  const customer = customerLabel(item.customer_name);
  const overview = `/p2/journeys/${item.journey_id}/overview`;
  const documents = `/p2/journeys/${item.journey_id}/documents`;
  const paid = Number(item.booking_receipt_total || 0);
  const minimum = Number(item.booking_minimum_amount || 0);
  const pc = item.pc_open_tasks ?? 0;
  const tl = item.tl_open_tasks ?? 0;
  const overdue = item.overdue_tasks ?? 0;
  const toVerify = item.manual_verification_pending_count ?? 0;

  const now = cancelled ? 'Cancelled'
    : active >= 6 ? (item.delivery_reviewed_at ? 'Delivered · reviewed' : 'Delivered · awaiting TL review')
      : STEP_NOW[active];
  const percent = cancelled ? 0 : Math.round((Math.min(active, 6) / 6) * 100);

  const facts: string[] = [];
  if (item.booking_confirm_date) facts.push(`Booked ${shortDate(item.booking_confirm_date)}`);
  if (item.delivery_completed_at) facts.push(`Delivered ${shortDate(item.delivery_completed_at)}`);
  else if (item.planned_delivery_at) facts.push(`Delivery due ${shortDate(item.planned_delivery_at)}`);
  if (minimum > 0) facts.push(`${formatInr(paid)} of ${formatInr(minimum)} received`);
  else if (paid > 0) facts.push(`${formatInr(paid)} received`);
  if (!facts.length && item.created_at_utc) facts.push(`Started ${shortDate(item.created_at_utc)}`);

  const work: string[] = [];
  if (pc) work.push(`${pc} PC task${pc === 1 ? '' : 's'}`);
  if (tl) work.push(`${tl} TL task${tl === 1 ? '' : 's'}`);
  if (toVerify) work.push(`${toVerify} to verify`);

  const primary = mode === 'bookings' && !item.closed ? documents : overview;
  const tone = cancelled || item.closed ? ' is-closed' : overdue ? ' is-overdue' : '';

  return (
    <li className={`p2w-jcard${tone}`}>
      <div className="p2w-jcard__head">
        <Link to={primary} className={`p2w-jcard__name${customer.known ? '' : ' is-unknown'}`}>{customer.text}</Link>
        {cancelled ? <span className="p2w-chip p2w-chip--neutral">Cancelled</span>
          : delivered ? <span className="p2w-chip p2w-chip--success">Delivered</span>
            : active >= 3 ? <span className="p2w-chip p2w-chip--info">Delivery</span>
              : <span className="p2w-chip p2w-chip--progress">Booking</span>}
      </div>
      <div className={`p2w-jcard__line${item.vehicle ? '' : ' is-unknown'}`}>{item.vehicle || 'Vehicle not identified yet'}</div>
      <div className="p2w-jcard__line p2w-muted">{[item.journey_reference, item.outlet_name].filter(Boolean).join(' · ')}</div>

      <div className="p2w-jcard__progress" aria-label={`Progress: ${now}`}>
        <div className="p2w-jcard__bar"><span style={{ width: `${percent}%` }} /></div>
        <span>{now}</span>
      </div>

      {facts.length ? <div className="p2w-jcard__line">{facts.join(' · ')}</div> : null}

      <div className="p2w-jcard__foot">
        <span className={overdue ? 'p2w-tone p2w-tone--danger' : work.length ? 'p2w-jcard__work' : 'p2w-muted'}>
          {overdue ? `${overdue} overdue` : work.length ? work.join(' · ') : 'Nothing waiting'}
        </span>
        <Link className="p2w-button p2w-button--secondary" to={primary}>
          {primary === documents ? 'Documents' : 'Journey 360'}
        </Link>
      </div>
    </li>
  );
}
