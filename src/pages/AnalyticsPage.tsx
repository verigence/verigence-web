import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import {
  AnalyticsBarChart,
  AnalyticsDonutChart,
  AnalyticsMultiBarChart,
  AnalyticsTreemap,
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

function numeric(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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
    const key = label(row) || 'UNSPECIFIED';
    totals.set(key, (totals.get(key) || 0) + value(row));
  });
  return Array.from(totals.entries())
    .map(([rowLabel, rowValue]) => ({ label: rowLabel, value: rowValue }))
    .sort((a, b) => b.value - a.value);
}

function pivot<T>(
  rows: T[],
  category: (row: T) => string,
  seriesName: (row: T) => string,
  value: (row: T) => number,
) {
  const seriesNames = Array.from(new Set(rows.map(seriesName).filter(Boolean))).slice(0, 6);
  const series = seriesNames.map((label, index) => ({ key: `series_${index}`, label }));
  const seriesKey = new Map(seriesNames.map((label, index) => [label, `series_${index}`]));
  const grouped = new Map<string, Record<string, string | number>>();

  rows.forEach((row) => {
    const label = category(row) || 'UNSPECIFIED';
    const key = seriesKey.get(seriesName(row));
    if (!key) return;
    const target = grouped.get(label) || { label };
    target[key] = numeric(target[key]) + value(row);
    grouped.set(label, target);
  });

  const chartRows = Array.from(grouped.values())
    .map((row) => ({ ...row, label: String(row.label) }))
    .sort((a, b) => {
      const aTotal = series.reduce((sum, item) => sum + numeric(a[item.key]), 0);
      const bTotal = series.reduce((sum, item) => sum + numeric(b[item.key]), 0);
      return bTotal - aTotal;
    });

  return { chartRows, series };
}

