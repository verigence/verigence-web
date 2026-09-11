import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import AnalyticsProjectOverview from '../features/analytics/AnalyticsProjectOverview';
import AnalyticsReportViews from '../features/analytics/AnalyticsReportViews';
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
  overview: 'Project Business Overview',
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

function formatAsOf(value?: string): string {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
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

export default function AnalyticsPage() {
  const [searchParams] = useSearchParams();
  const activeView = parseReport(searchParams.get('report'));
  const accessToken = useSessionStore((state) => state.accessToken);
  const sessionTenantId = useSessionStore((state) => state.tenantId);
  const selectedProject = useProjectContextStore((state) => state.selectedProject);
  const tenantId = selectedProject?.tenantId || sessionTenantId;

  const overviewQuery = useQuery({
    queryKey: ['analytics', 'executive-dashboard', tenantId],
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

  const currentAsOf = activeView === 'overview' ? overviewQuery.data?.network.data_as_of : reportAsOf(reportQuery.data);
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
          <SectionCard title="Loading project overview"><p>Loading dealer, outlet, compliance and penetration analytics…</p></SectionCard>
        ) : overviewQuery.isError ? (
          <ReportError error={overviewQuery.error} />
        ) : overviewQuery.data ? (
          <AnalyticsProjectOverview data={overviewQuery.data} />
        ) : null
      ) : reportQuery.isPending ? (
        <SectionCard title={`Loading ${viewTitle}`}><p>Loading this report from the latest controlled snapshot…</p></SectionCard>
      ) : reportQuery.isError ? (
        <ReportError error={reportQuery.error} />
      ) : reportQuery.data ? (
        <AnalyticsReportViews payload={reportQuery.data} />
      ) : null}
    </div>
  );
}
