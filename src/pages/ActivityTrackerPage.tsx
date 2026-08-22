import { useEffect, useMemo, useState } from 'react';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import VerigenceButton from '../components/VerigenceButton';

const activityRows = [
  { actor: 'A. Sharma', role: 'Process Coordinator', bookings: 7, deliveries: 4, payments: 6, reviews: 0, followups: 3, status: 'IN_PROGRESS' },
  { actor: 'N. Gupta', role: 'Process Coordinator', bookings: 5, deliveries: 6, payments: 4, reviews: 0, followups: 2, status: 'IN_PROGRESS' },
  { actor: 'S. Verma', role: 'Process Coordinator', bookings: 8, deliveries: 3, payments: 7, reviews: 0, followups: 4, status: 'COMPLETED' },
  { actor: 'R. Kapoor', role: 'Team Lead', bookings: 0, deliveries: 0, payments: 0, reviews: 12, followups: 3, status: 'IN_PROGRESS' },
];

export default function ActivityTrackerPage() {
  const today = new Date().toISOString().slice(0, 10);
  const storageKey = `verigence-web-notepad-${today}`;
  const [note, setNote] = useState(() => localStorage.getItem(storageKey) || '');
  const [saved, setSaved] = useState(false);
  const totals = useMemo(() => activityRows.reduce((acc, row) => ({
    bookings: acc.bookings + row.bookings,
    deliveries: acc.deliveries + row.deliveries,
    payments: acc.payments + row.payments,
    reviews: acc.reviews + row.reviews,
  }), { bookings: 0, deliveries: 0, payments: 0, reviews: 0 }), []);

  useEffect(() => setSaved(false), [note]);

  return (
    <div className="screen-stack">
      <PageHeader
        eyebrow="Daily Operations"
        title="Activity Tracker"
        description="Review daily workload and keep your follow-ups, assigned actions and notes together."
      />
      <div className="metric-grid">
        <article className="metric-card"><span className="metric-card__label">Booking Cases</span><strong className="metric-card__value">{totals.bookings}</strong><span className="metric-card__detail">Handled today</span></article>
        <article className="metric-card"><span className="metric-card__label">Delivery Cases</span><strong className="metric-card__value">{totals.deliveries}</strong><span className="metric-card__detail">Handled today</span></article>
        <article className="metric-card"><span className="metric-card__label">Payment Updates</span><strong className="metric-card__value">{totals.payments}</strong><span className="metric-card__detail">Handled today</span></article>
        <article className="metric-card"><span className="metric-card__label">Team Lead Reviews</span><strong className="metric-card__value">{totals.reviews}</strong><span className="metric-card__detail">Cases reviewed today</span></article>
      </div>
      <div className="dashboard-grid">
        <SectionCard title="Daily Activity" description="Activity for the current business date.">
          <div className="activity-list">{activityRows.map((row) => <div className="activity-row" key={row.actor}><span className="activity-avatar">{row.actor.slice(0, 2)}</span><span className="activity-person"><strong>{row.actor}</strong><small>{row.role}</small></span><span><small>Booking</small><strong>{row.bookings}</strong></span><span><small>Delivery</small><strong>{row.deliveries}</strong></span><span><small>Payment</small><strong>{row.payments}</strong></span><span><small>Review</small><strong>{row.reviews}</strong></span><StatusPill value={row.status} compact /></div>)}</div>
        </SectionCard>
        <SectionCard title="My Daily Notepad" description="Keep tasks, follow-ups and notes you want to remember for this business date.">
          <div className="notepad-panel">
            <div className="notepad-panel__date"><span>Business Date</span><strong>{today}</strong></div>
            <textarea rows={12} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Important activities, follow-ups, assigned actions and notes…" />
            <div className="notepad-panel__footer"><span>{saved ? 'Saved' : 'Changes not saved'}</span><VerigenceButton onClick={() => { localStorage.setItem(storageKey, note); setSaved(true); }}>Save Note</VerigenceButton></div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
