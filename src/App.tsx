import { IonApp } from '@ionic/react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import AppShell from './layout/AppShell';
import DashboardPage from './pages/DashboardPage';
import EvidencePage from './pages/EvidencePage';

export default function App() {
  return (
    <IonApp>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/evidence" element={<EvidencePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </IonApp>
  );
}
