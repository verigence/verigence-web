import { lazy, Suspense, type ReactNode } from 'react';
import { IonApp } from '@ionic/react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import AppShell from './layout/AppShell';
import { assetUrl } from './services/assets';
import { useSessionStore } from './store/sessionStore';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const ApprovalQueuePage = lazy(() => import('./pages/ApprovalQueuePage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
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
const OrganizationAdminPage = lazy(() => import('./pages/OrganizationAdminPage'));
const TeamAssignmentsPage = lazy(() => import('./pages/TeamAssignmentsPage'));
const MasterDataPage = lazy(() => import('./pages/MasterDataPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));

const routerBase = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '');

function PrivatePage({ children }: { children: ReactNode }) {
  const signedIn = useSessionStore((state) => state.signedIn);
  if (!signedIn) return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
}

function Loading() {
  return <div className="app-loading"><img src={assetUrl('brand/svg/verigence-mark.svg')} alt="" /><span>Loading Verigence…</span></div>;
}

export default function App() {
  return (
    <IonApp>
      <BrowserRouter basename={routerBase}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/dashboard" element={<PrivatePage><DashboardPage /></PrivatePage>} />
            <Route path="/customers" element={<PrivatePage><CustomersPage /></PrivatePage>} />
            <Route path="/journeys" element={<PrivatePage><JourneysPage /></PrivatePage>} />
            <Route path="/journeys/:journeyId" element={<PrivatePage><JourneyWorkspacePage /></PrivatePage>} />
            <Route path="/journeys/:journeyId/evidence/:evidenceId" element={<PrivatePage><EvidenceDetailPage /></PrivatePage>} />
            <Route path="/reviews" element={<PrivatePage><ReviewQueuePage /></PrivatePage>} />
            <Route path="/evidence" element={<PrivatePage><EvidencePage /></PrivatePage>} />
            <Route path="/payments" element={<PrivatePage><PaymentTrackerPage /></PrivatePage>} />
            <Route path="/findings" element={<PrivatePage><FindingsPage /></PrivatePage>} />
            <Route path="/tasks" element={<PrivatePage><TasksPage /></PrivatePage>} />
            <Route path="/daily-ops" element={<PrivatePage><DailyOpsPage /></PrivatePage>} />
            <Route path="/activity" element={<PrivatePage><ActivityTrackerPage /></PrivatePage>} />
            <Route path="/crm" element={<PrivatePage><CrmPage /></PrivatePage>} />
            <Route path="/escalations" element={<PrivatePage><EscalationsPage /></PrivatePage>} />
            <Route path="/analytics" element={<PrivatePage><AnalyticsPage /></PrivatePage>} />
            <Route path="/approvals" element={<PrivatePage><ApprovalQueuePage /></PrivatePage>} />
            <Route path="/admin/organization" element={<PrivatePage><OrganizationAdminPage /></PrivatePage>} />
            <Route path="/admin/team" element={<PrivatePage><TeamAssignmentsPage /></PrivatePage>} />
            <Route path="/admin/masters" element={<PrivatePage><MasterDataPage /></PrivatePage>} />
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
