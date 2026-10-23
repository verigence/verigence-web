import SectionCard from '../../components/SectionCard';
import type { AnalyticsReportPayload } from '../../services/analytics/client';
import {
  AnalyticsBarChart,
  AnalyticsBubbleChart,
  AnalyticsComboChart,
  AnalyticsDonutChart,
  AnalyticsHeatmap,
  AnalyticsParetoChart,
  AnalyticsSunburstChart,
  AnalyticsTreemap,
  AnalyticsVarianceChart,
} from './AnalyticsCharts';

type InsightTone = 'default' | 'attention' | 'positive';

const acronymMap: Record<string, string> = {
  amc: 'AMC', cctv: 'CCTV', cod: 'COD', do: 'DO', dsa: 'DSA', emi: 'EMI', ew: 'EW', gst: 'GST', id: 'ID', neft: 'NEFT', pan: 'PAN', po: 'PO', pos: 'POS', qr: 'QR', rc: 'RC', rsa: 'RSA', rtgs: 'RTGS', upi: 'UPI',
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

function formatMoney(value: string | number): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(numericValue);
}

function numeric(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(part: number, whole: number): string {
  return whole ? `${((part / whole) * 100).toFixed(1)}%` : '0.0%';
}

function formatMonth(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

function humanize(value: string): string {
  if (!value) return 'Unspecified';
  return value
    .replace(/[:/]/g, ' ')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((token) => acronymMap[token.toLowerCase()] || `${token.charAt(0).toUpperCase()}${token.slice(1).toLowerCase()}`)
    .join(' ');
}

function normalizePaymentChannel(value: string): string {
  const key = value.trim().replace(/\s+/g, ' ').toUpperCase();
  const knownAliases: Record<string, string> = {
    CASH: 'Cash',
    'CASH DEPOSIT': 'Cash',
    UPI: 'UPI / Wallet',
    'PHONE PAY': 'UPI / Wallet',
    PHONEPE: 'UPI / Wallet',
    'PHONE PE': 'UPI / Wallet',
    'TRANSFER-UPI': 'UPI / Wallet',
    CARD: 'Card / POS',
    'CREDIT CARD': 'Card / POS',
    'DEBIT CARD': 'Card / POS',
    POS: 'Card / POS',
    'ICICI BANK POS MACHINE RECEIPTS': 'Card / POS',
    TRANSFER: 'Bank Transfer',
    'BY TRANSFER': 'Bank Transfer',
    'BANK TRANSFER': 'Bank Transfer',
    NEFT: 'Bank Transfer',
    RTGS: 'Bank Transfer',
    'NEFT/RTGS': 'Bank Transfer',
    'RTGS/NEFT': 'Bank Transfer',
  };
  return knownAliases[key] || humanize(value);
}

function humanizeRuleKey(value: string): string {
  const [prefix, suffix] = value.split(':', 2);
  if (suffix) {
    if (prefix.includes('REQUIRED_DOCUMENT_MISSING')) return `Missing: ${humanize(suffix)}`;
    if (prefix.includes('DISCOUNT_EVIDENCE_MISSING')) return `Missing evidence: ${humanize(suffix)}`;
    return `${humanize(prefix)} · ${humanize(suffix)}`;
  }
  return humanize(value);
}


function HeroStat({ eyebrow, value, title, detail, tone = 'default' }: { eyebrow: string; value: string; title: string; detail: string; tone?: InsightTone }) {
  return (
    <article className={`analytics-hero-stat analytics-hero-stat--${tone}`}>
      <span className="analytics-hero-stat__eyebrow">{eyebrow}</span>
      <strong className="analytics-hero-stat__value">{value}</strong>
      <h3>{title}</h3>
      <p>{detail}</p>
    </article>
  );
}

function InsightCard({ label, value, detail, tone = 'default' }: { label: string; value: string; detail: string; tone?: InsightTone }) {
  return (
    <article className={`analytics-insight-card analytics-insight-card--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function RankedList({ title, description, items }: { title: string; description?: string; items: Array<{ label: string; value: string; meta?: string; tone?: InsightTone }> }) {
  return (
    <section className="analytics-ranked-panel">
      <div className="analytics-ranked-panel__header"><h3>{title}</h3>{description ? <p>{description}</p> : null}</div>
      {items.length ? (
        <ol className="analytics-ranked-list">
          {items.map((item, index) => (
            <li key={`${item.label}-${index}`} className={`analytics-ranked-list__item analytics-ranked-list__item--${item.tone || 'default'}`}>
              <span className="analytics-ranked-list__rank">{index + 1}</span>
              <span className="analytics-ranked-list__copy"><strong>{item.label}</strong>{item.meta ? <small>{item.meta}</small> : null}</span>
              <span className="analytics-ranked-list__value">{item.value}</span>
            </li>
          ))}
        </ol>
      ) : <p className="analytics-empty-copy">No items in the current snapshot.</p>}
    </section>
  );
}

function ReportTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) {
  if (!rows.length) return <p>No data in the current snapshot.</p>;
  return (
    <div className="data-table-wrap analytics-table-wrap">
      <table className="data-table">
        <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function DetailDisclosure({ title = 'View underlying detail', headers, rows }: { title?: string; headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <details className="analytics-detail">
      <summary>{title}</summary>
      <div className="analytics-detail__body"><ReportTable headers={headers} rows={rows} /></div>
    </details>
  );
}

function aggregate<T>(rows: T[], label: (row: T) => string, value: (row: T) => number) {
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    const key = label(row) || 'Unspecified';
    totals.set(key, (totals.get(key) || 0) + value(row));
  });
  return Array.from(totals.entries()).map(([rowLabel, rowValue]) => ({ label: rowLabel, value: rowValue })).sort((a, b) => b.value - a.value);
}

function aggregateBubble<T>(rows: T[], label: (row: T) => string, x: (row: T) => number, y: (row: T) => number) {
  const totals = new Map<string, { x: number; y: number }>();
  rows.forEach((row) => {
    const key = label(row) || 'Unspecified';
    const current = totals.get(key) || { x: 0, y: 0 };
    current.x += x(row);
    current.y += y(row);
    totals.set(key, current);
  });
  return Array.from(totals.entries()).map(([rowLabel, values]) => ({ label: rowLabel, x: values.x, y: values.y, size: values.x })).sort((a, b) => b.y - a.y);
}

function matrixFromRows<T>(rows: T[], xValues: string[], yValues: string[], x: (row: T) => string, y: (row: T) => string, value: (row: T) => number) {
  const cellTotals = new Map<string, number>();
  rows.forEach((row) => {
    const xIndex = xValues.indexOf(x(row));
    const yIndex = yValues.indexOf(y(row));
    if (xIndex < 0 || yIndex < 0) return;
    const key = `${xIndex}:${yIndex}`;
    cellTotals.set(key, (cellTotals.get(key) || 0) + value(row));
  });
  return Array.from(cellTotals.entries()).map(([key, cellValue]) => {
    const [xIndex, yIndex] = key.split(':').map(Number);
    return [xIndex, yIndex, cellValue] as [number, number, number];
  });
}

export default function AnalyticsReportViews({ payload }: { payload: AnalyticsReportPayload }) {
  switch (payload.kind) {
    case 'finance': {
      const { rows, summary } = payload.data;
      const attachRate = summary.finance_attach_pct == null ? 'Unavailable' : `${numeric(summary.finance_attach_pct).toFixed(1)}%`;
      const lenderRows = rows.map((row) => ({
        label: `${humanize(row.provider)} · ${humanize(row.finance_type)}`,
        value: numeric(row.loan_amount),
      }));
      return <>
        <div className="analytics-finance-hero">
          <HeroStat eyebrow="Finance record rate" value={attachRate} title="Booked journeys with a finance record" detail={`${formatNumber(summary.financed_journeys)} of ${formatNumber(summary.booked_journeys)} booked journeys. This is not a loan approval rate.`} />
          <div className="analytics-insight-stack">
            <InsightCard label="High-confidence loan amount" value={formatMoney(summary.high_confidence_loan_amount)} detail={`${formatNumber(summary.high_confidence_loan_records)} records with a high-confidence disbursement amount`} />
            <InsightCard label="Medium-confidence loan amount" value={formatMoney(summary.medium_confidence_loan_amount)} detail={`${formatNumber(summary.medium_confidence_loan_records)} records, shown separately from lender-attributed totals`} />
          </div>
        </div>
        <SectionCard title="High-confidence Loan Amount by Lender" description="Lender totals use only high-confidence loan disbursement records; medium-confidence amounts are excluded from this chart."><AnalyticsBarChart rows={lenderRows} valueLabel="Loan amount" valueKind="currency" /></SectionCard>
        <p className="analytics-footnote">{payload.data.definition}</p>
      </>;
    }

    case 'insurance': {
      const { rows, summary, source_split: sourceSplit, duplicate_agent_codes: duplicates } = payload.data;
      const policies = summary.insurance_journeys;
      const premium = numeric(summary.captured_premium);
      const sourceMix = sourceSplit.map((row) => ({ label: humanize(row.insurance_source), value: row.policy_count }));
      const insurerValue = aggregate(rows, (row) => humanize(row.insurer), (row) => numeric(row.premium_amount));
      const topInsurer = insurerValue[0];
      const insurerPosition = aggregateBubble(rows, (row) => humanize(row.insurer), (row) => row.policy_count, (row) => numeric(row.premium_amount));
      return <>
        <div className="analytics-insurance-banner">
          <HeroStat eyebrow="Insurance records" value={`${summary.insurance_record_rate_pct == null ? 'Unavailable' : `${numeric(summary.insurance_record_rate_pct).toFixed(1)}%`} of booked journeys`} title={`${formatNumber(policies)} journeys have a policy record`} detail="A missing record does not prove a vehicle was uninsured." />
          <InsightCard label="Captured policy premium" value={formatMoney(premium)} detail={`${formatNumber(summary.premium_populated)} of ${formatNumber(policies)} records contain a premium value`} />
          <InsightCard label="Source unclassified" value={formatNumber(summary.source_unclassified_journeys)} detail={`${percent(summary.source_unclassified_journeys, policies)} of policy journeys lack a recognized source or explicit self-insurance flag`} />
          <InsightCard label="Largest insurer by premium" value={topInsurer?.label || '—'} detail={topInsurer ? `${formatMoney(topInsurer.value)} captured premium` : 'No insurer premium captured'} />
          <InsightCard label="Repeated agent codes" value={formatNumber(duplicates.length)} detail={duplicates.length ? 'Codes reused across multiple bookings require attention' : 'No repeated agent-code exception in this snapshot'} tone={duplicates.length ? 'attention' : 'positive'} />
        </div>
        <div className="analytics-split analytics-split--insurance">
          <SectionCard title="Insurance Source Classification" description="Known source codes and unclassified records. Missing source data is not assumed to be in-house."><AnalyticsDonutChart rows={sourceMix} valueLabel="Policy records" /></SectionCard>
          <SectionCard title="Insurer Portfolio" description="Insurers positioned by policy volume and premium value."><AnalyticsBubbleChart rows={insurerPosition} xLabel="Policies" yLabel="Premium value" yKind="currency" /></SectionCard>
        </div>
        {duplicates.length ? <RankedList title="Agent-code exceptions" description="Repeated codes are shown first because they are directly actionable audit exceptions." items={duplicates.slice(0, 8).map((row) => ({ label: row.agent_code, value: `${formatNumber(row.booking_count)} bookings`, tone: 'attention' }))} /> : null}
        <DetailDisclosure title="View insurance detail" headers={['Insurance By', 'Insurer', 'Policies', 'Premium']} rows={rows.map((row) => [humanize(row.insurance_by), humanize(row.insurer), formatNumber(row.policy_count), formatMoney(row.premium_amount)])} />
      </>;
    }

    case 'addons': {
      const { rows } = payload.data;
      const attaches = rows.reduce((sum, row) => sum + row.attach_count, 0);
      const value = rows.reduce((sum, row) => sum + numeric(row.actual_amount), 0);
      const comboRows = rows.map((row) => ({ label: humanize(row.addon_type), bar: row.attach_count, line: row.attach_count ? numeric(row.actual_amount) / row.attach_count : 0 }));
      const economics = rows.map((row) => ({ label: humanize(row.addon_type), count: row.attach_count, value: numeric(row.actual_amount), average: row.attach_count ? numeric(row.actual_amount) / row.attach_count : 0 })).sort((a, b) => b.value - a.value);
      return <>
        <div className="analytics-product-summary">
          <HeroStat eyebrow="VAS captured value" value={formatMoney(value)} title="Add-on economics" detail={`${formatNumber(attaches)} EW, RSA, accessory and service-package attachments captured.`} />
          <RankedList title="Product contribution" description="Products ranked by captured value, with attach volume shown below." items={economics.slice(0, 6).map((row) => ({ label: row.label, value: formatMoney(row.value), meta: `${formatNumber(row.count)} attaches · ${formatMoney(row.average)} average` }))} />
        </div>
        <SectionCard title="Volume vs Value per Attachment" description="Bars show attachment volume; the line shows average captured value per attachment, revealing high-volume versus high-value products."><AnalyticsComboChart rows={comboRows} barLabel="Attachments" lineLabel="Average value" lineKind="currency" /></SectionCard>
        <DetailDisclosure title="View add-on detail" headers={['Add-on Type', 'Attachments', 'Actual Value']} rows={rows.map((row) => [humanize(row.addon_type), formatNumber(row.attach_count), formatMoney(row.actual_amount)])} />
      </>;
    }

    case 'discounts': {
      const { rows } = payload.data;
      const applications = rows.reduce((sum, row) => sum + row.application_count, 0);
      const actual = rows.reduce((sum, row) => sum + numeric(row.actual_discount_amount), 0);
      const eligible = rows.reduce((sum, row) => sum + numeric(row.standard_eligible_amount), 0);
      const variance = rows.map((row) => ({ label: humanize(row.discount_key), value: numeric(row.actual_discount_amount) - numeric(row.standard_eligible_amount) }));
      const mix = aggregate(rows, (row) => humanize(row.discount_key), (row) => row.application_count);
      const topVariance = [...variance].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 6);
      return <>
        <div className="analytics-discount-hero">
          <HeroStat eyebrow="Actual discount" value={formatMoney(actual)} title={`${formatNumber(applications)} discount applications`} detail={`Captured eligible basis: ${formatMoney(eligible)}.`} tone={actual > eligible ? 'attention' : 'default'} />
          <div className="analytics-insight-stack">
            <InsightCard label="Variance to eligible basis" value={formatMoney(actual - eligible)} detail={actual > eligible ? 'Actual discount exceeds captured eligible basis' : 'Actual discount is within or below captured eligible basis'} tone={actual > eligible ? 'attention' : 'positive'} />
            <InsightCard label="Average discount" value={applications ? formatMoney(actual / applications) : '—'} detail="Actual discount per captured application" />
          </div>
        </div>
        <SectionCard title="Discount Variance by Type" description="Positive bars show discount above the captured standard eligible basis; negative bars show below-basis value."><AnalyticsVarianceChart rows={variance} valueLabel="Actual minus eligible" /></SectionCard>
        <div className="analytics-split analytics-split--discounts">
          <SectionCard title="Application Mix" description="How frequently each discount type is used."><AnalyticsDonutChart rows={mix} valueLabel="Applications" /></SectionCard>
          <RankedList title="Largest variance areas" description="Discount types with the largest absolute gap to eligible basis." items={topVariance.map((row) => ({ label: row.label, value: formatMoney(row.value), tone: row.value > 0 ? 'attention' : 'positive' }))} />
        </div>
        <DetailDisclosure title="View discount detail" headers={['Discount Type', 'Applications', 'Actual', 'Standard Eligible']} rows={rows.map((row) => [humanize(row.discount_key), formatNumber(row.application_count), formatMoney(row.actual_discount_amount), formatMoney(row.standard_eligible_amount)])} />
      </>;
    }

    case 'trade-in': {
      const { rows } = payload.data;
      const count = rows.reduce((sum, row) => sum + row.trade_in_count, 0);
      const value = rows.reduce((sum, row) => sum + numeric(row.actual_value), 0);
      const statusMix = aggregate(rows, (row) => humanize(row.status), (row) => row.trade_in_count);
      const statusPosition = rows.map((row) => ({ label: humanize(row.status), x: row.trade_in_count, y: numeric(row.actual_value), size: row.trade_in_count }));
      return <>
        <div className="analytics-trade-summary">
          <HeroStat eyebrow="Trade-in value" value={formatMoney(value)} title={`${formatNumber(count)} trade-in cases`} detail={count ? `${formatMoney(value / count)} average captured value per trade-in.` : 'No trade-in value captured.'} />
          <RankedList title="Lifecycle status" items={statusMix.map((row) => ({ label: row.label, value: formatNumber(row.value), meta: percent(row.value, count) }))} />
        </div>
        <SectionCard title="Status Volume vs Value" description="Trade-in statuses positioned by case count and captured actual value."><AnalyticsBubbleChart rows={statusPosition} xLabel="Cases" yLabel="Trade-in value" yKind="currency" /></SectionCard>
        <DetailDisclosure title="View trade-in detail" headers={['Status', 'Cases', 'Actual Value']} rows={rows.map((row) => [humanize(row.status), formatNumber(row.trade_in_count), formatMoney(row.actual_value)])} />
      </>;
    }

    case 'payments': {
      const { rows, summary, definition } = payload.data;
      const channelRows = rows.map((row) => ({
        label: normalizePaymentChannel(row.payment_method),
        value: numeric(row.total_amount),
      }));
      return <>
        <div className="analytics-payment-flow">
          <div className="analytics-payment-flow__total"><span>Recorded receipt amount</span><strong>{formatMoney(summary.recorded_receipt_amount)}</strong><p>{formatNumber(summary.payment_entry_count)} entries across {formatNumber(rows.length)} normalized channels.</p></div>
          <div className="analytics-payment-flow__average"><span>Status coverage</span><strong>{summary.status_coverage_pct == null ? 'Unavailable' : `${numeric(summary.status_coverage_pct).toFixed(1)}%`}</strong><p>{formatNumber(summary.status_coded_entries)} of {formatNumber(summary.payment_entry_count)} entries have a status code.</p></div>
        </div>
        <SectionCard title="Recorded Receipt Amount by Channel" description="Channels are normalized from recognized payment-method prefixes. Recorded amounts are not treated as settled collections."><AnalyticsBarChart rows={channelRows} valueLabel="Recorded receipt amount" valueKind="currency" /></SectionCard>
        <p className="analytics-footnote">{definition}</p>
      </>;
    }

    case 'findings': {
      const { rows } = payload.data;
      const total = rows.reduce((sum, row) => sum + row.finding_count, 0);
      const open = rows.filter((row) => row.status.toUpperCase() === 'OPEN').reduce((sum, row) => sum + row.finding_count, 0);
      const resolved = rows.filter((row) => row.status.toUpperCase() === 'RESOLVED').reduce((sum, row) => sum + row.finding_count, 0);
      const high = rows.filter((row) => row.severity.toUpperCase() === 'HIGH').reduce((sum, row) => sum + row.finding_count, 0);
      const ruleConcentration = aggregate(rows, (row) => humanizeRuleKey(row.rule_key), (row) => row.finding_count);
      const urgentRules = aggregate(rows.filter((row) => row.status.toUpperCase() === 'OPEN' && row.severity.toUpperCase() === 'HIGH'), (row) => humanizeRuleKey(row.rule_key), (row) => row.finding_count);
      const statuses = Array.from(new Set(rows.map((row) => row.status))).sort();
      const severities = Array.from(new Set(rows.map((row) => row.severity))).sort();
      const matrix = matrixFromRows(rows, statuses, severities, (row) => row.status, (row) => row.severity, (row) => row.finding_count);
      return <>
        <div className="analytics-risk-strip">
          <InsightCard label="Open findings" value={formatNumber(open)} detail={`${percent(open, total)} of all captured findings`} tone={open ? 'attention' : 'positive'} />
          <InsightCard label="High severity" value={formatNumber(high)} detail={`${percent(high, total)} of all captured findings`} tone={high ? 'attention' : 'positive'} />
          <InsightCard label="Resolved" value={formatNumber(resolved)} detail={`${percent(resolved, total)} of all captured findings`} tone={resolved ? 'positive' : 'default'} />
        </div>
        <div className="analytics-risk-layout">
          <RankedList title="Immediate attention" description="Open, high-severity rules ranked by current finding count." items={urgentRules.slice(0, 8).map((row) => ({ label: row.label, value: formatNumber(row.value), meta: 'Open · High severity', tone: 'attention' }))} />
          <SectionCard title="Status × Severity Matrix" description="A compact risk map of where the finding population sits by workflow status and severity."><AnalyticsHeatmap xLabels={statuses.map(humanize)} yLabels={severities.map(humanize)} cells={matrix} valueLabel="Findings" /></SectionCard>
        </div>
        <SectionCard title="Exception Concentration" description="Area represents the share of captured findings generated by each rule or control."><AnalyticsTreemap rows={ruleConcentration} valueLabel="Findings" /></SectionCard>
        <DetailDisclosure title="View finding detail" headers={['Rule / Control', 'Status', 'Severity', 'Count']} rows={rows.map((row) => [humanizeRuleKey(row.rule_key), humanize(row.status), humanize(row.severity), formatNumber(row.finding_count)])} />
      </>;
    }

    case 'documents': {
      const { requirements, missing_document_flags: missing } = payload.data;
      const requirementCount = requirements.reduce((sum, row) => sum + row.requirement_count, 0);
      const missingCount = missing.reduce((sum, row) => sum + row.flag_count, 0);
      const missingRules = aggregate(missing, (row) => humanizeRuleKey(row.rule_key), (row) => row.flag_count);
      const statusMix = aggregate(requirements, (row) => humanize(row.status), (row) => row.requirement_count);
      const documentTotals = aggregate(requirements, (row) => row.document_type, (row) => row.requirement_count);
      const topDocumentKeys = documentTotals.slice(0, 12).map((row) => row.label);
      const statuses = Array.from(new Set(requirements.map((row) => row.status))).sort();
      const filteredRequirements = requirements.filter((row) => topDocumentKeys.includes(row.document_type));
      const requirementMatrix = matrixFromRows(filteredRequirements, statuses, topDocumentKeys, (row) => row.status, (row) => row.document_type, (row) => row.requirement_count);
      return <>
        <div className="analytics-document-hero">
          <HeroStat eyebrow="Missing evidence breaches" value={formatNumber(missingCount)} title={missingCount ? 'Document exceptions need attention' : 'No missing-document breach captured'} detail={`${formatNumber(requirementCount)} requirement assessments were evaluated. Missing-rule flags represent ${percent(missingCount, requirementCount)} of those requirement records.`} tone={missingCount ? 'attention' : 'positive'} />
          <RankedList title="What is actually missing" description="Missing-document audit rules, not the general list of required document types." items={missingRules.slice(0, 7).map((row) => ({ label: row.label, value: formatNumber(row.value), meta: `${percent(row.value, missingCount)} of missing flags`, tone: 'attention' }))} />
        </div>
        <SectionCard title="Missing-document Concentration" description="Bars rank the rules generating missing-document flags; the line shows cumulative concentration so the biggest causes are immediately visible."><AnalyticsParetoChart rows={missingRules} valueLabel="Missing flags" /></SectionCard>
        <div className="analytics-split analytics-split--documents">
          <SectionCard title="Requirement Assessment Status" description="Overall assessment outcome mix across all captured document requirements."><AnalyticsDonutChart rows={statusMix} valueLabel="Requirements" /></SectionCard>
          <div className="analytics-document-summary">
            <InsightCard label="Requirements assessed" value={formatNumber(requirementCount)} detail="All captured document requirement records" />
            <InsightCard label="Document types" value={formatNumber(new Set(requirements.map((row) => row.document_type)).size)} detail="Distinct document types represented" />
            <InsightCard label="Missing flag rate" value={percent(missingCount, requirementCount)} detail="Missing-document flags as a share of requirement records" tone={missingCount ? 'attention' : 'positive'} />
          </div>
        </div>
        <details className="analytics-detail"><summary>View document assessment matrix</summary><div className="analytics-detail__body"><p className="analytics-footnote">This matrix shows the assessment-status distribution for the highest-volume document types. It is diagnostic context, not the missing-flag count.</p><AnalyticsHeatmap xLabels={statuses.map(humanize)} yLabels={topDocumentKeys.map(humanize)} cells={requirementMatrix} valueLabel="Requirements" /></div></details>
        <DetailDisclosure title="View document requirement detail" headers={['Document Type', 'Assessment Status', 'Requirements']} rows={requirements.map((row) => [humanize(row.document_type), humanize(row.status), formatNumber(row.requirement_count)])} />
      </>;
    }

    case 'turnaround': {
      const row = payload.data.rows[0];
      const completed = row?.completed_count || 0;
      const average = row?.avg_days == null ? null : Number(row.avg_days);
      return <>
        <div className="analytics-turnaround-hero">
          <HeroStat eyebrow="Completed journeys" value={formatNumber(completed)} title="Receipt-to-delivery completion" detail="Journeys with both first receipt and delivery available in the current snapshot." />
          <HeroStat eyebrow="Average turnaround" value={average == null ? '—' : `${average.toFixed(1)} days`} title="First receipt to delivery" detail={completed ? 'Average across completed journeys represented in this snapshot.' : 'No completed journey has both dates available.'} />
        </div>
        <section className="analytics-data-gap"><div><span>Current data boundary</span><h3>Distribution and trend analysis are not yet available from this endpoint.</h3><p>The API currently returns only completed count and average days. Slabs, model-wise comparison and month-on-month movement require bucketed or dated turnaround rows. No synthetic chart is shown.</p></div></section>
      </>;
    }

    case 'productivity': {
      const { summary, upload_activity: uploadActivity } = payload.data;
      const totalJourneys = summary.reduce((s, r) => s + r.journeys_created, 0);
      const totalBookings = summary.reduce((s, r) => s + r.bookings, 0);
      const totalDeliveries = summary.reduce((s, r) => s + r.deliveries_completed, 0);
      const unattributed = uploadActivity.reduce((sum, row) => sum + row.unattributed_journeys, 0);
      const creators = new Set(summary
        .filter((row) => row.actor_id || row.employee_name !== 'Unknown')
        .map((row) => row.actor_id || row.employee_name)).size;
      const uploadRows = uploadActivity.map((row) => ({ label: formatMonth(row.upload_month), value: row.journeys_created }));
      const overallBookingRate = totalJourneys ? `${((totalBookings / totalJourneys) * 100).toFixed(1)}%` : 'Unavailable';
      const overallDeliveryRate = totalBookings ? `${((totalDeliveries / totalBookings) * 100).toFixed(1)}%` : 'Unavailable';
      const formatDays = (value: number | null) => value == null ? 'Unavailable' : `${Number(value).toFixed(1)} days`;

      return <>
        <div className="analytics-employee-summary">
          <HeroStat eyebrow="Journey uploads" value={formatNumber(totalJourneys)} title={`${creators} attributed creator${creators !== 1 ? 's' : ''}`} detail="Creator attribution comes from Audit Core journey created-by fields." />
          <div className="analytics-insight-stack">
            <InsightCard label="Unattributed uploads" value={formatNumber(unattributed)} detail="Journey records with no creator ID or display name" />
            <InsightCard label="Upload-to-booking rate" value={overallBookingRate} detail={`${formatNumber(totalBookings)} booked journeys from ${formatNumber(totalJourneys)} uploaded journeys`} />
            <InsightCard label="Booking-to-delivery completion" value={overallDeliveryRate} detail={`${formatNumber(totalDeliveries)} deliveries with an actual completion timestamp from ${formatNumber(totalBookings)} booked journeys`} />
          </div>
        </div>

        <SectionCard title="Journey Upload Cadence" description="Monthly counts use the journey created-at timestamp in the current snapshot. Creator attribution gaps are reported separately.">
          <AnalyticsBarChart rows={uploadRows} valueLabel="Journeys uploaded" />
        </SectionCard>

        <SectionCard title="Journey outcomes by uploader" description="Each journey is attributed to the Audit Core created-by fields. Rates use journey uploads as the booking denominator and booked journeys as the delivery denominator.">
          <div className="data-table-wrap analytics-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Creator</th>
                  <th>Journeys Uploaded</th>
                  <th>Bookings</th>
                  <th>Booking Rate</th>
                  <th>Delivery Records</th>
                  <th>Delivered</th>
                  <th>Delivery Completion</th>
                  <th>Avg Days to Delivery Record</th>
                  <th>Avg Days to Delivery</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => (
                  <tr key={row.actor_id || row.employee_name}>
                    <td><strong>{row.employee_name}</strong></td>
                    <td>{formatNumber(row.journeys_created)}</td>
                    <td>{formatNumber(row.bookings)}</td>
                    <td>{row.booking_rate_pct == null ? 'Unavailable' : `${Number(row.booking_rate_pct).toFixed(1)}%`}</td>
                    <td>{formatNumber(row.deliveries_started)}</td>
                    <td>{formatNumber(row.deliveries_completed)}</td>
                    <td>{row.delivery_completion_pct == null ? 'Unavailable' : `${Number(row.delivery_completion_pct).toFixed(1)}%`}</td>
                    <td>{formatDays(row.avg_days_to_delivery_start)}</td>
                    <td>{formatDays(row.avg_days_journey_to_delivery)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

      </>;
    }
  }
}
