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

function formatOptionalNumber(value: NumericValue | null | undefined): string {
  return value == null || value === '' ? 'Unavailable' : formatNumber(numeric(value));
}

function formatOptionalMoney(value: NumericValue | null | undefined): string {
  return value == null || value === '' ? 'Unavailable' : formatMoney(value);
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

function DetailTable({ title = 'View underlying detail', headers, rows, defaultOpen = false }: {
  title?: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  defaultOpen?: boolean;
}) {
  return (
    <details className="analytics-detail" open={defaultOpen}>
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
      const {
        by_model_variant: models,
        by_dealer_model_variant: dealerModels,
        by_colour: colours,
        by_outlet: outlets,
        model_variant_coverage: coverage,
      } = payload.data;
      const booked = coverage.booked_journeys;
      const delivered = models.reduce((sum, row) => sum + row.actual_deliveries, 0);
      const modelRows = models.slice(0, 12).map((row) => ({
        label: `${row.model_name} · ${row.variant_name}`,
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
            <Metric label="Dealerships with bookings" value={formatNumber(new Set(outlets.filter((row) => row.journey_count > 0).map((row) => row.dealer_name)).size)} detail="Separate dealer names in the selected project" />
            <Metric label="Catalogue-mapped vehicles" value={`${formatNumber(coverage.catalogue_mapped_journeys)} / ${formatNumber(booked)}`} detail={`${formatNumber(coverage.unresolved_journeys)} booked journeys still lack a model or variant label`} attention={coverage.unresolved_journeys > 0} />
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
            title="Vehicle units by dealership, outlet, model and variant"
            defaultOpen
            headers={['Dealer', 'Outlet', 'Model', 'Variant', 'Booked Cars', 'Delivered Cars']}
            rows={dealerModels.map((row) => [
              row.dealer_name,
              row.outlet_name,
              row.model_name,
              row.variant_name,
              formatNumber(row.booked_units),
              formatNumber(row.delivered_units),
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
      const { summary, by_insurer: insurers, by_route: routes, by_outlet: outlets, add_ons: addOns, definition } = payload.data;
      const routeLabel = (route: string) => ({
        DEALER_ARRANGED: 'Dealer arranged',
        CUSTOMER_ARRANGED: 'Customer arranged / outside',
        MIXED_OR_UNCLEAR: 'Mixed or unclear',
        UNSPECIFIED: 'Unspecified',
      }[route] || humanize(route));
      const sourceRows = routes.map((row) => ({ label: routeLabel(row.route), value: row.policy_count }));
      const insurerRows = insurers.map((row) => ({ label: humanize(row.insurer_name), value: numeric(row.premium_amount) }));
      return (
        <>
          <div className="analytics-insurance-banner">
            <Metric label="Insurance record rate" value={formatPercent(summary.insurance_record_rate_pct)} detail={`${formatNumber(summary.insurance_journeys)} of ${formatNumber(summary.booked_journeys)} booked journeys have a policy record`} />
            <Metric label="Dealer arranged" value={formatNumber(summary.dealer_arranged_journeys)} detail={`${percent(summary.dealer_arranged_journeys, summary.insurance_journeys)} of policy records, based on explicit dealer labels`} />
            <Metric label="Customer arranged / outside" value={formatNumber(summary.customer_arranged_journeys)} detail={`${percent(summary.customer_arranged_journeys, summary.insurance_journeys)} of policy records, based on explicit customer or own labels`} />
            <Metric label="Route unclear or missing" value={formatNumber(summary.source_ambiguous_journeys + summary.source_unknown_journeys)} detail={`${formatNumber(summary.source_ambiguous_journeys)} mixed · ${formatNumber(summary.source_unknown_journeys)} unspecified; excluded from dealer/outside totals`} attention={summary.source_ambiguous_journeys + summary.source_unknown_journeys > 0} />
            <Metric label="Captured premium" value={formatMoney(summary.premium_amount)} detail={`${formatNumber(summary.premium_populated)} of ${formatNumber(summary.insurance_journeys)} policy records have a premium value (${percent(summary.premium_populated, summary.insurance_journeys)})`} />
          </div>

          <div className="analytics-split analytics-split--insurance">
            <SectionCard title="Insurance arranged by" description="Dealer and customer/outside counts use explicit insurance source or insurance-by labels. Mixed or missing records remain visible as unclear.">
              <AnalyticsBarChart rows={sourceRows} valueLabel="Policy records" />
            </SectionCard>
            <SectionCard title="Captured premium by insurer" description="Premium totals include only populated premium fields. The premium is not assumed to be dealership revenue.">
              <AnalyticsBarChart rows={insurerRows} valueLabel="Captured premium" valueKind="currency" />
            </SectionCard>
          </div>

          <DetailTable
            title="Insurance route and premium coverage by dealership / outlet"
            defaultOpen
            headers={['Dealer', 'Outlet', 'Booked Journeys', 'Policy Records', 'Dealer Arranged', 'Customer / Outside', 'Mixed', 'Unspecified', 'Premium Values', 'Captured Premium']}
            rows={outlets.map((row) => [
              row.dealer_name,
              row.outlet_name,
              formatNumber(row.booked_journeys),
              formatNumber(row.insurance_journeys),
              formatNumber(row.dealer_arranged_journeys),
              formatNumber(row.customer_arranged_journeys),
              formatNumber(row.source_ambiguous_journeys),
              formatNumber(row.source_unknown_journeys),
              formatNumber(row.premium_populated),
              formatMoney(row.premium_amount),
            ])}
          />

          <DetailTable
            title="Insurance components captured from policy evidence"
            defaultOpen
            headers={['Insurance Component', 'Policy Count', 'Share of Policy Records', 'Source Terms']}
            rows={addOns.map((row) => [
              row.add_on_name,
              formatNumber(row.policy_count),
              formatPercent(row.policy_attach_pct),
              row.raw_terms.join(' · '),
            ])}
          />
          <p className="analytics-footnote">{definition}</p>
        </>
      );
    }

    case 'addons': {
      const {
        journeys,
        by_type: byType,
        by_product_type: byProductType,
        accessory_cost_by_product: accessoryCosts,
        accessory_items: accessoryItems,
        accessory_line_coverage: accessoryLineCoverage,
        definition,
      } = payload.data;
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
              <h3>Journey add-on category value</h3>
              <p>{formatNumber(journeys)} booked journeys · {formatNumber(totalAttachedJourneys)} category attachments. This is a different source measure from the itemized invoice sales below.</p>
            </article>
            <Metric label="Accessory tax invoices" value={formatNumber(accessoryLineCoverage.confirmed_tax_invoices)} detail={`${formatNumber(accessoryLineCoverage.confirmed_tax_invoice_lines)} confirmed invoice item lines`} />
            <Metric label="Items with a label or code" value={`${formatNumber(accessoryLineCoverage.confirmed_lines_with_item_label)} / ${formatNumber(accessoryLineCoverage.confirmed_tax_invoice_lines)}`} detail="Confirmed accessory tax invoice lines with a usable item description or item code" attention={accessoryLineCoverage.confirmed_lines_with_item_label < accessoryLineCoverage.confirmed_tax_invoice_lines} />
            <Metric label="Proforma / unclassified lines" value={formatNumber(accessoryLineCoverage.proforma_lines + accessoryLineCoverage.unclassified_lines)} detail="Shown in source coverage only; excluded from sold-item totals" attention={accessoryLineCoverage.proforma_lines + accessoryLineCoverage.unclassified_lines > 0} />
            <Metric label="Duplicate source copies removed" value={formatNumber(accessoryLineCoverage.duplicate_source_documents)} detail={`Collapsed into ${formatNumber(accessoryLineCoverage.duplicate_invoice_groups)} invoice identities before sales totals`} />
          </div>

          <SectionCard title="VAS Penetration vs Captured Value" description="Bars show captured value; the line shows penetration across booked journeys. This separates high-value categories from high-attachment categories.">
            <AnalyticsComboChart rows={typeRows} barLabel="Captured value" lineLabel="Penetration" barKind="currency" lineKind="percent" />
          </SectionCard>

          <DetailTable
            title="VAS category attachments by dealership, model and variant"
            defaultOpen
            headers={['Dealer', 'Outlet', 'Model', 'Variant', 'Captured Category', 'Journeys', 'Priced Records', 'Captured Value']}
            rows={byProductType.map((row) => [
              row.dealer_name,
              row.outlet_name,
              row.model_name,
              row.variant_name,
              humanize(row.addon_type),
              formatNumber(row.journey_count),
              formatNumber(row.priced_records),
              formatMoney(row.actual_amount),
            ])}
          />

          {accessoryItems.length > 0 ? (
            <DetailTable
              title="Accessory items sold on tax invoices by dealership, model and variant"
              defaultOpen
              headers={['Dealer', 'Outlet', 'Model', 'Variant', 'Category', 'Accessory item', 'Item code', 'Invoice source', 'Invoices', 'Lines', 'Qty invoiced', 'Net sales', 'Lines with amount']}
              rows={accessoryItems.map((row) => [
                row.dealer_name,
                row.outlet_name,
                row.model_name,
                row.variant_name,
                humanize(row.line_category),
                row.item_description,
                row.item_code || 'Unavailable',
                row.invoice_sources || 'Unspecified',
                formatNumber(row.invoice_count),
                formatNumber(row.invoice_lines),
                formatOptionalNumber(row.invoiced_quantity),
                formatOptionalMoney(row.net_amount),
                formatNumber(row.lines_with_net_amount),
              ])}
            />
          ) : (
            <SectionCard title="Accessory invoice items" description="No confirmed accessory tax-invoice lines were captured for this project in the current snapshot." />
          )}

          <DetailTable
            title="Accessory pricing audit: comparable standard versus actual charges"
            defaultOpen
            headers={['Dealer', 'Outlet', 'Model', 'Variant', 'Evidence Rows', 'Comparable Rows', 'Comparable Standard', 'Comparable Actual', 'Actual − Standard']}
            rows={accessoryCosts.map((row) => [
              row.dealer_name,
              row.outlet_name,
              row.model_name,
              row.variant_name,
              formatNumber(row.evidence_rows),
              formatNumber(row.comparable_rows),
              formatOptionalMoney(row.comparable_standard_amount),
              formatOptionalMoney(row.comparable_actual_amount),
              formatOptionalMoney(row.comparable_actual_minus_standard),
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
      const { summary: discountSummary, by_dealer_model_variant: discountsByProduct } = payload.data;
      const pricing: PricingIntegrityReport = payload.data.pricing_integrity;
      const summary = pricing.summary;
      const keyRows = pricing.by_discount_key
        .filter((row) => numeric(row.known_excess_discount_amount) > 0)
        .map((row) => ({ label: humanize(row.discount_key), value: numeric(row.known_excess_discount_amount) }));
      return (
        <>
          <div className="analytics-insurance-banner">
            <Metric label="Recorded discounts" value={formatMoney(discountSummary.total_actual_discount)} detail={`${formatNumber(discountSummary.journeys_with_actual_discount)} booked journeys with a captured actual discount`} />
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
            title="Discounts by dealership, vehicle model and variant"
            defaultOpen
            headers={['Dealer', 'Outlet', 'Model', 'Variant', 'Booked Cars', 'Cars with Discount', 'Recorded Discount', 'Average per Discounted Car', 'Known Excess', 'Excess Cars', 'Unknown Entitlement Cars']}
            rows={discountsByProduct.map((row) => [
              row.dealer_name,
              row.outlet_name,
              row.model_name,
              row.variant_name,
              formatNumber(row.booked_units),
              formatNumber(row.discounted_units),
              formatMoney(row.actual_discount_amount),
              row.avg_discount_per_discounted_unit == null ? 'Unavailable' : formatMoney(row.avg_discount_per_discounted_unit),
              formatMoney(row.known_excess_discount_amount),
              formatNumber(row.known_excess_units),
              formatNumber(row.units_with_unknown_entitlement),
            ])}
          />

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
