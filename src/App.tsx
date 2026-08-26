import { lazy, Suspense, type ReactNode } from 'react';
import { IonApp } from '@ionic/react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { verigenceLockup } from './assets/verigenceLockup';
import ProjectContextGate from './components/ProjectContextGate';
import SessionRenewalGate from './components/SessionRenewalGate';
import ProjectAdminOutletLocationEnhancer from './features/project-admin/ProjectAdminOutletLocationEnhancer';
import ProjectMasterActionOverlay from './features/project-admin/ProjectMasterActionOverlay';
import AppShell from './layout/AppShell';
import AndroidNativeBridge from './native/AndroidNativeBridge';
import { useProjectContextStore } from './store/projectContextStore';
import { useSessionStore } from './store/sessionStore';

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
const DiTestConsolePage = lazy(() => import('./pages/DiTestConsolePage'));
const DocumentIntelligenceConfigurationPage = lazy(() => import('./pages/DocumentIntelligenceConfigurationPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const BookingWorkspacePage = lazy(() => import('./pages/BookingWorkspacePage'));
const DeliveryWorkspacePage = lazy(() => import('./pages/DeliveryWorkspacePage'));
const AuditReviewPage = lazy(() => import('./pages/AuditReviewPage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const JourneysPage = lazy(() => import('./pages/JourneysPage'));
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
const ProjectAdministrationPage = lazy(() => import('./pages/ProjectAdministrationV2Page'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));

const routerBase = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '');

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
  if (role !== 'SUPER_ADMIN' && role !== 'TENANT_ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }
  return <PrivatePage>{children}</PrivatePage>;
}

function DashboardEntry() {
  const role = useSessionStore((state) => state.role);
  const selectedProject = useProjectContextStore((state) => state.selectedProject);

  if (role === 'SUPER_ADMIN' && !selectedProject) {
    return <PrivatePage><AdminLandingPage /></PrivatePage>;
  }
  return <OperationalPage><DashboardPage /></OperationalPage>;
}

function OperationalPage({ children }: { children: ReactNode }) {
  return (
    <Authenticated>
      <ProjectContextGate><AppShell>{children}</AppShell></ProjectContextGate>
    </Authenticated>
  );
}

function LegacyOperationalPage({ children }: { children: ReactNode }) {
  const role = useSessionStore((state) => state.role);
  const selectedProject = useProjectContextStore((state) => state.selectedProject);
  const adminPersona = role === 'SUPER_ADMIN' || role === 'TENANT_ADMIN';

  if (adminPersona && !selectedProject) return <PrivatePage>{children}</PrivatePage>;
  return (
    <Authenticated>
      <ProjectContextGate><Navigate to="/dashboard" replace /></ProjectContextGate>
    </Authenticated>
  );
}

function Loading() {
  return <div className="app-loading"><img src={verigenceLockup} alt="Verigence" /><span>Loading Verigence…</span></div>;
}

export default function App() {
  return (
    <IonApp>
      <BrowserRouter basename={routerBase}>
        <SessionRenewalGate />
        <AndroidNativeBridge />
        <ProjectAdminOutletLocationEnhancer />
        <ProjectMasterActionOverlay />
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/dashboard" element={<DashboardEntry />} />
            <Route path="/bookings/:journeyId" element={<OperationalPage><BookingWorkspacePage /></OperationalPage>} />
            <Route path="/deliveries/:journeyId" element={<OperationalPage><DeliveryWorkspacePage /></OperationalPage>} />
            <Route path="/audit/:journeyId" element={<OperationalPage><AuditReviewPage /></OperationalPage>} />
            <Route path="/customers" element={<LegacyOperationalPage><CustomersPage /></LegacyOperationalPage>} />
            <Route path="/journeys" element={<LegacyOperationalPage><JourneysPage /></LegacyOperationalPage>} />
            <Route path="/journeys/:journeyId" element={<LegacyOperationalPage><JourneyWorkspacePage /></LegacyOperationalPage>} />
            <Route path="/journeys/:journeyId/evidence/:evidenceId" element={<LegacyOperationalPage><EvidenceDetailPage /></LegacyOperationalPage>} />
            <Route path="/reviews" element={<LegacyOperationalPage><ReviewQueuePage /></LegacyOperationalPage>} />
            <Route path="/evidence" element={<LegacyOperationalPage><EvidencePage /></LegacyOperationalPage>} />
            <Route path="/payments" element={<LegacyOperationalPage><PaymentTrackerPage /></LegacyOperationalPage>} />
            <Route path="/findings" element={<LegacyOperationalPage><FindingsPage /></LegacyOperationalPage>} />
            <Route path="/tasks" element={<LegacyOperationalPage><TasksPage /></LegacyOperationalPage>} />
            <Route path="/daily-ops" element={<LegacyOperationalPage><DailyOpsPage /></LegacyOperationalPage>} />
            <Route path="/activity" element={<LegacyOperationalPage><ActivityTrackerPage /></LegacyOperationalPage>} />
            <Route path="/crm" element={<LegacyOperationalPage><CrmPage /></LegacyOperationalPage>} />
            <Route path="/escalations" element={<LegacyOperationalPage><EscalationsPage /></LegacyOperationalPage>} />
            <Route path="/analytics" element={<LegacyOperationalPage><AnalyticsPage /></LegacyOperationalPage>} />

            <Route path="/admin/engagements" element={<SuperAdminPage><AdminConfigurationPage section="engagements" /></SuperAdminPage>} />
            <Route path="/admin/document-intelligence" element={<SuperAdminPage><DocumentIntelligenceConfigurationPage /></SuperAdminPage>} />
            <Route path="/admin/housekeeping" element={<SuperAdminPage><AdminHousekeepingPage /></SuperAdminPage>} />
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
  );
}
