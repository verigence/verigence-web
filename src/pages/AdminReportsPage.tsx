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
import PerformanceSettings from '../features/admin/reports/PerformanceSettings';
import DiDashboard from '../features/task-manager/DiDashboard';
import AccessLocationsSummary from '../features/dealguard-presence/AccessLocationsSummary';
import LocationAwayReport from '../features/dealguard-presence/LocationAwayReport';
import LocationChecksLog from '../features/dealguard-presence/LocationChecksLog';
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
    key: 'location',
    title: 'Location checks',
    description: "Where each PC was when DealGuard checked their location (1–3 times an hour, 10:00–19:30 IST): at their outlet, away from it, or not clear, day by day; and, date-wise over a range, every time a PC was more than 5 km (or another distance) from their outlet, with roughly how far. Checks only inform; nobody is stopped.",
  },
  {
    key: 'sign-ins',
    title: 'Sign-in locations',
    description: "Where each PC, TL and PM opened Verigence from (every sign-in and reopening, until 22 Nov 2026): how often at the outlet they are tagged to (within 500 m), and the three other places they opened it from most, with an address.",
  },
  {
    key: 'app',
    title: 'App',
    description:
      'Who has the Verigence Android app and which version: every download with the version it handed out, and the version each person\'s app reports when it signs in. Everyone, not one Project.',
  },
  {
    key: 'performance',
    title: 'Performance view',
    description:
      'What the Performance tab of the Project Tracker and My Tracker shows: each measure (files, journeys uploaded and closed, reviews, tasks, pages rejected, active time), the daily and weekly duties, and the comparison with peers. For every Project.',
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
  const [locationView, setLocationView] = useState<'checks' | 'away'>('checks');
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
          <label className="uc03-booking-field" hidden={reportKey === 'app' || reportKey === 'performance'}>
            <span>Project / Tenant</span>
            <select value={tenantId} disabled={projectsQuery.isPending} onChange={(e) => setTenantId(e.target.value)}>
              <option value="">Select Project</option>
              {(projectsQuery.data ?? []).map((p) => (
                <option key={p.tenantId} value={p.tenantId}>{p.projectName} · {p.projectCode}</option>
              ))}
            </select>
          </label>
          {projectsQuery.isError && reportKey !== 'app' && reportKey !== 'performance' ? <div className="uc01-admin-message uc01-admin-message--error">Projects could not be loaded.</div> : null}
        </article>
      </div>

      {reportKey === 'app' ? (
        <article className="uc01-admin-config-card">
          <span className="eyebrow">Who has the app</span>
          <AppInstalls accessToken={accessToken} />
        </article>
      ) : null}

      {reportKey === 'performance' ? (
        <article className="uc01-admin-config-card">
          <span className="eyebrow">What the Performance view shows</span>
          <PerformanceSettings accessToken={accessToken} />
        </article>
      ) : null}

      {tenantId && reportKey === 'location' ? (
        <div className="p2-screen p2w">
          <div className="p2w-segment" role="tablist" aria-label="Location checks view">
            <button type="button" role="tab" aria-selected={locationView === 'checks'} className={locationView === 'checks' ? 'is-active' : ''} onClick={() => setLocationView('checks')}>Day log</button>
            <button type="button" role="tab" aria-selected={locationView === 'away'} className={locationView === 'away' ? 'is-active' : ''} onClick={() => setLocationView('away')}>Away more than 5 km</button>
          </div>
          {locationView === 'checks'
            ? <LocationChecksLog key={tenantId} mode="admin" tenantId={tenantId} accessToken={accessToken} />
            : <LocationAwayReport key={tenantId} mode="admin" tenantId={tenantId} accessToken={accessToken} />}
        </div>
      ) : null}

      {tenantId && reportKey === 'sign-ins' ? (
        <div className="p2-screen p2w">
          <AccessLocationsSummary key={tenantId} mode="admin" tenantId={tenantId} accessToken={accessToken} />
        </div>
      ) : null}

      {tenantId && reportKey !== 'journey-review' && reportKey !== 'app' && reportKey !== 'location' && reportKey !== 'sign-ins' && reportKey !== 'performance' ? (
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
