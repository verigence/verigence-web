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
  { key: 'review', label: 'Audit review' },
];

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not evidenced';
  if (typeof value === 'number') return new Intl.NumberFormat('en-IN').format(value);
  if (typeof value === 'object') return Array.isArray(value) ? `${value.length} records` : 'Structured record';
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
    mutationFn: async (action: 'start' | 'submit') => {
      if (runtimeConfig.mode === 'demo') return action;
      return action === 'start'
        ? startAudit(runtimeConfig.tenantId, journeyId, accessToken)
        : submitAudit(runtimeConfig.tenantId, journeyId, accessToken);
    },
    onSuccess: (_, action) => {
      setActionMessage(action === 'start' ? 'Audit started.' : 'Audit submitted for review.');
      void queryClient.invalidateQueries({ queryKey: ['journey-workspace', journeyId] });
    },
  });

  const reviewAction = useMutation({
    mutationFn: async (decision: 'BREACH' | 'NO_BREACH' | 'SEND_BACK') => {
      if (runtimeConfig.mode === 'demo') return decision;
      return createReviewDecision(runtimeConfig.tenantId, journeyId, {
        decision,
        reviewerRoleCode: role === 'PM' ? 'PM' : 'TL',
        remarks: reviewRemarks || undefined,
      }, accessToken);
    },
    onSuccess: (_, decision) => setActionMessage(`Review decision recorded: ${decision.replaceAll('_', ' ')}.`),
  });

  const stageData = useMemo(() => model?.stages[activeStage] || null, [model, activeStage]);

  if (query.isLoading) return <div className="page-loading">Loading journey workspace…</div>;
  if (!model) return <div className="page-error">Journey workspace could not be loaded.</div>;

  return (
    <div className="screen-stack">
      <PageHeader
        eyebrow={`${model.journey.outletName} · ${model.journey.journeyReference || 'Journey'}`}
        title={model.customer.displayName}
        description={`${model.journey.productLabel || 'Vehicle configuration pending'} · Booking ${model.journey.bookingReference || 'not evidenced'}`}
        backing={model.backing}
        actions={<div className="header-statuses"><StatusPill value={model.journey.auditState} /><StatusPill value={model.journey.auditOutcome} /></div>}
      />

      <div className="journey-summary-strip">
        <div><span>Evidence</span><strong>{model.evidence.length}</strong></div>
        <div><span>Findings</span><strong>{model.findings.length}</strong></div>
        <div><span>Observed status</span><strong>{model.journey.observedStatusCode?.replaceAll('_', ' ') || '—'}</strong></div>
        <div><span>Delivery</span><strong>{model.journey.actualDeliveryStatusCode?.replaceAll('_', ' ') || 'Not delivered'}</strong></div>
      </div>

      <EvidenceCapture journeyId={journeyId} onUploaded={() => void queryClient.invalidateQueries({ queryKey: ['journey-workspace', journeyId] })} />

      <div className="journey-workspace-grid">
        <aside className="journey-stage-nav">
          <span className="journey-stage-nav__label">Journey stages</span>
          {stages.map((stage, index) => {
            const populated = Boolean(model.stages[stage.key]);
            return (
              <button key={stage.key} type="button" className={`journey-stage-button${activeStage === stage.key ? ' journey-stage-button--active' : ''}`} onClick={() => setActiveStage(stage.key)}>
                <span className="journey-stage-button__index">{String(index + 1).padStart(2, '0')}</span>
                <span><strong>{stage.label}</strong><small>{populated ? 'Evidence / system facts available' : 'No record evidenced'}</small></span>
                <span className={`journey-stage-button__dot${populated ? ' journey-stage-button__dot--done' : ''}`} />
              </button>
            );
          })}
        </aside>

        <div className="journey-stage-content">
          <SectionCard
            title={stages.find((stage) => stage.key === activeStage)?.label}
            description={activeStage === 'review' ? 'Workflow decisions are recorded here. Observed facts remain sourced from evidence and system records.' : 'Read-only audit projection. These facts come from uploaded evidence or source systems; the audit user does not re-key them.'}
          >
            {activeStage !== 'review' && (
              <div className="fact-grid">
                {stageData ? Object.entries(stageData).filter(([key]) => key !== 'source').map(([key, value]) => (
                  <div className="fact-card" key={key}>
                    <span>{key.replace(/([A-Z])/g, ' $1').replaceAll('_', ' ')}</span>
                    <strong>{displayValue(value)}</strong>
                    <small>Observed fact</small>
                  </div>
                )) : <div className="no-evidence-panel"><strong>No source evidence for this stage yet.</strong><span>Upload the relevant document or screenshot instead of typing the missing facts.</span></div>}
              </div>
            )}

            {activeStage !== 'review' && stageData?.source && <div className="provenance-strip"><span>Source provenance</span><strong>{String(stageData.source).replaceAll('_', ' ')}</strong></div>}

            {activeStage === 'review' && (
              <div className="review-action-panel">
                <div className="review-state-card"><span>Current state</span><StatusPill value={model.journey.auditState} /><small>Outcome: {model.journey.auditOutcome.replaceAll('_', ' ')}</small></div>
                {role === 'PC' && (
                  <div className="review-action-group">
                    <strong>Process Consultant action</strong>
                    <p>Start the audit when evidence capture begins. Submit only when the evidence packet is ready for TL review.</p>
                    <div className="button-row"><VerigenceButton fill="outline" onClick={() => auditAction.mutate('start')}>Start audit</VerigenceButton><VerigenceButton onClick={() => auditAction.mutate('submit')}>Submit for review</VerigenceButton></div>
                  </div>
                )}
                {(role === 'TL' || role === 'PM' || role === 'TENANT_ADMIN' || role === 'SUPER_ADMIN') && (
                  <div className="review-action-group">
                    <strong>{role === 'PM' ? 'PM' : 'TL'} review decision</strong>
                    <textarea rows={4} value={reviewRemarks} onChange={(event) => setReviewRemarks(event.target.value)} placeholder="Decision remarks (new workflow information; source facts remain unchanged)" />
                    <div className="button-row button-row--wrap"><VerigenceButton fill="outline" onClick={() => reviewAction.mutate('SEND_BACK')}>Send back</VerigenceButton><VerigenceButton fill="outline" onClick={() => reviewAction.mutate('NO_BREACH')}>No breach</VerigenceButton><VerigenceButton onClick={() => reviewAction.mutate('BREACH')}>Record breach</VerigenceButton></div>
                  </div>
                )}
                {actionMessage && <div className="form-alert form-alert--success">{actionMessage}</div>}
              </div>
            )}
          </SectionCard>

          <div className="workspace-secondary-grid">
            <SectionCard title="Evidence packet" action={<Link className="text-link" to="/evidence">All evidence</Link>}>
              <div className="evidence-mini-list">
                {model.evidence.slice(0, 5).map((evidence) => (
                  <Link key={evidence.evidenceId} to={`/journeys/${journeyId}/evidence/${evidence.evidenceId}`} className="evidence-mini-row">
                    <span className="document-mark">DOC</span>
                    <span><strong>{evidence.documentTypeKey || 'Evidence'}</strong><small>{evidence.evidencePurpose}</small></span>
                    <StatusPill value={evidence.verificationStatus || evidence.processingStatus} compact />
                  </Link>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="Findings" action={<Link className="text-link" to="/findings">Register</Link>}>
              <div className="evidence-mini-list">
                {model.findings.map((finding) => (
                  <div key={finding.auditFindingId} className="evidence-mini-row evidence-mini-row--static">
                    <span className="document-mark document-mark--finding">!</span>
                    <span><strong>{finding.title}</strong><small>{finding.findingStatus.replaceAll('_', ' ')}</small></span>
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
