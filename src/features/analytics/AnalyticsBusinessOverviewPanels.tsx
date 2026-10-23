import SectionCard from '../../components/SectionCard';
import type { AuditorProjectDashboard, NumericValue } from '../../services/analytics/businessClient';

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

function formatPercent(value: number | null | undefined): string {
  return value == null ? 'Unavailable' : `${Number(value).toFixed(1)}%`;
}

function percent(part: number, total: number): string {
  return total ? `${((part / total) * 100).toFixed(1)}%` : 'Unavailable';
}

function Metric({ label, value, detail, attention = false }: {
  label: string;
  value: string;
  detail: string;
  attention?: boolean;
}) {
  return (
    <article className={`analytics-insight-card${attention ? ' analytics-insight-card--attention' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

export default function AnalyticsBusinessOverviewPanels({ data }: { data: AuditorProjectDashboard }) {
  const { summary, price_integrity: pricing } = data;
  const booked = summary.booked_journeys || 0;
  const delivered = summary.delivered_cars || 0;

  return (
    <>
      <SectionCard
        title="Business Performance"
        description="Sales, delivery, finance, insurance and receipt measures use the latest controlled project snapshot."
      >
        <div className="analytics-insurance-banner">
          <Metric
            label="Booked vehicles"
            value={formatNumber(booked)}
            detail={`${formatNumber(summary.total_journeys)} total journey records in this snapshot`}
          />
          <Metric
            label="Vehicles delivered"
            value={formatNumber(delivered)}
            detail={`${percent(delivered, booked)} of booked journeys have an actual delivery date`}
          />
          <Metric
            label="Finance record rate"
            value={formatPercent(summary.finance_attach_pct == null ? null : numeric(summary.finance_attach_pct))}
            detail={`${formatNumber(summary.financed_bookings)} booked journeys have a finance record; this is not an approval or disbursement rate`}
          />
          <Metric
            label="Insurance record rate"
            value={percent(summary.insured_journeys, booked)}
            detail={`${formatNumber(summary.insured_journeys)} policy records; ${formatNumber(summary.insurance_source_unknown_journeys)} have an unclassified insurance source`}
          />
          <Metric
            label="Accessory value recorded"
            value={formatMoney(summary.total_accessories_value)}
            detail={`${formatNumber(summary.accessory_journeys)} booked journeys with an accessory-category record`}
          />
          <Metric
            label="Recorded receipt amount"
            value={formatMoney(summary.recorded_receipt_amount)}
            detail={`${formatNumber(summary.payment_entry_count)} entries · status present for ${formatPercent(summary.payment_status_coverage_pct == null ? null : numeric(summary.payment_status_coverage_pct))}; not a settled-cash figure`}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Pricing Integrity Coverage"
        description="Active exceptions come from current Audit Core findings. Known excess is calculated per discount application; unmatched or unclear entitlements remain unknown."
      >
        <div className="analytics-insurance-banner">
          <Metric
            label="Open or acknowledged pricing cases"
            value={formatNumber(pricing.summary.journeys_with_pricing_exceptions)}
            detail={`${formatNumber(pricing.summary.price_exception_journeys)} price variance · ${formatNumber(pricing.summary.discount_exception_journeys)} discount cases · ${formatNumber(pricing.summary.invoice_conflict_journeys)} invoice conflicts`}
            attention={pricing.summary.journeys_with_pricing_exceptions > 0}
          />
          <Metric
            label="Known excess discount"
            value={formatMoney(pricing.summary.known_excess_discount_amount)}
            detail={`${formatNumber(pricing.summary.known_excess_discount_journeys)} journeys · ${formatNumber(pricing.summary.known_excess_application_count)} applications above entitlement`}
            attention={numeric(pricing.summary.known_excess_discount_amount) > 0}
          />
          <Metric
            label="Entitlement attribution gaps"
            value={formatNumber(pricing.summary.unknown_entitlement_application_count)}
            detail="Discount applications excluded from the known excess amount"
            attention={pricing.summary.unknown_entitlement_application_count > 0}
          />
          <Metric
            label="Comparable price line coverage"
            value={formatPercent(pricing.summary.comparable_price_line_coverage_pct)}
            detail={`${formatNumber(pricing.summary.comparable_price_line_count)} of ${formatNumber(pricing.summary.standard_price_line_count)} standard-priced commercial lines have an actual amount`}
          />
        </div>
        <p className="analytics-footnote">
          Invoice-backed lines: {formatNumber(pricing.summary.invoice_backed_price_line_count)}. Booking-backed lines: {formatNumber(pricing.summary.booking_backed_price_line_count)}. Line coverage is not a claim that every deal has a complete invoice comparison.
        </p>
      </SectionCard>
    </>
  );
}
