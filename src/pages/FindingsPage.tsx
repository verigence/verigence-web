import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import { loadFindingsRegister } from '../services/webRepository';

export default function FindingsPage() {
  const [severity, setSeverity] = useState('ALL');
  const query = useQuery({ queryKey: ['findings-register'], queryFn: loadFindingsRegister });
  const items = useMemo(() => (query.data?.items || []).filter((item) => severity === 'ALL' || item.severity === severity), [query.data, severity]);

  return (
    <div className="screen-stack">
      <PageHeader eyebrow="Assurance" title="Findings Register" description="Review audit findings, compare expected and observed results, and open the related journey for more detail." />
      <SectionCard>
        <div className="toolbar-row"><label className="filter-select"><span>Severity</span><select value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="ALL">All</option><option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select></label><span className="toolbar-count">{items.length} findings</span></div>
        <div className="finding-list">
          {items.map((finding) => (
            <article className="finding-card" key={finding.auditFindingId}>
              <div className="finding-card__severity"><StatusPill value={finding.severity} compact /><StatusPill value={finding.findingStatus} compact /></div>
              <div><h3>{finding.title}</h3><p>{finding.description || 'No additional details.'}</p><div className="finding-card__comparison"><span><small>Expected</small>{finding.expectedSummary || '—'}</span><span><small>Observed</small>{finding.observedSummary || '—'}</span></div></div>
              <div className="finding-card__link"><span>{finding.journeyReference}</span><Link className="text-link" to={`/journeys/${finding.journeyId}`}>Open Journey</Link></div>
            </article>
          ))}
          {items.length === 0 && <div className="adaptive-list-empty">No findings match this filter.</div>}
        </div>
      </SectionCard>
    </div>
  );
}
