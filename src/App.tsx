import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { IonApp } from '@ionic/react';
import { BrowserRouter, Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import AppGate from './features/announcements/AppGate';
import { useHrAccess } from './features/hr/hrQueries';
import { landingDecision } from './features/rollout/landing';
import { useMyFeatures } from './features/rollout/featureFlags';

import { verigenceLockup } from './assets/verigenceLockup';
import { ErrorBoundary, STALE_CHUNK_RELOAD_FLAG } from './components/ErrorBoundary';
import ProjectContextGate from './components/ProjectContextGate';
import SessionRenewalGate from './components/SessionRenewalGate';
import ProjectAdminOutletLocationEnhancer from './features/project-admin/ProjectAdminOutletLocationEnhancer';
import ProjectMasterActionOverlay from './features/project-admin/ProjectMasterActionOverlay';
import ReviewReadinessWatcher from './features/uc03/ReviewReadinessWatcher';
import AppShell from './layout/AppShell';
import AndroidNativeBridge from './native/AndroidNativeBridge';
import { UC03_PRIMARY_WORK_QUEUE_SETTLED_EVENT } from './services/audit-core/uc03';
import { useProjectContextStore } from './store/projectContextStore';
import { useSessionStore } from './store/sessionStore';
import { P2_NEW_BOOKING_PATH } from './features/uc03-p2/newBookingPath';

const loadDashboardPage = () => import('./pages/DashboardPage');
const loadAuditReviewPage = () => import('./pages/AuditReviewPage');

const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const AppDownloadPage = lazy(() => import('./pages/AppDownloadPage'));
const ApprovalQueuePage = lazy(() => import('./pages/ApprovalQueuePage'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));
const HrEmployeesPage = lazy(() => import('./pages/hr/HrEmployeesPage'));
const HrEmployeeCreatePage = lazy(() => import('./pages/hr/HrEmployeeCreatePage'));
const HrEmployeeImportPage = lazy(() => import('./pages/hr/HrEmployeeImportPage'));
const HrEmployeeDetailPage = lazy(() => import('./pages/hr/HrEmployeeDetailPage'));
const HrMyProfilePage = lazy(() => import('./pages/hr/HrMyProfilePage'));
const HrAttendancePage = lazy(() => import('./pages/hr/HrAttendancePage'));
const HrTeamAttendancePage = lazy(() => import('./pages/hr/HrTeamAttendancePage'));
const HrLeavePage = lazy(() => import('./pages/hr/HrLeavePage'));
const HrLeaveOverviewPage = lazy(() => import('./pages/hr/HrLeaveOverviewPage'));
const HrClaimsPage = lazy(() => import('./pages/hr/HrClaimsPage'));
const HrClaimNewPage = lazy(() => import('./pages/hr/HrClaimNewPage'));
const HrClaimsAllPage = lazy(() => import('./pages/hr/HrClaimsAllPage'));
const HrClaimDetailPage = lazy(() => import('./pages/hr/HrClaimDetailPage'));
const HrApprovalsPage = lazy(() => import('./pages/hr/HrApprovalsPage'));
const HrPayslipsPage = lazy(() => import('./pages/hr/HrPayslipsPage'));
const HrDailyAttendancePage = lazy(() => import('./pages/hr/HrDailyAttendancePage'));
const HrAssignmentsPage = lazy(() => import('./pages/hr/HrAssignmentsPage'));
const HrDesignationSalaryImportPage = lazy(() => import('./pages/hr/HrDesignationSalaryImportPage'));
const AdminFeatureRolloutPage = lazy(() => import('./pages/AdminFeatureRolloutPage'));
const AdminAnnouncementsPage = lazy(() => import('./pages/AdminAnnouncementsPage'));
const AdminDeviceDiagnosticsPage = lazy(() => import('./pages/AdminDeviceDiagnosticsPage'));
const AdminLoginActivityPage = lazy(() => import('./pages/AdminLoginActivityPage'));
const HrHousekeepingPage = lazy(() => import('./pages/HrHousekeepingPage'));
const HrMySalaryPage = lazy(() => import('./pages/hr/HrMySalaryPage'));
const HrPayrollPage = lazy(() => import('./pages/hr/HrPayrollPage'));
const HrSalariesPage = lazy(() => import('./pages/hr/HrSalariesPage'));
const HrPayrollSettingsPage = lazy(() => import('./pages/hr/HrPayrollSettingsPage'));
const HrPayrollRunPage = lazy(() => import('./pages/hr/HrPayrollRunPage'));
const HrSettingsPage = lazy(() => import('./pages/hr/HrSettingsPage'));
const HrMessagesPage = lazy(() => import('./pages/hr/HrMessagesPage'));
const AdminHousekeepingPage = lazy(() => import('./pages/AdminHousekeepingPage'));
const AdminSkuResolutionPage = lazy(() => import('./pages/AdminSkuResolutionPage'));
const AdminReportsPage = lazy(() => import('./pages/AdminReportsPage'));
const AdminLandingPage = lazy(() => import('./pages/AdminLandingPage'));
const AdminFeedbackPage = lazy(() => import('./pages/AdminFeedbackPage'));
const OemMastersPage = lazy(() => import('./pages/AdminOemMastersPage'));
const DiTestConsolePage = lazy(() => import('./pages/DiTestConsolePage'));
const DocumentIntelligenceConfigurationPage = lazy(() => import('./pages/DocumentIntelligenceConfigurationPage'));
const DashboardPage = lazy(loadDashboardPage);
const TeamLeadDashboardPage = lazy(() => import('./pages/TeamLeadDashboardPage'));
const TeamLeadReviewPage = lazy(() => import('./pages/TeamLeadReviewPage'));
const AuditReviewPage = lazy(loadAuditReviewPage);
const JourneySearchPage = lazy(() => import('./pages/JourneySearchPage'));
const ComplianceReportPage = lazy(() => import('./pages/ComplianceReportPage'));
const ReviewQueuePage = lazy(() => import('./pages/ReviewQueuePage'));
const DuplicateBookingsPage = lazy(() => import('./pages/DuplicateBookingsPage'));
const RuleCatalogPage = lazy(() => import('./pages/RuleCatalogPage'));
const RuleAuthoringPage = lazy(() => import('./pages/RuleAuthoringPage'));
const DailyOpsPage = lazy(() => import('./pages/DailyOpsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const HrSupportPage = lazy(() => import('./pages/hr/HrSupportPage'));
const HrSupportNewPage = lazy(() => import('./pages/hr/HrSupportNewPage'));
const HrSupportTicketPage = lazy(() => import('./pages/hr/HrSupportTicketPage'));
const ProjectAdministrationPage = lazy(() => import('./pages/ProjectAdministrationV2Page'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const P2JourneyListPage = lazy(() => import('./pages/P2JourneyListPage'));
const P2DiscountVariancePage = lazy(() => import('./pages/P2DiscountVariancePage'));
const P2JourneyOverviewPage = lazy(() => import('./pages/P2JourneyOverviewPage'));
const P2JourneyWorkspacePage = lazy(() => import('./pages/P2JourneyWorkspacePage'));
const P2TasksPage = lazy(() => import('./pages/P2TasksPage'));
const P2ComplianceReportPage = lazy(() => import('./pages/P2ComplianceReportPage'));
const P2DuplicateBookingsPage = lazy(() => import('./pages/P2DuplicateBookingsPage'));
const P2PriceMastersPage = lazy(() => import('./pages/P2PriceMastersPage'));
const P2MasterDocumentsPage = lazy(() => import('./pages/P2MasterDocumentsPage'));
const P2ReviewBoardPage = lazy(() => import('./pages/P2ReviewBoardPage'));
const P2ReviewActivityPage = lazy(() => import('./pages/P2ReviewActivityPage'));
const P2DailyProcessingReportPage = lazy(() => import('./pages/P2DailyProcessingReportPage'));

const routerBase = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '');

/*
 * ── PC home ───────────────────────────────────────────────────────────────────
 * A PC's home is Booking & Delivery (/p2/bookings). The Phase 1 PC Overview
 * page, with its own "Capture new booking", was removed on 2026-10-20.
 */

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

/** The plain landing: people without the Audit switch who have HR go to HR. Everyone else, and any failure, gets the page as before. */
function HrLanding({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams();
  const myFeatures = useMyFeatures();
  const hr = useHrAccess();
  const decision = landingDecision({
    features: { status: myFeatures.status, audit: myFeatures.features?.AUDIT },
    hr: { loading: hr.loading, available: hr.available, isEmployee: hr.isEmployee, canReadEmployees: hr.canReadEmployees },
    searchParams,
  });
  if (decision.kind === 'wait') return <Loading />;
  if (decision.kind === 'go') return <Navigate to={decision.to} replace />;
  return children;
}

function DashboardEntry() {
  const role = useSessionStore((state) => state.role);
  const selectedProject = useProjectContextStore((state) => state.selectedProject);
  if (role === 'SUPER_ADMIN' && !selectedProject) return <PrivatePage><AdminLandingPage /></PrivatePage>;
  if (selectedProject?.operatingRole === 'TL') return <OperationalPage><TeamLeadDashboardPage /></OperationalPage>;
  // A PC or PM works only on Booking & Delivery: the Phase 1 Overview (and its
  // "Capture new booking") is never shown to them -- see P2DocumentsRedirect.
  if (selectedProject?.operatingRole === 'PC' || selectedProject?.operatingRole === 'PM') {
    return <Navigate to="/p2/bookings" replace />;
  }

  return <OperationalPage><DashboardPage /></OperationalPage>;
}

/** The Phase 1 work queue: PC, TL and PM use Booking & Delivery instead. */
function WorkQueueEntry() {
  const operatingRole = useProjectContextStore((state) => state.selectedProject?.operatingRole);
  if (operatingRole === 'PC' || operatingRole === 'TL' || operatingRole === 'PM') {
    return <Navigate to="/p2/bookings" replace />;
  }
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

function OperationalShellPage({ children }: { children: ReactNode }) {
  return <Authenticated><ProjectContextGate><AppShell>{children}</AppShell></ProjectContextGate></Authenticated>;
}

/** Where a signed-in user lands (2026-09-30): PC, TL and PM start on the
 * Phase 2 Booking & Delivery list; a Reviewer on their own board, which is the
 * only surface they have; everyone else on the Phase 1 Overview. */
function HomeEntry() {
  const selectedProject = useProjectContextStore((state) => state.selectedProject);
  const operatingRole = selectedProject?.operatingRole;
  const home = operatingRole === 'REVIEWER'
    ? '/p2/review'
    : operatingRole === 'PC' || operatingRole === 'TL' || operatingRole === 'PM'
      ? '/p2/bookings'
      : '/dashboard';
  // People without the Audit switch who have HR land on My HR, as the plain landing page does.
  return <Authenticated><ProjectContextGate><HrLanding><Navigate to={home} replace /></HrLanding></ProjectContextGate></Authenticated>;
}


/** The Phase 1 capture screens are gone (2026-10-20). Found live on 19 Oct:
 * a PC reached the old Overview (Verigence logo / outlet switch / mobile
 * bottom bar all pointed at /dashboard), pressed its "Capture new booking",
 * and /v2/bookings/new created the Journey and uploaded a 5-page PDF as ONE
 * document -- never split into pages, so its PAN and Aadhaar were never read
 * and the customer was never named. Every old Booking / Delivery / Documents
 * address now opens the one Booking & Delivery screen; there is no other
 * place in Web that uploads. */
function P2DocumentsRedirect() {
  const { journeyId = '' } = useParams();
  return <Navigate to={journeyId ? `/p2/journeys/${journeyId}/documents` : '/p2/bookings'} replace />;
}

function P2OverviewRedirect() {
  const { journeyId = '' } = useParams();
  return <Navigate to={journeyId ? `/p2/journeys/${journeyId}/overview` : '/p2/bookings'} replace />;
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
          <AppGate>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/apps" element={<AppDistributionRoute />} />
              <Route path="/download" element={<Navigate to="/apps" replace />} />
              <Route path="/home" element={<Authenticated><HrLanding><HomeEntry /></HrLanding></Authenticated>} />
              <Route path="/dashboard" element={<Authenticated><HrLanding><DashboardEntry /></HrLanding></Authenticated>} />
              {/* Dedicated "Bookings & Deliveries" sidebar destination — renders the
                  Work Queue table directly for every operating role (PC, TL, PM),
                  independent of DashboardEntry's Overview role-branching (which
                  would otherwise always send TL to TeamLeadDashboardPage). */}
              <Route path="/work-queue" element={<Authenticated><ProjectContextGate><WorkQueueEntry /></ProjectContextGate></Authenticated>} />
              <Route path="/search" element={<OperationalPage><JourneySearchPage /></OperationalPage>} />
              {/* Old Phase 1 journey addresses (bookmarks, history, old links)
                  all open the Booking & Delivery screens -- see P2DocumentsRedirect. */}
              <Route path="/journeys/:journeyId/overview" element={<P2OverviewRedirect />} />
              <Route path="/journeys/:journeyId/documents" element={<P2DocumentsRedirect />} />
              <Route path="/journeys/:journeyId/compliance-report" element={<OperationalPage><ComplianceReportPage /></OperationalPage>} />
              <Route path="/tl/cases/:journeyId/review" element={<OperationalPage><TeamLeadReviewPage /></OperationalPage>} />
              <Route path="/bookings/:journeyId" element={<P2DocumentsRedirect />} />
              <Route path="/bookings/:journeyId/review" element={<P2DocumentsRedirect />} />
              <Route path="/v2/bookings/new" element={<Navigate to={P2_NEW_BOOKING_PATH} replace />} />
              <Route path="/v2/bookings/:journeyId" element={<P2DocumentsRedirect />} />
              <Route path="/v2/bookings/:journeyId/details" element={<P2OverviewRedirect />} />
              <Route path="/v2/bookings/:journeyId/review" element={<P2DocumentsRedirect />} />
              <Route path="/deliveries/:journeyId" element={<P2DocumentsRedirect />} />
              <Route path="/v2/deliveries/:journeyId" element={<P2DocumentsRedirect />} />
              <Route path="/v2/deliveries/:journeyId/review" element={<P2DocumentsRedirect />} />
              <Route path="/audit/:journeyId" element={<OperationalPage><AuditReviewPage /></OperationalPage>} />
              <Route path="/feedback" element={<Navigate to="/hr/support" replace />} />
              <Route path="/reviews" element={<OperationalPage><ReviewQueuePage /></OperationalPage>} />
              <Route path="/duplicate-bookings" element={<OperationalPage><DuplicateBookingsPage /></OperationalPage>} />
              <Route path="/rule-catalog" element={<OperationalPage><RuleCatalogPage /></OperationalPage>} />
              <Route path="/rule-catalog/new" element={<OperationalPage><RuleAuthoringPage /></OperationalPage>} />
              <Route path="/daily-ops" element={<OperationalShellPage><DailyOpsPage /></OperationalShellPage>} />
              <Route path="/analytics" element={<OperationalShellPage><AnalyticsPage /></OperationalShellPage>} />

              {/* Phase 2 is additive. Existing links/routes above remain unchanged. */}
              <Route path="/p2/bookings" element={<OperationalPage><P2JourneyListPage /></OperationalPage>} />
              <Route path="/p2/journey-360" element={<Navigate to="/p2/bookings" replace />} />
              <Route path="/p2/work-queue" element={<Navigate to="/p2/bookings" replace />} />
              <Route path="/p2/tasks" element={<OperationalPage><P2TasksPage /></OperationalPage>} />
              <Route path="/p2/duplicate-bookings" element={<OperationalPage><P2DuplicateBookingsPage /></OperationalPage>} />
              <Route path="/p2/discount-variance" element={<OperationalPage><P2DiscountVariancePage /></OperationalPage>} />
              <Route path="/p2/price-masters" element={<OperationalPage><P2PriceMastersPage /></OperationalPage>} />
              <Route path="/p2/master-documents" element={<OperationalPage><P2MasterDocumentsPage /></OperationalPage>} />
              <Route path="/p2/review" element={<OperationalPage><P2ReviewBoardPage /></OperationalPage>} />
              <Route path="/p2/review/activity" element={<OperationalPage><P2ReviewActivityPage /></OperationalPage>} />
              <Route path="/p2/reports/daily" element={<OperationalPage><P2DailyProcessingReportPage /></OperationalPage>} />
              <Route path="/p2/journeys/:journeyId/compliance-report" element={<OperationalPage><P2ComplianceReportPage /></OperationalPage>} />
              <Route path="/p2/journeys/:journeyId/overview" element={<OperationalPage><P2JourneyOverviewPage /></OperationalPage>} />
              <Route path="/p2/journeys/:journeyId/documents" element={<OperationalPage><P2JourneyWorkspacePage /></OperationalPage>} />
              <Route path="/p2/journeys/:journeyId/documents/:documentId" element={<OperationalPage><P2JourneyWorkspacePage /></OperationalPage>} />
              <Route path="/p2/journeys/:journeyId/tasks" element={<OperationalPage><P2TasksPage /></OperationalPage>} />
              <Route path="/admin/document-intelligence" element={<SuperAdminPage><DocumentIntelligenceConfigurationPage /></SuperAdminPage>} />
              <Route path="/admin/housekeeping" element={<SuperAdminPage><AdminHousekeepingPage /></SuperAdminPage>} />
              <Route path="/admin/sku-resolution" element={<SuperAdminPage><AdminSkuResolutionPage /></SuperAdminPage>} />
              <Route path="/admin/reports" element={<SuperAdminPage><AdminReportsPage /></SuperAdminPage>} />
              <Route path="/admin/feedback" element={<SuperAdminPage><AdminFeedbackPage /></SuperAdminPage>} />
              <Route path="/admin/di-test" element={<SuperAdminPage><DiTestConsolePage /></SuperAdminPage>} />
              <Route path="/admin/users" element={<SuperAdminPage><AdminUsersPage /></SuperAdminPage>} />
              <Route path="/admin/features" element={<SuperAdminPage><AdminFeatureRolloutPage /></SuperAdminPage>} />
              <Route path="/admin/announcements" element={<SuperAdminPage><AdminAnnouncementsPage /></SuperAdminPage>} />
              <Route path="/admin/diagnostics" element={<SuperAdminPage><AdminDeviceDiagnosticsPage /></SuperAdminPage>} />
              <Route path="/admin/login-activity" element={<SuperAdminPage><AdminLoginActivityPage /></SuperAdminPage>} />
              <Route path="/admin/hr-housekeeping" element={<SuperAdminPage><HrHousekeepingPage /></SuperAdminPage>} />
              <Route path="/admin/users/pending" element={<SuperAdminPage><ApprovalQueuePage /></SuperAdminPage>} />
              <Route path="/admin/oem-masters" element={<SuperAdminPage><OemMastersPage /></SuperAdminPage>} />
              <Route path="/admin/project" element={<ProjectAdminPage><ProjectAdministrationPage /></ProjectAdminPage>} />
              <Route path="/approvals" element={<Navigate to="/admin/users/pending" replace />} />
              <Route path="/admin/project-provisioning" element={<Navigate to="/admin/project" replace />} />
              <Route path="/admin/organization" element={<Navigate to="/admin/project?step=2" replace />} />
              <Route path="/admin/team" element={<Navigate to="/admin/project?step=5" replace />} />
              <Route path="/admin/masters" element={<Navigate to="/admin/project?step=6" replace />} />
              <Route path="/profile" element={<PrivatePage><ProfilePage /></PrivatePage>} />
              {/* HR is company-level: no project or outlet is needed, and every call is checked by the HR service. */}
              <Route path="/hr/me" element={<PrivatePage><HrMyProfilePage /></PrivatePage>} />
              <Route path="/hr/employees" element={<PrivatePage><HrEmployeesPage /></PrivatePage>} />
              <Route path="/hr/employees/new" element={<PrivatePage><HrEmployeeCreatePage /></PrivatePage>} />
              <Route path="/hr/employees/import" element={<PrivatePage><HrEmployeeImportPage /></PrivatePage>} />
              <Route path="/hr/employees/designation-salary-import" element={<PrivatePage><HrDesignationSalaryImportPage /></PrivatePage>} />
              <Route path="/hr/employees/:employeeId" element={<PrivatePage><HrEmployeeDetailPage /></PrivatePage>} />
              <Route path="/hr/attendance" element={<PrivatePage><HrAttendancePage /></PrivatePage>} />
              <Route path="/hr/attendance/team" element={<PrivatePage><HrTeamAttendancePage /></PrivatePage>} />
              <Route path="/hr/attendance/daily" element={<PrivatePage><HrDailyAttendancePage /></PrivatePage>} />
              <Route path="/hr/assignments" element={<PrivatePage><HrAssignmentsPage /></PrivatePage>} />
              <Route path="/hr/leave" element={<PrivatePage><HrLeavePage /></PrivatePage>} />
              <Route path="/hr/leave/overview" element={<PrivatePage><HrLeaveOverviewPage /></PrivatePage>} />
              <Route path="/hr/claims" element={<PrivatePage><HrClaimsPage /></PrivatePage>} />
              <Route path="/hr/claims/new" element={<PrivatePage><HrClaimNewPage /></PrivatePage>} />
              <Route path="/hr/claims/all" element={<PrivatePage><HrClaimsAllPage /></PrivatePage>} />
              <Route path="/hr/claims/:claimId" element={<PrivatePage><HrClaimDetailPage /></PrivatePage>} />
              <Route path="/hr/approvals" element={<PrivatePage><HrApprovalsPage /></PrivatePage>} />
              <Route path="/hr/payslips" element={<PrivatePage><HrPayslipsPage /></PrivatePage>} />
              <Route path="/hr/salary" element={<PrivatePage><HrMySalaryPage /></PrivatePage>} />
              <Route path="/hr/payroll" element={<PrivatePage><HrPayrollPage /></PrivatePage>} />
              <Route path="/hr/payroll/salaries" element={<PrivatePage><HrSalariesPage /></PrivatePage>} />
              <Route path="/hr/payroll/settings" element={<PrivatePage><HrPayrollSettingsPage /></PrivatePage>} />
              <Route path="/hr/payroll/runs/:runId" element={<PrivatePage><HrPayrollRunPage /></PrivatePage>} />
              <Route path="/hr/settings" element={<PrivatePage><HrSettingsPage /></PrivatePage>} />
              <Route path="/hr/messages" element={<PrivatePage><HrMessagesPage /></PrivatePage>} />
              <Route path="/hr/support" element={<PrivatePage><HrSupportPage /></PrivatePage>} />
              <Route path="/hr/support/new" element={<PrivatePage><HrSupportNewPage /></PrivatePage>} />
              <Route path="/hr/support/:ticketId" element={<PrivatePage><HrSupportTicketPage /></PrivatePage>} />
              <Route path="/workspace" element={<Navigate to="/home" replace />} />
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </Suspense>
          </AppGate>
        </BrowserRouter>
      </IonApp>
    </ErrorBoundary>
  );
}
