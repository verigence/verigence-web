import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import AnalyticsBusinessOverviewPanels from '../features/analytics/AnalyticsBusinessOverviewPanels';
import AnalyticsBusinessReportViews from '../features/analytics/AnalyticsBusinessReportViews';
import AnalyticsProjectOverview from '../features/analytics/AnalyticsProjectOverview';
import AnalyticsReportViews from '../features/analytics/AnalyticsReportViews';
import {
  type AnalyticsBusinessReportKey,
  type AnalyticsBusinessReportPayload,
  getBusinessAnalyticsReport,
  getBusinessProjectDashboard,
} from '../services/analytics/businessClient';
import {
  AnalyticsHttpError,
  type AnalyticsReportKey,
  type AnalyticsReportPayload,
  getAnalyticsReport,
} from '../services/analytics/client';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/analytics.css';
import '../styles/analytics-project.css';

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

const businessReportKeys: AnalyticsBusinessReportKey[] = [
  'insurance',
  'addons',
  'discounts',
  'turnaround',
  'findings',
];

const reportLabels: Record<AnalyticsView, string> = {
  overview: 'Project Business Overview',
  finance: 'Finance',
  insurance: 'Insurance & Add-ons',
  addons: 'Accessories & VAS',
  discounts: 'Discounts & Pricing',
  'trade-in': 'Trade-in',
  payments: 'Payments',
  turnaround: 'Delivery Performance',
  findings: 'Compliance & Exposure',
  documents: 'Documents',
  productivity: 'Employees',
};

function parseReport(value: string | null): AnalyticsView {
  if (value && reportKeys.includes(value as AnalyticsReportKey)) return value as AnalyticsReportKey;
  return 'overview';
}

function isBusinessReport(value: AnalyticsView): value is AnalyticsBusinessReportKey {
  return value !== 'overview' && businessReportKeys.includes(value as AnalyticsBusinessReportKey);
}

function formatAsOf(value?: string): string {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function legacyReportAsOf(payload?: AnalyticsReportPayload): string | undefined {
  return payload?.data.data_as_of;
}

function businessReportAsOf(payload?: AnalyticsBusinessReportPayload): string | undefined {
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
  const businessView = isBusinessReport(activeView);

  const overviewQuery = useQuery({
    queryKey: ['analytics', 'business-project-dashboard', tenantId],
    enabled: Boolean(activeView === 'overview' && tenantId && accessToken),
    queryFn: ({ signal }) => getBusinessProjectDashboard(tenantId!, accessToken!, signal),
    staleTime: 60_000,
    retry: (failureCount, error) => {
      if (error instanceof AnalyticsHttpError && [401, 403, 404].includes(error.status)) return false;
      return failureCount < 1;
    },
  });

  const businessReportQuery = useQuery({
    queryKey: ['analytics', 'business-report', tenantId, activeView],
    enabled: Boolean(activeView !== 'overview' && businessView && tenantId && accessToken),
    queryFn: ({ signal }) => getBusinessAnalyticsReport(tenantId!, accessToken!, activeView as AnalyticsBusinessReportKey, signal),
    staleTime: 60_000,
    retry: (failureCount, error) => {
      if (error instanceof AnalyticsHttpError && [401, 403, 404].includes(error.status)) return false;
      return failureCount < 1;
    },
  });

  const legacyReportQuery = useQuery({
    queryKey: ['analytics', 'report', tenantId, activeView],
    enabled: Boolean(activeView !== 'overview' && !businessView && tenantId && accessToken),
    queryFn: ({ signal }) => getAnalyticsReport(tenantId!, accessToken!, activeView as AnalyticsReportKey, signal),
    staleTime: 60_000,
    retry: (failureCount, error) => {
      if (error instanceof AnalyticsHttpError && [401, 403, 404].includes(error.status)) return false;
      return failureCount < 1;
    },
  });

  const currentAsOf = activeView === 'overview'
    ? overviewQuery.data?.data_as_of
    : businessView
      ? businessReportAsOf(businessReportQuery.data)
      : legacyReportAsOf(legacyReportQuery.data);
  const viewTitle = reportLabels[activeView];

  if (!tenantId) {
    return (
      <div className="screen-stack analytics-screen">
        <PageHeader eyebrow="Insights · Analytics" title={viewTitle} description="Business, commercial and compliance analytics from controlled Audit Core snapshots." />
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
          <SectionCard title="Loading project business overview"><p>Loading sales, product, dealer, outlet, penetration and compliance analytics…</p></SectionCard>
        ) : overviewQuery.isError ? (
          <ReportError error={overviewQuery.error} />
        ) : overviewQuery.data ? (
          <>
            <AnalyticsBusinessOverviewPanels data={overviewQuery.data} />
            <AnalyticsProjectOverview data={overviewQuery.data.legacy} />
          </>
        ) : null
      ) : businessView ? (
        businessReportQuery.isPending ? (
          <SectionCard title={`Loading ${viewTitle}`}><p>Loading this business report from the latest controlled snapshot…</p></SectionCard>
        ) : businessReportQuery.isError ? (
          <ReportError error={businessReportQuery.error} />
        ) : businessReportQuery.data ? (
          <AnalyticsBusinessReportViews payload={businessReportQuery.data} />
        ) : null
      ) : legacyReportQuery.isPending ? (
        <SectionCard title={`Loading ${viewTitle}`}><p>Loading this report from the latest controlled snapshot…</p></SectionCard>
      ) : legacyReportQuery.isError ? (
        <ReportError error={legacyReportQuery.error} />
      ) : legacyReportQuery.data ? (
        <AnalyticsReportViews payload={legacyReportQuery.data} />
      ) : null}
    </div>
  );
}
