import { useState } from 'react';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-missing-documents.css';

import PageHeader from '../components/PageHeader';
import MissingDocumentsPanel from '../features/uc03-p2/missing/MissingDocumentsPanel';
import { periodStart } from '../services/audit-core/uc03MissingDocuments';
import { istDate } from '../services/audit-core/uc03MyWork';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const PERIODS = [
  { days: 7, label: 'Last 7 days' },
  { days: 31, label: 'Last 31 days' },
];

/**
 * Missing documents of the journeys that have deliveries, day by day, just the
 * names (product owner 2026-11-02), for the Team Lead, PM and Executive across
 * the Project. A PC sees the same inside their Tracker (2026-11-03), not here.
 */
export default function P2MissingDocumentsPage() {
  const project = useProjectContextStore((s) => s.selectedProject);
  const accessToken = useSessionStore((s) => s.accessToken);
  const tenantId = project?.tenantId;
  const supervisor = ['TL', 'PM', 'EXECUTIVE'].includes(String(project?.operatingRole ?? ''));
  const [days, setDays] = useState(31);

  return (
    <div className="screen-stack p2-screen p2w p2md">
      <PageHeader
        eyebrow="DealGuard"
        title="Missing documents"
        description={supervisor
          ? 'Documents still missing on the journeys that have deliveries, by delivery day, across the Project.'
          : 'Documents still missing on the journeys of your outlets that have deliveries, by delivery day.'}
      />
      {!tenantId || !accessToken ? (
        <div className="p2w-alert p2w-alert--error" role="alert">Select a project to continue.</div>
      ) : (
        <>
          <div className="p2md-bar">
            <div className="p2w-segment" role="tablist" aria-label="Period">
              {PERIODS.map((p) => (
                <button key={p.days} type="button" role="tab" aria-selected={days === p.days}
                  className={days === p.days ? 'is-active' : undefined} onClick={() => setDays(p.days)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <MissingDocumentsPanel tenantId={tenantId} accessToken={accessToken} from={periodStart(days)}
            to={istDate()} supervisor={supervisor} />
        </>
      )}
    </div>
  );
}
