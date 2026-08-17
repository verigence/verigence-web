import { useEffect, useMemo, useState } from 'react';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import VerigenceButton from '../components/VerigenceButton';
import { useSessionStore } from '../store/sessionStore';

const activityRows = [
  { actor: 'A. Sharma', role: 'PC', bookings: 7, deliveries: 4, payments: 6, reviews: 0, followups: 3, status: 'IN_PROGRESS' },
  { actor: 'N. Gupta', role: 'PC', bookings: 5, deliveries: 6, payments: 4, reviews: 0, followups: 2, status: 'IN_PROGRESS' },
  { actor: 'S. Verma', role: 'PC', bookings: 8, deliveries: 3, payments: 7, reviews: 0, followups: 4, status: 'COMPLETED' },
  { actor: 'R. Kapoor', role: 'TL', bookings: 0, deliveries: 0, payments: 0, reviews: 12, followups: 3, status: 'IN_PROGRESS' },
];

export default function ActivityTrackerPage() {
  const role = useSessionStore((state) => state.role);
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
        eyebrow="Daily operations"
        title="PC / TL activity tracker"
        description="Daily workload and productivity view plus the PC activity notepad required by the operating process. These are workflow/productivity facts—not a substitute for booking, delivery or payment source records."
        backing="WEB_DEMO"
      />
      <div className="metric-grid">
        <article className="metric-card"><span className="metric-card__label">Booking cases</span><strong className="metric-card__value">{totals.bookings}</strong><span className="metric-card__detail">Handled today</span></article>
        <article className="metric-card"><span className="metric-card__label">Delivery cases</span><strong className="metric-card__value">{totals.deliveries}</strong><span className="metric-card__detail">Handled today</span></article>
        <article className="metric-card"><span className="metric-card__label">Payment updates</span><strong className="metric-card__value">{totals.payments}</strong><span className="metric-card__detail">Reconciliation activity</span></article>
        <article className="metric-card"><span className="metric-card__label">TL reviews</span><strong className="metric-card__value">{totals.reviews}</strong><span className="metric-card__detail">Cases reviewed today</span></article>
      </div>
      <div className="dashboard-grid">
        <SectionCard title="Daily activity" description="PC/TL operating activity for the selected business date.">
          <div className="activity-list">{activityRows.map((row) => <div className="activity-row" key={row.actor}><span className="activity-avatar">{row.actor.slice(0, 2)}</span><span className="activity-person"><strong>{row.actor}</strong><small>{row.role}</small></span><span><small>Booking</small><strong>{row.bookings}</strong></span><span><small>Delivery</small><strong>{row.deliveries}</strong></span><span><small>Payment</small><strong>{row.payments}</strong></span><span><small>Review</small><strong>{row.reviews}</strong></span><StatusPill value={row.status} compact /></div>)}</div>
        </SectionCard>
        <SectionCard title="My daily notepad" description="Tasks, follow-ups and notes for future reference. This is genuine new workflow information and is therefore appropriate manual input.">
          <div className="notepad-panel">
            <div className="notepad-panel__date"><span>Business date</span><strong>{today}</strong><small>Current preview role: {role}</small></div>
            <textarea rows={12} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Important activities, follow-ups, assigned actions and notes…" />
            <div className="notepad-panel__footer"><span>{saved ? 'Saved in Web Preview' : 'Notepad backend will be connected after Web sign-off.'}</span><VerigenceButton onClick={() => { localStorage.setItem(storageKey, note); setSaved(true); }}>Save note</VerigenceButton></div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
