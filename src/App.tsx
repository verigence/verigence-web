import { lazy, Suspense, type ReactNode } from 'react';
import { IonApp } from '@ionic/react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import AppShell from './layout/AppShell';
import { runtimeConfig } from './services/runtime';
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
const DailyOpsPage = lazy(() => import('./pages/DailyOpsPage'));
const CrmPage = lazy(() => import('./pages/CrmPage'));
const EscalationsPage = lazy(() => import('./pages/EscalationsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const OrganizationAdminPage = lazy(() => import('./pages/OrganizationAdminPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));

function PrivatePage({ children }: { children: ReactNode }) {
  const signedIn = useSessionStore((state) => state.signedIn);
  if (!signedIn && runtimeConfig.mode === 'demo') return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
}

function Loading() {
  return <div className="app-loading"><img src="/brand/svg/verigence-mark.svg" alt="" /><span>Loading Verigence…</span></div>;
}

export default function App() {
  return (
    <IonApp>
      <BrowserRouter>
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
            <Route path="/findings" element={<PrivatePage><FindingsPage /></PrivatePage>} />
            <Route path="/tasks" element={<PrivatePage><TasksPage /></PrivatePage>} />
            <Route path="/daily-ops" element={<PrivatePage><DailyOpsPage /></PrivatePage>} />
            <Route path="/crm" element={<PrivatePage><CrmPage /></PrivatePage>} />
            <Route path="/escalations" element={<PrivatePage><EscalationsPage /></PrivatePage>} />
            <Route path="/analytics" element={<PrivatePage><AnalyticsPage /></PrivatePage>} />
            <Route path="/approvals" element={<PrivatePage><ApprovalQueuePage /></PrivatePage>} />
            <Route path="/admin/organization" element={<PrivatePage><OrganizationAdminPage /></PrivatePage>} />
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
