import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { IonApp } from '@ionic/react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';

import { verigenceLockup } from './assets/verigenceLockup';
import { ErrorBoundary } from './components/ErrorBoundary';
import ProjectContextGate from './components/ProjectContextGate';
import SessionRenewalGate from './components/SessionRenewalGate';
import AttendanceShellSlot from './features/attendance/AttendanceShellSlot';
import ProjectAdminOutletLocationEnhancer from './features/project-admin/ProjectAdminOutletLocationEnhancer';
import ProjectMasterActionOverlay from './features/project-admin/ProjectMasterActionOverlay';
import ReviewReadinessWatcher from './features/uc03/ReviewReadinessWatcher';
import AppShell from './layout/AppShell';
import AndroidNativeBridge from './native/AndroidNativeBridge';
import { UC03_PRIMARY_WORK_QUEUE_SETTLED_EVENT } from './services/audit-core/uc03';
import { useProjectContextStore } from './store/projectContextStore';
import { useSessionStore } from './store/sessionStore';

const loadDashboardPage = () => import('./pages/DashboardPage');
const loadBookingWorkspacePage = () => import('./pages/BookingWorkspaceFastEntry');
const loadBookingReviewPage = () => import('./pages/BookingReviewPage');
const loadCreateBookingV2Page = () => import('./pages/CreateBookingV2Page');
const loadBookingCaptureV2Page = () => import('./pages/BookingCaptureV2Page');
const loadBookingDetailsV2Page = () => import('./pages/BookingDetailsV2Page');
const loadBookingReviewV2Page = () => import('./pages/BookingReviewV2Page');
const loadDeliveryWorkspacePage = () => import('./pages/DeliveryWorkspacePage');
const loadDeliveryCaptureV2Page = () => import('./pages/DeliveryCaptureV2Page');
const loadDeliveryReviewV2Page = () => import('./pages/DeliveryReviewV2Page');
const loadAuditReviewPage = () => import('./pages/AuditReviewPage');

