import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import { loadEvidenceDetail } from '../services/webRepository';
import { useSessionStore } from '../store/sessionStore';

function factValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function EvidenceDetailPage() {
  const { journeyId = '', evidenceId = '' } = useParams();
  const accessToken = useSessionStore((s) => s.accessToken);
  const query = useQuery({
    queryKey: ['evidence-detail', journeyId, evidenceId],
    queryFn: () => loadEvidenceDetail(journeyId, evidenceId, { accessToken }),
  });
  const data = query.data;
  if (!data) return <div className="page-loading">Loading evidence detail…</div>;

  return (
    <div className="screen-stack">
      <PageHeader
        eyebrow="Evidence detail"
        title={data.evidence.documentTypeKey || 'Evidence document'}
        description={`${data.evidence.evidencePurpose} · ${data.evidence.filename || data.evidence.evidenceId}`}
        backing={data.backing}
        actions={<StatusPill value={data.evidence.verificationStatus || data.evidence.processingStatus} />}
      />
      <div className="evidence-detail-grid">
        <SectionCard title="Document source" description="The original document remains authoritative; extracted facts below are a projection for audit review.">
          <div className="document-preview">
            <div className="document-preview__sheet">
              <img src="/brand/svg/verigence-mark.svg" alt="" />
              <strong>{data.evidence.filename || data.evidence.documentTypeKey}</strong>
              <span>Document preview placeholder</span>
              <small>The production viewer will render the original secured evidence stream when the content endpoint is connected.</small>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Evidence facts" description="Extracted or normalized facts. Low-confidence / review-required facts stay visibly flagged.">
          <div className="fact-table">
            <div className="fact-table__head"><span>Field</span><span>Observed value</span><span>Confidence</span><span>Status</span></div>
            {data.facts.map((fact) => (
              <div className="fact-table__row" key={fact.evidenceFactId}>
                <span><strong>{fact.fieldKey}</strong><small>{fact.source || data.evidence.documentTypeKey}</small></span>
                <span>{factValue(fact.value)}</span>
                <span>{fact.confidenceScore == null ? '—' : `${Math.round(fact.confidenceScore * 100)}%`}</span>
                <StatusPill value={fact.verificationStatus || 'NOT_VERIFIED'} compact />
              </div>
            ))}
            {data.facts.length === 0 && <p className="muted-copy">No extracted facts are available for this document yet.</p>}
          </div>
        </SectionCard>
      </div>
      <Link className="text-link" to={`/journeys/${journeyId}`}>← Back to journey</Link>
    </div>
  );
}
