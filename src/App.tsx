import { IonApp } from '@ionic/react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import AppShell from './layout/AppShell';
import ApprovalQueuePage from './pages/ApprovalQueuePage';
import DashboardPage from './pages/DashboardPage';
import EvidencePage from './pages/EvidencePage';
import SignupPage from './pages/SignupPage';

export default function App() {
  return (
    <IonApp>
      <BrowserRouter>
        <Routes>
          <Route path="/signup" element={<SignupPage />} />
          <Route
            path="/workspace"
            element={
              <AppShell>
                <DashboardPage />
              </AppShell>
            }
          />
          <Route
            path="/approvals"
            element={
              <AppShell>
                <ApprovalQueuePage />
              </AppShell>
            }
          />
          <Route
            path="/evidence"
            element={
              <AppShell>
                <EvidencePage />
              </AppShell>
            }
          />
          <Route path="/" element={<Navigate to="/signup" replace />} />
          <Route path="*" element={<Navigate to="/signup" replace />} />
        </Routes>
      </BrowserRouter>
    </IonApp>
  );
}
