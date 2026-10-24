import { useMemo, useState } from 'react';
import SectionCard from '../../components/SectionCard';
import type { AnalyticsBusinessReportPayload, NumericValue, PricingIntegrityReport } from '../../services/analytics/businessClient';
import AnalyticsOdishaPinMap from './AnalyticsOdishaPinMap';
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
  const [query, setQuery] = useState('');
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return rows;
    return rows.filter((row) => row.some((cell) => String(cell).toLocaleLowerCase().includes(normalizedQuery)));
  }, [query, rows]);

  return (
    <details className="analytics-detail" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="analytics-detail__body">
        {rows.length > 10 && (
          <div className="analytics-detail__search">
            <label>
              Search this table
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search dealer, model, code, item, or value"
              />
            </label>
            <span>Showing {formatNumber(filteredRows.length)} of {formatNumber(rows.length)} rows</span>
          </div>
        )}
        <div className="data-table-wrap analytics-table-wrap">
          <table className="data-table">
            <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
            <tbody>
              {filteredRows.length > 0
                ? filteredRows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)
                : rows.length > 0
                  ? <tr><td className="analytics-table-empty" colSpan={headers.length}>No rows match this search.</td></tr>
                : <tr><td className="analytics-table-empty" colSpan={headers.length}>No rows are available for this report in the selected project snapshot. Confirm the project scope shown above.</td></tr>}
          </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

type AnalyticsVasData = Extract<AnalyticsBusinessReportPayload, { kind: 'addons' }>['data'];

