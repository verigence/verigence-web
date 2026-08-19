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
      <PageHeader eyebrow="Assurance" title="Findings register" description="Exceptions and audit findings with the expected/observed context preserved. Finding narratives are workflow information; underlying facts remain evidence-backed." backing={query.data?.backing} />
      <SectionCard>
        <div className="toolbar-row"><label className="filter-select"><span>Severity</span><select value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="ALL">All</option><option>CRITICAL</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></label><span className="toolbar-count">{items.length} findings</span></div>
        <div className="finding-list">
          {items.map((finding) => (
            <article className="finding-card" key={finding.auditFindingId}>
              <div className="finding-card__severity"><StatusPill value={finding.severity} compact /><StatusPill value={finding.findingStatus} compact /></div>
              <div><h3>{finding.title}</h3><p>{finding.description || 'No additional narrative.'}</p><div className="finding-card__comparison"><span><small>Expected</small>{finding.expectedSummary || '—'}</span><span><small>Observed</small>{finding.observedSummary || '—'}</span></div></div>
              <div className="finding-card__link"><span>{finding.journeyReference}</span><Link className="text-link" to={`/journeys/${finding.journeyId}`}>Open journey</Link></div>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
