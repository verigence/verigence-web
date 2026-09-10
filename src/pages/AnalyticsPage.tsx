import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
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

function HorizontalBars({
  rows,
  emptyText = 'No data in the current snapshot.',
}: {
  rows: Array<{ label: string; value: number; display?: string }>;
  emptyText?: string;
}) {
  const visible = rows.filter((row) => row.value > 0).slice(0, 12);
  const max = Math.max(...visible.map((row) => row.value), 0);
  if (!visible.length || max <= 0) return <p>{emptyText}</p>;

  return (
    <div className="analytics-bars" aria-label="Report chart">
      {visible.map((row, index) => (
        <div className="analytics-bar" key={`${row.label}-${index}`}>
          <div className="analytics-bar__heading">
            <span title={row.label}>{row.label}</span>
            <strong>{row.display ?? formatNumber(row.value)}</strong>
          </div>
          <div className="analytics-bar__track" aria-hidden="true">
            <span className="analytics-bar__fill" style={{ width: `${Math.max((row.value / max) * 100, 2)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) {
  if (!rows.length) return <p>No data in the current snapshot.</p>;
  return (
    <div className="data-table-wrap">
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

function ReportContent({ payload }: { payload: AnalyticsReportPayload }) {
  switch (payload.kind) {
    case 'finance': {
      const { rows } = payload.data;
      const deals = rows.reduce((sum, row) => sum + row.deal_count, 0);
      const amount = rows.reduce((sum, row) => sum + numeric(row.financed_amount), 0);
      const providers = new Set(rows.map((row) => row.provider).filter((value) => value !== 'UNSPECIFIED')).size;
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Finance Deals" value={formatNumber(deals)} detail="Deals with captured finance records" />
            <MetricCard label="Financed Amount" value={formatMoney(amount)} detail="Captured financed value" />
            <MetricCard label="Finance Providers" value={formatNumber(providers)} detail="Distinct captured providers" />
            <MetricCard label="Average Financed" value={deals ? formatMoney(amount / deals) : '—'} detail="Average per captured finance deal" />
          </div>
          <div className="dashboard-grid analytics-report-grid">
            <SectionCard title="Finance Mix" description="Deal count by finance type and provider.">
              <HorizontalBars rows={rows.map((row) => ({ label: `${row.finance_type} · ${row.provider}`, value: row.deal_count }))} />
            </SectionCard>
            <SectionCard title="Finance Detail" description="Current controlled snapshot.">
              <ReportTable headers={['Finance Type', 'Provider', 'Deals', 'Financed Amount']} rows={rows.map((row) => [row.finance_type, row.provider, formatNumber(row.deal_count), formatMoney(row.financed_amount)])} />
            </SectionCard>
          </div>
        </>
      );
    }
    case 'insurance': {
      const { rows, duplicate_agent_codes: duplicates } = payload.data;
      const policies = rows.reduce((sum, row) => sum + row.policy_count, 0);
      const premium = rows.reduce((sum, row) => sum + numeric(row.premium_amount), 0);
      const insurers = new Set(rows.map((row) => row.insurer).filter((value) => value !== 'UNSPECIFIED')).size;
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Policies" value={formatNumber(policies)} detail="Captured insurance policies" />
            <MetricCard label="Premium Value" value={formatMoney(premium)} detail="Captured actual premium" />
            <MetricCard label="Insurers" value={formatNumber(insurers)} detail="Distinct captured insurers" />
            <MetricCard label="Repeated Agent Codes" value={formatNumber(duplicates.length)} detail="Agent codes reused across bookings" />
          </div>
          <div className="dashboard-grid analytics-report-grid">
            <SectionCard title="Insurance Mix" description="Policy count by insurance source and insurer.">
              <HorizontalBars rows={rows.map((row) => ({ label: `${row.insurance_by} · ${row.insurer}`, value: row.policy_count }))} />
            </SectionCard>
            <SectionCard title="Repeated Agent Codes" description="Codes appearing across more than one booking.">
              <ReportTable headers={['Agent Code', 'Bookings']} rows={duplicates.map((row) => [row.agent_code, formatNumber(row.booking_count)])} />
            </SectionCard>
          </div>
          <SectionCard title="Insurance Detail">
            <ReportTable headers={['Insurance By', 'Insurer', 'Policies', 'Premium']} rows={rows.map((row) => [row.insurance_by, row.insurer, formatNumber(row.policy_count), formatMoney(row.premium_amount)])} />
          </SectionCard>
        </>
      );
    }
    case 'addons': {
      const { rows } = payload.data;
      const attaches = rows.reduce((sum, row) => sum + row.attach_count, 0);
      const value = rows.reduce((sum, row) => sum + numeric(row.actual_amount), 0);
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Add-on Attachments" value={formatNumber(attaches)} detail="EW, RSA, accessories and service packages" />
            <MetricCard label="Add-on Value" value={formatMoney(value)} detail="Captured actual add-on value" />
            <MetricCard label="Add-on Types" value={formatNumber(rows.length)} detail="Types represented in snapshot" />
            <MetricCard label="Average Value" value={attaches ? formatMoney(value / attaches) : '—'} detail="Average per captured attachment" />
          </div>
          <div className="dashboard-grid analytics-report-grid">
            <SectionCard title="Attach Mix" description="Attachment count by add-on type.">
              <HorizontalBars rows={rows.map((row) => ({ label: row.addon_type, value: row.attach_count }))} />
            </SectionCard>
            <SectionCard title="Add-on Detail">
              <ReportTable headers={['Add-on Type', 'Attachments', 'Actual Value']} rows={rows.map((row) => [row.addon_type, formatNumber(row.attach_count), formatMoney(row.actual_amount)])} />
            </SectionCard>
          </div>
        </>
      );
    }
    case 'discounts': {
      const { rows } = payload.data;
      const applications = rows.reduce((sum, row) => sum + row.application_count, 0);
      const actual = rows.reduce((sum, row) => sum + numeric(row.actual_discount_amount), 0);
      const eligible = rows.reduce((sum, row) => sum + numeric(row.standard_eligible_amount), 0);
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Discount Applications" value={formatNumber(applications)} detail="Captured discount applications" />
            <MetricCard label="Actual Discount" value={formatMoney(actual)} detail="Total actual discount captured" />
            <MetricCard label="Standard Eligible" value={formatMoney(eligible)} detail="Total standard eligible basis" />
            <MetricCard label="Actual vs Eligible" value={formatMoney(actual - eligible)} detail="Positive value indicates above standard basis" />
          </div>
          <div className="dashboard-grid analytics-report-grid">
            <SectionCard title="Discount Value by Type" description="Actual discount value by discount key.">
              <HorizontalBars rows={rows.map((row) => ({ label: row.discount_key, value: numeric(row.actual_discount_amount), display: formatMoney(row.actual_discount_amount) }))} />
            </SectionCard>
            <SectionCard title="Discount Detail">
              <ReportTable headers={['Discount Type', 'Applications', 'Actual', 'Standard Eligible']} rows={rows.map((row) => [row.discount_key, formatNumber(row.application_count), formatMoney(row.actual_discount_amount), formatMoney(row.standard_eligible_amount)])} />
            </SectionCard>
          </div>
        </>
      );
    }
    case 'trade-in': {
      const { rows } = payload.data;
      const count = rows.reduce((sum, row) => sum + row.trade_in_count, 0);
      const value = rows.reduce((sum, row) => sum + numeric(row.actual_value), 0);
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Trade-ins" value={formatNumber(count)} detail="Captured trade-in cases" />
            <MetricCard label="Trade-in Value" value={formatMoney(value)} detail="Captured actual trade-in value" />
            <MetricCard label="Average Trade-in" value={count ? formatMoney(value / count) : '—'} detail="Average actual value per trade-in" />
            <MetricCard label="Statuses" value={formatNumber(rows.length)} detail="Trade-in statuses represented" />
          </div>
          <div className="dashboard-grid analytics-report-grid">
            <SectionCard title="Trade-in Status" description="Case count by current trade-in status.">
              <HorizontalBars rows={rows.map((row) => ({ label: row.status, value: row.trade_in_count }))} />
            </SectionCard>
            <SectionCard title="Trade-in Detail">
              <ReportTable headers={['Status', 'Cases', 'Actual Value']} rows={rows.map((row) => [row.status, formatNumber(row.trade_in_count), formatMoney(row.actual_value)])} />
            </SectionCard>
          </div>
        </>
      );
    }
    case 'payments': {
      const { rows } = payload.data;
      const count = rows.reduce((sum, row) => sum + row.payment_count, 0);
      const amount = rows.reduce((sum, row) => sum + numeric(row.total_amount), 0);
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Payments" value={formatNumber(count)} detail="Captured payment entries" />
            <MetricCard label="Receipt Value" value={formatMoney(amount)} detail="Total captured payment value" />
            <MetricCard label="Payment Modes" value={formatNumber(rows.length)} detail="Distinct captured payment modes" />
            <MetricCard label="Average Payment" value={count ? formatMoney(amount / count) : '—'} detail="Average value per payment entry" />
          </div>
          <div className="dashboard-grid analytics-report-grid">
            <SectionCard title="Payment Mode Mix" description="Captured value by payment mode.">
              <HorizontalBars rows={rows.map((row) => ({ label: row.payment_method, value: numeric(row.total_amount), display: formatMoney(row.total_amount) }))} />
            </SectionCard>
            <SectionCard title="Payment Detail">
              <ReportTable headers={['Mode', 'Payments', 'Total Amount']} rows={rows.map((row) => [row.payment_method, formatNumber(row.payment_count), formatMoney(row.total_amount)])} />
            </SectionCard>
          </div>
        </>
      );
    }
    case 'findings': {
      const { rows } = payload.data;
      const total = rows.reduce((sum, row) => sum + row.finding_count, 0);
      const open = rows.filter((row) => row.status.toUpperCase() === 'OPEN').reduce((sum, row) => sum + row.finding_count, 0);
      const resolved = rows.filter((row) => row.status.toUpperCase() === 'RESOLVED').reduce((sum, row) => sum + row.finding_count, 0);
      const high = rows.filter((row) => row.severity.toUpperCase() === 'HIGH').reduce((sum, row) => sum + row.finding_count, 0);
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Audit Findings" value={formatNumber(total)} detail="Findings in latest controlled snapshot" />
            <MetricCard label="Open" value={formatNumber(open)} detail="Open audit findings" />
            <MetricCard label="High Severity" value={formatNumber(high)} detail="High-severity findings" />
            <MetricCard label="Resolved" value={formatNumber(resolved)} detail="Resolved findings represented in snapshot" />
          </div>
          <div className="dashboard-grid analytics-report-grid">
            <SectionCard title="Findings by Rule / Control" description="Concentration of findings by business rule or control.">
              <HorizontalBars rows={rows.map((row) => ({ label: row.rule_key, value: row.finding_count }))} />
            </SectionCard>
            <SectionCard title="Finding Detail">
              <ReportTable headers={['Rule / Control', 'Status', 'Severity', 'Count']} rows={rows.map((row) => [row.rule_key, row.status, row.severity, formatNumber(row.finding_count)])} />
            </SectionCard>
          </div>
        </>
      );
    }
    case 'documents': {
      const { requirements, missing_document_flags: missing } = payload.data;
      const requirementCount = requirements.reduce((sum, row) => sum + row.requirement_count, 0);
      const missingCount = missing.reduce((sum, row) => sum + row.flag_count, 0);
      const types = new Set(requirements.map((row) => row.document_type)).size;
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Document Requirements" value={formatNumber(requirementCount)} detail="Requirement records evaluated" />
            <MetricCard label="Missing Document Flags" value={formatNumber(missingCount)} detail="Document-missing audit flags raised" />
            <MetricCard label="Document Types" value={formatNumber(types)} detail="Distinct required document types" />
            <MetricCard label="Missing Flag Rate" value={requirementCount ? `${((missingCount / requirementCount) * 100).toFixed(1)}%` : '—'} detail="Flags as share of requirement records" />
          </div>
          <div className="dashboard-grid analytics-report-grid">
            <SectionCard title="Requirement Status" description="Required-document coverage by document type and status.">
              <HorizontalBars rows={requirements.map((row) => ({ label: `${row.document_type} · ${row.status}`, value: row.requirement_count }))} />
            </SectionCard>
            <SectionCard title="Missing Document Rules" description="Audit rules producing document-missing flags.">
              <HorizontalBars rows={missing.map((row) => ({ label: row.rule_key, value: row.flag_count }))} />
            </SectionCard>
          </div>
          <SectionCard title="Document Requirement Detail">
            <ReportTable headers={['Document Type', 'Status', 'Requirements']} rows={requirements.map((row) => [row.document_type, row.status, formatNumber(row.requirement_count)])} />
          </SectionCard>
        </>
      );
    }
    case 'turnaround': {
      const row = payload.data.rows[0];
      return (
        <div className="metric-grid analytics-metric-grid analytics-turnaround-grid">
          <MetricCard label="Completed Journeys" value={formatNumber(row?.completed_count || 0)} detail="Journeys with both first receipt and delivery" />
          <MetricCard label="Average Turnaround" value={row?.avg_days == null ? '—' : `${Number(row.avg_days).toFixed(1)} days`} detail="First receipt to delivery" />
        </div>
      );
    }
    case 'productivity': {
      const { rows } = payload.data;
      const activities = rows.reduce((sum, row) => sum + row.activity_count, 0);
      const employees = new Set(rows.map((row) => row.actor_id).filter((value) => value !== 'UNSPECIFIED')).size;
      const roles = new Set(rows.map((row) => row.actor_role).filter((value) => value !== 'UNSPECIFIED')).size;
      const byEmployee = new Map<string, number>();
      rows.forEach((row) => byEmployee.set(row.actor_id, (byEmployee.get(row.actor_id) || 0) + row.activity_count));
      const employeeBars = Array.from(byEmployee.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
      return (
        <>
          <div className="metric-grid analytics-metric-grid">
            <MetricCard label="Recorded Activities" value={formatNumber(activities)} detail="Workflow activities in snapshot" />
            <MetricCard label="Employees" value={formatNumber(employees)} detail="Distinct actors represented" />
            <MetricCard label="Roles" value={formatNumber(roles)} detail="Operational roles represented" />
            <MetricCard label="Average Activities" value={employees ? formatNumber(Math.round(activities / employees)) : '—'} detail="Recorded activities per represented employee" />
          </div>
          <div className="dashboard-grid analytics-report-grid">
            <SectionCard title="Employee Activity" description="Recorded workflow activity by employee/actor.">
              <HorizontalBars rows={employeeBars} />
            </SectionCard>
            <SectionCard title="Employee Activity Detail" description="Daily workflow activity by role and employee.">
              <ReportTable headers={['Role', 'Employee / Actor', 'Date', 'Activities']} rows={rows.slice(0, 50).map((row) => [row.actor_role, row.actor_id, row.activity_date || '—', formatNumber(row.activity_count)])} />
            </SectionCard>
          </div>
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
          const snapshotRows = data.overview.entities.reduce((total, row) => total + row.row_count, 0);
          const findingCount = data.findings.rows.reduce((total, row) => total + row.finding_count, 0);
          const missingDocumentFlags = data.documents.missing_document_flags.reduce((total, row) => total + row.flag_count, 0);
          const turnaround = data.turnaround.rows[0];
          const paymentTotal = data.payments.rows.reduce((total, row) => total + numeric(row.total_amount), 0);
          return (
            <>
              <div className="metric-grid analytics-metric-grid">
                <MetricCard label="Snapshot Records" value={formatNumber(snapshotRows)} detail={`Across ${formatNumber(data.overview.entities.length)} business datasets`} />
                <MetricCard label="Audit Findings" value={formatNumber(findingCount)} detail="Latest completed controlled snapshot" />
                <MetricCard label="Missing Document Flags" value={formatNumber(missingDocumentFlags)} detail="Document-missing audit flags raised" />
                <MetricCard label="Average Turnaround" value={turnaround?.avg_days == null ? '—' : `${Number(turnaround.avg_days).toFixed(1)}d`} detail={`First receipt to delivery · ${formatNumber(turnaround?.completed_count || 0)} completed`} />
              </div>

              <div className="dashboard-grid analytics-report-grid">
                <SectionCard title="Top Audit Exceptions" description="Highest finding concentrations in the current snapshot.">
                  <HorizontalBars rows={data.findings.rows.map((row) => ({ label: row.rule_key, value: row.finding_count }))} />
                </SectionCard>
                <SectionCard title="Payment Mix" description={`Total captured receipt/payment value ${formatMoney(paymentTotal)}.`}>
                  <HorizontalBars rows={data.payments.rows.map((row) => ({ label: row.payment_method, value: numeric(row.total_amount), display: formatMoney(row.total_amount) }))} />
                </SectionCard>
              </div>

              <SectionCard title="Business Dataset Coverage" description="Datasets currently available to the Analytics snapshot layer.">
                <ReportTable headers={['Dataset', 'Rows']} rows={data.overview.entities.map((row) => [row.source_table, formatNumber(row.row_count)])} />
              </SectionCard>
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
