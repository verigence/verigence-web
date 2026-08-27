import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import EvidenceCapture from '../components/EvidenceCapture';
import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import StatusPill from '../components/StatusPill';
import type { JourneyStageKey } from '../domain/models';
import { runtimeConfig } from '../services/runtime';
import { loadJourneyWorkspace } from '../services/webRepository';
import { createReviewDecision, startAudit, submitAudit } from '../services/audit-core/operations';
import { useSessionStore } from '../store/sessionStore';
import VerigenceButton from '../components/VerigenceButton';

const stages: Array<{ key: JourneyStageKey; label: string }> = [
  { key: 'booking', label: 'Booking' },
  { key: 'commercials', label: 'Commercials' },
  { key: 'payment', label: 'Payment' },
  { key: 'finance', label: 'Finance' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'tradeIn', label: 'Trade-in' },
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'registration', label: 'Registration' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'review', label: 'Audit Review' },
];

const reviewDecisionLabels = {
  BREACH: 'Breach',
  NO_BREACH: 'No Breach',
  SEND_BACK: 'Sent Back',
} as const;

function readableCode(value?: string | null): string {
  if (!value) return '';
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function readableField(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not available';
  if (typeof value === 'number') return new Intl.NumberFormat('en-IN').format(value);
  if (typeof value === 'object') return Array.isArray(value) ? `${value.length} records` : 'Details available';
  return String(value).replaceAll('_', ' ');
}

export default function JourneyWorkspacePage() {
  const { journeyId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const role = useSessionStore((s) => s.role);
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [activeStage, setActiveStage] = useState<JourneyStageKey>(searchParams.get('review') ? 'review' : 'booking');
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const query = useQuery({
    queryKey: ['journey-workspace', journeyId],
    queryFn: () => loadJourneyWorkspace(journeyId, { accessToken }),
    enabled: Boolean(journeyId),
  });
  const model = query.data;

  const auditAction = useMutation({
    mutationFn: async (action: 'start' | 'submit') => action === 'start'
      ? startAudit(runtimeConfig.tenantId, journeyId, accessToken)
      : submitAudit(runtimeConfig.tenantId, journeyId, accessToken),
    onSuccess: (_, action) => {
      setActionMessage(action === 'start' ? 'Audit started successfully.' : 'Audit submitted for review successfully.');
      void queryClient.invalidateQueries({ queryKey: ['journey-workspace', journeyId] });
    },
  });

  const reviewAction = useMutation({
    mutationFn: async (decision: 'BREACH' | 'NO_BREACH' | 'SEND_BACK') => createReviewDecision(runtimeConfig.tenantId, journeyId, {
      decision,
      reviewerRoleCode: role === 'PM' ? 'PM' : 'TL',
      remarks: reviewRemarks || undefined,
    }, accessToken),
    onSuccess: (_, decision) => setActionMessage(`Review completed: ${reviewDecisionLabels[decision]}.`),
  });

  const stageData = useMemo(() => model?.stages[activeStage] || null, [model, activeStage]);
  const informationSource = stageData?.source;
  const activeStageLabel = stages.find((stage) => stage.key === activeStage)?.label || 'Journey Stage';

  if (query.isLoading) return <div className="page-loading">Loading journey…</div>;
  if (!model) return <div className="page-error">We couldn't load this journey. Please try again.</div>;

  return (
    <div className="screen-stack">
      <PageHeader
        eyebrow={`${model.journey.outletName} · ${model.journey.journeyReference || 'Journey'}`}
        title={model.customer.displayName}
        description={`${model.journey.productLabel || 'Vehicle details pending'} · Booking ${model.journey.bookingReference || 'not available'}`}
        actions={<div className="header-statuses"><StatusPill value={model.journey.auditState} /><StatusPill value={model.journey.auditOutcome} /></div>}
      />

      <div className="journey-summary-strip">
        <div><span>Evidence</span><strong>{model.evidence.length}</strong></div>
        <div><span>Findings</span><strong>{model.findings.length}</strong></div>
        <div><span>Current Status</span><strong>{readableCode(model.journey.observedStatusCode) || 'Not available'}</strong></div>
        <div><span>Delivery</span><strong>{readableCode(model.journey.actualDeliveryStatusCode) || 'Not delivered'}</strong></div>
      </div>

      <EvidenceCapture journeyId={journeyId} onUploaded={() => void queryClient.invalidateQueries({ queryKey: ['journey-workspace', journeyId] })} />

      <label className="journey-stage-mobile-picker">
        <span>Journey Stage</span>
        <select value={activeStage} onChange={(event) => setActiveStage(event.target.value as JourneyStageKey)}>
          {stages.map((stage, index) => (
            <option key={stage.key} value={stage.key}>{index + 1}. {stage.label}</option>
          ))}
        </select>
        <small>{activeStageLabel}</small>
      </label>

      <div className="journey-workspace-grid">
        <aside className="journey-stage-nav">
          <span className="journey-stage-nav__label">Journey Stages</span>
          {stages.map((stage, index) => {
            const populated = Boolean(model.stages[stage.key]);
            return (
              <button key={stage.key} type="button" className={`journey-stage-button${activeStage === stage.key ? ' journey-stage-button--active' : ''}`} onClick={() => setActiveStage(stage.key)}>
                <span className="journey-stage-button__index">{String(index + 1).padStart(2, '0')}</span>
                <span><strong>{stage.label}</strong><small>{populated ? 'Details available' : 'Not available yet'}</small></span>
                <span className={`journey-stage-button__dot${populated ? ' journey-stage-button__dot--done' : ''}`} />
              </button>
            );
          })}
        </aside>

        <div className="journey-stage-content">
          <SectionCard
            title={activeStageLabel}
            description={activeStage === 'review' ? 'Review the current audit status and record the required decision.' : 'Review the information captured from evidence and existing records for this stage.'}
          >
            {activeStage !== 'review' && (
              <div className="fact-grid">
                {stageData ? Object.entries(stageData).filter(([key]) => key !== 'source').map(([key, value]) => (
                  <div className="fact-card" key={key}>
                    <span>{readableField(key)}</span>
                    <strong>{displayValue(value)}</strong>
                    <small>Available information</small>
                  </div>
                )) : <div className="no-evidence-panel"><strong>No evidence is available for this stage yet.</strong><span>Add the relevant document or screenshot to continue.</span></div>}
              </div>
            )}

            {activeStage !== 'review' && informationSource != null && informationSource !== '' && <div className="provenance-strip"><span>Information Source</span><strong>{readableCode(String(informationSource))}</strong></div>}

            {activeStage === 'review' && (
              <div className="review-action-panel">
                <div className="review-state-card"><span>Current Status</span><StatusPill value={model.journey.auditState} /><small>Outcome: {readableCode(model.journey.auditOutcome)}</small></div>
                {role === 'PC' && (
                  <div className="review-action-group">
                    <strong>Process Consultant</strong>
                    <p>Start the audit when you begin reviewing the evidence. Submit it when the journey is ready for Team Lead review.</p>
                    <div className="button-row"><VerigenceButton fill="outline" onClick={() => auditAction.mutate('start')}>Start Audit</VerigenceButton><VerigenceButton onClick={() => auditAction.mutate('submit')}>Submit for Review</VerigenceButton></div>
                  </div>
                )}
                {(role === 'TL' || role === 'PM' || role === 'TENANT_ADMIN' || role === 'SUPER_ADMIN') && (
                  <div className="review-action-group">
                    <strong>{role === 'PM' ? 'Project Manager' : 'Team Lead'} Review</strong>
                    <textarea rows={4} value={reviewRemarks} onChange={(event) => setReviewRemarks(event.target.value)} placeholder="Add review remarks" />
                    <div className="button-row button-row--wrap"><VerigenceButton fill="outline" onClick={() => reviewAction.mutate('SEND_BACK')}>Send Back</VerigenceButton><VerigenceButton fill="outline" onClick={() => reviewAction.mutate('NO_BREACH')}>No Breach</VerigenceButton><VerigenceButton onClick={() => reviewAction.mutate('BREACH')}>Record Breach</VerigenceButton></div>
                  </div>
                )}
                {actionMessage && <div className="form-alert form-alert--success">{actionMessage}</div>}
              </div>
            )}
          </SectionCard>

          <div className="workspace-secondary-grid">
            <SectionCard title="Evidence" action={<Link className="text-link" to="/evidence">View All</Link>}>
              <div className="evidence-mini-list">
                {model.evidence.slice(0, 5).map((evidence) => (
                  <Link key={evidence.evidenceId} to={`/journeys/${journeyId}/evidence/${evidence.evidenceId}`} className="evidence-mini-row">
                    <span className="document-mark">DOC</span>
                    <span><strong>{readableCode(evidence.documentTypeKey) || 'Evidence'}</strong><small>{readableCode(evidence.evidencePurpose) || 'Supporting evidence'}</small></span>
                    <StatusPill value={evidence.verificationStatus || evidence.processingStatus} compact />
                  </Link>
                ))}
                {model.evidence.length === 0 && <p className="muted-copy">No evidence has been added to this journey yet.</p>}
              </div>
            </SectionCard>
            <SectionCard title="Findings" action={<Link className="text-link" to="/findings">View All</Link>}>
              <div className="evidence-mini-list">
                {model.findings.map((finding) => (
                  <div key={finding.auditFindingId} className="evidence-mini-row evidence-mini-row--static">
                    <span className="document-mark document-mark--finding">!</span>
                    <span><strong>{finding.title}</strong><small>{readableCode(finding.findingStatus)}</small></span>
                    <StatusPill value={finding.severity} compact />
                  </div>
                ))}
                {model.findings.length === 0 && <p className="muted-copy">No findings recorded for this journey.</p>}
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