function ReportContent({ payload }: { payload: AnalyticsReportPayload }) {
  switch (payload.kind) {
    case 'finance': {
      const { rows } = payload.data;
      const deals = rows.reduce((sum, row) => sum + row.deal_count, 0);
      const amount = rows.reduce((sum, row) => sum + numeric(row.financed_amount), 0);
      const providers = new Set(rows.map((row) => row.provider).filter((value) => value !== 'UNSPECIFIED')).size;
      const financeTypeMix = aggregate(rows, (row) => row.finance_type, (row) => row.deal_count);
      const providerValue = aggregate(rows, (row) => row.provider, (row) => numeric(row.financed_amount));
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Finance Deals" value={formatNumber(deals)} detail="Deals with captured finance records" />
            <MetricCard label="Financed Amount" value={formatMoney(amount)} detail="Captured financed value" />
            <MetricCard label="Finance Providers" value={formatNumber(providers)} detail="Distinct captured providers" />
            <MetricCard label="Average Financed" value={deals ? formatMoney(amount / deals) : '—'} detail="Average financed value per captured deal" />
          </div>
          <div className="dashboard-grid analytics-report-grid">
            <SectionCard title="Finance Type Mix" description="Share of captured finance deals by finance type.">
              <AnalyticsDonutChart rows={financeTypeMix} valueLabel="Deals" />
            </SectionCard>
            <SectionCard title="Financed Value by Provider" description="Captured finance value by provider.">
              <AnalyticsBarChart rows={providerValue} valueLabel="Financed value" valueKind="currency" />
            </SectionCard>
          </div>
          <SectionCard title="Finance Detail" description="Current controlled snapshot.">
            <ReportTable headers={['Finance Type', 'Provider', 'Deals', 'Financed Amount']} rows={rows.map((row) => [row.finance_type, row.provider, formatNumber(row.deal_count), formatMoney(row.financed_amount)])} />
          </SectionCard>
        </>
      );
    }
    case 'insurance': {
      const { rows, duplicate_agent_codes: duplicates } = payload.data;
      const policies = rows.reduce((sum, row) => sum + row.policy_count, 0);
      const premium = rows.reduce((sum, row) => sum + numeric(row.premium_amount), 0);
      const insurers = new Set(rows.map((row) => row.insurer).filter((value) => value !== 'UNSPECIFIED')).size;
      const sourceMix = aggregate(rows, (row) => row.insurance_by, (row) => row.policy_count);
      const insurerPremium = aggregate(rows, (row) => row.insurer, (row) => numeric(row.premium_amount));
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Policies" value={formatNumber(policies)} detail="Captured insurance policies" />
            <MetricCard label="Premium Value" value={formatMoney(premium)} detail="Captured actual premium" />
            <MetricCard label="Insurers" value={formatNumber(insurers)} detail="Distinct captured insurers" />
            <MetricCard label="Repeated Agent Codes" value={formatNumber(duplicates.length)} detail="Agent codes reused across bookings" />
          </div>
          <div className="dashboard-grid analytics-report-grid">
            <SectionCard title="Insurance Source Mix" description="Policy mix by in-house/self/external source as captured.">
              <AnalyticsDonutChart rows={sourceMix} valueLabel="Policies" />
            </SectionCard>
            <SectionCard title="Premium by Insurer" description="Captured actual premium value by insurer.">
              <AnalyticsBarChart rows={insurerPremium} valueLabel="Premium" valueKind="currency" />
            </SectionCard>
          </div>
          <div className="dashboard-grid analytics-report-grid">
            <SectionCard title="Repeated Agent Codes" description="Codes appearing across more than one booking.">
              <ReportTable headers={['Agent Code', 'Bookings']} rows={duplicates.map((row) => [row.agent_code, formatNumber(row.booking_count)])} />
            </SectionCard>
            <SectionCard title="Insurance Detail">
              <ReportTable headers={['Insurance By', 'Insurer', 'Policies', 'Premium']} rows={rows.map((row) => [row.insurance_by, row.insurer, formatNumber(row.policy_count), formatMoney(row.premium_amount)])} />
            </SectionCard>
          </div>
        </>
      );
    }
    case 'addons': {
      const { rows } = payload.data;
      const attaches = rows.reduce((sum, row) => sum + row.attach_count, 0);
      const value = rows.reduce((sum, row) => sum + numeric(row.actual_amount), 0);
      const attachMix = aggregate(rows, (row) => row.addon_type, (row) => row.attach_count);
      const valueMix = aggregate(rows, (row) => row.addon_type, (row) => numeric(row.actual_amount));
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Add-on Attachments" value={formatNumber(attaches)} detail="EW, RSA, accessories and service packages" />
            <MetricCard label="Add-on Value" value={formatMoney(value)} detail="Captured actual add-on value" />
            <MetricCard label="Add-on Types" value={formatNumber(rows.length)} detail="Types represented in snapshot" />
            <MetricCard label="Average Value" value={attaches ? formatMoney(value / attaches) : '—'} detail="Average per captured attachment" />
          </div>
          <div className="dashboard-grid analytics-report-grid">
            <SectionCard title="Attachment Mix" description="Share of captured attachments by product type.">
              <AnalyticsDonutChart rows={attachMix} valueLabel="Attachments" />
            </SectionCard>
            <SectionCard title="Add-on Value by Type" description="Captured actual value by add-on type.">
              <AnalyticsBarChart rows={valueMix} valueLabel="Actual value" valueKind="currency" />
            </SectionCard>
          </div>
          <SectionCard title="Add-on Detail">
            <ReportTable headers={['Add-on Type', 'Attachments', 'Actual Value']} rows={rows.map((row) => [row.addon_type, formatNumber(row.attach_count), formatMoney(row.actual_amount)])} />
          </SectionCard>
        </>
      );
    }
    case 'discounts': {
      const { rows } = payload.data;
      const applications = rows.reduce((sum, row) => sum + row.application_count, 0);
      const actual = rows.reduce((sum, row) => sum + numeric(row.actual_discount_amount), 0);
      const eligible = rows.reduce((sum, row) => sum + numeric(row.standard_eligible_amount), 0);
      const comparison = rows
        .map((row) => ({
          label: row.discount_key,
          actual: numeric(row.actual_discount_amount),
          eligible: numeric(row.standard_eligible_amount),
        }))
        .sort((a, b) => b.actual - a.actual);
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Discount Applications" value={formatNumber(applications)} detail="Captured discount applications" />
            <MetricCard label="Actual Discount" value={formatMoney(actual)} detail="Total actual discount captured" />
            <MetricCard label="Standard Eligible" value={formatMoney(eligible)} detail="Total standard eligible basis" />
            <MetricCard label="Actual vs Eligible" value={formatMoney(actual - eligible)} detail="Positive value indicates above standard basis" />
          </div>
          <SectionCard title="Actual vs Standard Eligible Discount" description="Direct comparison by discount type; gaps are immediately visible.">
            <AnalyticsMultiBarChart rows={comparison} series={[{ key: 'actual', label: 'Actual discount' }, { key: 'eligible', label: 'Standard eligible' }]} valueKind="currency" />
          </SectionCard>
          <SectionCard title="Discount Detail">
            <ReportTable headers={['Discount Type', 'Applications', 'Actual', 'Standard Eligible']} rows={rows.map((row) => [row.discount_key, formatNumber(row.application_count), formatMoney(row.actual_discount_amount), formatMoney(row.standard_eligible_amount)])} />
          </SectionCard>
        </>
      );
    }
    case 'trade-in': {
      const { rows } = payload.data;
      const count = rows.reduce((sum, row) => sum + row.trade_in_count, 0);
      const value = rows.reduce((sum, row) => sum + numeric(row.actual_value), 0);
      const statusMix = aggregate(rows, (row) => row.status, (row) => row.trade_in_count);
      const statusValue = aggregate(rows, (row) => row.status, (row) => numeric(row.actual_value));
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Trade-ins" value={formatNumber(count)} detail="Captured trade-in cases" />
            <MetricCard label="Trade-in Value" value={formatMoney(value)} detail="Captured actual trade-in value" />
            <MetricCard label="Average Trade-in" value={count ? formatMoney(value / count) : '—'} detail="Average actual value per trade-in" />
            <MetricCard label="Statuses" value={formatNumber(rows.length)} detail="Trade-in statuses represented" />
          </div>
          <div className="dashboard-grid analytics-report-grid">
            <SectionCard title="Trade-in Status Mix" description="Share of captured trade-in cases by status.">
              <AnalyticsDonutChart rows={statusMix} valueLabel="Cases" />
            </SectionCard>
            <SectionCard title="Trade-in Value by Status" description="Captured actual trade-in value by status.">
              <AnalyticsBarChart rows={statusValue} valueLabel="Actual value" valueKind="currency" />
            </SectionCard>
          </div>
          <SectionCard title="Trade-in Detail">
            <ReportTable headers={['Status', 'Cases', 'Actual Value']} rows={rows.map((row) => [row.status, formatNumber(row.trade_in_count), formatMoney(row.actual_value)])} />
          </SectionCard>
        </>
      );
    }
    case 'payments': {
      const { rows } = payload.data;
      const count = rows.reduce((sum, row) => sum + row.payment_count, 0);
      const amount = rows.reduce((sum, row) => sum + numeric(row.total_amount), 0);
      const valueMix = aggregate(rows, (row) => row.payment_method, (row) => numeric(row.total_amount));
      const countMix = aggregate(rows, (row) => row.payment_method, (row) => row.payment_count);
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Payments" value={formatNumber(count)} detail="Captured payment entries" />
            <MetricCard label="Receipt Value" value={formatMoney(amount)} detail="Total captured payment value" />
            <MetricCard label="Payment Modes" value={formatNumber(rows.length)} detail="Distinct captured payment modes" />
            <MetricCard label="Average Payment" value={count ? formatMoney(amount / count) : '—'} detail="Average value per payment entry" />
          </div>
          <div className="dashboard-grid analytics-report-grid">
            <SectionCard title="Receipt Value Mix" description="Share of captured payment value by payment mode.">
              <AnalyticsDonutChart rows={valueMix} valueLabel="Value" valueKind="currency" />
            </SectionCard>
            <SectionCard title="Payment Count by Mode" description="Captured payment entries by payment mode.">
              <AnalyticsBarChart rows={countMix} valueLabel="Payments" />
            </SectionCard>
          </div>
          <SectionCard title="Payment Detail">
            <ReportTable headers={['Mode', 'Payments', 'Total Amount']} rows={rows.map((row) => [row.payment_method, formatNumber(row.payment_count), formatMoney(row.total_amount)])} />
          </SectionCard>
        </>
      );
    }
    case 'findings': {
      const { rows } = payload.data;
      const total = rows.reduce((sum, row) => sum + row.finding_count, 0);
      const open = rows.filter((row) => row.status.toUpperCase() === 'OPEN').reduce((sum, row) => sum + row.finding_count, 0);
      const resolved = rows.filter((row) => row.status.toUpperCase() === 'RESOLVED').reduce((sum, row) => sum + row.finding_count, 0);
      const high = rows.filter((row) => row.severity.toUpperCase() === 'HIGH').reduce((sum, row) => sum + row.finding_count, 0);
      const ruleConcentration = aggregate(rows, (row) => row.rule_key, (row) => row.finding_count);
      const severityMix = aggregate(rows, (row) => row.severity, (row) => row.finding_count);
      const statusSeverity = pivot(rows, (row) => row.status, (row) => row.severity, (row) => row.finding_count);
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Audit Findings" value={formatNumber(total)} detail="Findings in latest controlled snapshot" />
            <MetricCard label="Open" value={formatNumber(open)} detail="Open audit findings" />
            <MetricCard label="High Severity" value={formatNumber(high)} detail="High-severity findings" />
            <MetricCard label="Resolved" value={formatNumber(resolved)} detail="Resolved findings represented in snapshot" />
          </div>
          <div className="dashboard-grid analytics-report-grid">
            <SectionCard title="Finding Concentration" description="Treemap of the rules and controls generating the most findings.">
              <AnalyticsTreemap rows={ruleConcentration} valueLabel="Findings" />
            </SectionCard>
            <SectionCard title="Severity Mix" description="Distribution of findings by captured severity.">
              <AnalyticsDonutChart rows={severityMix} valueLabel="Findings" />
            </SectionCard>
          </div>
          <SectionCard title="Status by Severity" description="Open/resolved/other finding status split by severity.">
            <AnalyticsMultiBarChart rows={statusSeverity.chartRows} series={statusSeverity.series} stacked />
          </SectionCard>
          <SectionCard title="Finding Detail">
            <ReportTable headers={['Rule / Control', 'Status', 'Severity', 'Count']} rows={rows.map((row) => [row.rule_key, row.status, row.severity, formatNumber(row.finding_count)])} />
          </SectionCard>
        </>
      );
    }
    case 'documents': {
      const { requirements, missing_document_flags: missing } = payload.data;
      const requirementCount = requirements.reduce((sum, row) => sum + row.requirement_count, 0);
      const missingCount = missing.reduce((sum, row) => sum + row.flag_count, 0);
      const types = new Set(requirements.map((row) => row.document_type)).size;
      const requirementStatus = pivot(requirements, (row) => row.document_type, (row) => row.status, (row) => row.requirement_count);
      const missingRules = aggregate(missing, (row) => row.rule_key, (row) => row.flag_count);
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Document Requirements" value={formatNumber(requirementCount)} detail="Requirement records evaluated" />
            <MetricCard label="Missing Document Flags" value={formatNumber(missingCount)} detail="Document-missing audit flags raised" />
            <MetricCard label="Document Types" value={formatNumber(types)} detail="Distinct required document types" />
            <MetricCard label="Missing Flag Rate" value={requirementCount ? `${((missingCount / requirementCount) * 100).toFixed(1)}%` : '—'} detail="Flags as share of requirement records" />
          </div>
          <SectionCard title="Document Requirement Status" description="Stacked comparison of requirement status by document type.">
            <AnalyticsMultiBarChart rows={requirementStatus.chartRows} series={requirementStatus.series} stacked />
          </SectionCard>
          <SectionCard title="Missing Document Rules" description="Rules generating the highest number of missing-document flags.">
            <AnalyticsBarChart rows={missingRules} valueLabel="Flags" />
          </SectionCard>
          <SectionCard title="Document Requirement Detail">
            <ReportTable headers={['Document Type', 'Status', 'Requirements']} rows={requirements.map((row) => [row.document_type, row.status, formatNumber(row.requirement_count)])} />
          </SectionCard>
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
          <SectionCard title="Turnaround Distribution" description="A distribution or trend chart requires bucketed or dated turnaround data from the Analytics API.">
            <p className="analytics-note">The current endpoint exposes only completed count and average days. No synthetic chart is shown because there is no underlying distribution yet.</p>
          </SectionCard>
        </>
      );
    }
    case 'productivity': {
      const { rows } = payload.data;
      const activities = rows.reduce((sum, row) => sum + row.activity_count, 0);
      const employees = new Set(rows.map((row) => row.actor_id).filter((value) => value !== 'UNSPECIFIED')).size;
      const roles = new Set(rows.map((row) => row.actor_role).filter((value) => value !== 'UNSPECIFIED')).size;
      const employeeActivity = aggregate(rows, (row) => row.actor_id, (row) => row.activity_count);
      const roleActivity = aggregate(rows, (row) => row.actor_role, (row) => row.activity_count);
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Recorded Activities" value={formatNumber(activities)} detail="Workflow activities in snapshot" />
            <MetricCard label="Employees" value={formatNumber(employees)} detail="Distinct actors represented" />
            <MetricCard label="Roles" value={formatNumber(roles)} detail="Operational roles represented" />
            <MetricCard label="Average Activities" value={employees ? formatNumber(Math.round(activities / employees)) : '—'} detail="Recorded activities per represented employee" />
          </div>
          <div className="dashboard-grid analytics-report-grid">
            <SectionCard title="Employee Activity Ranking" description="Recorded workflow activity by employee/actor.">
              <AnalyticsBarChart rows={employeeActivity} valueLabel="Activities" />
            </SectionCard>
            <SectionCard title="Activity by Role" description="Share of recorded activity by operational role.">
              <AnalyticsDonutChart rows={roleActivity} valueLabel="Activities" />
            </SectionCard>
          </div>
          <SectionCard title="Employee Activity Detail" description="Daily workflow activity by role and employee.">
            <ReportTable headers={['Role', 'Employee / Actor', 'Date', 'Activities']} rows={rows.slice(0, 100).map((row) => [row.actor_role, row.actor_id, row.activity_date || '—', formatNumber(row.activity_count)])} />
          </SectionCard>
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
          const severityMix = aggregate(data.findings.rows, (row) => row.severity, (row) => row.finding_count);
          const paymentMix = aggregate(data.payments.rows, (row) => row.payment_method, (row) => numeric(row.total_amount));
          const ruleConcentration = aggregate(data.findings.rows, (row) => row.rule_key, (row) => row.finding_count);
          return (
            <>
              <div className="metric-grid analytics-metric-grid">
                <MetricCard label="Audited Journeys" value={formatNumber(journeyCount)} detail="Journeys represented in the latest controlled snapshot" />
                <MetricCard label="Audit Findings" value={formatNumber(findingCount)} detail="Findings represented in the latest snapshot" />
                <MetricCard label="Missing Document Flags" value={formatNumber(missingDocumentFlags)} detail="Document-missing audit flags raised" />
                <MetricCard label="Receipt Value" value={formatMoney(paymentTotal)} detail="Captured payment value in the latest snapshot" />
              </div>

              <div className="dashboard-grid analytics-report-grid">
                <SectionCard title="Findings by Severity" description="Current audit finding severity mix.">
                  <AnalyticsDonutChart rows={severityMix} valueLabel="Findings" />
                </SectionCard>
                <SectionCard title="Receipt / Payment Mix" description="Current captured receipt value by payment mode.">
                  <AnalyticsDonutChart rows={paymentMix} valueLabel="Value" valueKind="currency" />
                </SectionCard>
              </div>

              <SectionCard title="Top Audit Exception Concentration" description="Largest rule/control concentrations in the current snapshot.">
                <AnalyticsTreemap rows={ruleConcentration} valueLabel="Findings" />
              </SectionCard>

              <details className="analytics-coverage">
                <summary>Snapshot data coverage</summary>
                <div className="analytics-coverage__body">
                  <p>Technical ingestion coverage for the current Analytics snapshot. This is diagnostic information, not a business report.</p>
                  <ReportTable headers={['Dataset', 'Rows']} rows={data.overview.entities.map((row) => [row.source_table, formatNumber(row.row_count)])} />
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
