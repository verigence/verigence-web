import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-daily-report.css';
import '../styles/task-manager.css';
import '../styles/admin-reports.css';

import PageHeader from '../components/PageHeader';
import { getJourneyReview } from '../services/audit-core/adminReports';
import AppInstalls from '../features/admin/reports/AppInstalls';
import JourneyReview from '../features/admin/reports/JourneyReview';
import DiDashboard from '../features/task-manager/DiDashboard';
import EngagementDashboard from '../features/task-manager/EngagementDashboard';
import { listProjects } from '../services/audit-core/uc02Admin';
import { getLoginActivity, type LoginPerson } from '../services/security/loginActivity';
import { useSessionStore } from '../store/sessionStore';


// One place for the SuperAdmin's reports (product owner 2026-10-27): employee
// engagement, the DI dashboard and the Journey review, one Project at a time.
const REPORTS = [
  {
    key: 'engagement',
    title: 'Employee engagement',
    description: "Who was in first and out last, who spent the most and the least time on Verigence, who was not seen, and each person's time, files and tasks.",
  },
  {
    key: 'di',
    title: 'DI',
    description: 'How much Document Intelligence read the first time, what has to be scanned again or failed and why, how long a file takes, by PC and by document.',
  },
  {
    key: 'app',
    title: 'App',
    description:
      'Who has the Verigence Android app and which version: every download with the version it handed out, and the version each person\'s app reports when it signs in. Everyone, not one Project.',
  },
  {
    key: 'journey-review',
    title: 'Journey review',
    description:
      'For every Journey: the SKU and its price-list ex-showroom, the booking, each invoice as read, insurance, discounts against the SKU, scrappage and credit notes, and the cost sheet / ledger / bank letter / no-dues figures. Facts as held by the system; nothing is calculated here.',
  },
] as const;

type ReportKey = (typeof REPORTS)[number]['key'];

function reportOf(value: string | null): ReportKey {
  return REPORTS.find((r) => r.key === value)?.key ?? 'engagement';
}

export default function AdminReportsPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const [tenantId, setTenantId] = useState('');
  const [params, setParams] = useSearchParams();
  const reportKey = reportOf(params.get('tab'));
  const setReportKey = (key: ReportKey) => setParams({ tab: key }, { replace: true });

  const projectsQuery = useQuery({
    queryKey: ['admin-reports-projects'],
    queryFn: () => listProjects(accessToken),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
    retry: 1,
  });
  const reviewQuery = useQuery({
    queryKey: ['admin-report-journey-review', tenantId],
    queryFn: () => getJourneyReview(tenantId, accessToken!),
    enabled: Boolean(tenantId && accessToken) && reportKey === 'journey-review',
    staleTime: 60_000,
    retry: 1,
  });

  // Sign-in counts are Security's, all time; Superadmin only.
  const logins = useQuery({
    queryKey: ['security', 'login-activity'],
    queryFn: () => getLoginActivity(accessToken!),
    enabled: Boolean(accessToken) && reportKey === 'engagement',
    retry: false,
    staleTime: 5 * 60_000,
  });
  const byUser = useMemo(() => {
    const map = new Map<string, LoginPerson>();
    for (const p of logins.data?.people ?? []) map.set(p.userId, p);
    return map;
  }, [logins.data]);

  const report = REPORTS.find((r) => r.key === reportKey) ?? REPORTS[0];

  return (
    <section className="admin-landing screen-stack">
      <PageHeader
        eyebrow="Administration · Reports"
        title="Reports"
        description="Employee engagement, DI and the Journey review, one Project at a time, read live from the Project's records. They only read; nothing here changes a Journey."
      />
      <div className="uc01-admin-config-grid">
        <article className="uc01-admin-config-card">
          <div className="p2w">
            <div className="p2w-segment" role="tablist" aria-label="Report">
              {REPORTS.map((r) => (
                <button key={r.key} type="button" role="tab" aria-selected={reportKey === r.key}
                  className={reportKey === r.key ? 'is-active' : ''} onClick={() => setReportKey(r.key)}>{r.title}</button>
              ))}
            </div>
          </div>
          <p>{report.description}</p>
          {/* The App report is Security's, for everyone: no Project to pick. */}
          <label className="uc03-booking-field" hidden={reportKey === 'app'}>
            <span>Project / Tenant</span>
            <select value={tenantId} disabled={projectsQuery.isPending} onChange={(e) => setTenantId(e.target.value)}>
              <option value="">Select Project</option>
              {(projectsQuery.data ?? []).map((p) => (
                <option key={p.tenantId} value={p.tenantId}>{p.projectName} · {p.projectCode}</option>
              ))}
            </select>
          </label>
          {projectsQuery.isError && reportKey !== 'app' ? <div className="uc01-admin-message uc01-admin-message--error">Projects could not be loaded.</div> : null}
        </article>
      </div>

      {reportKey === 'app' ? (
        <article className="uc01-admin-config-card">
          <span className="eyebrow">Who has the app</span>
          <AppInstalls accessToken={accessToken} />
        </article>
      ) : null}

      {tenantId && reportKey !== 'journey-review' && reportKey !== 'app' ? (
        <div className="p2-screen p2w">
          {reportKey === 'engagement' ? (
            <EngagementDashboard key={tenantId} mode="admin" tenantId={tenantId} accessToken={accessToken}
              logins={logins.data ? byUser : undefined} />
          ) : <DiDashboard key={tenantId} mode="admin" tenantId={tenantId} accessToken={accessToken} />}
        </div>
      ) : null}

      {tenantId && reportKey === 'journey-review' && reviewQuery.isPending ? <p>Reading every Journey in the Project. This can take a minute.</p> : null}
      {reportKey === 'journey-review' && reviewQuery.isError ? <div className="uc01-admin-message uc01-admin-message--error">The report could not be loaded. Try again; if it repeats, the Project is too large for one read.</div> : null}

      {reportKey === 'journey-review' && reviewQuery.data ? (
        <article className="uc01-admin-config-card">
          <span className="eyebrow">{report.title}</span>
          <JourneyReview report={reviewQuery.data} />
        </article>
      ) : null}
    </section>
  );
}
