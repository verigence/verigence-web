import { Link } from 'react-router-dom';

import type { P2JourneyListItem } from '../../../services/audit-core/uc03P2';

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

const PHASES = [
  { name: 'Booking', offset: 0, steps: ['Docs', 'Check', 'Done'] },
  { name: 'Delivery', offset: 3, steps: ['Docs', 'Check', 'Done'] },
] as const;

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
    : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(date);
}

export type Priority = 'overdue' | 'action' | 'waiting' | 'ok' | 'closed';

export const PRIORITY_LABEL: Record<Priority, string> = {
  overdue: 'Overdue',
  action: 'To do',
  waiting: 'Waiting on others',
  ok: 'On track',
  closed: 'Closed',
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

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
    return { priority: 'waiting', title: `${plural(others, 'task')} with ${othersRole}`, detail: STEP_NOW[active] };
  }
  if (toVerify) {
    return { priority: 'waiting', title: `${plural(toVerify, 'document')} being verified`, detail: 'Nothing for you right now' };
  }
  const upload = active === 0 || active === 3;
  return {
    priority: upload ? 'action' : 'ok',
    title: STEP_NOW[active],
    detail: upload ? (item.documents ? `${plural(item.documents, 'document')} in so far` : 'Nothing uploaded yet') : 'Nothing for you right now',
  };
}

/** Booking and Delivery as two rows of three labelled steps (Docs, Check,
 * Done): ticked when done, highlighted when in hand, grey when to come. */
function StageTrack({ active, cancelled }: { active: number; cancelled: boolean }) {
  return (
    <div className="p2w-jstage" role="img" aria-label={cancelled ? 'Cancelled' : `Step ${Math.min(active, 6)} of 6: ${JOURNEY_STEPS[Math.min(active, 5)]}`}>
      {PHASES.map((phase) => {
        const state = cancelled ? 'todo' : active >= phase.offset + 3 ? 'done' : active >= phase.offset ? 'active' : 'todo';
        return (
          <div key={phase.name} className={`p2w-jstage__phase is-${state}`}>
            <span className="p2w-jstage__name">{phase.name}</span>
            <ol className="p2w-jstage__pips">
              {phase.steps.map((step, i) => {
                const index = phase.offset + i;
                const pip = cancelled ? 'todo' : index < active ? 'done' : index === active ? 'active' : 'todo';
                return <li key={step} className={`is-${pip}`} title={`${phase.name}: ${JOURNEY_STEPS[index]}${pip === 'done' ? ' (done)' : pip === 'active' ? ' (in hand)' : ''}`}>{step}</li>;
              })}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

/**
 * One journey, led by what it needs next. Three ways in: Complete journey
 * (the documents workspace), Journey 360, and the tasks for your role.
 */
export default function JourneyCard({ item, role }: { item: P2JourneyListItem; role?: string }) {
  const delivered = Boolean(item.delivery_completed_at);
  const cancelled = Boolean(item.cancelled);
  const active = cancelled ? -1 : activeStep(item.current_stage, delivered);
  const customer = customerLabel(item.customer_name);
  const next = nextAction(item, role);
  const overview = `/p2/journeys/${item.journey_id}/overview`;
  const documents = `/p2/journeys/${item.journey_id}/documents`;
  const tasks = `/p2/journeys/${item.journey_id}/tasks`;
  const myTasks = role === 'TL' ? (item.tl_open_tasks ?? 0) : role === 'PC' ? (item.pc_open_tasks ?? 0) : (item.open_tasks ?? 0);

  const when: string[] = [];
  if (item.booking_confirm_date) when.push(`Booked ${shortDate(item.booking_confirm_date)}`);
  if (item.delivery_completed_at) when.push(`Delivered ${shortDate(item.delivery_completed_at)}`);
  else if (item.planned_delivery_at) when.push(`Delivery ${shortDate(item.planned_delivery_at)}`);

  return (
    <li className={`p2w-jcard is-${next.priority}`}>
      <div className="p2w-jcard__head">
        <Link to={item.closed ? overview : documents} className={`p2w-jcard__name${customer.known ? '' : ' is-unknown'}`}>{customer.text}</Link>
        {cancelled ? <span className="p2w-chip p2w-chip--neutral">Cancelled</span>
          : delivered ? <span className="p2w-chip p2w-chip--success">Delivered</span>
            : active >= 3 ? <span className="p2w-chip p2w-chip--info">Delivery</span>
              : <span className="p2w-chip p2w-chip--progress">Booking</span>}
      </div>
      <div className={`p2w-jcard__line${item.vehicle ? '' : ' is-unknown'}`}>{item.vehicle || 'Vehicle not identified yet'}</div>
      <div className="p2w-jcard__line p2w-muted">{[item.journey_reference, item.outlet_name, ...when].filter(Boolean).join(' · ')}</div>

      <div className="p2w-jcard__next">
        <span className="p2w-jcard__flag">{PRIORITY_LABEL[next.priority]}</span>
        <strong>{next.title}</strong>
        {next.detail ? <span className="p2w-jcard__detail">{next.detail}</span> : null}
      </div>

      <StageTrack active={active} cancelled={cancelled} />

      <div className="p2w-jcard__foot">
        {!item.closed ? <Link className="p2w-button p2w-button--primary" to={documents}>Complete journey</Link> : null}
        <Link className="p2w-button p2w-button--secondary" to={overview}>Journey 360</Link>
        {!item.closed ? (
          <Link className="p2w-button p2w-button--secondary" to={tasks}>
            {role ? `${role} tasks` : 'Tasks'}{myTasks ? <b className="p2w-jcard__count">{myTasks}</b> : null}
          </Link>
        ) : null}
      </div>
    </li>
  );
}
