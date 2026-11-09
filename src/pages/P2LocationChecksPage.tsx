import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';

import { useState } from 'react';

import BackLink from '../components/BackLink';
import PageHeader from '../components/PageHeader';
import AccessLocationsSummary from '../features/dealguard-presence/AccessLocationsSummary';
import LocationAwayReport from '../features/dealguard-presence/LocationAwayReport';
import LocationChecksLog from '../features/dealguard-presence/LocationChecksLog';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const VIEWERS = new Set(['EXECUTIVE']);

/** DealGuard location checks of the Project's PCs, day by day (Executive only, product owner 2026-11-06; the server enforces it). */
export default function P2LocationChecksPage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const operatingRole = useProjectContextStore((s) => s.selectedProject?.operatingRole);
  const accessToken = useSessionStore((s) => s.accessToken);
  const [view, setView] = useState<'checks' | 'away' | 'sign-ins'>('checks');
  return (
    <div className="screen-stack p2-screen p2w">
      <BackLink fallbackTo="/dashboard" fallbackLabel="Overview" />
      <PageHeader
        eyebrow="DealGuard"
        title="Location checks"
        description="Where each PC was when DealGuard checked their location: at their outlet, away from it, or not clear. Checks only inform; nobody is stopped from working."
      />
      {!VIEWERS.has(String(operatingRole)) ? (
        <div className="p2w-alert p2w-alert--error" role="alert">Location checks are for Executives and SuperAdmin.</div>
      ) : tenantId ? (
        <>
          <div className="p2w-segment" role="tablist" aria-label="Location report">
            <button type="button" role="tab" aria-selected={view === 'checks'} className={view === 'checks' ? 'is-active' : ''} onClick={() => setView('checks')}>DealGuard checks</button>
            <button type="button" role="tab" aria-selected={view === 'away'} className={view === 'away' ? 'is-active' : ''} onClick={() => setView('away')}>Away more than 5 km</button>
            <button type="button" role="tab" aria-selected={view === 'sign-ins'} className={view === 'sign-ins' ? 'is-active' : ''} onClick={() => setView('sign-ins')}>Sign-in locations</button>
          </div>
          {view === 'checks' ? <LocationChecksLog mode="project" tenantId={tenantId} accessToken={accessToken} /> : null}
          {view === 'away' ? <LocationAwayReport mode="project" tenantId={tenantId} accessToken={accessToken} /> : null}
          {view === 'sign-ins' ? <AccessLocationsSummary mode="project" tenantId={tenantId} accessToken={accessToken} /> : null}
        </>
      ) : null}
    </div>
  );
}