function AnalyticsAddonsReport({ data }: { data: AnalyticsVasData }) {
  const [selectedDealer, setSelectedDealer] = useState('All dealerships');
  const [selectedOutlet, setSelectedOutlet] = useState('All outlets');
  const accessoryItems = data.accessory_items;
  const accessoryLineCoverage = data.accessory_line_coverage;
  const dealers = useMemo(
    () => Array.from(new Set(accessoryItems.map((row) => row.dealer_name))).sort((a, b) => a.localeCompare(b)),
    [accessoryItems],
  );
  const outlets = useMemo(
    () => Array.from(new Set(accessoryItems
      .filter((row) => selectedDealer === 'All dealerships' || row.dealer_name === selectedDealer)
      .map((row) => row.outlet_name))).sort((a, b) => a.localeCompare(b)),
    [accessoryItems, selectedDealer],
  );
  const scopedAccessoryItems = useMemo(
    () => accessoryItems
      .filter((row) => selectedDealer === 'All dealerships' || row.dealer_name === selectedDealer)
      .filter((row) => selectedOutlet === 'All outlets' || row.outlet_name === selectedOutlet)
      .sort((a, b) => numeric(b.invoiced_quantity) - numeric(a.invoiced_quantity)
        || numeric(b.net_amount) - numeric(a.net_amount)
        || a.model_name.localeCompare(b.model_name)
        || a.item_description.localeCompare(b.item_description)),
    [accessoryItems, selectedDealer, selectedOutlet],
  );
  const warrantyRsa = data.warranty_rsa;
  const reconciliation = data.booking_invoice_reconciliation;
  const invoiceCoverage = reconciliation.invoice_coverage;

  return (
    <>
      <SectionCard
        title="Booking proposal vs delivery invoice"
        description="One project-scoped reconciliation of captured booking VAS proposals against completed-delivery invoices. Only confirmed tax invoices count as purchases; category evidence on an invoice with unknown nature is shown for review."
      >
        <p className="analytics-footnote">{reconciliation.definition}</p>
        <p className="analytics-footnote">
          Confirmed tax-invoice evidence covers {formatNumber(invoiceCoverage.delivered_journeys_with_tax_invoice_lines)} of {formatNumber(invoiceCoverage.delivered_journeys)} completed deliveries ({formatPercent(invoiceCoverage.invoice_coverage_pct)}), across {formatNumber(invoiceCoverage.delivery_tax_invoice_documents)} documents and {formatNumber(invoiceCoverage.delivery_tax_invoice_lines)} lines. {formatNumber(invoiceCoverage.delivered_journeys_with_unverified_vas_evidence)} delivered journeys have VAS-like lines on {formatNumber(invoiceCoverage.unverified_invoice_documents)} invoice documents with unknown invoice nature ({formatNumber(invoiceCoverage.classified_unverified_vas_lines)} category-matched lines); these are neither counted as bought nor treated as missing. {formatNumber(invoiceCoverage.unclassified_tax_invoice_lines)} confirmed tax-invoice lines remain unclassified.
        </p>
        <DetailTable
          title="VAS proposal to invoice reconciliation by category"
          defaultOpen
          headers={['VAS', 'Booking proposals', 'Delivered proposals', 'Bought on invoice', 'Matched', 'Unverified invoice evidence', 'Not observed on invoice', 'Awaiting invoice evidence', 'Match rate']}
          rows={reconciliation.by_category.map((row) => [
            humanize(row.category),
            formatNumber(row.booked_proposal_journeys),
            formatNumber(row.delivered_proposal_journeys),
            formatNumber(row.delivery_invoice_purchase_journeys),
            formatNumber(row.proposed_and_invoiced_journeys),
            formatNumber(row.unverified_invoice_evidence_journeys),
            formatNumber(row.proposal_not_observed_on_invoice_journeys),
            formatNumber(row.proposal_without_invoice_evidence_journeys),
            formatPercent(row.proposal_invoice_match_pct),
          ])}
        />
        <DetailTable
          title="Outlet, model and variant reconciliation"
          headers={['Dealer', 'Outlet', 'Model', 'Variant', 'VAS', 'Booking proposals', 'Bought on invoice', 'Matched', 'Unverified invoice evidence', 'Proposals needing review', 'Not observed on invoice', 'Awaiting invoice evidence', 'Confirmed invoice purpose', 'Unverified invoice purpose']}
          rows={reconciliation.by_dealer_model_variant.map((row) => [
            row.dealer_name,
            row.outlet_name,
            row.model_name,
            row.variant_name,
            humanize(row.category),
            formatNumber(row.booked_proposal_journeys),
            formatNumber(row.delivery_invoice_purchase_journeys),
            formatNumber(row.proposed_and_invoiced_journeys),
            formatNumber(row.unverified_invoice_evidence_journeys),
            formatNumber(row.proposal_with_unverified_invoice_evidence_journeys),
            formatNumber(row.proposal_not_observed_on_invoice_journeys),
            formatNumber(row.proposal_without_invoice_evidence_journeys),
            row.invoice_purposes || 'None confirmed',
            row.unverified_invoice_purposes || 'None',
          ])}
        />
      </SectionCard>

      <div className="analytics-split analytics-split--overview">
        <SectionCard title="Accessory source coverage" description="Sold-item results include confirmed accessory tax invoices only. Proforma and unclassified lines are not counted as sold.">
          <div className="analytics-insight-stack">
            <Metric label="Confirmed invoices / lines" value={`${formatNumber(accessoryLineCoverage.confirmed_tax_invoices)} / ${formatNumber(accessoryLineCoverage.confirmed_tax_invoice_lines)}`} detail="Reviewed accessory-purpose tax invoices in the current tenant snapshot" />
            <Metric label="Usable item labels" value={`${formatNumber(accessoryLineCoverage.confirmed_lines_with_item_label)} / ${formatNumber(accessoryLineCoverage.confirmed_tax_invoice_lines)}`} detail="Tax-invoice lines with an item description or code" attention={accessoryLineCoverage.confirmed_lines_with_item_label < accessoryLineCoverage.confirmed_tax_invoice_lines} />
            <Metric label="Proforma / unclassified lines" value={formatNumber(accessoryLineCoverage.proforma_lines + accessoryLineCoverage.unclassified_lines)} detail="Visible in source coverage only; excluded from sold-item totals" attention={accessoryLineCoverage.proforma_lines + accessoryLineCoverage.unclassified_lines > 0} />
            <Metric label="Duplicate source copies removed" value={formatNumber(accessoryLineCoverage.duplicate_source_documents)} detail={`Collapsed across ${formatNumber(accessoryLineCoverage.duplicate_invoice_groups)} invoice identities`} />
          </div>
        </SectionCard>
      </div>

      <div className="analytics-pin-map__controls analytics-accessory-filters">
        <label>
          Dealership
          <select value={selectedDealer} onChange={(event) => {
            setSelectedDealer(event.target.value);
            setSelectedOutlet('All outlets');
          }}>
            <option>All dealerships</option>
            {dealers.map((dealer) => <option key={dealer}>{dealer}</option>)}
          </select>
        </label>
        <label>
          Outlet
          <select value={selectedOutlet} onChange={(event) => setSelectedOutlet(event.target.value)}>
            <option>All outlets</option>
            {outlets.map((outlet) => <option key={outlet}>{outlet}</option>)}
          </select>
        </label>
        <p>Showing {formatNumber(scopedAccessoryItems.length)} of {formatNumber(accessoryItems.length)} outlet/model/item groups. Search the table for a model, variant, accessory description, or item code.</p>
      </div>

      {accessoryItems.length > 0 ? (
        <DetailTable
          title="Accessories sold by dealership, outlet, model, variant and item"
          defaultOpen
          headers={['Dealer', 'Outlet', 'Model', 'Variant', 'Category', 'Accessory item', 'Item code', 'Invoice source', 'Invoices', 'Invoice lines', 'Qty invoiced', 'Net sales', 'Discount captured']}
          rows={scopedAccessoryItems.map((row) => [
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
            formatOptionalMoney(row.line_discount_amount),
          ])}
        />
      ) : (
        <SectionCard title="Accessory invoice items" description="No confirmed accessory tax-invoice lines were captured for this project in the current snapshot." />
      )}

      <DetailTable
        title="Extended warranty term by dealership, outlet, model and variant"
        defaultOpen
        headers={['Dealer', 'Outlet', 'Model', 'Variant', 'Warranty journeys', '4-year', '5-year', 'Term not recorded', 'Booking add-on source', 'Tax-invoice description source']}
        rows={warrantyRsa.by_product.filter((row) => row.product_type === 'EW').map((row) => [
          row.dealer_name,
          row.outlet_name,
          row.model_name,
          row.variant_name,
          formatNumber(row.journey_count),
          formatNumber(row.four_year_journeys),
          formatNumber(row.five_year_journeys),
          formatNumber(row.term_not_recorded_journeys),
          formatNumber(row.addon_source_journeys),
          formatNumber(row.invoice_source_journeys),
        ])}
      />
      {warrantyRsa.ew_journey_count === 0 && (
        <p className="analytics-footnote">No EW-coded add-on or warranty-described confirmed invoice evidence was found in this snapshot. This does not establish that no warranty was sold outside the captured sources.</p>
      )}

      <DetailTable
        title="Accessory pricing audit: comparable standard versus actual charges"
        headers={['Dealer', 'Outlet', 'Model', 'Variant', 'Evidence Rows', 'Comparable Rows', 'Comparable Standard', 'Comparable Actual', 'Actual − Standard']}
        rows={data.accessory_cost_by_product.map((row) => [
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
      <p className="analytics-footnote">{data.definition}</p>
    </>
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
        by_source_outlet: sourceByOutlet,
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
            title="Raw insurance source codes and route evidence by outlet"
            defaultOpen
            headers={['Dealer', 'Outlet', 'Route assessment', 'insurance_by', 'insurance_source', 'Self-insurance flag', 'MISP code', 'Intermediary', 'Insurer', 'Policy records', 'Premium captured']}
            rows={sourceByOutlet.map((row) => [
              row.dealer_name,
              row.outlet_name,
              routeLabel(row.source_assessment),
              row.insurance_by,
              row.insurance_source,
              row.self_insurance_flag,
              row.misp_code,
              row.intermediary_name,
              row.insurer_name,
              formatNumber(row.policy_count),
              formatMoney(row.premium_amount),
            ])}
          />
          <p className="analytics-footnote">The raw table retains the captured Audit Core source values outlet by outlet. A MISP code, intermediary, or insurer name alone does not establish that the policy was dealer-arranged or customer-arranged; only explicit route evidence contributes to those classifications.</p>

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

    case 'addons':
      return <AnalyticsAddonsReport data={payload.data} />;

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
      const dealerCount = new Set(rows.map((row) => row.dealer_name)).size;
      return (
        <>
          <div className="analytics-insurance-banner">
            <Metric label="Pincode coverage" value={formatPercent(coverage.coverage_pct)} detail={`${formatNumber(coverage.available)} of ${formatNumber(coverage.total)} booked journeys have an explicit PIN field`} />
            <Metric label="Reviewed PIN records" value={formatNumber(quality.reviewed_journeys)} detail={`${formatPercent(quality.reviewed_pct_of_pincode_records)} of PIN-bearing journeys have a review timestamp`} />
            <Metric label="Provisional PIN records" value={formatNumber(quality.provisional_journeys)} detail="Document-extracted values not yet reviewed in Audit Core" attention={quality.provisional_journeys > 0} />
            <Metric label="Dealerships represented" value={formatNumber(dealerCount)} detail="Dealerships with at least one booking attached to a captured customer PIN" />
          </div>

          <SectionCard title="Odisha customer sales influence by PIN" description="Select a dealership and measure to see the distribution of its customer bookings across Odisha postal areas. Use this as a recorded-customer footprint indicator, not as a verified territory boundary.">
            <AnalyticsOdishaPinMap rows={rows} />
          </SectionCard>

          <DetailTable
            title="All PIN sales by dealer, outlet and captured model"
            defaultOpen
            headers={['Customer PIN', 'Dealer', 'Outlet', 'Model label', 'Booked Journeys', 'Deliveries', 'Finance Records', 'Insurance Records', 'Accessory Records']}
            rows={rows.map((row) => [
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
