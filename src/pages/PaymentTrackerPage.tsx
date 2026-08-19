import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import { demoJourneys, demoStageData } from '../data/demoData';

interface PaymentTrackerRow {
  journeyId: string;
  journeyReference: string;
  customerName: string;
  outletName: string;
  mode: string;
  amount: number;
  status: string;
  verification: string;
  reference: string;
}

export default function PaymentTrackerPage() {
  const [status, setStatus] = useState('ALL');
  const rows = useMemo<PaymentTrackerRow[]>(() => demoJourneys.map((journey, index) => {
    const payment = (demoStageData[journey.journeyId]?.payment || {}) as Record<string, unknown>;
    return {
      journeyId: journey.journeyId,
      journeyReference: journey.journeyReference || journey.journeyId,
      customerName: journey.customerName,
      outletName: journey.outletName,
      mode: String(payment.paymentMethod || (index % 2 === 0 ? 'UPI' : 'BANK_TRANSFER')),
      amount: Number(payment.totalReceived || [50000, 1850000, 420000, 1610000, 21000][index] || 0),
      status: String(payment.actualStatusCode || (index === 4 ? 'PENDING' : 'RECEIVED')),
      verification: index === 1 ? 'REVIEW_REQUIRED' : index === 4 ? 'PENDING' : 'VERIFIED',
      reference: String(payment.paymentReference || `PAY-${58120 + index}`),
    };
  }), []);

  const filtered = rows.filter((row) => status === 'ALL' || row.verification === status);
  const verified = rows.filter((row) => row.verification === 'VERIFIED').length;
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="screen-stack">
      <PageHeader
        eyebrow="Payment verification"
        title="Payment tracker"
        description="Operational visibility across booking payments and verification status. Per-journey payment records are already integrated with Audit Core; this cross-journey tracker remains a Web aggregate until Core exposes a read model."
        backing="WEB_DEMO"
      />
      <div className="metric-grid metric-grid--three">
        <article className="metric-card"><span className="metric-card__label">Payments in view</span><strong className="metric-card__value">{rows.length}</strong><span className="metric-card__detail">Current audit scope</span></article>
        <article className="metric-card"><span className="metric-card__label">Verified</span><strong className="metric-card__value">{verified}</strong><span className="metric-card__detail">{rows.length - verified} need follow-up/review</span></article>
        <article className="metric-card"><span className="metric-card__label">Receipt value</span><strong className="metric-card__value metric-card__value--small">₹{new Intl.NumberFormat('en-IN').format(total)}</strong><span className="metric-card__detail">Illustrative Web aggregate</span></article>
      </div>
      <SectionCard>
        <div className="toolbar-row">
          <label className="filter-select"><span>Verification</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All</option><option value="VERIFIED">Verified</option><option value="REVIEW_REQUIRED">Review required</option><option value="PENDING">Pending</option></select></label>
          <span className="toolbar-count">{filtered.length} payment records</span>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Journey</th><th>Customer</th><th>Payment</th><th>Reference</th><th>Receipt status</th><th>Verification</th><th></th></tr></thead>
            <tbody>{filtered.map((row) => <tr key={row.journeyId}><td><strong>{row.journeyReference}</strong><small>{row.outletName}</small></td><td>{row.customerName}</td><td><strong>₹{new Intl.NumberFormat('en-IN').format(row.amount)}</strong><small>{row.mode.replaceAll('_', ' ')}</small></td><td>{row.reference}</td><td><StatusPill value={row.status} compact /></td><td><StatusPill value={row.verification} compact /></td><td><Link className="row-action" to={`/journeys/${row.journeyId}`}>Open</Link></td></tr>)}</tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
