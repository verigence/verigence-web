import { useMemo, useState } from 'react';
import SectionCard from '../../components/SectionCard';
import type {
  AuditorProjectDashboard,
  DealerAuditorRow,
  NumericValue,
  OutletAuditorRow,
} from '../../services/analytics/businessClient';
import { AnalyticsBubbleChart } from './AnalyticsCharts';

type ScorecardScope = 'dealer' | 'outlet';
type ScorecardSort = 'risk' | 'bookings';
type ScorecardRow = DealerAuditorRow | OutletAuditorRow;

interface PricingExposure {
  price_exception_journeys: number;
  discount_exception_journeys: number;
  invoice_conflict_journeys: number;
  known_excess_discount_amount: NumericValue;
  unknown_discount_applications: number;
}

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
  return value == null ? 'Unavailable' : Number(value).toFixed(1) + '%';
}

function percent(part: number, total: number): string {
  return total ? ((part / total) * 100).toFixed(1) + '%' : 'Unavailable';
}



function Metric({ label, value, detail, attention = false }: {
  label: string;
  value: string;
  detail: string;
  attention?: boolean;
}) {
  return (
    <article className={'analytics-insight-card' + (attention ? ' analytics-insight-card--attention' : '')}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function rowExposureKey(dealerName: string, outletName: string): string {
  return dealerName + '¦' + outletName;
}

function exceptionTotal(exposure: PricingExposure): number {
  return exposure.price_exception_journeys
    + exposure.discount_exception_journeys
    + exposure.invoice_conflict_journeys;
}

export default function AnalyticsBusinessOverviewPanels({ data }: { data: AuditorProjectDashboard }) {
  const [scope, setScope] = useState<ScorecardScope>('dealer');
  const [sort, setSort] = useState<ScorecardSort>('risk');
  const { summary, price_integrity: pricing } = data;
  const booked = summary.booked_journeys || 0;
  const delivered = summary.delivered_cars || 0;

  const pricingByDealer = useMemo(() => {
    const rows = new Map<string, PricingExposure>();
    pricing.by_dealer.forEach((row) => rows.set(row.dealer_name, row));
    return rows;
  }, [pricing.by_dealer]);
  const pricingByOutlet = useMemo(() => {
    const rows = new Map<string, PricingExposure>();
    pricing.by_outlet.forEach((row) => {
      rows.set(rowExposureKey(row.dealer_name, row.outlet_name), row);
    });
    return rows;
  }, [pricing.by_outlet]);
  const scorecardRows = useMemo(() => {
    const sourceRows: ScorecardRow[] = scope === 'dealer' ? data.dealers : data.outlets;
    return sourceRows.map((row) => {
      const outletRow = 'outlet_name' in row;
      const exposure = outletRow
        ? pricingByOutlet.get(rowExposureKey(row.dealer_name, row.outlet_name))
        : pricingByDealer.get(row.dealer_name);
      return {
        row,
        exposure: exposure || {
          price_exception_journeys: 0,
          discount_exception_journeys: 0,
          invoice_conflict_journeys: 0,
          known_excess_discount_amount: 0,
          unknown_discount_applications: 0,
        },
      };
    }).sort((a, b) => {
      if (sort === 'bookings') {
        return b.row.booked_cars - a.row.booked_cars || a.row.dealer_name.localeCompare(b.row.dealer_name);
      }
      return numeric(b.exposure.known_excess_discount_amount) - numeric(a.exposure.known_excess_discount_amount)
        || exceptionTotal(b.exposure) - exceptionTotal(a.exposure)
        || b.row.booked_cars - a.row.booked_cars
        || a.row.dealer_name.localeCompare(b.row.dealer_name);
    });
  }, [data.dealers, data.outlets, pricingByDealer, pricingByOutlet, scope, sort]);

  const topExceptions = pricing.exceptions.slice(0, 8);
  const topPincodes = data.pincodes.slice(0, 10);

  return (
    <>
      {booked === 0 ? (
        <SectionCard title="No booked vehicle journeys in this project snapshot">
          <p className="analytics-empty-copy">
            This is an empty result for the project identified above. Check the selected project before interpreting the totals as business performance.
          </p>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Business pulse"
        description="Project-level measures from the latest completed Audit Core snapshot. Each focused report below is scoped to this project."
      >
        <div className="analytics-overview-metrics">
          <Metric
            label="Booked journeys"
            value={formatNumber(booked)}
            detail={formatNumber(summary.total_journeys) + ' total journeys captured'}
          />
          <Metric
            label="Delivered journeys"
            value={formatNumber(delivered) + ' · ' + percent(delivered, booked)}
            detail="Uses an actual delivery timestamp; not a vehicle registration count"
          />
          <Metric
            label="Known excess discount"
            value={formatMoney(pricing.summary.known_excess_discount_amount)}
            detail={formatNumber(pricing.summary.known_excess_discount_journeys) + ' journeys · ' + formatNumber(pricing.summary.known_excess_application_count) + ' applications above known entitlement'}
            attention={numeric(pricing.summary.known_excess_discount_amount) > 0}
          />
          <Metric
            label="Finance record attach"
            value={formatPercent(summary.finance_attach_pct == null ? null : numeric(summary.finance_attach_pct))}
            detail={formatNumber(summary.financed_bookings) + ' booked journeys with a finance record; not approval or disbursement'}
          />
          <Metric
            label="Insurance record attach"
            value={percent(summary.insured_journeys, booked)}
            detail={formatNumber(summary.inhouse_insurance_journeys) + ' dealer arranged · ' + formatNumber(summary.outside_insurance_journeys) + ' customer arranged · ' + formatNumber(summary.insurance_source_ambiguous_journeys + summary.insurance_source_unknown_journeys) + ' unclear or unspecified'}
          />
          <Metric
            label="Recorded receipt amount"
            value={formatMoney(summary.recorded_receipt_amount)}
            detail={formatNumber(summary.payment_entry_count) + ' payment entries · not a settled-cash figure'}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Dealer and outlet scorecard"
        description="Compare sales, discounts against recorded eligibility, active pricing findings, insurance route, accessory-category value, receipts and delivery time at one grain."
      >
        <div className="analytics-scorecard-controls">
          <label>
            Level
            <select value={scope} onChange={(event) => setScope(event.target.value as ScorecardScope)}>
              <option value="dealer">Dealership</option>
              <option value="outlet">Outlet</option>
            </select>
          </label>
          <label>
            Sort
            <select value={sort} onChange={(event) => setSort(event.target.value as ScorecardSort)}>
              <option value="risk">Highest known excess first</option>
              <option value="bookings">Most booked first</option>
            </select>
          </label>
        </div>
        {scorecardRows.length ? (
          <AnalyticsBubbleChart
            rows={scorecardRows.map(({ row, exposure }) => ({
              label: 'outlet_name' in row ? `${row.dealer_name} · ${row.outlet_name}` : row.dealer_name,
              x: row.booked_cars,
              y: numeric(exposure.known_excess_discount_amount),
              size: Math.max(row.journeys_with_findings, 1),
            }))}
            xLabel="Booked journeys"
            yLabel="Known excess discount"
            yKind="currency"
            sizeLabel="Journeys with findings"
            emptyText="No dealer or outlet comparison is available for this project snapshot."
          />
        ) : (
          <p className="analytics-overview-empty">No dealer or outlet rows were returned for this project snapshot.</p>
        )}
        <p className="analytics-footnote">
          Cases are active Audit Core price, discount and invoice findings. Known excess is entitlement based; unknown entitlements stay separate. Accessory and payment values are recorded source amounts, not audited dealer revenue or settled cash.
        </p>
      </SectionCard>

      <div className="analytics-split analytics-split--overview">
        <SectionCard
          title="Current pricing cases for review"
          description="Open and acknowledged Audit Core pricing findings, ordered by severity and SLA. This list is actionable case work, separate from aggregate discount exposure."
        >
          {topExceptions.length ? (
            <div className="analytics-exception-cards">{topExceptions.map((row, index) => <article className="analytics-exception-card" key={row.finding_id || `${row.journey_id}:${row.rule_key}:${index}`}>
              <header><strong>{row.journey_reference || row.journey_id.slice(0, 8)}</strong><span className={'analytics-severity-pill analytics-severity-pill--' + row.severity.toLowerCase()}>{row.severity}</span></header>
              <h4>{row.title}</h4><p>{row.dealer_name} · {row.outlet_name} · {row.model_name} {row.variant_name}</p>
              <footer><span>{row.finding_status} · {row.owner_role_code || 'Unassigned'}</span><strong>{row.sla_due_at_utc ? `SLA ${new Date(row.sla_due_at_utc).toLocaleDateString('en-IN')}` : 'No SLA date'}</strong></footer>
            </article>)}</div>
          ) : (
            <p className="analytics-overview-empty">No active price, discount or invoice findings were returned for this snapshot.</p>
          )}
        </SectionCard>

        <SectionCard
          title="Customer sales by PIN code"
          description="Leading captured customer PINs, with dealership and outlet attribution."
        >
          {topPincodes.length ? (
            <ol className="analytics-ranked-list">{topPincodes.map((row, index) => <li className="analytics-ranked-list__item" key={`${row.customer_pincode}:${row.dealer_name}:${row.outlet_name}`}>
              <span className="analytics-ranked-list__rank">{index + 1}</span><span className="analytics-ranked-list__copy"><strong>{row.customer_pincode}</strong><small>{row.dealer_name} · {row.outlet_name} · {formatNumber(row.delivered_count)} deliveries · {formatMoney(row.total_discount)} discount recorded</small></span><span className="analytics-ranked-list__value">{formatNumber(row.car_count)} booked</span>
            </li>)}</ol>
          ) : (
            <p className="analytics-overview-empty">No usable six-digit customer PINs were captured for booked journeys in this snapshot.</p>
          )}
          <p className="analytics-footnote">
            {formatNumber(summary.journeys_with_pincode)} of {formatNumber(booked)} booked journeys have a captured PIN; {formatNumber(summary.reviewed_pincode_journeys)} have review provenance.
          </p>
        </SectionCard>
      </div>

      <SectionCard
        title="Pricing integrity coverage"
        description="Amounts compare individual discount applications to captured entitlements. Price-line coverage is a coverage measure, not proof that every deal has a complete invoice comparison."
      >
        <div className="analytics-overview-metrics analytics-overview-metrics--audit">
          <Metric
            label="Active pricing journeys"
            value={formatNumber(pricing.summary.journeys_with_pricing_exceptions)}
            detail={formatNumber(pricing.summary.price_exception_journeys) + ' price · ' + formatNumber(pricing.summary.discount_exception_journeys) + ' discount · ' + formatNumber(pricing.summary.invoice_conflict_journeys) + ' invoice'}
            attention={pricing.summary.journeys_with_pricing_exceptions > 0}
          />
          <Metric
            label="Entitlement gaps"
            value={formatNumber(pricing.summary.unknown_entitlement_application_count)}
            detail="Applications excluded from known excess because the entitlement is unknown"
            attention={pricing.summary.unknown_entitlement_application_count > 0}
          />
          <Metric
            label="Comparable price line coverage"
            value={formatPercent(pricing.summary.comparable_price_line_coverage_pct)}
            detail={formatNumber(pricing.summary.comparable_price_line_count) + ' of ' + formatNumber(pricing.summary.standard_price_line_count) + ' standard-priced commercial lines have an actual amount'}
          />
        </div>
        <p className="analytics-footnote">
          Invoice-backed lines: {formatNumber(pricing.summary.invoice_backed_price_line_count)} · booking-backed lines: {formatNumber(pricing.summary.booking_backed_price_line_count)}.
        </p>
      </SectionCard>
    </>
  );
}
