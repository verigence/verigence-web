import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { IonApp } from '@ionic/react';
import { BrowserRouter, Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom';

import { verigenceLockup } from './assets/verigenceLockup';
import { ErrorBoundary, STALE_CHUNK_RELOAD_FLAG } from './components/ErrorBoundary';
import ProjectContextGate from './components/ProjectContextGate';
import SessionRenewalGate from './components/SessionRenewalGate';
import AttendanceShellSlot from './features/attendance/AttendanceShellSlot';
import ProjectAdminOutletLocationEnhancer from './features/project-admin/ProjectAdminOutletLocationEnhancer';
import ProjectMasterActionOverlay from './features/project-admin/ProjectMasterActionOverlay';
import OverviewOpenBoundary from './features/uc03/OverviewOpenBoundary';
import ReviewReadinessWatcher from './features/uc03/ReviewReadinessWatcher';
import AppShell from './layout/AppShell';
import AndroidNativeBridge from './native/AndroidNativeBridge';
import { UC03_PRIMARY_WORK_QUEUE_SETTLED_EVENT } from './services/audit-core/uc03';
import { useProjectContextStore } from './store/projectContextStore';
import { useSessionStore } from './store/sessionStore';

const loadDashboardPage = () => import('./pages/DashboardPage');
const loadBookingWorkspacePage = () => import('./pages/BookingWorkspaceFastEntry');
const loadBookingReviewPage = () => import('./pages/BookingReviewPage');
const loadBookingCaptureV2Page = () => import('./pages/BookingCaptureV2Page');
const loadBookingDetailsV2Page = () => import('./pages/BookingDetailsV2Page');
const loadDeliveryWorkspacePage = () => import('./pages/DeliveryWorkspacePage');
const loadDeliveryCaptureV2Page = () => import('./pages/DeliveryCaptureV2Page');
const loadAuditReviewPage = () => import('./pages/AuditReviewPage');

const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const AppDownloadPage = lazy(() => import('./pages/AppDownloadPage'));
const ApprovalQueuePage = lazy(() => import('./pages/ApprovalQueuePage'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));
const AdminConfigurationPage = lazy(() => import('./pages/AdminConfigurationPage'));
const AdminHousekeepingPage = lazy(() => import('./pages/AdminHousekeepingPage'));
const AdminLandingPage = lazy(() => import('./pages/AdminLandingPage'));
const AdminFeedbackPage = lazy(() => import('./pages/AdminFeedbackPage'));
const OemMastersPage = lazy(() => import('./pages/AdminOemMastersPage'));
const DiTestConsolePage = lazy(() => import('./pages/DiTestConsolePage'));
const DocumentIntelligenceConfigurationPage = lazy(() => import('./pages/DocumentIntelligenceConfigurationPage'));
const DashboardPage = lazy(loadDashboardPage);
const PcOverviewPage = lazy(() => import('./pages/PcOverviewPage'));
const TeamLeadDashboardPage = lazy(() => import('./pages/TeamLeadDashboardPage'));
const TeamLeadReviewPage = lazy(() => import('./pages/TeamLeadReviewPage'));
const BookingCaptureV2Page = lazy(loadBookingCaptureV2Page);
const BookingDetailsV2Page = lazy(loadBookingDetailsV2Page);
const DeliveryCaptureV2Page = lazy(loadDeliveryCaptureV2Page);
const AuditReviewPage = lazy(loadAuditReviewPage);
const AttendancePage = lazy(() => import('./pages/AttendancePage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const JourneysPage = lazy(() => import('./pages/JourneysPage'));
const JourneySearchPage = lazy(() => import('./pages/JourneySearchPage'));
const Journey360Page = lazy(() => import('./pages/Journey360Page'));
const ComplianceReportPage = lazy(() => import('./pages/ComplianceReportPage'));
const JourneyWorkspacePage = lazy(() => import('./pages/JourneyWorkspacePage'));
const EvidencePage = lazy(() => import('./pages/EvidencePage'));
const EvidenceDetailPage = lazy(() => import('./pages/EvidenceDetailPage'));
const ReviewQueuePage = lazy(() => import('./pages/ReviewQueuePage'));
const DuplicateBookingsPage = lazy(() => import('./pages/DuplicateBookingsPage'));
const JourneyDocumentsPage = lazy(() => import('./pages/JourneyDocumentsPage'));
const RuleCatalogPage = lazy(() => import('./pages/RuleCatalogPage'));
const RuleAuthoringPage = lazy(() => import('./pages/RuleAuthoringPage'));
const FindingsPage = lazy(() => import('./pages/FindingsPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const PaymentTrackerPage = lazy(() => import('./pages/PaymentTrackerPage'));
const DailyOpsPage = lazy(() => import('./pages/DailyOpsPage'));
const ActivityTrackerPage = lazy(() => import('./pages/ActivityTrackerPage'));
const CrmPage = lazy(() => import('./pages/CrmPage'));
const EscalationsPage = lazy(() => import('./pages/EscalationsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));
const ProjectAdministrationPage = lazy(() => import('./pages/ProjectAdministrationV2Page'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));

const routerBase = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '');

/*
 * ── PC Overview redesign ──────────────────────────────────────────────────────
 * The new Process Coordinator dashboard lives in ./pages/PcOverviewPage and is
 * documented under docs/uc-003-booking-delivery-audit/pc-overview-redesign/.
 * It ONLY replaces the PC landing screen — Team Lead / PM / admin dashboards are
 * left exactly as they were.
 *
 * Falling back to the legacy Work Queue dashboard is deliberately trivial:
 *   • set PC_OVERVIEW_REDESIGN_ENABLED to false below, or
 *   • open any dashboard link with ?legacyDashboard=1
 * The legacy DashboardPage and every dashboard-*.css file are untouched.
 */
const PC_OVERVIEW_REDESIGN_ENABLED = true;

function PcJourneyRoutePreloader() {
  const signedIn = useSessionStore((state) => state.signedIn);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboardPage();
    }, 250);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!signedIn) return undefined;
    let started = false;
    let preloadTimer: number | undefined;
    let fallbackTimer: number | undefined;

    const preloadJourneys = () => {
      if (started) return;
      started = true;
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
      preloadTimer = window.setTimeout(() => {
        void Promise.allSettled([
          loadBookingWorkspacePage(),
          loadBookingReviewPage(),
          loadBookingCaptureV2Page(),
          loadBookingDetailsV2Page(),
          loadDeliveryWorkspacePage(),
          loadDeliveryCaptureV2Page(),
          loadAuditReviewPage(),
        ]);
      }, 150);
    };

    window.addEventListener(UC03_PRIMARY_WORK_QUEUE_SETTLED_EVENT, preloadJourneys);
    fallbackTimer = window.setTimeout(preloadJourneys, 30_000);

    return () => {
      window.removeEventListener(UC03_PRIMARY_WORK_QUEUE_SETTLED_EVENT, preloadJourneys);
      if (preloadTimer !== undefined) window.clearTimeout(preloadTimer);
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
    };
  }, [signedIn]);

  return null;
}

function Authenticated({ children }: { children: ReactNode }) {
  const signedIn = useSessionStore((state) => state.signedIn);
  const accessToken = useSessionStore((state) => state.accessToken);
  if (!signedIn || !accessToken) return <Navigate to="/login" replace />;
  return children;
}

function AppDistributionRoute() {
  const signedIn = useSessionStore((state) => state.signedIn);
  const accessToken = useSessionStore((state) => state.accessToken);
  if (!signedIn || !accessToken) return <Navigate to="/login?returnTo=%2Fapps" replace />;
  // Intentionally no role, project, workspace, or operating-persona gate here.
  // Any authenticated Verigence USER may download an approved mobile release.
  return <AppDownloadPage />;
}

function PrivatePage({ children }: { children: ReactNode }) {
  return <Authenticated><AppShell>{children}</AppShell></Authenticated>;
}

function SuperAdminPage({ children }: { children: ReactNode }) {
  const role = useSessionStore((state) => state.role);
  if (role !== 'SUPER_ADMIN') return <Navigate to="/dashboard" replace />;
  return <PrivatePage>{children}</PrivatePage>;
}

function ProjectAdminPage({ children }: { children: ReactNode }) {
  const role = useSessionStore((state) => state.role);
  if (role !== 'SUPER_ADMIN' && role !== 'TENANT_ADMIN') return <Navigate to="/dashboard" replace />;
  return <PrivatePage>{children}</PrivatePage>;
}

function DashboardEntry() {
  const role = useSessionStore((state) => state.role);
  const selectedProject = useProjectContextStore((state) => state.selectedProject);
  const [searchParams] = useSearchParams();
  if (role === 'SUPER_ADMIN' && !selectedProject) return <PrivatePage><AdminLandingPage /></PrivatePage>;
  if (selectedProject?.operatingRole === 'TL') return <OperationalPage><TeamLeadDashboardPage /></OperationalPage>;

  // useSearchParams (not window.location) so the tiles on PC Overview, which link
  // to /dashboard?legacyDashboard=1&view=…, actually re-render this into the
  // legacy work queue instead of a no-op.
  const usePcOverview = selectedProject?.operatingRole === 'PC'
    && PC_OVERVIEW_REDESIGN_ENABLED
    && !searchParams.has('legacyDashboard');
  if (usePcOverview) return <OperationalPage><PcOverviewPage /></OperationalPage>;

  return <OperationalPage><DashboardPage /></OperationalPage>;
}

function OperationalPage({ children }: { children: ReactNode }) {
  return (
    <Authenticated>
      <ProjectContextGate>
        <AppShell>
          <ReviewReadinessWatcher />
          {children}
        </AppShell>
      </ProjectContextGate>
    </Authenticated>
  );
}

function OverviewJourneyPage({ children }: { children: ReactNode }) {
  return (
    <OperationalPage>
      <OverviewOpenBoundary>{children}</OverviewOpenBoundary>
    </OperationalPage>
  );
}

function OperationalShellPage({ children }: { children: ReactNode }) {
  return <Authenticated><ProjectContextGate><AppShell>{children}</AppShell></ProjectContextGate></Authenticated>;
}

function LegacyOperationalPage({ children }: { children: ReactNode }) {
  const role = useSessionStore((state) => state.role);
  const selectedProject = useProjectContextStore((state) => state.selectedProject);
  const adminPersona = role === 'SUPER_ADMIN' || role === 'TENANT_ADMIN';
  if (adminPersona && !selectedProject) return <PrivatePage>{children}</PrivatePage>;
  return <Authenticated><ProjectContextGate><Navigate to="/dashboard" replace /></ProjectContextGate></Authenticated>;
}

function V2JourneyRedirect({ target }: { target: 'BOOKING' | 'BOOKING_REVIEW' | 'DELIVERY' }) {
  const { journeyId = '' } = useParams();
  if (!journeyId) return <Navigate to="/dashboard" replace />;
  // BOOKING and BOOKING_REVIEW both land on the one unified Documents page
  // now -- BookingCaptureV2WorkspacePage's own upload/checklist/Submit UI
  // and BookingReviewV2Page's Accept/Reject/Confirm-reviewed-values flow
  // were both folded into JourneyDocumentsPage, so there is nothing left
  // for either former destination to render.
  const path = target === 'DELIVERY'
    ? `/v2/deliveries/${journeyId}`
    : `/journeys/${journeyId}/documents`;
  return <Navigate to={path} replace />;
}

/** /v2/bookings/:journeyId (an EXISTING Booking) used to render the capture
 * workspace directly; that screen's functionality now lives on
 * JourneyDocumentsPage, so this route is a plain redirect. /v2/bookings/new
 * (no journeyId yet) still renders BookingCaptureV2Page for the actual
 * creation step -- see its own docstring. */
function JourneyDocumentsRedirect() {
  const { journeyId = '' } = useParams();
  if (!journeyId) return <Navigate to="/dashboard" replace />;
  return <Navigate to={`/journeys/${journeyId}/documents`} replace />;
}

function Loading() {
  return <div className="app-loading"><img src={verigenceLockup} alt="Verigence" /><span>Loading Verigence…</span></div>;
}

export default function App() {
  // Proves this boot actually got past ErrorBoundary's own stale-chunk
  // auto-reload (see there) -- clearing it here, not right after that
  // reload fires, is what lets a LATER deploy get its own one free reload
  // in the same tab instead of being silently suppressed by a flag left
  // over from hours earlier.
  useEffect(() => {
    try {
      sessionStorage.removeItem(STALE_CHUNK_RELOAD_FLAG);
    } catch {
      // sessionStorage unavailable -- nothing to clear.
    }
  }, []);

  return (
    <ErrorBoundary>
      <IonApp>
        <BrowserRouter basename={routerBase}>
          <SessionRenewalGate />
          <PcJourneyRoutePreloader />
          <AndroidNativeBridge />
          <ProjectAdminOutletLocationEnhancer />
          <ProjectMasterActionOverlay />
          <AttendanceShellSlot />
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/apps" element={<AppDistributionRoute />} />
              <Route path="/download" element={<Navigate to="/apps" replace />} />
              <Route path="/dashboard" element={<DashboardEntry />} />
              {/* Dedicated "Bookings & Deliveries" sidebar destination — renders the
                  Work Queue table directly for every operating role (PC, TL, PM),
                  independent of DashboardEntry's Overview role-branching (which
                  would otherwise always send TL to TeamLeadDashboardPage). */}
              <Route path="/work-queue" element={<OperationalPage><DashboardPage /></OperationalPage>} />
              <Route path="/search" element={<OperationalPage><JourneySearchPage /></OperationalPage>} />
              <Route path="/journeys/:journeyId/overview" element={<OperationalPage><Journey360Page /></OperationalPage>} />
              <Route path="/journeys/:journeyId/documents" element={<OperationalPage><JourneyDocumentsPage /></OperationalPage>} />
              <Route path="/journeys/:journeyId/compliance-report" element={<OperationalPage><ComplianceReportPage /></OperationalPage>} />
              <Route path="/attendance" element={<OperationalShellPage><AttendancePage /></OperationalShellPage>} />
              <Route path="/tl/cases/:journeyId/review" element={<OperationalPage><TeamLeadReviewPage /></OperationalPage>} />
              <Route path="/bookings/:journeyId" element={<V2JourneyRedirect target="BOOKING" />} />
              <Route path="/bookings/:journeyId/review" element={<V2JourneyRedirect target="BOOKING_REVIEW" />} />
              {/* /new creates the Journey then hands off to JourneyDocumentsPage
                  (see BookingCaptureV2WorkspacePage's own docstring); an
                  EXISTING Booking now redirects straight there too -- its
                  former workspace UI was folded in. */}
              <Route path="/v2/bookings/new" element={<OperationalPage><BookingCaptureV2Page /></OperationalPage>} />
              <Route path="/v2/bookings/:journeyId" element={<JourneyDocumentsRedirect />} />
              <Route path="/v2/bookings/:journeyId/details" element={<OperationalPage><BookingDetailsV2Page /></OperationalPage>} />
              <Route path="/v2/bookings/:journeyId/review" element={<JourneyDocumentsRedirect />} />
              <Route path="/deliveries/:journeyId" element={<V2JourneyRedirect target="DELIVERY" />} />
              <Route path="/v2/deliveries/:journeyId" element={<OverviewJourneyPage><DeliveryCaptureV2Page /></OverviewJourneyPage>} />
              {/* DeliveryReviewV2Page's Accept/Reject/Confirm flow was never
                  reachable in production (no real Link/navigate anywhere
                  pointed at this route, confirmed by an exhaustive search) --
                  redirected rather than left to 404 in case anything
                  unexpected still links here. */}
              <Route path="/v2/deliveries/:journeyId/review" element={<JourneyDocumentsRedirect />} />
              <Route path="/audit/:journeyId" element={<OperationalPage><AuditReviewPage /></OperationalPage>} />
              <Route path="/feedback" element={<OperationalShellPage><FeedbackPage /></OperationalShellPage>} />
              <Route path="/customers" element={<LegacyOperationalPage><CustomersPage /></LegacyOperationalPage>} />
              <Route path="/journeys" element={<LegacyOperationalPage><JourneysPage /></LegacyOperationalPage>} />
              <Route path="/journeys/:journeyId" element={<LegacyOperationalPage><JourneyWorkspacePage /></LegacyOperationalPage>} />
              <Route path="/journeys/:journeyId/evidence/:evidenceId" element={<LegacyOperationalPage><EvidenceDetailPage /></LegacyOperationalPage>} />
              <Route path="/reviews" element={<OperationalPage><ReviewQueuePage /></OperationalPage>} />
              <Route path="/duplicate-bookings" element={<OperationalPage><DuplicateBookingsPage /></OperationalPage>} />
              <Route path="/rule-catalog" element={<OperationalPage><RuleCatalogPage /></OperationalPage>} />
              <Route path="/rule-catalog/new" element={<OperationalPage><RuleAuthoringPage /></OperationalPage>} />
              <Route path="/evidence" element={<LegacyOperationalPage><EvidencePage /></LegacyOperationalPage>} />
              <Route path="/payments" element={<LegacyOperationalPage><PaymentTrackerPage /></LegacyOperationalPage>} />
              <Route path="/findings" element={<LegacyOperationalPage><FindingsPage /></LegacyOperationalPage>} />
              <Route path="/tasks" element={<LegacyOperationalPage><TasksPage /></LegacyOperationalPage>} />
              <Route path="/daily-ops" element={<OperationalShellPage><DailyOpsPage /></OperationalShellPage>} />
              <Route path="/activity" element={<LegacyOperationalPage><ActivityTrackerPage /></LegacyOperationalPage>} />
              <Route path="/crm" element={<LegacyOperationalPage><CrmPage /></LegacyOperationalPage>} />
              <Route path="/escalations" element={<LegacyOperationalPage><EscalationsPage /></LegacyOperationalPage>} />
              <Route path="/analytics" element={<OperationalShellPage><AnalyticsPage /></OperationalShellPage>} />

              <Route path="/admin/engagements" element={<SuperAdminPage><AdminConfigurationPage section="engagements" /></SuperAdminPage>} />
              <Route path="/admin/document-intelligence" element={<SuperAdminPage><DocumentIntelligenceConfigurationPage /></SuperAdminPage>} />
              <Route path="/admin/housekeeping" element={<SuperAdminPage><AdminHousekeepingPage /></SuperAdminPage>} />
              <Route path="/admin/feedback" element={<SuperAdminPage><AdminFeedbackPage /></SuperAdminPage>} />
              <Route path="/admin/di-test" element={<SuperAdminPage><DiTestConsolePage /></SuperAdminPage>} />
              <Route path="/admin/users" element={<SuperAdminPage><AdminUsersPage /></SuperAdminPage>} />
              <Route path="/admin/users/pending" element={<SuperAdminPage><ApprovalQueuePage /></SuperAdminPage>} />
              <Route path="/admin/activity-log" element={<SuperAdminPage><AdminConfigurationPage section="activity" /></SuperAdminPage>} />
              <Route path="/admin/roles-permissions" element={<SuperAdminPage><AdminConfigurationPage section="roles" /></SuperAdminPage>} />
              <Route path="/admin/audit-rules" element={<SuperAdminPage><AdminConfigurationPage section="audit-rules" /></SuperAdminPage>} />
              <Route path="/admin/approval-workflow" element={<SuperAdminPage><AdminConfigurationPage section="approval-workflow" /></SuperAdminPage>} />
              <Route path="/admin/notifications" element={<SuperAdminPage><AdminConfigurationPage section="notifications" /></SuperAdminPage>} />
              <Route path="/admin/oem-masters" element={<SuperAdminPage><OemMastersPage /></SuperAdminPage>} />
              <Route path="/admin/project" element={<ProjectAdminPage><ProjectAdministrationPage /></ProjectAdminPage>} />

              <Route path="/approvals" element={<Navigate to="/admin/users/pending" replace />} />
              <Route path="/admin/project-provisioning" element={<Navigate to="/admin/project" replace />} />
              <Route path="/admin/organization" element={<Navigate to="/admin/project?step=2" replace />} />
              <Route path="/admin/team" element={<Navigate to="/admin/project?step=5" replace />} />
              <Route path="/admin/masters" element={<Navigate to="/admin/project?step=6" replace />} />
              <Route path="/profile" element={<PrivatePage><ProfilePage /></PrivatePage>} />
              <Route path="/workspace" element={<Navigate to="/dashboard" replace />} />
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </IonApp>
    </ErrorBoundary>
  );
}
