import SectionCard from '../../components/SectionCard';
import type { AnalyticsBusinessReportPayload, NumericValue, PricingIntegrityReport } from '../../services/analytics/businessClient';
import {
  AnalyticsBarChart,
  AnalyticsBubbleChart,
  AnalyticsComboChart,
  AnalyticsParetoChart,
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

function percent(part: number, whole: number): string {
  return whole ? `${((part / whole) * 100).toFixed(1)}%` : 'Unavailable';
}

function formatDays(value: NumericValue | undefined): string {
  if (value == null || value === '') return 'Unavailable';
  return `${numeric(value).toFixed(1)} days`;
}

function humanize(value: string): string {
  if (!value) return 'Unspecified';
  const acronyms: Record<string, string> = {
    ew: 'EW', rsa: 'RSA', gst: 'GST', rti: 'RTI', idv: 'IDV', rc: 'RC', pan: 'PAN', po: 'PO', upi: 'UPI',
  };
  return value
    .replace(/[:/]/g, ' ')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((token) => acronyms[token.toLowerCase()] || `${token.charAt(0).toUpperCase()}${token.slice(1).toLowerCase()}`)
    .join(' ');
}

function humanizeRule(value: string): string {
  const [prefix, suffix] = value.split(':', 2);
  if (suffix && prefix.includes('REQUIRED_DOCUMENT_MISSING')) return `Missing: ${humanize(suffix)}`;
  if (suffix && prefix.includes('DISCOUNT_EVIDENCE_MISSING')) return `Missing evidence: ${humanize(suffix)}`;
  return suffix ? `${humanize(prefix)} · ${humanize(suffix)}` : humanize(value);
}

function Metric({ label, value, detail, attention = false }: { label: string; value: string; detail: string; attention?: boolean }) {
  return (
    <article className={`analytics-insight-card${attention ? ' analytics-insight-card--attention' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function DetailTable({ title = 'View underlying detail', headers, rows }: { title?: string; headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <details className="analytics-detail">
      <summary>{title}</summary>
      <div className="analytics-detail__body">
        <div className="data-table-wrap analytics-table-wrap">
          <table className="data-table">
            <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

export default function AnalyticsBusinessReportViews({ payload }: { payload: AnalyticsBusinessReportPayload }) {
  switch (payload.kind) {
    case 'sales-product': {
      const { by_model_variant: models, by_colour: colours, by_outlet: outlets } = payload.data;
      const booked = models.reduce((sum, row) => sum + row.journey_count, 0);
      const delivered = models.reduce((sum, row) => sum + row.actual_deliveries, 0);
      const modelRows = models.slice(0, 12).map((row) => ({
        label: `${humanize(row.model_name)} · ${humanize(row.variant_name)}`,
        value: row.journey_count,
      }));
      const colourRows = colours.slice(0, 10).map((row) => ({
        label: humanize(row.colour_name),
        value: row.journey_count,
      }));
      return (
        <>
          <div className="analytics-insurance-banner">
            <Metric label="Booked vehicle journeys" value={formatNumber(booked)} detail="Journeys with a captured booking row" />
            <Metric label="Actual deliveries" value={formatNumber(delivered)} detail="Booked journeys with an actual delivery timestamp" />
            <Metric label="Model and variant combinations" value={formatNumber(models.length)} detail="Distinct captured combinations in this snapshot" />
            <Metric label="Active sales outlets" value={formatNumber(outlets.filter((row) => row.journey_count > 0).length)} detail="Outlets with at least one captured booking" />
          </div>

          <div className="analytics-split analytics-split--insurance">
            <SectionCard title="Vehicle Sales by Model and Variant" description="Booked journeys ranked by captured model and variant. This identifies the highest-volume vehicle combinations in the current snapshot.">
              <AnalyticsBarChart rows={modelRows} valueLabel="Booked vehicles" />
            </SectionCard>
            <SectionCard title="Vehicle Colour Mix" description="Booked journeys by captured vehicle colour. Colour labels are taken from the journey product snapshot.">
              <AnalyticsBarChart rows={colourRows} valueLabel="Booked vehicles" />
            </SectionCard>
          </div>

          <DetailTable
            headers={['Dealer', 'Outlet', 'Booked Vehicles', 'Actual Deliveries', 'Delivery Rate']}
            rows={outlets.map((row) => [
              row.dealer_name,
              row.outlet_name,
              formatNumber(row.journey_count),
              formatNumber(row.actual_deliveries),
              formatPercent(row.journey_count ? row.actual_deliveries * 100 / row.journey_count : null),
            ])}
          />
        </>
      );
    }

    case 'finance': {
      const { summary, by_lender: lenders, by_lender_outlet: lendersByOutlet, by_outlet: outlets, definition } = payload.data;
      const lenderRows = lenders.map((row) => ({
        label: `${humanize(row.lender_name)} · ${humanize(row.finance_type)}`,
        value: numeric(row.loan_amount),
      }));
      return (
        <>
          <div className="analytics-insurance-banner">
            <Metric label="Finance record rate" value={formatPercent(summary.finance_record_attach_pct == null ? null : numeric(summary.finance_record_attach_pct))} detail={`${formatNumber(summary.financed_journeys)} of ${formatNumber(summary.booked_journeys)} booked journeys have a finance record; not an approval rate`} />
            <Metric label="High-confidence loan amount" value={formatMoney(summary.high_confidence_loan_amount)} detail={`${formatNumber(summary.high_confidence_loan_records)} records with a high-confidence disbursement amount`} />
            <Metric label="Medium-confidence amount" value={formatMoney(summary.medium_confidence_loan_amount)} detail={`${formatNumber(summary.medium_confidence_loan_records)} amounts without verified lender attribution`} />
            <Metric label="Loan amount coverage" value={formatPercent(summary.loan_amount_capture_pct)} detail={`${formatNumber(summary.high_confidence_loan_records + summary.medium_confidence_loan_records)} amount records of ${formatNumber(summary.finance_record_count)} finance records`} />
          </div>

          <SectionCard title="High-confidence loan amount by lender" description="Bank/NBFC attribution and totals use only high-confidence disbursement matches. Medium-confidence totals remain separate and are not assigned to a lender.">
            <AnalyticsBarChart rows={lenderRows} valueLabel="Matched loan disbursement" valueKind="currency" />
          </SectionCard>

          <DetailTable
            title="View finance attach and amount by dealership / outlet"
            headers={['Dealer', 'Outlet', 'Booked Journeys', 'Finance Records', 'Record Rate', 'High-confidence Amount', 'Medium-confidence Amount']}
            rows={outlets.map((row) => [
              row.dealer_name,
              row.outlet_name,
              formatNumber(row.booked_journeys),
              formatNumber(row.financed_journeys),
              formatPercent(row.finance_record_attach_pct),
              formatMoney(row.high_confidence_loan_amount),
              formatMoney(row.medium_confidence_loan_amount),
            ])}
          />

          <DetailTable
            title="View lender, confidence, and amount by dealership / outlet"
            headers={['Dealer', 'Outlet', 'Lender', 'Confidence', 'Finance Records', 'Journeys', 'Loan Amount']}
            rows={lendersByOutlet.map((row) => [
              row.dealer_name,
              row.outlet_name,
              humanize(row.lender_name),
              humanize(row.confidence),
              formatNumber(row.finance_record_count),
              formatNumber(row.financed_journeys),
              formatMoney(row.loan_amount),
            ])}
          />
          <p className="analytics-footnote">{definition}</p>
        </>
      );
    }

    case 'insurance': {
      const { summary, by_insurer: insurers, by_source: sources, by_outlet: outlets, add_ons: addOns, definition } = payload.data;
      const sourceRows = sources.map((row) => ({ label: humanize(row.insurance_by), value: row.policy_count }));
      const insurerRows = insurers.map((row) => ({ label: humanize(row.insurer_name), value: numeric(row.premium_amount) }));
      const addOnRows = addOns.map((row) => ({ label: humanize(row.add_on_name), value: Number(row.policy_attach_pct || 0) }));
      return (
        <>
          <div className="analytics-insurance-banner">
            <Metric label="Insurance record rate" value={formatPercent(summary.insurance_record_rate_pct)} detail={`${formatNumber(summary.insurance_journeys)} of ${formatNumber(summary.booked_journeys)} booked journeys have a policy record`} />
            <Metric label="Captured premium" value={formatMoney(summary.premium_amount)} detail={`${formatNumber(summary.premium_populated)} of ${formatNumber(summary.insurance_journeys)} policy records have a premium value (${percent(summary.premium_populated, summary.insurance_journeys)})`} />
            <Metric label="Average premium" value={summary.avg_premium == null ? 'Unavailable' : formatMoney(summary.avg_premium)} detail="Average across policies where premium is populated" />
            <Metric label="Insurance source unclassified" value={formatNumber(summary.source_unknown_journeys)} detail={`of ${formatNumber(summary.insurance_journeys)} policy records lack a recognized source or explicit self-insurance flag`} attention={summary.source_unknown_journeys > 0} />
          </div>

          <div className="analytics-split analytics-split--insurance">
            <SectionCard title="Recorded Insurance Route" description="Counts by the raw insurance_by label captured in the source. This field is not standardized to in-house versus self/external.">
              <AnalyticsBarChart rows={sourceRows} valueLabel="Policy records" />
            </SectionCard>
            <SectionCard title="Captured Premium by Insurer" description="Premium totals include only populated premium fields. Use the policy counts in the detail table to assess coverage.">
              <AnalyticsBarChart rows={insurerRows} valueLabel="Captured premium" valueKind="currency" />
            </SectionCard>
          </div>

          <DetailTable
            title="View insurance records and premium by dealership / outlet"
            headers={['Dealer', 'Outlet', 'Booked Journeys', 'Policy Records', 'Source Missing', 'Premium Values', 'Captured Premium', 'Average Premium']}
            rows={outlets.map((row) => [
              row.dealer_name,
              row.outlet_name,
              formatNumber(row.booked_journeys),
              formatNumber(row.insurance_journeys),
              formatNumber(row.source_unknown_journeys),
              formatNumber(row.premium_populated),
              formatMoney(row.premium_amount),
              row.avg_premium == null ? 'Unavailable' : formatMoney(row.avg_premium),
            ])}
          />

          <SectionCard title="Insurance Add-on Penetration" description="Attach rate by named insurance benefit extracted from policy evidence. These are policy add-ons, separate from the vehicle accessory and VAS category report.">
            <AnalyticsBarChart rows={addOnRows} valueLabel="Share of insured policies" valueKind="percent" />
          </SectionCard>
          <p className="analytics-footnote">{definition}</p>
        </>
      );
    }

    case 'addons': {
      const { journeys, by_type: byType, by_outlet: byOutlet, by_model_outlet: byModelOutlet, definition } = payload.data;
      const totalValue = byType.reduce((sum, row) => sum + numeric(row.actual_amount), 0);
      const totalAttachedJourneys = byType.reduce((sum, row) => sum + row.journey_count, 0);
      const typeRows = byType.map((row) => ({
        label: humanize(row.addon_type),
        bar: numeric(row.actual_amount),
        line: Number(row.penetration_pct || 0),
      }));
      return (
        <>
          <div className="analytics-product-summary">
            <article className="analytics-hero-stat">
              <span className="analytics-hero-stat__eyebrow">VAS captured value</span>
              <strong className="analytics-hero-stat__value">{formatMoney(totalValue)}</strong>
              <h3>Accessories and VAS category value</h3>
              <p>{formatNumber(journeys)} booked journeys · {formatNumber(totalAttachedJourneys)} category-level journey attachments. Individual accessory SKU names and quantities are not present in this snapshot.</p>
            </article>
            <Metric label="Captured VAS categories" value={formatNumber(byType.length)} detail="Normalized add-on types represented in the current snapshot" />
          </div>

          <SectionCard title="VAS Penetration vs Captured Value" description="Bars show captured value; the line shows penetration across booked journeys. This separates high-value categories from high-attachment categories.">
            <AnalyticsComboChart rows={typeRows} barLabel="Captured value" lineLabel="Penetration" barKind="currency" lineKind="percent" />
          </SectionCard>

          <DetailTable
            title="View outlet and product category detail"
            headers={['Dealer', 'Outlet', 'Product', 'Journeys', 'Captured Value']}
            rows={byOutlet.map((row) => [row.dealer_name, row.outlet_name, humanize(row.addon_type), formatNumber(row.journey_count), formatMoney(row.actual_amount)])}
          />

          <DetailTable
            title="View accessory value by model and dealership / outlet"
            headers={['Dealer', 'Outlet', 'Model label', 'Variant label', 'Booked Journeys', 'Accessory Attachments', 'Attachment Rate', 'Captured Value']}
            rows={byModelOutlet.map((row) => [
              row.dealer_name,
              row.outlet_name,
              row.model_name,
              row.variant_name,
              formatNumber(row.booked_journeys),
              formatNumber(row.attached_journeys),
              formatPercent(row.penetration_pct),
              formatMoney(row.actual_amount),
            ])}
          />
          <p className="analytics-footnote">{definition}</p>
        </>
      );
    }

    case 'payments': {
      const { summary, by_channel: channels, by_outlet: outlets, definition } = payload.data;
      const channelRows = channels.map((row) => ({
        label: humanize(row.channel),
        value: numeric(row.recorded_receipt_amount),
      }));
      return (
        <>
          <div className="analytics-insurance-banner">
            <Metric label="Recorded receipt amount" value={formatMoney(summary.recorded_receipt_amount)} detail={`${formatNumber(summary.payment_entry_count)} payment entries`} />
            <Metric label="Journeys with receipt entries" value={formatNumber(summary.journeys_with_payment_entries)} detail="Distinct booked journeys with at least one payment record" />
            <Metric label="Status coverage" value={formatPercent(summary.status_coverage_pct)} detail={`${formatNumber(summary.status_coded_entries)} of ${formatNumber(summary.payment_entry_count)} entries have a status code`} attention={summary.status_coverage_pct === 0} />
            <Metric label="Channels captured" value={formatNumber(summary.channel_count)} detail={`${formatNumber(summary.unmapped_entries)} entries remain in Other / Unmapped`} />
          </div>

          <SectionCard title="Recorded receipt amount by channel" description="Known payment aliases are grouped into channel categories. Values are recorded receipt amounts, not settled collections, because current status coverage is incomplete.">
            <AnalyticsBarChart rows={channelRows} valueLabel="Recorded receipt amount" valueKind="currency" />
          </SectionCard>

          <DetailTable
            title="View payment channel activity by dealership / outlet"
            headers={['Dealer', 'Outlet', 'Channel', 'Entries', 'Journeys', 'Recorded Amount', 'Status-Coded Entries']}
            rows={outlets.map((row) => [
              row.dealer_name,
              row.outlet_name,
              humanize(row.channel),
              formatNumber(row.payment_entry_count),
              formatNumber(row.journey_count),
              formatMoney(row.recorded_receipt_amount),
              formatNumber(row.status_coded_entries),
            ])}
          />
          <p className="analytics-footnote">{definition}</p>
        </>
      );
    }

    case 'geography': {
      const { coverage, quality, rows, privacy } = payload.data;
      const pinTotals = new Map<string, number>();
      rows.forEach((row) => pinTotals.set(row.customer_pincode, (pinTotals.get(row.customer_pincode) || 0) + row.journey_count));
      const topPins = Array.from(pinTotals.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
        .slice(0, 12);
      const leadingPin = topPins[0];
      return (
        <>
          <div className="analytics-insurance-banner">
            <Metric label="Pincode coverage" value={formatPercent(coverage.coverage_pct)} detail={`${formatNumber(coverage.available)} of ${formatNumber(coverage.total)} booked journeys have an explicit PIN field`} />
            <Metric label="Reviewed PIN records" value={formatNumber(quality.reviewed_journeys)} detail={`${formatPercent(quality.reviewed_pct_of_pincode_records)} of PIN-bearing journeys have a review timestamp`} />
            <Metric label="Provisional PIN records" value={formatNumber(quality.provisional_journeys)} detail="Document-extracted values not yet reviewed in Audit Core" attention={quality.provisional_journeys > 0} />
            <Metric label="Highest-volume PIN" value={leadingPin?.label || 'Unavailable'} detail={leadingPin ? `${formatNumber(leadingPin.value)} booked journeys in this snapshot` : 'No pincode data available'} />
          </div>

          <SectionCard title="Booked journeys by customer PIN" description="Top PINs ranked by captured booked journeys. Use the distribution to understand where sales are coming from; PINs are provisional until reviewed.">
            <AnalyticsBarChart rows={topPins} valueLabel="Booked journeys" emptyText="No reviewed or extracted customer PINs are available in this snapshot." />
          </SectionCard>

          <DetailTable
            title="View PIN sales by dealer, outlet, and captured model"
            headers={['Customer PIN', 'Dealer', 'Outlet', 'Model label', 'Booked Journeys', 'Deliveries', 'Finance Records', 'Insurance Records', 'Accessory Records']}
            rows={rows.slice(0, 100).map((row) => [
              row.customer_pincode,
              row.dealer_name,
              row.outlet_name,
              row.model_name,
              formatNumber(row.journey_count),
              formatNumber(row.actual_deliveries),
              formatNumber(row.finance_journeys),
              formatNumber(row.insurance_journeys),
              formatNumber(row.accessory_journeys),
            ])}
          />
          <p className="analytics-footnote">{quality.source_note} {privacy}</p>
        </>
      );
    }

    case 'discounts': {
      const pricing: PricingIntegrityReport = payload.data.pricing_integrity;
      const summary = pricing.summary;
      const keyRows = pricing.by_discount_key
        .filter((row) => numeric(row.known_excess_discount_amount) > 0)
        .map((row) => ({ label: humanize(row.discount_key), value: numeric(row.known_excess_discount_amount) }));
      return (
        <>
          <div className="analytics-insurance-banner">
            <Metric label="Active pricing cases" value={formatNumber(summary.journeys_with_pricing_exceptions)} detail="Distinct journeys with an open or acknowledged Audit Core pricing finding" attention={summary.journeys_with_pricing_exceptions > 0} />
            <Metric label="Active invoice conflicts" value={formatNumber(summary.invoice_conflict_journeys)} detail="Open or acknowledged commercial price and discount disagreements across captured invoices" attention={summary.invoice_conflict_journeys > 0} />
            <Metric label="Known discount overage" value={formatMoney(summary.known_excess_discount_amount)} detail={`${formatNumber(summary.known_excess_discount_journeys)} journeys · ${formatNumber(summary.known_excess_application_count)} applications above entitlement`} attention={numeric(summary.known_excess_discount_amount) > 0} />
            <Metric label="Unknown entitlements" value={formatNumber(summary.unknown_entitlement_application_count)} detail="Applications excluded because the offered entitlement could not be attributed" attention={summary.unknown_entitlement_application_count > 0} />
            <Metric label="Comparable price line coverage" value={formatPercent(summary.comparable_price_line_coverage_pct)} detail={`${formatNumber(summary.comparable_price_line_count)} of ${formatNumber(summary.standard_price_line_count)} standard-priced commercial lines have an actual amount`} />
          </div>

          <SectionCard title="Known Excess by Discount Category" description="Per-application overage above the captured entitlement. Unused entitlement in another category never offsets an exception; applications with unknown entitlement are omitted.">
            <AnalyticsBarChart rows={keyRows} valueLabel="Known excess discount" valueKind="currency" />
          </SectionCard>

          <DetailTable
            title="View outlet pricing exception concentration"
            headers={['Dealer', 'Outlet', 'Price Variance Journeys', 'Discount Exception Journeys', 'Invoice Conflict Journeys', 'Known Excess', 'Unknown Applications']}
            rows={pricing.by_outlet.map((row) => [row.dealer_name, row.outlet_name, formatNumber(row.price_exception_journeys), formatNumber(row.discount_exception_journeys), formatNumber(row.invoice_conflict_journeys), formatMoney(row.known_excess_discount_amount), formatNumber(row.unknown_discount_applications)])}
          />

          <DetailTable
            title="View active Audit Core pricing findings"
            headers={['Journey Reference', 'Dealer', 'Outlet', 'Model / Variant', 'Finding', 'Audit Core detail', 'Severity', 'Status']}
            rows={pricing.exceptions.map((row) => [row.journey_reference || row.journey_id, row.dealer_name, row.outlet_name, `${humanize(row.model_name)} / ${humanize(row.variant_name)}`, row.title || humanize(row.rule_key), row.description, humanize(row.severity), humanize(row.finding_status)])}
          />

          <p className="analytics-footnote">
            {pricing.definitions.exception_status} Known overage summarizes captured applications; current unresolved status is shown in the finding list. Invoice and booking line counts describe evidence coverage, not complete-deal invoice coverage.
          </p>
        </>
      );
    }

    case 'turnaround': {
      const { summary, by_outlet: byOutlet, by_model: byModel, definition } = payload.data;
      const outletRows = byOutlet.map((row) => ({ label: `${row.dealer_name} · ${row.outlet_name}`, value: numeric(row.avg_days) }));
      const modelRows = byModel.map((row) => ({ label: humanize(row.model_name), value: numeric(row.avg_days) }));
      const available = summary.booking_delivery_pairs > 0;
      return (
        <>
          {!available ? (
            <SectionCard title="Booking-to-delivery TAT is not yet available" description={definition}>
              <div className="analytics-empty-copy">
                There are currently {formatNumber(summary.booking_delivery_pairs)} journeys with both a booking date and populated actual delivery timestamp. Analytics therefore does not display a zero-day TAT or fabricate a delivery trend. As actual delivery dates populate, average, median, P75 and P90 will appear automatically.
              </div>
            </SectionCard>
          ) : (
            <div className="analytics-insurance-banner">
              <Metric label="Average booking → delivery" value={formatDays(summary.avg_booking_to_delivery_days)} detail={`${formatNumber(summary.booking_delivery_pairs)} completed booking-delivery pairs`} />
              <Metric label="Median" value={formatDays(summary.median_booking_to_delivery_days)} detail="Typical customer delivery cycle" />
              <Metric label="P75" value={formatDays(summary.p75_booking_to_delivery_days)} detail="75% of completed journeys are at or below this TAT" />
              <Metric label="P90" value={formatDays(summary.p90_booking_to_delivery_days)} detail="Tail delivery performance" />
            </div>
          )}

          <div className="analytics-insurance-banner">
            <Metric label="Booking → allocation" value={summary.booking_allocation_pairs ? formatDays(summary.avg_booking_to_allocation_days) : 'Unavailable'} detail={`${formatNumber(summary.booking_allocation_pairs)} journeys have both dates`} />
            <Metric label="On-time delivery" value={formatPercent(summary.on_time_delivery_pct)} detail={`${formatNumber(summary.on_time_deliveries)} of ${formatNumber(summary.planned_actual_pairs)} planned-vs-actual pairs`} />
          </div>

          {available ? (
            <div className="analytics-split analytics-split--wide-left">
              <SectionCard title="Delivery TAT by Outlet" description="Average business delivery cycle from booking to actual delivery.">
                <AnalyticsBarChart rows={outletRows} valueLabel="Average days" valueKind="days" />
              </SectionCard>
              <SectionCard title="Delivery TAT by Model" description="Which vehicle models take longer from booking to customer delivery.">
                <AnalyticsBarChart rows={modelRows} valueLabel="Average days" valueKind="days" />
              </SectionCard>
            </div>
          ) : null}
        </>
      );
    }

    case 'findings': {
      const { by_outlet: byOutlet, by_model: byModel, top_rules: topRules, commercial_value_note: commercialNote } = payload.data;
      const journeys = byOutlet.reduce((sum, row) => sum + row.journeys, 0);
      const affected = byOutlet.reduce((sum, row) => sum + row.journeys_with_findings, 0);
      const findings = byOutlet.reduce((sum, row) => sum + row.finding_count, 0);
      const high = byOutlet.reduce((sum, row) => sum + row.high_finding_count, 0);
      const open = byOutlet.reduce((sum, row) => sum + row.open_finding_count, 0);
      const discountValue = byOutlet.reduce((sum, row) => sum + numeric(row.discount_value_on_affected_journeys), 0);
      const paymentValue = byOutlet.reduce((sum, row) => sum + numeric(row.payment_value_on_affected_journeys), 0);
      const outletRows = byOutlet.map((row) => ({
        label: `${row.dealer_name} · ${row.outlet_name}`,
        x: row.journeys,
        y: Number(row.journeys_with_findings_pct || 0),
        size: Math.max(row.finding_count, 1),
      }));
      const modelRows = byModel.map((row) => ({ label: humanize(row.model_name), value: Number(row.journeys_with_findings_pct || 0) }));
      const ruleRows = topRules.map((row) => ({ label: humanizeRule(row.rule_key), value: row.finding_count }));
      return (
        <>
          <div className="analytics-insurance-banner">
            <Metric label="Journeys with compliance findings" value={journeys ? `${((affected / journeys) * 100).toFixed(1)}%` : 'Unavailable'} detail={`${formatNumber(affected)} of ${formatNumber(journeys)} journeys · ${formatNumber(findings)} findings`} attention={affected > 0} />
            <Metric label="High severity" value={formatNumber(high)} detail={`${formatNumber(open)} open findings across outlets`} attention={high > 0} />
            <Metric label="Discount value on affected journeys" value={formatMoney(discountValue)} detail="Associated commercial value, not automatically proven leakage" />
            <Metric label="Payment value on affected journeys" value={formatMoney(paymentValue)} detail="Associated commercial value, not automatically proven loss" />
          </div>

          <SectionCard title="Outlet Compliance Pressure" description="Outlet journey volume versus share of journeys carrying findings. Bubble size reflects total finding count.">
            <AnalyticsBubbleChart rows={outletRows} xLabel="Journeys" yLabel="Journeys with findings" yKind="percent" />
          </SectionCard>

          <div className="analytics-split analytics-split--wide-left">
            <SectionCard title="Finding Concentration by Rule" description="Rules driving the largest volume of compliance findings.">
              <AnalyticsParetoChart rows={ruleRows} valueLabel="Findings" />
            </SectionCard>
            <SectionCard title="Compliance Rate by Model" description="Share of journeys with findings for each captured vehicle model.">
              <AnalyticsBarChart rows={modelRows} valueLabel="Journeys with findings" valueKind="percent" />
            </SectionCard>
          </div>

          <SectionCard title="Commercial Exposure Context" description={commercialNote}>
            <p className="analytics-empty-copy">The values above identify where commercial amounts and compliance failures coexist. A value is only labelled leakage/loss when a rule-specific calculation establishes that causal amount.</p>
          </SectionCard>

          <DetailTable
            headers={['Rule', 'Severity', 'Status', 'Findings', 'Journeys']}
            rows={topRules.map((row) => [humanizeRule(row.rule_key), humanize(row.severity), humanize(row.finding_status), formatNumber(row.finding_count), formatNumber(row.journey_count)])}
          />
        </>
      );
    }
  }
}
