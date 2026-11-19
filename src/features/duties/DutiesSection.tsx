import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { DutiesMode } from '../../services/audit-core/duties';
import DutiesTeamPanel from './DutiesTeamPanel';
import DutyListPanel from './DutyListPanel';
import '../../styles/hr-attendance.css';
import '../../styles/duties.css';

/**
 * Daily duties for a Team Lead, PM, Executive or SuperAdmin: the team day by day, and the duty list
 * with the Project's switch (docs/DAILY_DUTIES_DESIGN_v1.0.md in Audit Core).
 *
 * With ``settingsLink`` (SuperAdmin) only the team is shown here: the duty list and its switch are
 * a setting of the Project and live in Project Administration, which the link opens.
 */
export default function DutiesSection({ mode, tenantId, accessToken, settingsLink }: {
  mode: DutiesMode; tenantId: string; accessToken?: string; settingsLink?: string;
}) {
  const [view, setView] = useState<'team' | 'list'>('team');
  if (settingsLink) {
    return (
      <div className="dty-stack">
        <p className="p2w-muted">The duty list and its switch are under <Link to={settingsLink}>Project Administration</Link>, Daily duties.</p>
        <DutiesTeamPanel mode={mode} tenantId={tenantId} accessToken={accessToken} />
      </div>
    );
  }
  return (
    <div className="dty-stack">
      <div className="dty-row__actions" role="tablist" aria-label="Daily duties">
        {([['team', 'Team'], ['list', 'Duty list and switch']] as const).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={view === key}
            className={`uc01-admin-button${view === key ? ' uc01-admin-button--primary' : ''}`} onClick={() => setView(key)}>{label}</button>
        ))}
      </div>
      {view === 'team'
        ? <DutiesTeamPanel mode={mode} tenantId={tenantId} accessToken={accessToken} />
        : <DutyListPanel mode={mode} tenantId={tenantId} accessToken={accessToken} />}
    </div>
  );
}
