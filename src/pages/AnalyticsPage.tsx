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
type InsightTone = 'default' | 'attention' | 'positive';

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

function formatSignedMoney(value: number): string {
  if (value === 0) return formatMoney(0);
  return `${value > 0 ? '+' : '−'}${formatMoney(Math.abs(value))}`;
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

function percent(part: number, total: number): string {
  return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : '—';
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

function HeroStat({
  eyebrow,
  value,
  title,
  detail,
  tone = 'default',
}: {
  eyebrow: string;
  value: string;
  title: string;
  detail: string;
  tone?: InsightTone;
}) {
  return (
    <article className={`analytics-hero-stat analytics-hero-stat--${tone}`}>
      <span className="analytics-hero-stat__eyebrow">{eyebrow}</span>
      <strong className="analytics-hero-stat__value">{value}</strong>
      <h3>{title}</h3>
      <p>{detail}</p>
    </article>
  );
}

function InsightCard({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string;
  detail: string;
  tone?: InsightTone;
}) {
  return (
    <article className={`analytics-insight-card analytics-insight-card--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function RankedList({
  title,
  description,
  items,
}: {
  title: string;
  description?: string;
  items: Array<{ label: string; value: string; meta?: string; tone?: InsightTone }>;
}) {
  return (
    <section className="analytics-ranked-panel">
      <div className="analytics-ranked-panel__header">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {items.length ? (
        <ol className="analytics-ranked-list">
          {items.map((item, index) => (
            <li key={`${item.label}-${index}`} className={`analytics-ranked-list__item analytics-ranked-list__item--${item.tone || 'default'}`}>
              <span className="analytics-ranked-list__rank">{index + 1}</span>
              <span className="analytics-ranked-list__copy">
                <strong>{item.label}</strong>
                {item.meta ? <small>{item.meta}</small> : null}
              </span>
              <span className="analytics-ranked-list__value">{item.value}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="analytics-empty-copy">No items in the current snapshot.</p>
      )}
    </section>
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
      const providers = aggregate(rows, (row) => humanize(row.provider), (row) => numeric(row.financed_amount));
      const financeTypes = aggregate(rows, (row) => humanize(row.finance_type), (row) => row.deal_count);
      const topProvider = providers[0];
      const topType = financeTypes[0];
      const hierarchy = rows.map((row) => ({ group: humanize(row.finance_type), label: humanize(row.provider), value: row.deal_count }));
      const providerPosition = aggregateBubble(rows, (row) => humanize(row.provider), (row) => row.deal_count, (row) => numeric(row.financed_amount));
      return (
        <>
          <div className="analytics-finance-hero">
            <HeroStat eyebrow="Portfolio value" value={formatMoney(amount)} title="Captured financed business" detail={`${formatNumber(deals)} financed deals in the current snapshot.`} />
            <div className="analytics-insight-stack">
              <InsightCard label="Leading finance type" value={topType?.label || '—'} detail={topType ? `${percent(topType.value, deals)} of captured finance deals` : 'No finance mix captured'} />
              <InsightCard label="Leading provider by value" value={topProvider?.label || '—'} detail={topProvider ? `${formatMoney(topProvider.value)} · ${percent(topProvider.value, amount)} of financed value` : 'No provider value captured'} />
              <InsightCard label="Average financed amount" value={deals ? formatMoney(amount / deals) : '—'} detail="Captured financed value per financed deal" />
            </div>
          </div>
          <SectionCard title="Finance Portfolio Structure" description="Finance type forms the inner ring and providers the outer ring. Segment size represents deal volume.">
            <AnalyticsSunburstChart rows={hierarchy} valueLabel="Deals" />
          </SectionCard>
          <div className="analytics-split analytics-split--wide-left">
            <SectionCard title="Provider Positioning" description="Compare providers on deal volume and financed value. Larger bubbles represent more deals.">
              <AnalyticsBubbleChart rows={providerPosition} xLabel="Deals" yLabel="Financed value" yKind="currency" />
            </SectionCard>
            <RankedList title="Provider value leaderboard" description="Where the captured financed value is concentrated." items={providers.slice(0, 6).map((row) => ({ label: row.label, value: formatMoney(row.value), meta: percent(row.value, amount) }))} />
          </div>
          <DetailDisclosure title="View finance transaction summary" headers={['Finance Type', 'Provider', 'Deals', 'Financed Amount']} rows={rows.map((row) => [humanize(row.finance_type), humanize(row.provider), formatNumber(row.deal_count), formatMoney(row.financed_amount)])} />
        </>
      );
    }

    case 'insurance': {
      const { rows, duplicate_agent_codes: duplicates } = payload.data;
      const policies = rows.reduce((sum, row) => sum + row.policy_count, 0);
      const premium = rows.reduce((sum, row) => sum + numeric(row.premium_amount), 0);
      const sourceMix = aggregate(rows, (row) => humanize(row.insurance_by), (row) => row.policy_count);
      const insurerValue = aggregate(rows, (row) => humanize(row.insurer), (row) => numeric(row.premium_amount));
      const topSource = sourceMix[0];
      const topInsurer = insurerValue[0];
      const insurerPosition = aggregateBubble(rows, (row) => humanize(row.insurer), (row) => row.policy_count, (row) => numeric(row.premium_amount));
      return (
        <>
          <div className="analytics-insurance-banner">
            <HeroStat eyebrow="Insurance book" value={formatMoney(premium)} title={`${formatNumber(policies)} policies captured`} detail={policies ? `${formatMoney(premium / policies)} average captured premium per policy.` : 'No captured policy value.'} />
            <InsightCard label="Primary sourcing route" value={topSource?.label || '—'} detail={topSource ? `${percent(topSource.value, policies)} of captured policies` : 'No source split captured'} />
            <InsightCard label="Largest insurer by premium" value={topInsurer?.label || '—'} detail={topInsurer ? `${formatMoney(topInsurer.value)} captured premium` : 'No insurer premium captured'} />
            <InsightCard label="Repeated agent codes" value={formatNumber(duplicates.length)} detail={duplicates.length ? 'Codes reused across multiple bookings require attention' : 'No repeated agent-code exception in this snapshot'} tone={duplicates.length ? 'attention' : 'positive'} />
          </div>
          <div className="analytics-split analytics-split--insurance">
            <SectionCard title="Insurance Source Mix" description="How the captured policies are sourced across in-house, self and external channels.">
              <AnalyticsDonutChart rows={sourceMix} valueLabel="Policies" />
            </SectionCard>
            <SectionCard title="Insurer Portfolio" description="Insurers positioned by policy volume and premium value.">
              <AnalyticsBubbleChart rows={insurerPosition} xLabel="Policies" yLabel="Premium value" yKind="currency" />
            </SectionCard>
          </div>
          {duplicates.length ? (
            <RankedList title="Agent-code exceptions" description="Repeated codes are shown first because they are directly actionable audit exceptions." items={duplicates.slice(0, 8).map((row) => ({ label: row.agent_code, value: `${formatNumber(row.booking_count)} bookings`, tone: 'attention' }))} />
          ) : null}
          <DetailDisclosure title="View insurance detail" headers={['Insurance By', 'Insurer', 'Policies', 'Premium']} rows={rows.map((row) => [humanize(row.insurance_by), humanize(row.insurer), formatNumber(row.policy_count), formatMoney(row.premium_amount)])} />
        </>
      );
    }

    case 'addons': {
      const { rows } = payload.data;
      const attaches = rows.reduce((sum, row) => sum + row.attach_count, 0);
      const value = rows.reduce((sum, row) => sum + numeric(row.actual_amount), 0);
      const comboRows = rows.map((row) => ({ label: humanize(row.addon_type), bar: row.attach_count, line: row.attach_count ? numeric(row.actual_amount) / row.attach_count : 0 }));
      const economics = rows
        .map((row) => ({ label: humanize(row.addon_type), count: row.attach_count, value: numeric(row.actual_amount), average: row.attach_count ? numeric(row.actual_amount) / row.attach_count : 0 }))
        .sort((a, b) => b.value - a.value);
      return (
        <>
          <div className="analytics-product-summary">
            <HeroStat eyebrow="VAS captured value" value={formatMoney(value)} title="Add-on economics" detail={`${formatNumber(attaches)} EW, RSA, accessory and service-package attachments captured.`} />
            <RankedList title="Product contribution" description="Products ranked by captured value, with attach volume shown below." items={economics.slice(0, 6).map((row) => ({ label: row.label, value: formatMoney(row.value), meta: `${formatNumber(row.count)} attaches · ${formatMoney(row.average)} average` }))} />
          </div>
          <SectionCard title="Volume vs Value per Attachment" description="Bars show attachment volume; the line shows average captured value per attachment, revealing high-volume versus high-value products.">
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
      const gap = actual - eligible;
      const variance = rows.map((row) => ({ label: humanize(row.discount_key), value: numeric(row.actual_discount_amount) - numeric(row.standard_eligible_amount) }));
      const exposure = variance.filter((row) => row.value !== 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
      const applicationMix = aggregate(rows, (row) => humanize(row.discount_key), (row) => row.application_count);
      return (
        <>
          <div className="analytics-discount-headline">
            <HeroStat eyebrow="Net variance" value={formatSignedMoney(gap)} title={gap > 0 ? 'Discount above captured eligible basis' : gap < 0 ? 'Discount below captured eligible basis' : 'Discount matches captured eligible basis'} detail={`${formatMoney(actual)} actual discount across ${formatNumber(applications)} applications versus ${formatMoney(eligible)} captured eligible basis.`} tone={gap > 0 ? 'attention' : gap < 0 ? 'positive' : 'default'} />
            <RankedList title="Largest discount gaps" description="Types with the largest absolute difference between actual and captured eligible basis." items={exposure.slice(0, 6).map((row) => ({ label: row.label, value: formatSignedMoney(row.value), meta: row.value > 0 ? 'Above basis' : 'Below basis', tone: row.value > 0 ? 'attention' : 'positive' }))} />
          </div>
          <SectionCard title="Discount Variance by Type" description="The zero line is the captured standard basis. Positive bars deserve immediate commercial review.">
            <AnalyticsVarianceChart rows={variance} valueLabel="Actual minus eligible" />
          </SectionCard>
          <div className="analytics-split analytics-split--compact-right">
            <SectionCard title="Application Mix" description="How frequently each discount type is being used.">
              <AnalyticsDonutChart rows={applicationMix} valueLabel="Applications" />
            </SectionCard>
            <div className="analytics-insight-stack">
              <InsightCard label="Actual discount" value={formatMoney(actual)} detail="Total captured discount granted" />
              <InsightCard label="Eligible basis" value={formatMoney(eligible)} detail="Total captured standard eligible amount" />
              <InsightCard label="Applications" value={formatNumber(applications)} detail="Captured discount applications" />
            </div>
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
      const statusValue = rows.map((row) => ({ label: humanize(row.status), value: numeric(row.actual_value), count: row.trade_in_count })).sort((a, b) => b.value - a.value);
      const statusPosition = rows.map((row) => ({ label: humanize(row.status), x: row.trade_in_count, y: numeric(row.actual_value), size: row.trade_in_count }));
      return (
        <>
          <div className="analytics-trade-ledger">
            <div className="analytics-trade-ledger__summary">
              <span>Captured trade-in book</span>
              <strong>{formatMoney(value)}</strong>
              <p>{formatNumber(count)} cases · {count ? `${formatMoney(value / count)} average actual value` : 'no captured cases'}</p>
            </div>
            <SectionCard title="Case Status Mix" description="How current captured trade-in cases are distributed by status.">
              <AnalyticsDonutChart rows={statusMix} valueLabel="Cases" />
            </SectionCard>
          </div>
          <div className="analytics-split analytics-split--trade">
            <SectionCard title="Status Volume vs Value" description="Statuses with more cases and more trapped value move toward the upper-right of the chart.">
              <AnalyticsBubbleChart rows={statusPosition} xLabel="Cases" yLabel="Trade-in value" yKind="currency" />
            </SectionCard>
            <RankedList title="Value by status" description="Where the captured trade-in value currently sits." items={statusValue.slice(0, 6).map((row) => ({ label: row.label, value: formatMoney(row.value), meta: `${formatNumber(row.count)} cases · ${percent(row.value, value)} of value` }))} />
          </div>
          <DetailDisclosure title="View trade-in detail" headers={['Status', 'Cases', 'Actual Value']} rows={rows.map((row) => [humanize(row.status), formatNumber(row.trade_in_count), formatMoney(row.actual_value)])} />
        </>
      );
    }

    case 'payments': {
      const { rows } = payload.data;
      const count = rows.reduce((sum, row) => sum + row.payment_count, 0);
      const amount = rows.reduce((sum, row) => sum + numeric(row.total_amount), 0);
      const comboRows = rows.map((row) => ({ label: humanize(row.payment_method), bar: numeric(row.total_amount), line: row.payment_count ? numeric(row.total_amount) / row.payment_count : 0 }));
      const methods = rows
        .map((row) => ({ label: humanize(row.payment_method), count: row.payment_count, value: numeric(row.total_amount), average: row.payment_count ? numeric(row.total_amount) / row.payment_count : 0 }))
        .sort((a, b) => b.value - a.value);
      return (
        <>
          <div className="analytics-payment-flow">
            <div className="analytics-payment-flow__total">
              <span>Total captured receipts</span>
              <strong>{formatMoney(amount)}</strong>
              <p>{formatNumber(count)} payment entries across {formatNumber(rows.length)} captured modes.</p>
            </div>
            <div className="analytics-payment-flow__average">
              <span>Average payment</span>
              <strong>{count ? formatMoney(amount / count) : '—'}</strong>
              <p>Captured receipt value per payment entry.</p>
            </div>
          </div>
          <SectionCard title="Payment Mode Economics" description="Total receipt value is shown as bars; average transaction value is shown as the line.">
            <AnalyticsComboChart rows={comboRows} barLabel="Receipt value" lineLabel="Average payment" barKind="currency" lineKind="currency" />
          </SectionCard>
          <RankedList title="Payment mode contribution" description="Modes ranked by captured receipt value." items={methods.slice(0, 8).map((row) => ({ label: row.label, value: formatMoney(row.value), meta: `${formatNumber(row.count)} payments · ${formatMoney(row.average)} average · ${percent(row.value, amount)} of value` }))} />
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
      const urgentRules = aggregate(rows.filter((row) => row.status.toUpperCase() === 'OPEN' && row.severity.toUpperCase() === 'HIGH'), (row) => humanizeRuleKey(row.rule_key), (row) => row.finding_count);
      const statuses = Array.from(new Set(rows.map((row) => row.status))).sort();
      const severities = Array.from(new Set(rows.map((row) => row.severity))).sort();
      const matrix = matrixFromRows(rows, statuses, severities, (row) => row.status, (row) => row.severity, (row) => row.finding_count);
      return (
        <>
          <div className="analytics-risk-strip">
            <InsightCard label="Open findings" value={formatNumber(open)} detail={`${percent(open, total)} of all captured findings`} tone={open ? 'attention' : 'positive'} />
            <InsightCard label="High severity" value={formatNumber(high)} detail={`${percent(high, total)} of all captured findings`} tone={high ? 'attention' : 'positive'} />
            <InsightCard label="Resolved" value={formatNumber(resolved)} detail={`${percent(resolved, total)} of all captured findings`} tone={resolved ? 'positive' : 'default'} />
          </div>
          <div className="analytics-risk-layout">
            <RankedList title="Immediate attention" description="Open, high-severity rules ranked by current finding count." items={urgentRules.slice(0, 8).map((row) => ({ label: row.label, value: formatNumber(row.value), meta: 'Open · High severity', tone: 'attention' }))} />
            <SectionCard title="Status × Severity Matrix" description="A compact risk map of where the finding population sits by workflow status and severity.">
              <AnalyticsHeatmap xLabels={statuses.map(humanize)} yLabels={severities.map(humanize)} cells={matrix} valueLabel="Findings" />
            </SectionCard>
          </div>
          <SectionCard title="Exception Concentration" description="Area represents the share of captured findings generated by each rule or control.">
            <AnalyticsTreemap rows={ruleConcentration} valueLabel="Findings" />
          </SectionCard>
          <DetailDisclosure title="View finding detail" headers={['Rule / Control', 'Status', 'Severity', 'Count']} rows={rows.map((row) => [humanizeRuleKey(row.rule_key), humanize(row.status), humanize(row.severity), formatNumber(row.finding_count)])} />
        </>
      );
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
      return (
        <>
          <div className="analytics-document-hero">
            <HeroStat eyebrow="Missing evidence breaches" value={formatNumber(missingCount)} title={missingCount ? 'Document exceptions need attention' : 'No missing-document breach captured'} detail={`${formatNumber(requirementCount)} requirement assessments were evaluated. Missing-rule flags represent ${percent(missingCount, requirementCount)} of those requirement records.`} tone={missingCount ? 'attention' : 'positive'} />
            <RankedList title="What is actually missing" description="Missing-document audit rules, not the general list of required document types." items={missingRules.slice(0, 7).map((row) => ({ label: row.label, value: formatNumber(row.value), meta: `${percent(row.value, missingCount)} of missing flags`, tone: 'attention' }))} />
          </div>
          <SectionCard title="Missing-document Concentration" description="Bars rank the rules generating missing-document flags; the line shows cumulative concentration so the biggest causes are immediately visible.">
            <AnalyticsParetoChart rows={missingRules} valueLabel="Missing flags" />
          </SectionCard>
          <div className="analytics-split analytics-split--documents">
            <SectionCard title="Requirement Assessment Status" description="Overall assessment outcome mix across all captured document requirements.">
              <AnalyticsDonutChart rows={statusMix} valueLabel="Requirements" />
            </SectionCard>
            <div className="analytics-document-summary">
              <InsightCard label="Requirements assessed" value={formatNumber(requirementCount)} detail="All captured document requirement records" />
              <InsightCard label="Document types" value={formatNumber(new Set(requirements.map((row) => row.document_type)).size)} detail="Distinct document types represented" />
              <InsightCard label="Missing flag rate" value={percent(missingCount, requirementCount)} detail="Missing-document flags as a share of requirement records" tone={missingCount ? 'attention' : 'positive'} />
            </div>
          </div>
          <details className="analytics-detail">
            <summary>View document assessment matrix</summary>
            <div className="analytics-detail__body">
              <p className="analytics-footnote">This matrix shows the assessment-status distribution for the highest-volume document types. It is diagnostic context, not the missing-flag count.</p>
              <AnalyticsHeatmap xLabels={statuses.map(humanize)} yLabels={topDocumentKeys.map(humanize)} cells={requirementMatrix} valueLabel="Requirements" />
            </div>
          </details>
          <DetailDisclosure title="View document requirement detail" headers={['Document Type', 'Assessment Status', 'Requirements']} rows={requirements.map((row) => [humanize(row.document_type), humanize(row.status), formatNumber(row.requirement_count)])} />
        </>
      );
    }

    case 'turnaround': {
      const row = payload.data.rows[0];
      const completed = row?.completed_count || 0;
      const average = row?.avg_days == null ? null : Number(row.avg_days);
      return (
        <>
          <div className="analytics-turnaround-hero">
            <HeroStat eyebrow="Completed journeys" value={formatNumber(completed)} title="Receipt-to-delivery completion" detail="Journeys with both first receipt and delivery available in the current snapshot." />
            <HeroStat eyebrow="Average turnaround" value={average == null ? '—' : `${average.toFixed(1)} days`} title="First receipt to delivery" detail={completed ? 'Average across completed journeys represented in this snapshot.' : 'No completed journey has both dates available.'} />
          </div>
          <section className="analytics-data-gap">
            <div>
              <span>Current data boundary</span>
              <h3>Distribution and trend analysis are not yet available from this endpoint.</h3>
              <p>The API currently returns only completed count and average days. Slabs, model-wise comparison and month-on-month movement require bucketed or dated turnaround rows. No synthetic chart is shown.</p>
            </div>
          </section>
        </>
      );
    }

    case 'productivity': {
      const { rows } = payload.data;
      const activities = rows.reduce((sum, row) => sum + row.activity_count, 0);
      const actorTotals = aggregate(rows, (row) => row.actor_id, (row) => row.activity_count);
      const roleTotals = aggregate(rows, (row) => humanize(row.actor_role), (row) => row.activity_count);
      const employees = actorTotals.filter((row) => row.label !== 'UNSPECIFIED').length;
      const topActorKeys = actorTotals.slice(0, 10).map((row) => row.label);
      const dateKeys = Array.from(new Set(rows.map((row) => row.activity_date).filter((value): value is string => Boolean(value)))).sort().slice(-14);
      const heatRows = rows.filter((row) => topActorKeys.includes(row.actor_id) && row.activity_date && dateKeys.includes(row.activity_date));
      const activityMatrix = matrixFromRows(heatRows, dateKeys, topActorKeys, (row) => row.activity_date || '', (row) => row.actor_id, (row) => row.activity_count);
      return (
        <>
          <div className="analytics-employee-summary">
            <HeroStat eyebrow="Recorded workflow activity" value={formatNumber(activities)} title={`${formatNumber(employees)} employees represented`} detail={employees ? `${formatNumber(Math.round(activities / employees))} recorded activities per represented employee on average.` : 'No employee activity captured.'} />
            <RankedList title="Most active employees" description="Current snapshot ranking by recorded workflow activity." items={actorTotals.slice(0, 8).map((row) => ({ label: compactActor(row.label), value: formatNumber(row.value), meta: `${percent(row.value, activities)} of recorded activity` }))} />
          </div>
          <div className="analytics-split analytics-split--employees">
            <SectionCard title="Activity by Role" description="Share of recorded workflow activity by operational role.">
              <AnalyticsDonutChart rows={roleTotals} valueLabel="Activities" />
            </SectionCard>
            <SectionCard title="Employee Activity Calendar" description="Activity concentration across the most active employees and the latest captured dates.">
              <AnalyticsHeatmap xLabels={dateKeys.map(formatShortDate)} yLabels={topActorKeys.map(compactActor)} cells={activityMatrix} valueLabel="Activities" />
            </SectionCard>
          </div>
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
          const openFindings = data.findings.rows.filter((row) => row.status.toUpperCase() === 'OPEN').reduce((total, row) => total + row.finding_count, 0);
          const highFindings = data.findings.rows.filter((row) => row.severity.toUpperCase() === 'HIGH').reduce((total, row) => total + row.finding_count, 0);
          const missingDocumentFlags = data.documents.missing_document_flags.reduce((total, row) => total + row.flag_count, 0);
          const paymentTotal = data.payments.rows.reduce((total, row) => total + numeric(row.total_amount), 0);
          const severityMix = aggregate(data.findings.rows, (row) => humanize(row.severity), (row) => row.finding_count);
          const paymentEconomics = data.payments.rows.map((row) => ({ label: humanize(row.payment_method), bar: numeric(row.total_amount), line: row.payment_count ? numeric(row.total_amount) / row.payment_count : 0 }));
          const ruleConcentration = aggregate(data.findings.rows, (row) => humanizeRuleKey(row.rule_key), (row) => row.finding_count);
          const missingRules = aggregate(data.documents.missing_document_flags, (row) => humanizeRuleKey(row.rule_key), (row) => row.flag_count);
          const attentionItems = [
            ...ruleConcentration.slice(0, 3).map((row) => ({ label: row.label, value: `${formatNumber(row.value)} findings`, meta: 'Top audit concentration', tone: 'attention' as InsightTone })),
            ...missingRules.slice(0, 2).map((row) => ({ label: row.label, value: `${formatNumber(row.value)} flags`, meta: 'Missing-document breach', tone: 'attention' as InsightTone })),
          ].sort((a, b) => Number.parseInt(b.value, 10) - Number.parseInt(a.value, 10));
          return (
            <>
              <div className="analytics-overview-pulse">
                <div className="metric-grid analytics-metric-grid analytics-overview-metrics">
                  <MetricCard label="Audited Journeys" value={formatNumber(journeyCount)} detail="Journeys represented in the latest controlled snapshot" />
                  <MetricCard label="Audit Findings" value={formatNumber(findingCount)} detail={`${formatNumber(openFindings)} open · ${formatNumber(highFindings)} high severity`} />
                  <MetricCard label="Missing Document Flags" value={formatNumber(missingDocumentFlags)} detail="Audit-rule breaches caused by missing expected evidence" />
                  <MetricCard label="Receipt Value" value={formatMoney(paymentTotal)} detail="Captured payment value in the latest snapshot" />
                </div>
                <RankedList title="Needs attention now" description="The biggest current audit and missing-document concentrations from this snapshot." items={attentionItems} />
              </div>

              <div className="analytics-split analytics-split--overview">
                <SectionCard title="Finding Severity" description="Current finding mix by captured severity.">
                  <AnalyticsDonutChart rows={severityMix} valueLabel="Findings" />
                </SectionCard>
                <SectionCard title="Payment Economics" description="Receipt value and average transaction value by payment mode.">
                  <AnalyticsComboChart rows={paymentEconomics} barLabel="Receipt value" lineLabel="Average payment" barKind="currency" lineKind="currency" />
                </SectionCard>
              </div>

              <SectionCard title="Where Audit Exceptions Concentrate" description="The largest rule/control concentrations in the current snapshot; bigger blocks represent more findings.">
                <AnalyticsTreemap rows={ruleConcentration} valueLabel="Findings" />
              </SectionCard>

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
