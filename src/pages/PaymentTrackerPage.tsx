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

function readableLabel(value: string) {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function PaymentTrackerPage() {
  const [status, setStatus] = useState('ALL');
  const rows = useMemo<PaymentTrackerRow[]>(() => demoJourneys.map((journey, index) => {
    const payment = (demoStageData[journey.journeyId]?.payment || {}) as Record<string, unknown>;
    return {
      journeyId: journey.journeyId,
      journeyReference: journey.journeyReference || 'Journey',
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
        eyebrow="Payment Verification"
        title="Payment Tracker"
        description="Review payment receipts and verification status across customer journeys."
      />
      <div className="metric-grid metric-grid--three">
        <article className="metric-card"><span className="metric-card__label">Payments In View</span><strong className="metric-card__value">{rows.length}</strong><span className="metric-card__detail">Current work scope</span></article>
        <article className="metric-card"><span className="metric-card__label">Verified</span><strong className="metric-card__value">{verified}</strong><span className="metric-card__detail">{rows.length - verified} need follow-up or review</span></article>
        <article className="metric-card"><span className="metric-card__label">Receipt Value</span><strong className="metric-card__value metric-card__value--small">₹{new Intl.NumberFormat('en-IN').format(total)}</strong><span className="metric-card__detail">Payments currently in view</span></article>
      </div>
      <SectionCard>
        <div className="toolbar-row">
          <label className="filter-select"><span>Verification</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All</option><option value="VERIFIED">Verified</option><option value="REVIEW_REQUIRED">Review Required</option><option value="PENDING">Pending</option></select></label>
          <span className="toolbar-count">{filtered.length} payment records</span>
        </div>
        <div className="adaptive-list__desktop">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Journey</th><th>Customer</th><th>Payment</th><th>Reference</th><th>Receipt Status</th><th>Verification</th><th></th></tr></thead>
              <tbody>{filtered.map((row) => <tr key={row.journeyId}><td><strong>{row.journeyReference}</strong><small>{row.outletName}</small></td><td>{row.customerName}</td><td><strong>₹{new Intl.NumberFormat('en-IN').format(row.amount)}</strong><small>{readableLabel(row.mode)}</small></td><td>{row.reference}</td><td><StatusPill value={row.status} compact /></td><td><StatusPill value={row.verification} compact /></td><td><Link className="row-action" to={`/journeys/${row.journeyId}`}>Open</Link></td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <div className="adaptive-list adaptive-list__mobile">
          {filtered.map((row) => (
            <Link className="adaptive-list-card" to={`/journeys/${row.journeyId}`} key={row.journeyId}>
              <div className="adaptive-list-card__head"><div><strong>{row.customerName}</strong><span>{row.journeyReference} · {row.outletName}</span></div><StatusPill value={row.verification} compact /></div>
              <div className="adaptive-list-card__details">
                <span>Amount <strong>₹{new Intl.NumberFormat('en-IN').format(row.amount)}</strong></span>
                <span>Payment Method <strong>{readableLabel(row.mode)}</strong></span>
                <span>Receipt Status <strong>{readableLabel(row.status)}</strong></span>
                <span>Reference <strong>{row.reference}</strong></span>
              </div>
              <div className="adaptive-list-card__action">Open Journey <span>›</span></div>
            </Link>
          ))}
          {filtered.length === 0 && <div className="adaptive-list-empty">No payment records match this filter.</div>}
        </div>
      </SectionCard>
    </div>
  );
}
