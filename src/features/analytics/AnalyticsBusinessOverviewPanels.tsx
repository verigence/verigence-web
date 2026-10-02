import { useState } from 'react';
import SectionCard from '../../components/SectionCard';
import type {
  AuditorProjectDashboard,
  DealerAuditorRow,
  DiscountSchemeRow,
  ModelVelocityRow,
  NumericValue,
  OutletAuditorRow,
  PincodePlacementRow,
} from '../../services/analytics/businessClient';
import {
  AnalyticsBarChart,
  AnalyticsDonutChart,
} from './AnalyticsCharts';

function numeric(value: NumericValue | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

function formatMoney(value: NumericValue | undefined): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(numeric(value));
}

function percent(part: number, total: number): string {
  if (!total) return '0.0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

function humanize(value: string): string {
  if (!value) return 'Unspecified';
  const acronyms: Record<string, string> = { ew: 'EW', rsa: 'RSA', gst: 'GST', id: 'ID', rc: 'RC', po: 'PO', upi: 'UPI', mr: 'MR' };
  return value
    .replace(/[:/]/g, ' ')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((token) => acronyms[token.toLowerCase()] || `${token.charAt(0).toUpperCase()}${token.slice(1).toLowerCase()}`)
    .join(' ');
}

function Metric({
  label,
  value,
  detail,
  attention = false,
  highlight = false,
}: {
  label: string;
  value: string;
  detail: string;
  attention?: boolean;
  highlight?: boolean;
}) {
  return (
    <article
      className={`analytics-insight-card${attention ? ' analytics-insight-card--attention' : ''}${
        highlight ? ' analytics-insight-card--highlight' : ''
      }`}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

export default function AnalyticsBusinessOverviewPanels({ data }: { data: AuditorProjectDashboard }) {
  const summary = data.summary;
  const [scope, setScope] = useState<'dealers' | 'outlets'>('dealers');
  const [searchTerm, setSearchTerm] = useState('');

  const excessDiscountVal = numeric(summary.total_excess_discount);
  const totalStandardVal = numeric(summary.total_standard_discount);
  const totalActualVal = numeric(summary.total_actual_discount);

  // Scheme donut
  const schemeRows = (data.discount_schemes || []).map((s: DiscountSchemeRow) => ({
    label: humanize(s.discount_key),
    value: numeric(s.actual_discount_amount),
  }));

  // Fast/slow model velocity
  const velocityRows = (data.models || []).slice(0, 8).map((m: ModelVelocityRow) => ({
    label: m.model_name,
    value: numeric(m.avg_delivery_days) || 0,
  }));

  // Accessories breakdown
  const accRows = (data.accessories || []).map((a) => ({
    label: humanize(a.addon_type),
    value: numeric(a.actual_amount),
  }));

  const filteredDealers = (data.dealers || []).filter((d: DealerAuditorRow) =>
    d.dealer_name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const filteredOutlets = (data.outlets || []).filter(
    (o: OutletAuditorRow) =>
      o.dealer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.outlet_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o.city && o.city.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  return (
    <>
      {/* 1. Project High-Level Auditor Pulse */}
      <SectionCard
        title="Project Audit Executive Summary"
        description="Consolidated findings across all dealerships and outlets under this audit scope."
      >
        <div className="analytics-insurance-banner">
          <Metric
            label="Total Cars Booked"
            value={formatNumber(summary.total_journeys)}
            detail={`${formatNumber(summary.delivered_cars)} cars delivered (${percent(
              summary.delivered_cars,
              summary.total_journeys,
            )})`}
          />
          <Metric
            label="Total Standard Discount"
            value={formatMoney(summary.total_standard_discount)}
            detail="Approved OEM / Scheme discount baseline"
          />
          <Metric
            label="Total Actual Discount"
            value={formatMoney(summary.total_actual_discount)}
            detail="Total discounts passed on across all cars"
          />
          <Metric
            label="Excess / Unauthorized Discount"
            value={formatMoney(summary.total_excess_discount)}
            detail={`${formatNumber(summary.journeys_with_excess_discount)} cars given discount above standard`}
            attention={excessDiscountVal > 0}
          />
        </div>

        <div className="analytics-insurance-banner">
          <Metric
            label="In-House Insurance"
            value={percent(summary.inhouse_insurance_journeys, summary.insured_journeys || 1)}
            detail={`${formatNumber(summary.inhouse_insurance_journeys)} of ${formatNumber(
              summary.insured_journeys,
            )} insured via dealer`}
          />
          <Metric
            label="Outside / Self Insurance"
            value={percent(summary.outside_insurance_journeys, summary.insured_journeys || 1)}
            detail={`${formatNumber(summary.outside_insurance_journeys)} cars took outside insurance`}
            attention={summary.outside_insurance_journeys > 0}
          />
          <Metric
            label="Avg Booking to Delivery TAT"
            value={`${numeric(summary.avg_booking_to_delivery_days).toFixed(1)} days`}
            detail={`Median delivery TAT: ${numeric(summary.median_booking_to_delivery_days).toFixed(1)} days`}
          />
          <Metric
            label="Total Payment Collected"
            value={formatMoney(summary.total_payment_collected)}
            detail={`Booking: ${formatMoney(summary.booking_payment_collected)} | Delivery: ${formatMoney(
              summary.delivery_payment_collected,
            )}`}
          />
        </div>
      </SectionCard>

      {/* 2. Scheme & Scheme Variance Deep Dive */}
      <div className="analytics-split analytics-split--insurance">
        <SectionCard
          title="Discount Scheme Breakdown"
          description="Distribution of actual discount value by scheme key (Cash, Exchange, Scrappage, Corporate, etc.)."
        >
          <AnalyticsDonutChart rows={schemeRows} valueLabel="Actual Amount (₹)" />
        </SectionCard>

        <SectionCard
          title="Accessories & VAS Mix"
          description="Total value realized across Genuine Accessories, Extended Warranty (EW), and RSA."
        >
          <AnalyticsDonutChart rows={accRows} valueLabel="Total Value (₹)" />
        </SectionCard>
      </div>

      {/* 3. Dealership & Outlet Auditor League Matrix */}
      <SectionCard
        title="Dealership & Outlet Audit League"
        description="Audit comparison of deliveries, standard vs actual discounts, excess discount leakage, insurance sourcing, and turnaround days."
        action={
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="search"
              placeholder="Filter by dealer/outlet..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '4px 10px',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            />
            <div className="button-group">
              <button
                type="button"
                className={`btn btn--secondary btn--sm ${scope === 'dealers' ? 'active' : ''}`}
                onClick={() => setScope('dealers')}
              >
                Dealerships ({data.dealers?.length || 0})
              </button>
              <button
                type="button"
                className={`btn btn--secondary btn--sm ${scope === 'outlets' ? 'active' : ''}`}
                onClick={() => setScope('outlets')}
              >
                Outlets ({data.outlets?.length || 0})
              </button>
            </div>
          </div>
        }
      >
        <div className="data-table-wrap analytics-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{scope === 'dealers' ? 'Dealership' : 'Dealer / Outlet'}</th>
                <th>Booked / Delivered</th>
                <th>Standard Eligible (₹)</th>
                <th>Actual Given (₹)</th>
                <th>Excess Discount Leakage (₹)</th>
                <th>Exchange Bonus (₹)</th>
                <th>Scrappage Bonus (₹)</th>
                <th>In-House vs Outside Ins.</th>
                <th>Accessories (₹)</th>
                <th>Avg Delivery TAT</th>
                <th>Audit Findings</th>
              </tr>
            </thead>
            <tbody>
              {scope === 'dealers'
                ? filteredDealers.map((d: DealerAuditorRow) => {
                    const excess = numeric(d.excess_discount);
                    const totalIns = d.total_insured || 1;
                    return (
                      <tr key={d.dealer_id}>
                        <td>
                          <strong>{d.dealer_name}</strong>
                        </td>
                        <td>
                          <strong>{formatNumber(d.booked_cars)}</strong> booked
                          <br />
                          <small style={{ color: '#0a6575' }}>
                            {formatNumber(d.delivered_cars)} delivered ({percent(d.delivered_cars, d.booked_cars)})
                          </small>
                        </td>
                        <td>{formatMoney(d.standard_discount)}</td>
                        <td>{formatMoney(d.actual_discount)}</td>
                        <td>
                          <span
                            style={{
                              fontWeight: 700,
                              color: excess > 0 ? '#b91c1c' : '#15803d',
                              backgroundColor: excess > 0 ? '#fee2e2' : '#dcfce7',
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            {formatMoney(d.excess_discount)}
                          </span>
                          {excess > 0 && (
                            <div>
                              <small style={{ color: '#b91c1c' }}>{d.excess_discount_journeys} cars affected</small>
                            </div>
                          )}
                        </td>
                        <td>
                          {formatMoney(d.exchange_bonus)}
                          <br />
                          <small>{d.exchange_journeys} cars</small>
                        </td>
                        <td>
                          {formatMoney(d.scrappage_bonus)}
                          <br />
                          <small>{d.scrappage_journeys} cars</small>
                        </td>
                        <td>
                          <span style={{ color: '#15803d', fontWeight: 600 }}>{d.inhouse_insurance} In-House</span>
                          <br />
                          <span style={{ color: d.outside_insurance > 0 ? '#b91c1c' : '#64748b' }}>
                            {d.outside_insurance} Outside ({percent(d.outside_insurance, totalIns)})
                          </span>
                        </td>
                        <td>
                          {formatMoney(d.accessories_value)}
                          <br />
                          <small>EW: {formatMoney(d.ew_value)}</small>
                        </td>
                        <td>
                          <strong>{numeric(d.avg_delivery_days).toFixed(1)} days</strong>
                          <br />
                          <small>Med: {numeric(d.median_delivery_days).toFixed(1)}d</small>
                        </td>
                        <td>
                          <span
                            style={{
                              fontWeight: 600,
                              color: d.journeys_with_findings > 0 ? '#d97706' : '#15803d',
                            }}
                          >
                            {d.journeys_with_findings} cars flagged
                          </span>
                        </td>
                      </tr>
                    );
                  })
                : filteredOutlets.map((o: OutletAuditorRow) => {
                    const excess = numeric(o.excess_discount);
                    const totalIns = o.total_insured || 1;
                    return (
                      <tr key={o.outlet_id}>
                        <td>
                          <strong>{o.outlet_name}</strong>
                          <br />
                          <small style={{ color: '#64748b' }}>
                            {o.dealer_name} {o.city ? `· ${o.city}` : ''}
                          </small>
                        </td>
                        <td>
                          <strong>{formatNumber(o.booked_cars)}</strong> booked
                          <br />
                          <small style={{ color: '#0a6575' }}>
                            {formatNumber(o.delivered_cars)} delivered ({percent(o.delivered_cars, o.booked_cars)})
                          </small>
                        </td>
                        <td>{formatMoney(o.standard_discount)}</td>
                        <td>{formatMoney(o.actual_discount)}</td>
                        <td>
                          <span
                            style={{
                              fontWeight: 700,
                              color: excess > 0 ? '#b91c1c' : '#15803d',
                              backgroundColor: excess > 0 ? '#fee2e2' : '#dcfce7',
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            {formatMoney(o.excess_discount)}
                          </span>
                          {excess > 0 && (
                            <div>
                              <small style={{ color: '#b91c1c' }}>{o.excess_discount_journeys} cars affected</small>
                            </div>
                          )}
                        </td>
                        <td>
                          {formatMoney(o.exchange_bonus)}
                          <br />
                          <small>{o.exchange_journeys} cars</small>
                        </td>
                        <td>
                          {formatMoney(o.scrappage_bonus)}
                          <br />
                          <small>{o.scrappage_journeys} cars</small>
                        </td>
                        <td>
                          <span style={{ color: '#15803d', fontWeight: 600 }}>{o.inhouse_insurance} In-House</span>
                          <br />
                          <span style={{ color: o.outside_insurance > 0 ? '#b91c1c' : '#64748b' }}>
                            {o.outside_insurance} Outside ({percent(o.outside_insurance, totalIns)})
                          </span>
                        </td>
                        <td>
                          {formatMoney(o.accessories_value)}
                          <br />
                          <small>EW: {formatMoney(o.ew_value)}</small>
                        </td>
                        <td>
                          <strong>{numeric(o.avg_delivery_days).toFixed(1)} days</strong>
                          <br />
                          <small>Med: {numeric(o.median_delivery_days).toFixed(1)}d</small>
                        </td>
                        <td>
                          <span
                            style={{
                              fontWeight: 600,
                              color: o.journeys_with_findings > 0 ? '#d97706' : '#15803d',
                            }}
                          >
                            {o.journeys_with_findings} cars flagged
                          </span>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* 4. Model Velocity & Turnaround Time Analysis */}
      <div className="analytics-split">
        <SectionCard
          title="Vehicle Model Delivery Velocity"
          description="Average booking-to-delivery days per model. Quickly identify fast-moving vs aging/slow-moving inventory."
        >
          <AnalyticsBarChart rows={velocityRows} valueLabel="Avg Days to Deliver" />
        </SectionCard>

        <SectionCard
          title="Model Sales & Discount Summary"
          description="Detailed breakdown of units sold, delivered, and discount metrics per model."
        >
          <div className="data-table-wrap analytics-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Units Booked</th>
                  <th>Delivered</th>
                  <th>Avg Delivery Days</th>
                  <th>Total Discount</th>
                  <th>Avg Disc / Car</th>
                </tr>
              </thead>
              <tbody>
                {(data.models || []).map((m: ModelVelocityRow) => (
                  <tr key={m.model_name}>
                    <td>
                      <strong>{m.model_name}</strong>
                    </td>
                    <td>{formatNumber(m.booked_units)}</td>
                    <td>{formatNumber(m.delivered_units)}</td>
                    <td>{numeric(m.avg_delivery_days) ? `${numeric(m.avg_delivery_days).toFixed(1)} d` : 'N/A'}</td>
                    <td>{formatMoney(m.actual_discount)}</td>
                    <td>{formatMoney(m.avg_discount_per_car)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      {/* 5. Customer Geography & Pincode Placement */}
      <SectionCard
        title="Customer Placement by Pincode & Cross-Territory Audit"
        description="Top customer pincodes served, dealer fulfillment mapping, and discount patterns across geographic zones."
      >
        <div className="data-table-wrap analytics-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer PIN</th>
                <th>Fulfilling Dealership</th>
                <th>Outlet</th>
                <th>Cars Sold</th>
                <th>Delivered</th>
                <th>Total Discount Given (₹)</th>
                <th>Excess Discount (₹)</th>
                <th>Payment Collected (₹)</th>
              </tr>
            </thead>
            <tbody>
              {(data.pincodes || []).slice(0, 15).map((p: PincodePlacementRow, idx: number) => {
                const excess = numeric(p.excess_discount);
                return (
                  <tr key={`${p.customer_pincode}-${p.dealer_name}-${idx}`}>
                    <td>
                      <strong>{p.customer_pincode}</strong>
                    </td>
                    <td>{p.dealer_name}</td>
                    <td>{p.outlet_name}</td>
                    <td>{formatNumber(p.car_count)}</td>
                    <td>{formatNumber(p.delivered_count)}</td>
                    <td>{formatMoney(p.total_discount)}</td>
                    <td style={{ color: excess > 0 ? '#b91c1c' : '#15803d', fontWeight: 600 }}>
                      {formatMoney(p.excess_discount)}
                    </td>
                    <td>{formatMoney(p.payment_collected)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}
