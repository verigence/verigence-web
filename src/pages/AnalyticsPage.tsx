import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
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
} from '../features/analytics/AnalyticsCharts';
import {
  AnalyticsHttpError,
  type AnalyticsReportKey,
  type AnalyticsReportPayload,
  getAnalyticsDashboard,
  getAnalyticsReport,
} from '../services/analytics/client';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/analytics.css';

type AnalyticsView = 'overview' | AnalyticsReportKey;

const reportKeys: AnalyticsReportKey[] = [
  'finance',
  'insurance',
  'addons',
  'discounts',
  'trade-in',
  'payments',
  'turnaround',
  'findings',
  'documents',
  'productivity',
];

const reportLabels: Record<AnalyticsView, string> = {
  overview: 'Business Analytics',
  finance: 'Finance',
  insurance: 'Insurance',
  addons: 'Add-ons & VAS',
  discounts: 'Discounts',
  'trade-in': 'Trade-in',
  payments: 'Payments',
  turnaround: 'Turnaround',
  findings: 'Audit & Compliance',
  documents: 'Documents',
  productivity: 'Employees',
};

const acronymMap: Record<string, string> = {
  amc: 'AMC',
  cctv: 'CCTV',
  do: 'DO',
  dsa: 'DSA',
  emi: 'EMI',
  ew: 'EW',
  gst: 'GST',
  id: 'ID',
  pan: 'PAN',
  po: 'PO',
  rc: 'RC',
  rsa: 'RSA',
  upi: 'UPI',
};

function parseReport(value: string | null): AnalyticsView {
  if (value && reportKeys.includes(value as AnalyticsReportKey)) return value as AnalyticsReportKey;
  return 'overview';
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

function formatMoney(value: string | number): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(numericValue);
}

function formatAsOf(value?: string): string {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function numeric(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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

function humanizeRuleKey(value: string): string {
  const [prefix, suffix] = value.split(':', 2);
  if (suffix) {
    if (prefix.includes('REQUIRED_DOCUMENT_MISSING')) return `Missing: ${humanize(suffix)}`;
    if (prefix.includes('DISCOUNT_EVIDENCE_MISSING')) return `Missing evidence: ${humanize(suffix)}`;
    return `${humanize(prefix)} · ${humanize(suffix)}`;
  }
  return humanize(value);
}

function compactActor(value: string): string {
  if (!value) return 'Unspecified';
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric-card analytics-metric-card">
      <span className="metric-card__label">{label}</span>
      <strong className="metric-card__value">{value}</strong>
      <span className="metric-card__detail">{detail}</span>
    </article>
  );
}

function ReportTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) {
  if (!rows.length) return <p>No data in the current snapshot.</p>;
  return (
    <div className="data-table-wrap analytics-table-wrap">
      <table className="data-table">
        <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailDisclosure({
  title = 'View underlying detail',
  headers,
  rows,
}: {
  title?: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <details className="analytics-detail">
      <summary>{title}</summary>
      <div className="analytics-detail__body">
        <ReportTable headers={headers} rows={rows} />
      </div>
    </details>
  );
}

function reportAsOf(payload?: AnalyticsReportPayload): string | undefined {
  return payload?.data.data_as_of;
}

function ReportError({ error }: { error: unknown }) {
  const forbidden = error instanceof AnalyticsHttpError && error.status === 403;
  const noDump = error instanceof AnalyticsHttpError && error.status === 404;
  return (
    <SectionCard title={forbidden ? 'Analytics access denied' : noDump ? 'No analytics snapshot' : 'Analytics unavailable'}>
      <p>
        {forbidden
          ? 'Your current Security role does not have audit.analytics.read for this tenant.'
          : noDump
            ? 'No completed Analytics dump is available for this tenant yet.'
            : error instanceof Error
              ? error.message
              : 'Analytics could not be loaded.'}
      </p>
    </SectionCard>
  );
}

function aggregate<T>(rows: T[], label: (row: T) => string, value: (row: T) => number) {
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    const key = label(row) || 'Unspecified';
    totals.set(key, (totals.get(key) || 0) + value(row));
  });
  return Array.from(totals.entries())
    .map(([rowLabel, rowValue]) => ({ label: rowLabel, value: rowValue }))
    .sort((a, b) => b.value - a.value);
}

