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
            <tbody>
              {rows.length > 0
                ? rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)
                : <tr><td className="analytics-table-empty" colSpan={headers.length}>No rows are available for this report in the selected project snapshot. Confirm the project scope shown above.</td></tr>}
          </tbody>
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
        by_outlet: outlets,
        by_month: monthlySales,
        model_variant_coverage: coverage,
      } = payload.data;
      const booked = coverage.booked_journeys;
      const delivered = models.reduce((sum, row) => sum + row.actual_deliveries, 0);
      const salesUsesDeliveries = delivered > 0;
      const salesValueLabel = salesUsesDeliveries ? 'Actual deliveries' : 'Booked cars';
      const modelRows = models
        .map((row) => ({
        label: `${row.model_name} · ${row.variant_name}`,
        value: salesUsesDeliveries ? row.actual_deliveries : row.journey_count,
      }))
        .filter((row) => row.value > 0)
        .slice(0, 12);
      const dealerSales = new Map<string, number>();
      outlets.forEach((row) => {
        const amount = salesUsesDeliveries ? row.actual_deliveries : row.journey_count;
        dealerSales.set(row.dealer_name, (dealerSales.get(row.dealer_name) || 0) + amount);
      });
      const dealerSalesRows = Array.from(dealerSales.entries())
        .map(([label, value]) => ({ label, value }))
        .filter((row) => row.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 12);
      const monthlyRows = monthlySales.map((row) => ({
        label: row.period,
        bar: row.booked_units,
        line: row.delivered_units,
      }));
      return (
        <>
          <div className="analytics-insurance-banner">
            <Metric label="Booked vehicle journeys" value={formatNumber(booked)} detail="Journeys with a captured booking row" />
            <Metric label="Actual deliveries with date" value={formatNumber(delivered)} detail="Booked journeys with an actual delivery timestamp; missing timestamps are not counted as delivered" />
            <Metric label="Model and variant combinations" value={formatNumber(models.length)} detail="Distinct captured combinations in this snapshot" />
            <Metric label="Dealerships with bookings" value={formatNumber(new Set(outlets.filter((row) => row.journey_count > 0).map((row) => row.dealer_name)).size)} detail="Separate dealer names in the selected project" />
            <Metric label="Catalogue-mapped vehicles" value={`${formatNumber(coverage.catalogue_mapped_journeys)} / ${formatNumber(booked)}`} detail={`${formatNumber(coverage.unresolved_journeys)} booked journeys still lack a model or variant label`} attention={coverage.unresolved_journeys > 0} />
          </div>

          <div className="analytics-split analytics-split--insurance">
            <SectionCard title="Vehicle sales by model and variant" description={salesUsesDeliveries ? 'Ranked by actual delivery timestamps.' : 'Ranked by booked journeys because actual delivery timestamps are not present in this project snapshot.'}>
              <AnalyticsBarChart rows={modelRows} valueLabel={salesValueLabel} emptyText="No booked or delivered vehicles are available in this snapshot." />
            </SectionCard>
            <SectionCard title="Vehicle sales by dealership" description={salesUsesDeliveries ? 'Actual deliveries grouped by dealership. The table below splits each dealership by outlet, model and variant.' : 'Booked cars grouped by dealership because actual delivery timestamps are not present.'}>
              <AnalyticsBarChart rows={dealerSalesRows} valueLabel={salesValueLabel} emptyText="No dealership sales are available in this snapshot." />
            </SectionCard>
          </div>

          <SectionCard title="Monthly bookings and deliveries" description="Bookings are grouped by booking date; deliveries are grouped by actual delivery date. A delivery series appears only when those dates are captured.">
            <AnalyticsComboChart rows={monthlyRows} barLabel="Booked cars" lineLabel="Actual deliveries" emptyText="No booking or delivery dates are available for a monthly trend." />
          </SectionCard>

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
      const {
        summary,
        by_insurer: insurers,
        by_insurer_outlet: insurersByOutlet,
        by_route: routes,
        by_outlet: outlets,
        add_ons: addOns,
        definition,
      } = payload.data;
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
            <Metric label="Route evidence coverage" value={formatPercent(summary.route_information_coverage_pct)} detail={`${formatNumber(summary.route_information_populated)} of ${formatNumber(summary.insurance_journeys)} policy records carry route or self-insurance evidence`} />
            <Metric label="Captured premium" value={formatMoney(summary.premium_amount)} detail={`${formatNumber(summary.premium_populated)} of ${formatNumber(summary.insurance_journeys)} policy records have a premium value (${percent(summary.premium_populated, summary.insurance_journeys)})`} />
            <Metric label="Premium variance vs standard" value={formatOptionalMoney(summary.premium_variance_amount)} detail={`${formatNumber(summary.premium_comparable)} policies have both actual and standard premium; positive values are above the captured standard`} attention={numeric(summary.premium_variance_amount) > 0} />
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
            headers={['Dealer', 'Outlet', 'Booked Journeys', 'Policy Records', 'Dealer Arranged', 'Customer / Outside', 'Mixed', 'Unspecified', 'Premium Values', 'Captured Premium', 'Comparable Policies', 'Standard Premium', 'Actual − Standard']}
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
              formatNumber(row.premium_comparable),
              formatOptionalMoney(row.standard_premium_amount),
              formatOptionalMoney(row.premium_variance_amount),
            ])}
          />

          <DetailTable
            title="Insurance components captured from policy evidence"
            defaultOpen
            headers={['Dealer', 'Outlet', 'Insurance Component', 'Policies', 'Share of Outlet Policies', 'Source Terms']}
            rows={addOns.map((row) => [
              row.dealer_name,
              row.outlet_name,
              row.add_on_name,
              formatNumber(row.policy_count),
              formatPercent(row.policy_attach_pct),
              row.raw_terms.join(' · '),
            ])}
          />

          <DetailTable
            title="Insurer and captured premium by dealership / outlet"
            headers={['Dealer', 'Outlet', 'Insurer', 'Policies', 'Premium Values', 'Average Premium', 'Captured Premium']}
            rows={insurersByOutlet.map((row) => [
              row.dealer_name,
              row.outlet_name,
              humanize(row.insurer_name),
              formatNumber(row.policy_count),
              formatNumber(row.premium_populated),
              formatOptionalMoney(row.avg_premium),
              formatMoney(row.premium_amount),
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
      const itemGroups = new Map<string, {
        label: string;
        itemCode: string | null;
        quantity: number;
        quantityLines: number;
        netAmount: number;
        netAmountLines: number;
      }>();
      accessoryItems.forEach((row) => {
        const itemCode = row.item_code?.trim() || null;
        const itemDescription = row.item_description?.trim() || 'Unlabeled accessory item';
        const itemKey = itemCode
          ? 'code:' + itemCode.toUpperCase()
          : 'description:' + itemDescription.toLowerCase();
        const current = itemGroups.get(itemKey) || {
          label: itemDescription,
          itemCode,
          quantity: 0,
          quantityLines: 0,
          netAmount: 0,
          netAmountLines: 0,
        };
        current.quantity += numeric(row.invoiced_quantity);
        current.quantityLines += row.lines_with_quantity;
        current.netAmount += numeric(row.net_amount);
        current.netAmountLines += row.lines_with_net_amount;
        if (current.label === 'Unlabeled accessory item' && itemDescription !== current.label) {
          current.label = itemDescription;
        }
        itemGroups.set(itemKey, current);
      });
      const itemGroupsSorted = Array.from(itemGroups.values());
      const accessoryRankingUsesQuantity = itemGroupsSorted.some((row) => row.quantityLines > 0);
      const accessoryItemRanking = itemGroupsSorted
        .map((row) => ({
          label: row.label + (row.itemCode ? ' · ' + row.itemCode : ''),
          value: accessoryRankingUsesQuantity ? row.quantity : row.netAmount,
        }))
        .filter((row) => row.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 12);
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

          <div className="analytics-split analytics-split--overview">
            <SectionCard title="VAS category value and attach" description="Journey add-on category amounts and their share of booked journeys. This is not an itemized accessory invoice sales figure.">
              <AnalyticsComboChart rows={typeRows} barLabel="Captured category value" lineLabel="Journey attach" barKind="currency" lineKind="percent" />
            </SectionCard>
            <SectionCard
              title={accessoryRankingUsesQuantity ? 'Top accessory items by invoiced quantity' : 'Top accessory items by captured net sales'}
              description={accessoryRankingUsesQuantity
                ? 'Confirmed tax-invoice accessory items ranked by the invoiced quantities captured in the snapshot.'
                : 'Confirmed tax-invoice accessory items ranked by captured net sales because invoice quantities are not available.'}
            >
              <AnalyticsParetoChart
                rows={accessoryItemRanking}
                valueLabel={accessoryRankingUsesQuantity ? 'Invoiced quantity' : 'Net sales'}
                emptyText="No confirmed tax-invoice accessory quantities or net sales were captured."
              />
              <p className="analytics-footnote">The chart aggregates by accessory item across dealerships and models; the detail list below retains dealer, outlet, model and variant.</p>
            </SectionCard>
          </div>

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
            <Metric label="Any positive over-offer" value={formatMoney(discountSummary.strict_excess_discount_amount)} detail={`${formatNumber(discountSummary.strict_excess_discount_journeys)} journeys · ${formatNumber(discountSummary.strict_excess_application_count)} applications with actual discount above the captured offer before tolerance`} attention={numeric(discountSummary.strict_excess_discount_amount) > 0} />
            <Metric label="Active pricing cases" value={formatNumber(summary.journeys_with_pricing_exceptions)} detail="Distinct journeys with an open or acknowledged Audit Core pricing finding" attention={summary.journeys_with_pricing_exceptions > 0} />
            <Metric label="Active invoice conflicts" value={formatNumber(summary.invoice_conflict_journeys)} detail="Open or acknowledged commercial price and discount disagreements across captured invoices" attention={summary.invoice_conflict_journeys > 0} />
              <Metric label="Known overage after tolerance" value={formatMoney(summary.known_excess_discount_amount)} detail={`${formatNumber(summary.known_excess_discount_journeys)} journeys · ${formatNumber(summary.known_excess_application_count)} applications above Audit Core's line tolerance`} attention={numeric(summary.known_excess_discount_amount) > 0} />
            <Metric label="Unknown entitlements" value={formatNumber(summary.unknown_entitlement_application_count)} detail="Applications excluded because the offered entitlement could not be attributed" attention={summary.unknown_entitlement_application_count > 0} />
            <Metric label="Comparable price line coverage" value={formatPercent(summary.comparable_price_line_coverage_pct)} detail={`${formatNumber(summary.comparable_price_line_count)} of ${formatNumber(summary.standard_price_line_count)} standard-priced commercial lines have an actual amount`} />
          </div>

          <SectionCard title="Known Excess by Discount Category" description="Per-application overage above the captured entitlement. Unused entitlement in another category never offsets an exception; applications with unknown entitlement are omitted.">
            <AnalyticsBarChart rows={keyRows} valueLabel="Known excess discount" valueKind="currency" />
          </SectionCard>

          <DetailTable
            title="Discounts by dealership, vehicle model and variant"
            defaultOpen
            headers={['Dealer', 'Outlet', 'Model', 'Variant', 'Booked Cars', 'Cars with Discount', 'Recorded Discount', 'Average per Discounted Car', 'Any Positive Over-Offer', 'Over-Offer Cars', 'Known Overage After Tolerance', 'Unknown Entitlement Cars']}
            rows={discountsByProduct.map((row) => [
              row.dealer_name,
              row.outlet_name,
              row.model_name,
              row.variant_name,
              formatNumber(row.booked_units),
              formatNumber(row.discounted_units),
              formatMoney(row.actual_discount_amount),
              row.avg_discount_per_discounted_unit == null ? 'Unavailable' : formatMoney(row.avg_discount_per_discounted_unit),
              formatMoney(row.strict_excess_discount_amount),
              formatNumber(row.strict_excess_units),
              formatMoney(row.known_excess_discount_amount),
              formatNumber(row.units_with_unknown_entitlement),
            ])}
          />

          <DetailTable
            title="View outlet pricing exception concentration"
            headers={['Dealer', 'Outlet', 'Price Variance Journeys', 'Discount Exception Journeys', 'Invoice Conflict Journeys', 'Any Positive Over-Offer', 'Known Overage After Tolerance', 'Unknown Applications']}
            rows={pricing.by_outlet.map((row) => [row.dealer_name, row.outlet_name, formatNumber(row.price_exception_journeys), formatNumber(row.discount_exception_journeys), formatNumber(row.invoice_conflict_journeys), formatMoney(row.strict_excess_discount_amount), formatMoney(row.known_excess_discount_amount), formatNumber(row.unknown_discount_applications)])}
          />

          <DetailTable
            title="View active Audit Core pricing findings"
            headers={['Journey Reference', 'Dealer', 'Outlet', 'Model / Variant', 'Finding', 'Audit Core detail', 'Severity', 'Status']}
            rows={pricing.exceptions.map((row) => [row.journey_reference || row.journey_id, row.dealer_name, row.outlet_name, `${humanize(row.model_name)} / ${humanize(row.variant_name)}`, row.title || humanize(row.rule_key), row.description, humanize(row.severity), humanize(row.finding_status)])}
          />

          <p className="analytics-footnote">
            {pricing.definitions.exception_status} Strict positive over-offer is shown before tolerance; known overage reflects Audit Core's configured line tolerance. Current unresolved status is shown in the finding list. Invoice and booking line counts describe evidence coverage, not complete-deal invoice coverage.
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