const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const ApprovalQueuePage = lazy(() => import('./pages/ApprovalQueuePage'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));
const AdminConfigurationPage = lazy(() => import('./pages/AdminConfigurationPage'));
const AdminHousekeepingPage = lazy(() => import('./pages/AdminHousekeepingPage'));
const AdminLandingPage = lazy(() => import('./pages/AdminLandingPage'));
const AdminFeedbackPage = lazy(() => import('./pages/AdminFeedbackPage'));
const DiTestConsolePage = lazy(() => import('./pages/DiTestConsolePage'));
const DocumentIntelligenceConfigurationPage = lazy(() => import('./pages/DocumentIntelligenceConfigurationPage'));
const DashboardPage = lazy(loadDashboardPage);
const TeamLeadDashboardPage = lazy(() => import('./pages/TeamLeadDashboardPage'));
const TeamLeadReviewPage = lazy(() => import('./pages/TeamLeadReviewPage'));
const CreateBookingV2Page = lazy(loadCreateBookingV2Page);
const BookingCaptureV2Page = lazy(loadBookingCaptureV2Page);
const BookingDetailsV2Page = lazy(loadBookingDetailsV2Page);
const BookingReviewV2Page = lazy(loadBookingReviewV2Page);
const DeliveryCaptureV2Page = lazy(loadDeliveryCaptureV2Page);
const DeliveryReviewV2Page = lazy(loadDeliveryReviewV2Page);
const AuditReviewPage = lazy(loadAuditReviewPage);
const AttendancePage = lazy(() => import('./pages/AttendancePage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const JourneysPage = lazy(() => import('./pages/JourneysPage'));
const JourneySearchPage = lazy(() => import('./pages/JourneySearchPage'));
const Journey360Page = lazy(() => import('./pages/Journey360Page'));
const JourneyWorkspacePage = lazy(() => import('./pages/JourneyWorkspacePage'));
const EvidencePage = lazy(() => import('./pages/EvidencePage'));
const EvidenceDetailPage = lazy(() => import('./pages/EvidenceDetailPage'));
const ReviewQueuePage = lazy(() => import('./pages/ReviewQueuePage'));
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
          loadCreateBookingV2Page(),
          loadBookingCaptureV2Page(),
          loadBookingDetailsV2Page(),
          loadBookingReviewV2Page(),
          loadDeliveryWorkspacePage(),
          loadDeliveryCaptureV2Page(),
          loadDeliveryReviewV2Page(),
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
  if (role === 'SUPER_ADMIN' && !selectedProject) return <PrivatePage><AdminLandingPage /></PrivatePage>;
  if (selectedProject?.operatingRole === 'TL') return <OperationalPage><TeamLeadDashboardPage /></OperationalPage>;
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
  const path = target === 'BOOKING'
    ? `/v2/bookings/${journeyId}`
    : target === 'BOOKING_REVIEW'
      ? `/v2/bookings/${journeyId}/review`
      : `/v2/deliveries/${journeyId}`;
  return <Navigate to={path} replace />;
}

function Loading() {
  return <div className="app-loading"><img src={verigenceLockup} alt="Verigence" /><span>Loading Verigence…</span></div>;
}

export default function App() {
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
              <Route path="/dashboard" element={<DashboardEntry />} />
              <Route path="/search" element={<OperationalPage><JourneySearchPage /></OperationalPage>} />
              <Route path="/journeys/:journeyId/overview" element={<OperationalPage><Journey360Page /></OperationalPage>} />
              <Route path="/attendance" element={<OperationalShellPage><AttendancePage /></OperationalShellPage>} />
              <Route path="/tl/cases/:journeyId/review" element={<OperationalPage><TeamLeadReviewPage /></OperationalPage>} />
              <Route path="/bookings/:journeyId" element={<V2JourneyRedirect target="BOOKING" />} />
              <Route path="/bookings/:journeyId/review" element={<V2JourneyRedirect target="BOOKING_REVIEW" />} />
              <Route path="/v2/bookings/new" element={<OperationalPage><CreateBookingV2Page /></OperationalPage>} />
              <Route path="/v2/bookings/:journeyId" element={<OperationalPage><BookingCaptureV2Page /></OperationalPage>} />
              <Route path="/v2/bookings/:journeyId/details" element={<OperationalPage><BookingDetailsV2Page /></OperationalPage>} />
              <Route path="/v2/bookings/:journeyId/review" element={<OperationalPage><BookingReviewV2Page /></OperationalPage>} />
              <Route path="/deliveries/:journeyId" element={<V2JourneyRedirect target="DELIVERY" />} />
              <Route path="/v2/deliveries/:journeyId" element={<OperationalPage><DeliveryCaptureV2Page /></OperationalPage>} />
              <Route path="/v2/deliveries/:journeyId/review" element={<OperationalPage><DeliveryReviewV2Page /></OperationalPage>} />
              <Route path="/audit/:journeyId" element={<OperationalPage><AuditReviewPage /></OperationalPage>} />
              <Route path="/feedback" element={<OperationalShellPage><FeedbackPage /></OperationalShellPage>} />
              <Route path="/customers" element={<LegacyOperationalPage><CustomersPage /></LegacyOperationalPage>} />
              <Route path="/journeys" element={<LegacyOperationalPage><JourneysPage /></LegacyOperationalPage>} />
              <Route path="/journeys/:journeyId" element={<LegacyOperationalPage><JourneyWorkspacePage /></LegacyOperationalPage>} />
              <Route path="/journeys/:journeyId/evidence/:evidenceId" element={<LegacyOperationalPage><EvidenceDetailPage /></LegacyOperationalPage>} />
              <Route path="/reviews" element={<LegacyOperationalPage><ReviewQueuePage /></LegacyOperationalPage>} />
              <Route path="/evidence" element={<LegacyOperationalPage><EvidencePage /></LegacyOperationalPage>} />
              <Route path="/payments" element={<LegacyOperationalPage><PaymentTrackerPage /></LegacyOperationalPage>} />
              <Route path="/findings" element={<LegacyOperationalPage><FindingsPage /></LegacyOperationalPage>} />
              <Route path="/tasks" element={<LegacyOperationalPage><TasksPage /></LegacyOperationalPage>} />
              <Route path="/daily-ops" element={<OperationalShellPage><DailyOpsPage /></OperationalShellPage>} />
              <Route path="/activity" element={<LegacyOperationalPage><ActivityTrackerPage /></LegacyOperationalPage>} />
              <Route path="/crm" element={<LegacyOperationalPage><CrmPage /></LegacyOperationalPage>} />
              <Route path="/escalations" element={<LegacyOperationalPage><EscalationsPage /></LegacyOperationalPage>} />
              <Route path="/analytics" element={<LegacyOperationalPage><AnalyticsPage /></LegacyOperationalPage>} />

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