function aggregateBubble<T>(
  rows: T[],
  label: (row: T) => string,
  x: (row: T) => number,
  y: (row: T) => number,
) {
  const totals = new Map<string, { x: number; y: number }>();
  rows.forEach((row) => {
    const key = label(row) || 'Unspecified';
    const current = totals.get(key) || { x: 0, y: 0 };
    current.x += x(row);
    current.y += y(row);
    totals.set(key, current);
  });
  return Array.from(totals.entries())
    .map(([rowLabel, values]) => ({ label: rowLabel, x: values.x, y: values.y, size: values.x }))
    .sort((a, b) => b.y - a.y);
}

function matrixFromRows<T>(
  rows: T[],
  xValues: string[],
  yValues: string[],
  x: (row: T) => string,
  y: (row: T) => string,
  value: (row: T) => number,
) {
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

function ReportContent({ payload }: { payload: AnalyticsReportPayload }) {
  switch (payload.kind) {
    case 'finance': {
      const { rows } = payload.data;
      const deals = rows.reduce((sum, row) => sum + row.deal_count, 0);
      const amount = rows.reduce((sum, row) => sum + numeric(row.financed_amount), 0);
      const providers = new Set(rows.map((row) => row.provider).filter((value) => value !== 'UNSPECIFIED')).size;
      const hierarchy = rows.map((row) => ({
        group: humanize(row.finance_type),
        label: humanize(row.provider),
        value: row.deal_count,
      }));
      const providerPosition = aggregateBubble(
        rows,
        (row) => humanize(row.provider),
        (row) => row.deal_count,
        (row) => numeric(row.financed_amount),
      );
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Finance Deals" value={formatNumber(deals)} detail="Deals with captured finance records" />
            <MetricCard label="Financed Amount" value={formatMoney(amount)} detail="Captured financed value" />
            <MetricCard label="Finance Providers" value={formatNumber(providers)} detail="Distinct captured providers" />
            <MetricCard label="Average Financed" value={deals ? formatMoney(amount / deals) : '—'} detail="Average financed value per captured deal" />
          </div>
          <div className="analytics-layout analytics-layout--finance">
            <SectionCard title="Finance Mix" description="Finance type at the centre, providers around it; segment size represents deal count.">
              <AnalyticsSunburstChart rows={hierarchy} valueLabel="Deals" />
            </SectionCard>
            <SectionCard title="Provider Positioning" description="Providers compared on deal volume and financed value. Bubble size follows deal count.">
              <AnalyticsBubbleChart rows={providerPosition} xLabel="Deals" yLabel="Financed value" yKind="currency" />
            </SectionCard>
          </div>
          <DetailDisclosure headers={['Finance Type', 'Provider', 'Deals', 'Financed Amount']} rows={rows.map((row) => [humanize(row.finance_type), humanize(row.provider), formatNumber(row.deal_count), formatMoney(row.financed_amount)])} />
        </>
      );
    }
    case 'insurance': {
      const { rows, duplicate_agent_codes: duplicates } = payload.data;
      const policies = rows.reduce((sum, row) => sum + row.policy_count, 0);
      const premium = rows.reduce((sum, row) => sum + numeric(row.premium_amount), 0);
      const insurers = new Set(rows.map((row) => row.insurer).filter((value) => value !== 'UNSPECIFIED')).size;
      const sourceMix = aggregate(rows, (row) => humanize(row.insurance_by), (row) => row.policy_count);
      const insurerPosition = aggregateBubble(
        rows,
        (row) => humanize(row.insurer),
        (row) => row.policy_count,
        (row) => numeric(row.premium_amount),
      );
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Policies" value={formatNumber(policies)} detail="Captured insurance policies" />
            <MetricCard label="Premium Value" value={formatMoney(premium)} detail="Captured actual premium" />
            <MetricCard label="Insurers" value={formatNumber(insurers)} detail="Distinct captured insurers" />
            <MetricCard label="Repeated Agent Codes" value={formatNumber(duplicates.length)} detail="Agent codes reused across bookings" />
          </div>
          <div className="analytics-layout analytics-layout--insurance">
            <SectionCard title="Insurance Source Mix" description="Policy mix by in-house, self or external source as captured.">
              <AnalyticsDonutChart rows={sourceMix} valueLabel="Policies" />
            </SectionCard>
            <SectionCard title="Insurer Portfolio" description="Insurers positioned by policy volume and premium value.">
              <AnalyticsBubbleChart rows={insurerPosition} xLabel="Policies" yLabel="Premium value" yKind="currency" />
            </SectionCard>
          </div>
          {duplicates.length ? (
            <SectionCard title="Repeated Agent Code Exceptions" description="Agent codes appearing across more than one booking; these need audit attention.">
              <ReportTable headers={['Agent Code', 'Bookings']} rows={duplicates.map((row) => [row.agent_code, formatNumber(row.booking_count)])} />
            </SectionCard>
          ) : null}
          <DetailDisclosure title="View insurance detail" headers={['Insurance By', 'Insurer', 'Policies', 'Premium']} rows={rows.map((row) => [humanize(row.insurance_by), humanize(row.insurer), formatNumber(row.policy_count), formatMoney(row.premium_amount)])} />
        </>
      );
    }
    case 'addons': {
      const { rows } = payload.data;
      const attaches = rows.reduce((sum, row) => sum + row.attach_count, 0);
      const value = rows.reduce((sum, row) => sum + numeric(row.actual_amount), 0);
      const comboRows = rows.map((row) => ({
        label: humanize(row.addon_type),
        bar: row.attach_count,
        line: row.attach_count ? numeric(row.actual_amount) / row.attach_count : 0,
      }));
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Add-on Attachments" value={formatNumber(attaches)} detail="EW, RSA, accessories and service packages" />
            <MetricCard label="Add-on Value" value={formatMoney(value)} detail="Captured actual add-on value" />
            <MetricCard label="Add-on Types" value={formatNumber(rows.length)} detail="Types represented in snapshot" />
            <MetricCard label="Average Value" value={attaches ? formatMoney(value / attaches) : '—'} detail="Average per captured attachment" />
          </div>
          <SectionCard title="Attachment Volume vs Average Value" description="Bars show attachment volume; the line shows average captured value per attachment.">
            <AnalyticsComboChart rows={comboRows} barLabel="Attachments" lineLabel="Average value" lineKind="currency" />
          </SectionCard>
          <DetailDisclosure title="View add-on detail" headers={['Add-on Type', 'Attachments', 'Actual Value']} rows={rows.map((row) => [humanize(row.addon_type), formatNumber(row.attach_count), formatMoney(row.actual_amount)])} />
        </>
      );
    }
    case 'discounts': {
      const { rows } = payload.data;
      const applications = rows.reduce((sum, row) => sum + row.application_count, 0);
      const actual = rows.reduce((sum, row) => sum + numeric(row.actual_discount_amount), 0);
      const eligible = rows.reduce((sum, row) => sum + numeric(row.standard_eligible_amount), 0);
      const variance = rows.map((row) => ({
        label: humanize(row.discount_key),
        value: numeric(row.actual_discount_amount) - numeric(row.standard_eligible_amount),
      }));
      const applicationMix = aggregate(rows, (row) => humanize(row.discount_key), (row) => row.application_count);
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Discount Applications" value={formatNumber(applications)} detail="Captured discount applications" />
            <MetricCard label="Actual Discount" value={formatMoney(actual)} detail="Total actual discount captured" />
            <MetricCard label="Standard Eligible" value={formatMoney(eligible)} detail="Total standard eligible basis" />
            <MetricCard label="Above / Below Basis" value={formatMoney(actual - eligible)} detail="Positive means actual discount exceeds captured standard basis" />
          </div>
          <div className="analytics-layout analytics-layout--discounts">
            <SectionCard title="Discount Variance" description="Positive bars are above the standard eligible basis; negative bars are below it.">
              <AnalyticsVarianceChart rows={variance} valueLabel="Actual minus eligible" />
            </SectionCard>
            <SectionCard title="Discount Application Mix" description="How frequently each discount type is being applied.">
              <AnalyticsDonutChart rows={applicationMix} valueLabel="Applications" />
            </SectionCard>
          </div>
          <DetailDisclosure title="View discount detail" headers={['Discount Type', 'Applications', 'Actual', 'Standard Eligible']} rows={rows.map((row) => [humanize(row.discount_key), formatNumber(row.application_count), formatMoney(row.actual_discount_amount), formatMoney(row.standard_eligible_amount)])} />
        </>
      );
    }
    case 'trade-in': {
      const { rows } = payload.data;
      const count = rows.reduce((sum, row) => sum + row.trade_in_count, 0);
      const value = rows.reduce((sum, row) => sum + numeric(row.actual_value), 0);
      const statusMix = aggregate(rows, (row) => humanize(row.status), (row) => row.trade_in_count);
      const statusPosition = rows.map((row) => ({
        label: humanize(row.status),
        x: row.trade_in_count,
        y: numeric(row.actual_value),
        size: row.trade_in_count,
      }));
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Trade-ins" value={formatNumber(count)} detail="Captured trade-in cases" />
            <MetricCard label="Trade-in Value" value={formatMoney(value)} detail="Captured actual trade-in value" />
            <MetricCard label="Average Trade-in" value={count ? formatMoney(value / count) : '—'} detail="Average actual value per trade-in" />
            <MetricCard label="Statuses" value={formatNumber(rows.length)} detail="Trade-in statuses represented" />
          </div>
          <div className="analytics-layout analytics-layout--tradein">
            <SectionCard title="Trade-in Status Mix" description="Current case distribution by captured trade-in status.">
              <AnalyticsDonutChart rows={statusMix} valueLabel="Cases" />
            </SectionCard>
            <SectionCard title="Status Volume vs Value" description="Compare the number of trade-ins in each status against their captured value.">
              <AnalyticsBubbleChart rows={statusPosition} xLabel="Cases" yLabel="Trade-in value" yKind="currency" />
            </SectionCard>
          </div>
          <DetailDisclosure title="View trade-in detail" headers={['Status', 'Cases', 'Actual Value']} rows={rows.map((row) => [humanize(row.status), formatNumber(row.trade_in_count), formatMoney(row.actual_value)])} />
        </>
      );
    }
    case 'payments': {
      const { rows } = payload.data;
      const count = rows.reduce((sum, row) => sum + row.payment_count, 0);
      const amount = rows.reduce((sum, row) => sum + numeric(row.total_amount), 0);
      const comboRows = rows.map((row) => ({
        label: humanize(row.payment_method),
        bar: numeric(row.total_amount),
        line: row.payment_count ? numeric(row.total_amount) / row.payment_count : 0,
      }));
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Payments" value={formatNumber(count)} detail="Captured payment entries" />
            <MetricCard label="Receipt Value" value={formatMoney(amount)} detail="Total captured payment value" />
            <MetricCard label="Payment Modes" value={formatNumber(rows.length)} detail="Distinct captured payment modes" />
            <MetricCard label="Average Payment" value={count ? formatMoney(amount / count) : '—'} detail="Average value per payment entry" />
          </div>
          <SectionCard title="Payment Mode Economics" description="Bars show total receipt value; the line shows average transaction value by payment mode.">
            <AnalyticsComboChart rows={comboRows} barLabel="Receipt value" lineLabel="Average payment" barKind="currency" lineKind="currency" />
          </SectionCard>
          <DetailDisclosure title="View payment detail" headers={['Mode', 'Payments', 'Total Amount']} rows={rows.map((row) => [humanize(row.payment_method), formatNumber(row.payment_count), formatMoney(row.total_amount)])} />
        </>
      );
    }
    case 'findings': {
      const { rows } = payload.data;
      const total = rows.reduce((sum, row) => sum + row.finding_count, 0);
      const open = rows.filter((row) => row.status.toUpperCase() === 'OPEN').reduce((sum, row) => sum + row.finding_count, 0);
      const resolved = rows.filter((row) => row.status.toUpperCase() === 'RESOLVED').reduce((sum, row) => sum + row.finding_count, 0);
      const high = rows.filter((row) => row.severity.toUpperCase() === 'HIGH').reduce((sum, row) => sum + row.finding_count, 0);
      const ruleConcentration = aggregate(rows, (row) => humanizeRuleKey(row.rule_key), (row) => row.finding_count);
      const statuses = Array.from(new Set(rows.map((row) => row.status))).sort();
      const severities = Array.from(new Set(rows.map((row) => row.severity))).sort();
      const matrix = matrixFromRows(rows, statuses, severities, (row) => row.status, (row) => row.severity, (row) => row.finding_count);
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Audit Findings" value={formatNumber(total)} detail="Findings in latest controlled snapshot" />
            <MetricCard label="Open" value={formatNumber(open)} detail="Open audit findings" />
            <MetricCard label="High Severity" value={formatNumber(high)} detail="High-severity findings" />
            <MetricCard label="Resolved" value={formatNumber(resolved)} detail="Resolved findings represented in snapshot" />
          </div>
          <div className="analytics-layout analytics-layout--findings">
            <SectionCard title="Exception Concentration" description="Area represents the number of findings generated by each rule or control.">
              <AnalyticsTreemap rows={ruleConcentration} valueLabel="Findings" />
            </SectionCard>
            <SectionCard title="Status × Severity Matrix" description="Where the current finding population is concentrated by status and severity.">
              <AnalyticsHeatmap xLabels={statuses.map(humanize)} yLabels={severities.map(humanize)} cells={matrix} valueLabel="Findings" />
            </SectionCard>
          </div>
          <DetailDisclosure title="View finding detail" headers={['Rule / Control', 'Status', 'Severity', 'Count']} rows={rows.map((row) => [humanizeRuleKey(row.rule_key), humanize(row.status), humanize(row.severity), formatNumber(row.finding_count)])} />
        </>
      );
    }
    case 'documents': {
      const { requirements, missing_document_flags: missing } = payload.data;
      const requirementCount = requirements.reduce((sum, row) => sum + row.requirement_count, 0);
      const missingCount = missing.reduce((sum, row) => sum + row.flag_count, 0);
      const types = new Set(requirements.map((row) => row.document_type)).size;
      const documentTotals = aggregate(requirements, (row) => row.document_type, (row) => row.requirement_count);
      const topDocumentKeys = documentTotals.slice(0, 14).map((row) => row.label);
      const statuses = Array.from(new Set(requirements.map((row) => row.status))).sort();
      const filteredRequirements = requirements.filter((row) => topDocumentKeys.includes(row.document_type));
      const requirementMatrix = matrixFromRows(
        filteredRequirements,
        statuses,
        topDocumentKeys,
        (row) => row.status,
        (row) => row.document_type,
        (row) => row.requirement_count,
      );
      const missingRules = aggregate(missing, (row) => humanizeRuleKey(row.rule_key), (row) => row.flag_count);
      const topMissing = missingRules[0];
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Document Requirements" value={formatNumber(requirementCount)} detail="Requirement records evaluated" />
            <MetricCard label="Missing Document Flags" value={formatNumber(missingCount)} detail="Audit-rule breaches where expected evidence was missing" />
            <MetricCard label="Document Types" value={formatNumber(types)} detail="Distinct document types assessed" />
            <MetricCard label="Top Missing Rule" value={topMissing ? formatNumber(topMissing.value) : '0'} detail={topMissing?.label || 'No missing-document rule breaches'} />
          </div>
          <SectionCard title="Document Assessment Matrix" description="Top document types by requirement volume, split by the assessment status actually recorded. This is not the missing-flag count.">
            <AnalyticsHeatmap
              xLabels={statuses.map(humanize)}
              yLabels={topDocumentKeys.map(humanize)}
              cells={requirementMatrix}
              valueLabel="Requirements"
            />
          </SectionCard>
          <SectionCard title="Missing-document Rule Breaches" description="The rules responsible for the missing-document flags. The cumulative line shows how concentrated the problem is in the top rules.">
            <AnalyticsParetoChart rows={missingRules} valueLabel="Missing flags" />
          </SectionCard>
          <DetailDisclosure title="View document requirement detail" headers={['Document Type', 'Assessment Status', 'Requirements']} rows={requirements.map((row) => [humanize(row.document_type), humanize(row.status), formatNumber(row.requirement_count)])} />
        </>
      );
    }
    case 'turnaround': {
      const row = payload.data.rows[0];
      return (
        <>
          <div className="metric-grid analytics-metric-grid analytics-turnaround-grid">
            <MetricCard label="Completed Journeys" value={formatNumber(row?.completed_count || 0)} detail="Journeys with both first receipt and delivery" />
            <MetricCard label="Average Turnaround" value={row?.avg_days == null ? '—' : `${Number(row.avg_days).toFixed(1)} days`} detail="First receipt to delivery" />
          </div>
          <SectionCard title="Turnaround Analysis Awaiting Distribution Data" description="The current Analytics endpoint exposes only completed count and average turnaround.">
            <p className="analytics-note">A slab chart, model comparison or time trend would require bucketed or dated turnaround rows. No synthetic distribution is shown.</p>
          </SectionCard>
        </>
      );
    }
    case 'productivity': {
      const { rows } = payload.data;
      const activities = rows.reduce((sum, row) => sum + row.activity_count, 0);
      const employees = new Set(rows.map((row) => row.actor_id).filter((value) => value !== 'UNSPECIFIED')).size;
      const roles = new Set(rows.map((row) => row.actor_role).filter((value) => value !== 'UNSPECIFIED')).size;
      const employeeActivity = aggregate(rows, (row) => compactActor(row.actor_id), (row) => row.activity_count);
      const actorTotals = aggregate(rows, (row) => row.actor_id, (row) => row.activity_count);
      const topActorKeys = actorTotals.slice(0, 12).map((row) => row.label);
      const dateKeys = Array.from(new Set(rows.map((row) => row.activity_date).filter((value): value is string => Boolean(value))))
        .sort()
        .slice(-14);
      const heatRows = rows.filter((row) => topActorKeys.includes(row.actor_id) && row.activity_date && dateKeys.includes(row.activity_date));
      const activityMatrix = matrixFromRows(
        heatRows,
        dateKeys,
        topActorKeys,
        (row) => row.activity_date || '',
        (row) => row.actor_id,
        (row) => row.activity_count,
      );
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Recorded Activities" value={formatNumber(activities)} detail="Workflow activities in snapshot" />
            <MetricCard label="Employees" value={formatNumber(employees)} detail="Distinct actors represented" />
            <MetricCard label="Roles" value={formatNumber(roles)} detail="Operational roles represented" />
            <MetricCard label="Average Activities" value={employees ? formatNumber(Math.round(activities / employees)) : '—'} detail="Recorded activities per represented employee" />
          </div>
          <SectionCard title="Employee Activity Calendar" description="Activity concentration across the most active employees and latest captured dates.">
            <AnalyticsHeatmap
              xLabels={dateKeys.map(formatShortDate)}
              yLabels={topActorKeys.map(compactActor)}
              cells={activityMatrix}
              valueLabel="Activities"
            />
          </SectionCard>
          <SectionCard title="Employee Activity Ranking" description="Total recorded workflow activity by employee / actor in the current snapshot.">
            <AnalyticsBarChart rows={employeeActivity} valueLabel="Activities" />
          </SectionCard>
          <p className="analytics-footnote">Employee names are not present in the current Analytics payload; actor IDs are shown without inventing directory data.</p>
          <DetailDisclosure title="View employee activity detail" headers={['Role', 'Employee / Actor', 'Date', 'Activities']} rows={rows.slice(0, 100).map((row) => [humanize(row.actor_role), row.actor_id, row.activity_date || '—', formatNumber(row.activity_count)])} />
        </>
      );
    }
  }
}

