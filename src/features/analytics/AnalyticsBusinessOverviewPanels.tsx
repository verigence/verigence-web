import SectionCard from '../../components/SectionCard';
import type { AnalyticsBusinessProjectDashboard, NumericValue } from '../../services/analytics/businessClient';
import {
  AnalyticsBarChart,
  AnalyticsBubbleChart,
  AnalyticsComboChart,
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

function formatPercent(value: number | null | undefined): string {
  return value == null ? 'Unavailable' : `${Number(value).toFixed(1)}%`;
}

function humanize(value: string): string {
  if (!value) return 'Unspecified';
  const acronyms: Record<string, string> = { ew: 'EW', rsa: 'RSA', gst: 'GST', idv: 'IDV', upi: 'UPI' };
  return value
    .replace(/[:/]/g, ' ')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((token) => acronyms[token.toLowerCase()] || `${token.charAt(0).toUpperCase()}${token.slice(1).toLowerCase()}`)
    .join(' ');
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="analytics-insight-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

export default function AnalyticsBusinessOverviewPanels({ data }: { data: AnalyticsBusinessProjectDashboard }) {
  const summary = data.business.summary;
  const modelRows = data.salesProduct.by_model_variant.map((row) => ({
    label: `${row.model_name} · ${row.variant_name}`,
    value: row.journey_count,
  }));
  const colourRows = data.salesProduct.by_colour.map((row) => ({
    label: humanize(row.colour_name),
    value: row.journey_count,
  }));
  const outletRows = data.salesProduct.by_outlet.map((row) => ({
    label: `${row.dealer_name} · ${row.outlet_name}`,
    x: row.journey_count,
    y: numeric(row.payment_amount),
    size: Math.max(row.actual_deliveries, row.journey_count, 1),
  }));
  const geographyRows = data.geography.rows.map((row) => ({
    label: row.customer_pincode,
    value: row.journey_count,
  }));
  const componentRows = data.commercialComponents.rows
    .slice(0, 12)
    .map((row) => ({
      label: humanize(row.component_key),
      bar: numeric(row.actual_amount),
      line: numeric(row.standard_amount),
    }));
  const coverageRows = [
    ['Vehicle model', data.coverage.metrics.model],
    ['Vehicle variant', data.coverage.metrics.variant],
    ['Actual delivery date', data.coverage.metrics.actual_delivery_date],
    ['Vehicle allocation date', data.coverage.metrics.allocation_date],
    ['Customer PIN', data.coverage.metrics.customer_pincode],
    ['Insurance add-ons', data.coverage.metrics.insurance_add_ons],
    ['Actual discount', data.coverage.metrics.actual_discount],
    ['Eligible discount', data.coverage.metrics.eligible_discount],
  ] as const;

  return (
    <>
      <SectionCard
        title="Business Activity Snapshot"
        description="Current vehicle-sale business from the controlled Analytics snapshot. Missing source fields are shown as coverage gaps rather than zero performance."
      >
        <div className="analytics-insurance-banner">
          <Metric label="Vehicle journeys" value={formatNumber(summary.journeys)} detail="Current project snapshot" />
          <Metric
            label="Actual deliveries"
            value={formatNumber(summary.actual_deliveries)}
            detail={`${formatNumber(summary.delivery_records)} journeys currently have a delivery record`}
          />
          <Metric label="Captured receipts" value={formatMoney(summary.payment_amount)} detail="Payment value associated with project journeys" />
          <Metric label="Average discount basis" value={formatMoney(summary.discount_amount)} detail="Total captured actual discount across journeys" />
        </div>
        <div className="analytics-insurance-banner">
          <Metric label="Finance penetration" value={formatPercent(summary.finance_penetration_pct)} detail={`${formatNumber(summary.finance_journeys)} financed journeys`} />
          <Metric label="Insurance penetration" value={formatPercent(summary.insurance_penetration_pct)} detail={`${formatNumber(summary.insurance_journeys)} insured journeys`} />
          <Metric label="Accessories penetration" value={formatPercent(summary.accessory_penetration_pct)} detail={`${formatNumber(summary.accessory_journeys)} journeys with accessories`} />
          <Metric label="Trade-in penetration" value={formatPercent(summary.trade_in_penetration_pct)} detail={`${formatNumber(summary.trade_in_journeys)} journeys with trade-in`} />
        </div>
      </SectionCard>

      <div className="analytics-split analytics-split--wide-left">
        <SectionCard title="Model / Variant Mix" description="Vehicle journeys by captured model and variant. Unresolved product records remain visible in the underlying data coverage.">
          <AnalyticsBarChart rows={modelRows} valueLabel="Journeys" />
        </SectionCard>
        <SectionCard title="Colour Mix" description="Share of captured vehicle journeys by colour.">
          <AnalyticsDonutChart rows={colourRows} valueLabel="Journeys" />
        </SectionCard>
      </div>

      <SectionCard
        title="Outlet Business Footprint"
        description="Outlet journey volume against captured receipt value. Bubble size reflects the larger of journey or actual-delivery volume so low-volume outlets remain visible."
      >
        <AnalyticsBubbleChart rows={outletRows} xLabel="Journeys" yLabel="Captured receipts" yKind="currency" />
      </SectionCard>

      <SectionCard title="Business Data Coverage" description={data.coverage.interpretation}>
        <div className="data-table-wrap analytics-table-wrap">
          <table className="data-table">
            <thead><tr><th>Business field</th><th>Available</th><th>Total journeys</th><th>Coverage</th></tr></thead>
            <tbody>
              {coverageRows.map(([label, metric]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{formatNumber(metric?.available || 0)}</td>
                  <td>{formatNumber(metric?.total || data.coverage.journeys)}</td>
                  <td>{formatPercent(metric?.coverage_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="analytics-split">
        <SectionCard
          title="Customer Geography"
          description={data.geography.available ? 'Vehicle journeys by derived customer PIN code.' : 'Customer geography will populate when a valid PIN can be derived from captured address evidence.'}
        >
          {data.geography.available ? (
            <AnalyticsBarChart rows={geographyRows} valueLabel="Journeys" />
          ) : (
            <div className="analytics-empty-copy">
              PIN coverage is {formatPercent(data.geography.coverage.coverage_pct)} ({formatNumber(data.geography.coverage.available)} of {formatNumber(data.geography.coverage.total)} journeys). No geographical sales penetration is fabricated while the source evidence is unavailable.
            </div>
          )}
        </SectionCard>
        <SectionCard title="Commercial Component Mix" description={data.commercialComponents.note}>
          <AnalyticsComboChart
            rows={componentRows}
            barLabel="Actual amount"
            lineLabel="Standard amount"
            barKind="currency"
            lineKind="currency"
          />
        </SectionCard>
      </div>
    </>
  );
}
