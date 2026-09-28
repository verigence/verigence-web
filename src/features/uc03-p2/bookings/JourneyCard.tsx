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

export default function JourneyCard({ item, supervisor, mode }: {
  item: P2JourneyListItem;
  supervisor: boolean;
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

  const stepLabel = cancelled
    ? 'Cancelled'
    : active >= 6
      ? (item.delivery_reviewed_at ? 'Delivered · TL reviewed' : 'Delivered · awaiting TL review')
      : JOURNEY_STEPS[active];

  const facts: Array<{ label: string; value: string; progress?: [number, number] }> = [];
  if (item.booking_confirm_date) facts.push({ label: 'Booking confirmed', value: shortDate(item.booking_confirm_date) ?? item.booking_confirm_date });
  if (item.delivery_completed_at) facts.push({ label: 'Delivered', value: shortDate(item.delivery_completed_at) ?? '' });
  else if (item.planned_delivery_at) facts.push({ label: 'Delivery due', value: shortDate(item.planned_delivery_at) ?? '' });
  if (minimum > 0) facts.push({ label: 'Booking amount', value: `${formatInr(paid)} of ${formatInr(minimum)}`, progress: [paid, minimum] });
  else if (paid > 0) facts.push({ label: 'Booking amount', value: formatInr(paid) });
  if (facts.length < 2 && item.created_at_utc) facts.push({ label: 'Started', value: shortDate(item.created_at_utc) ?? '' });

  const tone = cancelled || item.closed ? ' is-closed' : overdue ? ' is-overdue' : pc || tl ? ' is-attention' : '';

  return (
    <li className={`p2w-jcard${tone}${cancelled ? ' is-cancelled' : ''}`}>
      <div className="p2w-jcard__head">
        <div className="p2w-jcard__who">
          <Link to={overview} className={customer.known ? undefined : 'is-unknown'} aria-label={`Open Journey 360 for ${customer.text}`}>
            {customer.text}
          </Link>
          <span className={item.vehicle ? undefined : 'is-unknown'}>{item.vehicle || 'Vehicle not identified yet'}</span>
          <div className="p2w-jcard__meta">
            {item.journey_reference ? <span>{item.journey_reference}</span> : null}
            {item.outlet_name ? <span>{item.outlet_name}</span> : null}
            {item.mobile_last4 ? <span>Mobile ····{item.mobile_last4}</span> : null}
          </div>
        </div>
        {cancelled ? <span className="p2w-chip p2w-chip--neutral">Cancelled</span>
          : delivered ? <span className={`p2w-chip p2w-chip--${item.delivery_reviewed_at ? 'success' : 'warning'}`}>{item.delivery_reviewed_at ? 'TL reviewed' : 'Awaiting TL review'}</span>
            : active >= 3 ? <span className="p2w-chip p2w-chip--info">Delivery</span>
              : <span className="p2w-chip p2w-chip--progress">Booking</span>}
      </div>

      <div>
        <ol className="p2w-jcard__steps" aria-label="Journey progress">
          {JOURNEY_STEPS.map((step, index) => (
            <li key={step} className={index < active ? 'is-done' : index === active ? 'is-active' : ''}
              aria-current={index === active ? 'step' : undefined} title={step} />
          ))}
        </ol>
        <div className="p2w-jcard__step">
          <strong>{stepLabel}</strong>
          {!cancelled ? <span>Step {Math.min(active + 1, 6)} of 6</span> : null}
        </div>
      </div>

      {facts.length ? (
        <dl className="p2w-jcard__facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>
                {fact.value}
                {fact.progress ? <progress max={Math.max(1, fact.progress[1])} value={Math.min(fact.progress[0], fact.progress[1])} /> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="p2w-jcard__foot">
        <div className="p2w-jcard__tasks" aria-label="Open work">
          {pc ? <span className="p2w-chip p2w-chip--warning">PC {pc}</span> : null}
          {tl ? <span className="p2w-chip p2w-chip--warning">TL {tl}</span> : null}
          {overdue ? <span className="p2w-chip p2w-chip--danger">{overdue} overdue</span> : null}
          {toVerify ? <span className="p2w-chip p2w-chip--info">{toVerify} to verify</span> : null}
          {!pc && !tl && !overdue && !toVerify ? <span>No open tasks</span> : null}
          {item.documents ? <span>· {item.documents} document{item.documents === 1 ? '' : 's'}</span> : null}
        </div>
        <div className="p2w-jcard__actions">
          {mode === 'bookings' ? (
            <>
              {!item.closed ? <Link className="p2w-button p2w-button--primary" to={documents}>Documents</Link> : null}
              <Link className="p2w-button p2w-button--secondary" to={overview}>Journey 360</Link>
            </>
          ) : (
            <>
              <Link className="p2w-button p2w-button--primary" to={overview}>Journey 360</Link>
              {!item.closed ? <Link className="p2w-button p2w-button--secondary" to={documents}>Documents</Link> : null}
            </>
          )}
          {supervisor ? <Link className="p2w-button p2w-button--ghost" to={`/p2/journeys/${item.journey_id}/compliance-report`}>Report</Link> : null}
        </div>
      </div>
    </li>
  );
}