export default function AnalyticsPage() {
  const [searchParams] = useSearchParams();
  const activeView = parseReport(searchParams.get('report'));
  const accessToken = useSessionStore((state) => state.accessToken);
  const sessionTenantId = useSessionStore((state) => state.tenantId);
  const selectedProject = useProjectContextStore((state) => state.selectedProject);
  const tenantId = selectedProject?.tenantId || sessionTenantId;

  const overviewQuery = useQuery({
    queryKey: ['analytics', 'dashboard', tenantId],
    enabled: Boolean(activeView === 'overview' && tenantId && accessToken),
    queryFn: ({ signal }) => getAnalyticsDashboard(tenantId!, accessToken!, signal),
    staleTime: 60_000,
    retry: (failureCount, error) => {
      if (error instanceof AnalyticsHttpError && [401, 403, 404].includes(error.status)) return false;
      return failureCount < 1;
    },
  });

  const reportQuery = useQuery({
    queryKey: ['analytics', 'report', tenantId, activeView],
    enabled: Boolean(activeView !== 'overview' && tenantId && accessToken),
    queryFn: ({ signal }) => getAnalyticsReport(tenantId!, accessToken!, activeView as AnalyticsReportKey, signal),
    staleTime: 60_000,
    retry: (failureCount, error) => {
      if (error instanceof AnalyticsHttpError && [401, 403, 404].includes(error.status)) return false;
      return failureCount < 1;
    },
  });

  const currentAsOf = activeView === 'overview' ? overviewQuery.data?.overview.data_as_of : reportAsOf(reportQuery.data);
  const viewTitle = reportLabels[activeView];

  if (!tenantId) {
    return (
      <div className="screen-stack analytics-screen">
        <PageHeader eyebrow="Insights · Analytics" title={viewTitle} description="Business, audit and employee analytics from controlled Audit Core snapshots." />
        <SectionCard title="Select a project"><p>Choose a project from the Verigence project selector to load tenant analytics.</p></SectionCard>
      </div>
    );
  }

  return (
    <div className="screen-stack analytics-screen">
      <PageHeader
        eyebrow="Insights · Analytics"
        title={viewTitle}
        description={`Independent business reporting from controlled Audit Core snapshots${currentAsOf ? `. Data as of ${formatAsOf(currentAsOf)}.` : '.'}`}
      />

      {activeView === 'overview' ? (
        overviewQuery.isPending ? (
          <SectionCard title="Loading overview"><p>Loading the latest Analytics snapshot…</p></SectionCard>
        ) : overviewQuery.isError ? (
          <ReportError error={overviewQuery.error} />
        ) : overviewQuery.data ? (() => {
          const data = overviewQuery.data;
          const journeyCount = data.overview.entities.find((row) => row.source_table === 'journeys')?.row_count
            ?? data.overview.entities.find((row) => row.source_table === 'bookings')?.row_count
            ?? 0;
          const findingCount = data.findings.rows.reduce((total, row) => total + row.finding_count, 0);
          const missingDocumentFlags = data.documents.missing_document_flags.reduce((total, row) => total + row.flag_count, 0);
          const paymentTotal = data.payments.rows.reduce((total, row) => total + numeric(row.total_amount), 0);
          const severityMix = aggregate(data.findings.rows, (row) => humanize(row.severity), (row) => row.finding_count);
          const paymentEconomics = data.payments.rows.map((row) => ({
            label: humanize(row.payment_method),
            bar: numeric(row.total_amount),
            line: row.payment_count ? numeric(row.total_amount) / row.payment_count : 0,
          }));
          const ruleConcentration = aggregate(data.findings.rows, (row) => humanizeRuleKey(row.rule_key), (row) => row.finding_count);
          const missingRules = aggregate(data.documents.missing_document_flags, (row) => humanizeRuleKey(row.rule_key), (row) => row.flag_count);
          return (
            <>
              <div className="metric-grid analytics-metric-grid">
                <MetricCard label="Audited Journeys" value={formatNumber(journeyCount)} detail="Journeys represented in the latest controlled snapshot" />
                <MetricCard label="Audit Findings" value={formatNumber(findingCount)} detail="Findings represented in the latest snapshot" />
                <MetricCard label="Missing Document Flags" value={formatNumber(missingDocumentFlags)} detail="Audit-rule breaches caused by missing expected evidence" />
                <MetricCard label="Receipt Value" value={formatMoney(paymentTotal)} detail="Captured payment value in the latest snapshot" />
              </div>

              <div className="analytics-layout analytics-layout--overview">
                <SectionCard title="Finding Severity" description="Current audit finding severity mix.">
                  <AnalyticsDonutChart rows={severityMix} valueLabel="Findings" />
                </SectionCard>
                <SectionCard title="Payment Economics" description="Receipt value and average transaction value by payment mode.">
                  <AnalyticsComboChart rows={paymentEconomics} barLabel="Receipt value" lineLabel="Average payment" barKind="currency" lineKind="currency" />
                </SectionCard>
              </div>

              <div className="analytics-layout analytics-layout--overview-secondary">
                <SectionCard title="Top Audit Exception Concentration" description="Largest rule/control concentrations in the current snapshot.">
                  <AnalyticsTreemap rows={ruleConcentration} valueLabel="Findings" />
                </SectionCard>
                <SectionCard title="Missing-document Concentration" description="Which missing-document rules account for most of the current flags.">
                  <AnalyticsParetoChart rows={missingRules} valueLabel="Missing flags" />
                </SectionCard>
              </div>

              <details className="analytics-coverage">
                <summary>Snapshot data coverage · technical diagnostics</summary>
                <div className="analytics-coverage__body">
                  <p>Ingestion coverage for the current Analytics snapshot. This diagnostic table is intentionally separated from the business reports.</p>
                  <ReportTable headers={['Dataset', 'Rows']} rows={data.overview.entities.map((row) => [humanize(row.source_table), formatNumber(row.row_count)])} />
                </div>
              </details>
            </>
          );
        })() : null
      ) : reportQuery.isPending ? (
        <SectionCard title={`Loading ${viewTitle}`}><p>Loading this report from the latest controlled snapshot…</p></SectionCard>
      ) : reportQuery.isError ? (
        <ReportError error={reportQuery.error} />
      ) : reportQuery.data ? (
        <ReportContent payload={reportQuery.data} />
      ) : null}
    </div>
  );
}
