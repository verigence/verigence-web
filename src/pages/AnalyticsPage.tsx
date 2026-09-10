import { useQuery } from '@tanstack/react-query';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { AnalyticsHttpError, getAnalyticsDashboard } from '../services/analytics/client';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

function formatMoney(value: string | number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(numeric);
}

function formatAsOf(value?: string): string {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AnalyticsPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const sessionTenantId = useSessionStore((state) => state.tenantId);
  const selectedProject = useProjectContextStore((state) => state.selectedProject);
  const tenantId = selectedProject?.tenantId || sessionTenantId;

  const analytics = useQuery({
    queryKey: ['analytics', 'dashboard', tenantId],
    enabled: Boolean(tenantId && accessToken),
    queryFn: ({ signal }) => getAnalyticsDashboard(tenantId, accessToken!, signal),
    staleTime: 60_000,
    retry: (failureCount, error) => {
      if (error instanceof AnalyticsHttpError && [401, 403, 404].includes(error.status)) return false;
      return failureCount < 1;
    },
  });

  if (!tenantId) {
    return (
      <div className="screen-stack">
        <PageHeader eyebrow="Insights" title="Audit Analytics" description="Business analytics from the latest controlled Audit Core snapshot." />
        <SectionCard title="Select a project">
          <p>Choose a project from the Verigence project selector to load tenant analytics.</p>
        </SectionCard>
      </div>
    );
  }

  if (analytics.isPending) {
    return (
      <div className="screen-stack">
        <PageHeader eyebrow="Insights" title="Audit Analytics" description="Business analytics from the latest controlled Audit Core snapshot." />
        <SectionCard title="Loading analytics">
          <p>Loading the latest Analytics snapshot…</p>
        </SectionCard>
      </div>
    );
  }

  if (analytics.isError) {
    const forbidden = analytics.error instanceof AnalyticsHttpError && analytics.error.status === 403;
    const noDump = analytics.error instanceof AnalyticsHttpError && analytics.error.status === 404;
    return (
      <div className="screen-stack">
        <PageHeader eyebrow="Insights" title="Audit Analytics" description="Business analytics from the latest controlled Audit Core snapshot." />
        <SectionCard title={forbidden ? 'Analytics access denied' : noDump ? 'No analytics snapshot' : 'Analytics unavailable'}>
          <p>
            {forbidden
              ? 'Your current Security role does not have audit.analytics.read for this tenant.'
              : noDump
                ? 'No completed Analytics dump is available for this tenant yet.'
                : analytics.error instanceof Error
                  ? analytics.error.message
                  : 'Analytics could not be loaded.'}
          </p>
        </SectionCard>
      </div>
    );
  }

  const data = analytics.data;
  const snapshotRows = data.overview.entities.reduce((total, row) => total + row.row_count, 0);
  const findingCount = data.findings.rows.reduce((total, row) => total + row.finding_count, 0);
  const missingDocumentFlags = data.documents.missing_document_flags.reduce((total, row) => total + row.flag_count, 0);
  const turnaround = data.turnaround.rows[0];
  const paymentTotal = data.payments.rows.reduce((total, row) => total + Number(row.total_amount || 0), 0);
  const dataAsOf = data.overview.data_as_of;

  return (
    <div className="screen-stack">
      <PageHeader
        eyebrow="Insights"
        title="Audit Analytics"
        description={`Business analytics from the latest controlled Audit Core snapshot. Data as of ${formatAsOf(dataAsOf)}.`}
      />

      <div className="metric-grid">
        <article className="metric-card">
          <span className="metric-card__label">Snapshot Records</span>
          <strong className="metric-card__value">{formatNumber(snapshotRows)}</strong>
          <span className="metric-card__detail">Across {formatNumber(data.overview.entities.length)} business datasets</span>
        </article>
        <article className="metric-card">
          <span className="metric-card__label">Audit Findings</span>
          <strong className="metric-card__value">{formatNumber(findingCount)}</strong>
          <span className="metric-card__detail">Latest completed dump</span>
        </article>
        <article className="metric-card">
          <span className="metric-card__label">Missing Document Flags</span>
          <strong className="metric-card__value">{formatNumber(missingDocumentFlags)}</strong>
          <span className="metric-card__detail">Document-missing audit flags raised</span>
        </article>
        <article className="metric-card">
          <span className="metric-card__label">Average Turnaround</span>
          <strong className="metric-card__value">{turnaround?.avg_days == null ? '—' : `${Number(turnaround.avg_days).toFixed(1)}d`}</strong>
          <span className="metric-card__detail">First receipt to delivery · {formatNumber(turnaround?.completed_count || 0)} completed</span>
        </article>
      </div>

      <div className="dashboard-grid">
        <SectionCard title="Findings by Rule / Control" description="Breach and observation concentration in the latest snapshot.">
          {data.findings.rows.length === 0 ? <p>No findings in the current snapshot.</p> : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Rule / Control</th><th>Status</th><th>Severity</th><th>Count</th></tr></thead>
                <tbody>{data.findings.rows.slice(0, 12).map((row, index) => (
                  <tr key={`${row.rule_key}-${row.status}-${row.severity}-${index}`}>
                    <td>{row.rule_key}</td><td>{row.status}</td><td>{row.severity}</td><td>{formatNumber(row.finding_count)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Receipt / Payment Summary" description={`Total captured payment value ${formatMoney(paymentTotal)}.`}>
          {data.payments.rows.length === 0 ? <p>No payment rows in the current snapshot.</p> : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Mode</th><th>Payments</th><th>Total Amount</th></tr></thead>
                <tbody>{data.payments.rows.map((row) => (
                  <tr key={row.payment_method}>
                    <td>{row.payment_method}</td><td>{formatNumber(row.payment_count)}</td><td>{formatMoney(row.total_amount)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Document Requirement Status" description="Required-document coverage and audit flags from the current snapshot.">
        {data.documents.requirements.length === 0 ? <p>No document requirement rows in the current snapshot.</p> : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Document Type</th><th>Status</th><th>Requirements</th></tr></thead>
              <tbody>{data.documents.requirements.map((row, index) => (
                <tr key={`${row.document_type}-${row.status}-${index}`}>
                  <td>{row.document_type}</td><td>{row.status}</td><td>{formatNumber(row.requirement_count)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Snapshot Coverage" description={`Data as of ${formatAsOf(dataAsOf)}. Analytics reads this independent snapshot; it does not query live Audit Core on the request path.`}>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Dataset</th><th>Rows</th></tr></thead>
            <tbody>{data.overview.entities.map((row) => (
              <tr key={row.source_table}><td>{row.source_table}</td><td>{formatNumber(row.row_count)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
