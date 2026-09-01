import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import { assetUrl } from '../services/assets';
import { loadEvidenceDetail } from '../services/webRepository';
import { useSessionStore } from '../store/sessionStore';

/** Statuses where extraction is still in progress — polling should continue. */
const POLLING_STATUSES = new Set(['pending_upload', 'uploaded', 'extracting']);

/** Maximum number of polls before giving up and showing a 'taking longer' message. */
const MAX_POLLS = 30;

function factValue(value: unknown): string {
  if (value === null || value === undefined) return '\u2014';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function EvidenceDetailPage() {
  const { journeyId = '', evidenceId = '' } = useParams();
  const accessToken = useSessionStore((s) => s.accessToken);
  const pollCount = useRef(0);

  const query = useQuery({
    queryKey: ['evidence-detail', journeyId, evidenceId],
    queryFn: () => {
      pollCount.current += 1;
      return loadEvidenceDetail(journeyId, evidenceId, { accessToken });
    },
    // Large payload — evict from cache sooner than the 5 min global default
    gcTime: 2 * 60_000,
    // Poll while the document is still being processed, up to MAX_POLLS
    refetchInterval: (q) => {
      const status = (q.state.data?.evidence?.processingStatus ?? '').toLowerCase();
      if (!POLLING_STATUSES.has(status)) return false;   // terminal — stop
      if (pollCount.current >= MAX_POLLS) return false;  // ceiling reached — stop
      return 900;
    },
    staleTime: 0, // always re-fetch on mount while polling
  });

  const data = query.data;
  const status = (data?.evidence?.processingStatus ?? '').toLowerCase();
  const isStillProcessing = POLLING_STATUSES.has(status) && pollCount.current >= MAX_POLLS;

  if (!data) return <div className="page-loading">Loading evidence detail\u2026</div>;

  return (
    <div className="screen-stack">
      <PageHeader
        eyebrow="Evidence detail"
        title={data.evidence.documentTypeKey || 'Evidence document'}
        description={`${data.evidence.evidencePurpose} \u00b7 ${data.evidence.filename || data.evidence.evidenceId}`}
        backing={data.backing}
        actions={<StatusPill value={data.evidence.verificationStatus || data.evidence.processingStatus} />}
      />
      {isStillProcessing && (
        <div className="form-alert">
          This document is taking longer than usual to process. It will update automatically when ready.
        </div>
      )}
      <div className="evidence-detail-grid">
        <SectionCard title="Document source" description="The original document remains authoritative; extracted facts below are a projection for audit review.">
          <div className="document-preview">
            <div className="document-preview__sheet">
              <img src={assetUrl('brand/svg/verigence-mark.svg')} alt="" />
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
                <span>{fact.confidenceScore == null ? '\u2014' : `${Math.round(fact.confidenceScore * 100)}%`}</span>
                <StatusPill value={fact.verificationStatus || 'NOT_VERIFIED'} compact />
              </div>
            ))}
            {data.facts.length === 0 && <p className="muted-copy">No extracted facts are available for this document yet.</p>}
          </div>
        </SectionCard>
      </div>
      <Link className="text-link" to={`/journeys/${journeyId}`}>\u2190 Back to journey</Link>
    </div>
  );
}
