import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import { DocumentFieldReview } from '../features/uc03/DocumentFieldReview';
import {
  assessBookingDocument,
  captureBookingValue,
  concludeBooking,
  createBookingFlag,
  decideExtractionProposal,
  getBookingEvidenceFacts,
  getBookingProcessingStatus,
  getBookingWorkspace,
  refreshBookingExtraction,
  startBooking,
  uploadBookingDocument,
  type BookingDocumentView,
  type ExtractionProposalView,
} from '../services/audit-core/uc03Booking';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import { displayName, valueToCode } from '../utils/displayNames';

const CAPTURE_FIELDS = [
  ['CUSTOMER_NAME', 'Customer Name'],
  ['CUSTOMER_NUMBER', 'Customer Number'],
  ['CUSTOMER_EMAIL', 'Email ID'],
  ['CUSTOMER_TYPE', 'Customer Type'],
  ['BOOKING_REFERENCE', 'Booking Reference'],
  ['BOOKING_DATE', 'Booking Date'],
  ['DEAL_TYPE', 'Deal Type'],
  ['DEAL_SOURCE', 'Deal Source'],
  ['LEAD_SOURCE', 'Lead Source'],
  ['REGISTRATION_STATE', 'Registration State'],
  ['TERRITORY_CATEGORIZATION', 'Territory Categorization'],
  ['DISTRICT_NAME', 'District Name'],
  ['REGISTRATION_TYPE', 'Registration Type'],
  ['REGISTRATION_CATEGORY', 'Registration Category'],
] as const;

const HUMAN_FLAG_CATEGORIES = [
  'PHYSICAL_OBSERVATION',
  'DOCUMENT_EXCEPTION',
  'PAYMENT_EXCEPTION',
  'CUSTOMER_IDENTITY_CONCERN',
  'COMMERCIAL_EXCEPTION',
  'PROCESS_NON_COMPLIANCE',
  'OTHER',
];

const CONCLUSION_OPTIONS = [
  ['close-ready', 'Booking Complete — Proceed to Delivery'],
  ['close-no-delivery', 'Close — No Delivery'],
  ['cancel', 'Cancel Booking'],
  ['mark-duplicate', 'Mark Duplicate Booking'],
] as const;

const CLOSE_REASON_SUGGESTIONS = [
  'Finance Not Approved',
  'Vehicle Unavailable',
  'Customer Shifted Dealer',
  'Other',
];

const CANCEL_REASON_SUGGESTIONS = [
  'Customer Cancelled',
  'Dealer Cancelled',
];

const PROCESSING_STATES = new Set(['PENDING', 'PROCESSING', 'RECEIVED', 'QUEUED', 'DI_ACCEPTED', 'DI_SUBMITTING']);

type ConclusionAction = (typeof CONCLUSION_OPTIONS)[number][0];

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function confidenceLabel(value?: number | null): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const percent = value <= 1 ? value * 100 : value;
  return `${Math.round(percent)}% Confidence`;
}

function DocumentCard({
  document,
  busy,
  tenantId,
  journeyId,
  accessToken,
  onUpload,
  onAssess,
}: {
  document: BookingDocumentView;
  busy: boolean;
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  onUpload: (document: BookingDocumentView, files: File[]) => Promise<void>;
  onAssess: (document: BookingDocumentView, answer: 'YES' | 'NO' | 'NA') => Promise<void>;
}) {
  const documentName = displayName(document.documentTypeKey || document.requirementKey, 'Document');
  const processingState = document.processingStatus?.toUpperCase() || '';
  const processingActive = Boolean(document.evidenceId && PROCESSING_STATES.has(processingState));
  const factsQuery = useQuery({
    queryKey: [
      'uc03-booking-evidence-facts',
      tenantId,
      journeyId,
      document.evidenceId,
      document.updatedAtUtc,
    ],
    queryFn: () => getBookingEvidenceFacts(tenantId, journeyId, document.evidenceId!, accessToken),
    enabled: Boolean(document.evidenceId && accessToken),
    retry: 1,
    staleTime: 10_000,
    refetchInterval: processingActive ? 4_000 : false,
  });

  const hidden = document.applicabilityState === 'NOT_APPLICABLE' && document.answer === 'NA';
  if (hidden) return null;

  const canUpload = document.applicabilityState === 'APPLICABLE';
  const facts = factsQuery.data ?? [];

  return (
    <article className="uc03-c1-card uc03-c1-document-card">
      <header>
        <div>
          <span className="uc03-c1-eyebrow">{displayName(document.requirementLevel)}</span>
          <h3 className="uc03-c1-document-name">{documentName}</h3>
        </div>
        <div className="uc03-c1-status-stack">
          <StatusPill value={document.requirementStatus} compact />
          {document.processingStatus && <StatusPill value={document.processingStatus} compact />}
        </div>
      </header>

      {document.applicabilityState === 'UNRESOLVED' && (
        <div className="uc03-c1-notice">Applicability will update when the related Booking details are captured.</div>
      )}
      {document.applicabilityReason && <p className="uc03-c1-muted">{displayName(document.applicabilityReason, document.applicabilityReason)}</p>}

      <div className="uc03-c1-document-actions">
        <label className={`uc03-c1-file-button ${!canUpload || busy ? 'is-disabled' : ''}`}>
          <span>{document.evidenceId ? 'Add / Replace Files' : 'Upload Files'}</span>
          <input
            type="file"
            accept="image/*,.pdf"
            multiple
            disabled={!canUpload || busy}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) void onUpload(document, files);
              event.currentTarget.value = '';
            }}
          />
        </label>
        <span className="uc03-c1-upload-hint">Select one or more images or PDFs.</span>
        {document.evidenceId && <span className="uc03-c1-evidence-ok">Evidence Linked</span>}
      </div>

      <section className="uc03-c1-extraction-panel" aria-label={`Extracted fields from ${documentName}`}>
        <div className="uc03-c1-extraction-heading">
          <h4>Extracted Fields</h4>
          <span>
            {facts.length > 0
              ? `${facts.length} ${facts.length === 1 ? 'Field' : 'Fields'} Found`
              : document.evidenceId
                ? processingActive ? 'Document Intelligence Processing' : 'No Fields Yet'
                : 'Waiting for Document'}
          </span>
        </div>

        {!document.evidenceId && (
          <div className="uc03-c1-extraction-empty">Upload the document and its extracted fields will appear here automatically.</div>
        )}

        {document.evidenceId && factsQuery.isPending && (
          <div className="uc03-c1-extraction-empty">Loading extracted fields…</div>
        )}

        {document.evidenceId && factsQuery.isError && (
          <div className="uc03-c1-extraction-empty">Extracted fields could not be loaded. They will be retried when the document status refreshes.</div>
        )}

        {facts.length > 0 && (
          <div className="uc03-c1-extracted-grid">
            {facts.map((fact) => {
              const confidence = confidenceLabel(fact.confidenceScore);
              const value = displayValue(fact.normalizedValue ?? fact.value) || 'Not Found';
              const meta = [confidence, fact.verificationStatus ? displayName(fact.verificationStatus) : null]
                .filter(Boolean)
                .join(' · ');
              return (
                <div className="uc03-c1-extracted-field" key={fact.evidenceFactId}>
                  <span>{displayName(fact.fieldKey)}</span>
                  <strong>{value}</strong>
                  {meta && <small>{meta}</small>}
                </div>
              );
            })}
          </div>
        )}

        {document.evidenceId && !factsQuery.isPending && !factsQuery.isError && facts.length === 0 && (
          <div className="uc03-c1-extraction-empty">
            {processingActive
              ? 'Document Intelligence is reading this document. Fields will appear here as soon as processing completes.'
              : 'No extracted fields are available for this document yet.'}
          </div>
        )}
      </section>

      <div className="uc03-c1-answer-row" role="group" aria-label={`Assessment for ${documentName}`}>
        {(['YES', 'NO'] as const).map((answer) => (
          <button
            type="button"
            key={answer}
            className={document.answer === answer ? 'is-active' : ''}
            disabled={busy || document.applicabilityState !== 'APPLICABLE'}
            onClick={() => void onAssess(document, answer)}
          >
            {answer === 'YES' ? 'Yes — Available' : 'No — Missing / Mismatch'}
          </button>
        ))}
        {document.applicabilityState === 'NOT_APPLICABLE' && (
          <button
            type="button"
            className={document.answer === 'NA' ? 'is-active' : ''}
            disabled={busy}
            onClick={() => void onAssess(document, 'NA')}
          >
            Not Applicable
          </button>
        )}
      </div>
    </article>
  );
}

export default function BookingWorkspacePage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const navigate = useNavigate();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [captureValues, setCaptureValues] = useState<Record<string, string>>({});
  const [flagCategory, setFlagCategory] = useState('PHYSICAL_OBSERVATION');
  const [flagSeverity, setFlagSeverity] = useState('MEDIUM');
  const [flagSummary, setFlagSummary] = useState('');
  const [flagRemarks, setFlagRemarks] = useState('');
  const [conclusion, setConclusion] = useState<ConclusionAction>('close-ready');
  const [reasonName, setReasonName] = useState('');
  const [conclusionRemarks, setConclusionRemarks] = useState('');

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
  const workspaceQuery = useQuery({
    queryKey: ['uc03-booking-workspace', project?.tenantId, journeyId],
    queryFn: () => getBookingWorkspace(project!.tenantId, journeyId!, accessToken),
    enabled,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const processingQuery = useQuery({
    queryKey: ['uc03-booking-processing', project?.tenantId, journeyId],
    queryFn: () => getBookingProcessingStatus(project!.tenantId, journeyId!, accessToken),
    enabled: enabled && Boolean(workspaceQuery.data?.bookingStage.businessStatus),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const refreshWorkspace = useCallback(async () => {
    if (!project?.tenantId || !journeyId || !accessToken) return;
    await workspaceQuery.refetch();
  }, [accessToken, journeyId, project?.tenantId, workspaceQuery.refetch]);

  const refreshProcessingWorkspace = useCallback(async () => {
    if (!project?.tenantId || !journeyId || !accessToken) return;
    const pending = workspaceQuery.data?.processingSummary?.pendingCount ?? 0;
    if (pending > 0) {
      await refreshBookingExtraction(project.tenantId, journeyId, accessToken).catch(() => undefined);
    }
    await workspaceQuery.refetch();
  }, [
    accessToken,
    journeyId,
    project?.tenantId,
    workspaceQuery.data?.processingSummary?.pendingCount,
    workspaceQuery.refetch,
  ]);

  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState === 'visible') void refreshProcessingWorkspace();
    };
    const onOnline = () => void refreshProcessingWorkspace();
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('online', onOnline);
    };
  }, [refreshProcessingWorkspace]);

  useEffect(() => {
    const pending = workspaceQuery.data?.processingSummary?.pendingCount ?? 0;
    if (pending <= 0 || !project?.tenantId || !journeyId || !accessToken) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void refreshBookingExtraction(project.tenantId, journeyId, accessToken)
        .then(() => workspaceQuery.refetch())
        .catch(() => undefined);
    }, 4_000);
    return () => window.clearInterval(id);
  }, [
    accessToken,
    journeyId,
    project?.tenantId,
    workspaceQuery.data?.processingSummary?.pendingCount,
    workspaceQuery.refetch,
  ]);

  useEffect(() => {
    const capture = workspaceQuery.data?.capture;
    if (!capture) return;
    setCaptureValues((current) => {
      const next = { ...current };
      CAPTURE_FIELDS.forEach(([key]) => {
        if (next[key] === undefined) next[key] = displayValue(capture[key]);
      });
      return next;
    });
  }, [workspaceQuery.data?.capture]);

  if (!project || !journeyId) return null;
  const workspace = workspaceQuery.data;

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await operation();
      setMessage(success);
      await refreshWorkspace();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Booking action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const handleStart = () => run(
    () => startBooking(project.tenantId, journeyId, workspace?.aggregateVersion ?? 0, accessToken),
    'Booking Started.',
  );

  const handleCapture = (fieldKey: string) => run(
    () => captureBookingValue(
      project.tenantId,
      journeyId,
      fieldKey,
      captureValues[fieldKey] ?? '',
      workspace!.aggregateVersion,
      accessToken,
    ),
    `${displayName(fieldKey)} Saved.`,
  );

  const handleExchange = (value: boolean) => run(
    () => captureBookingValue(
      project.tenantId,
      journeyId,
      'EXCHANGE_TAKEN',
      value,
      workspace!.aggregateVersion,
      accessToken,
    ),
    'Exchange Applicability Updated.',
  );

  const handleUpload = async (documentView: BookingDocumentView, files: File[]) => {
    const documentName = displayName(documentView.documentTypeKey || documentView.requirementKey, 'Document');
    await run(async () => {
      for (const file of files) {
        await uploadBookingDocument(
          project.tenantId,
          journeyId,
          documentView.requirementKey,
          file,
          accessToken,
        );
      }
      await refreshBookingExtraction(project.tenantId, journeyId, accessToken).catch(() => undefined);
    }, `${documentName}: ${files.length} ${files.length === 1 ? 'File' : 'Files'} Uploaded. Processing Continues in the Background.`);
  };

  const handleAssess = async (
    documentView: BookingDocumentView,
    answer: 'YES' | 'NO' | 'NA',
  ) => run(
    () => assessBookingDocument(
      project.tenantId,
      journeyId,
      documentView.requirementKey,
      answer,
      workspace!.aggregateVersion,
      accessToken,
      documentView.evidenceId,
    ),
    `${displayName(documentView.documentTypeKey || documentView.requirementKey)} Assessment Saved.`,
  );

  const handleProposal = (
    proposal: ExtractionProposalView,
    mode: 'accept' | 'correct',
    correctedValue?: string,
  ) => run(
    () => decideExtractionProposal(
      project.tenantId,
      journeyId,
      proposal.proposalId,
      mode,
      workspace!.aggregateVersion,
      accessToken,
      correctedValue,
    ),
    mode === 'accept'
      ? 'Extracted Value Confirmed.'
      : 'Correction Saved with the Original Extracted Value Retained.',
  );

  const handleFlag = () => run(
    () => createBookingFlag(
      project.tenantId,
      journeyId,
      workspace!.aggregateVersion,
      {
        category: flagCategory,
        severity: flagSeverity,
        summary: flagSummary,
        remarks: flagRemarks || undefined,
      },
      accessToken,
    ),
    'Audit Flag Raised. It Does Not Stop Business Progression Unless Policy Explicitly Marks It Blocking.',
  ).then(() => {
    setFlagSummary('');
    setFlagRemarks('');
  });

  const handleConclusion = () => run(
    () => concludeBooking(
      project.tenantId,
      journeyId,
      conclusion,
      workspace!.aggregateVersion,
      accessToken,
      reasonName.trim() ? valueToCode(reasonName) : undefined,
      conclusionRemarks || undefined,
    ),
    'Booking Conclusion Recorded.',
  );

  if (workspaceQuery.isPending) {
    return <div className="uc03-c1-loading" role="status">Loading Booking Workspace…</div>;
  }
  if (workspaceQuery.isError || !workspace) {
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy">
          <strong>We couldn't open this Booking.</strong>
          <p>{workspaceQuery.error instanceof Error ? workspaceQuery.error.message : 'Please try again.'}</p>
        </div>
        <button type="button" className="user-menu-button" onClick={() => workspaceQuery.refetch()}>Try Again</button>
      </section>
    );
  }

  const started = Boolean(workspace.bookingStage.businessStatus);
  const active = workspace.permittedActions.includes('CAPTURE');
  const processing = workspace.processingSummary ?? processingQuery.data;
  const failedCount = processing?.failedCount ?? 0;
  const pendingCount = processing?.pendingCount ?? 0;
  const reasonSuggestions = conclusion === 'cancel' ? CANCEL_REASON_SUGGESTIONS : CLOSE_REASON_SUGGESTIONS;

  return (
    <div className="screen-stack uc03-c1-workspace">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button>
        <span>Project · {project.projectName}</span>
      </div>

      <PageHeader
        eyebrow={`Booking Audit · ${displayName(workspace.operatingRole)}`}
        title={(workspace.capture.BOOKING_REFERENCE as string) || 'Booking Reference Pending'}
        description="Upload evidence, continue PC capture while documents process, review extracted values against their source, and conclude the Booking when the checkpoint is ready."
      />

      <section className="uc03-c1-stage-strip" aria-label="Booking Stage Status">
        <div><span>Business Status</span><strong>{displayName(workspace.bookingStage.businessStatus)}</strong></div>
        <div><span>Audit State</span><StatusPill value={workspace.bookingStage.auditState} /></div>
        <div><span>Audit Status</span><StatusPill value={workspace.bookingStage.auditStatus} /></div>
        <div><span>Open Flags</span><strong>{workspace.flagSummary?.openCount ?? workspace.flags.length}</strong></div>
      </section>

      {message && <div className="uc03-c1-feedback is-success" role="status">{message}</div>}
      {error && <div className="uc03-c1-feedback is-error" role="alert">{error}</div>}

      {!started && (
        <section className="uc03-c1-start-panel">
          <div>
            <span className="uc03-c1-eyebrow">Booking Journey</span>
            <h2>Start Booking Audit</h2>
            <p>Starting creates the Booking workflow event and loads the versioned document checklist for this case.</p>
          </div>
          <button type="button" className="uc03-c1-primary" disabled={busy} onClick={() => void handleStart()}>
            Start Booking
          </button>
        </section>
      )}

      {started && (
        <>
          <section className="uc03-c1-section">
            <header className="uc03-c1-section-heading">
              <div>
                <span className="uc03-c1-eyebrow">1 · Evidence First</span>
                <h2>Booking Documents</h2>
                <p>Upload applicable evidence first. You can select multiple files for the same document, and each file processes independently while you continue the Booking.</p>
              </div>
              <div className="uc03-c1-processing-summary">
                <strong>{pendingCount}</strong><span>Processing</span>
                <strong>{processing?.readyProposalCount ?? 0}</strong><span>Proposals</span>
                <strong>{failedCount}</strong><span>Need Attention</span>
              </div>
            </header>

            {failedCount > 0 && (
              <div className="uc03-c1-feedback is-error">
                {processingQuery.data?.userMessage || 'One or more documents need attention. Retry processing or upload a clearer document.'}
              </div>
            )}

            <div className="uc03-c1-document-grid">
              {workspace.documents.map((documentView) => (
                <DocumentCard
                  key={documentView.requirementKey}
                  document={documentView}
                  busy={busy}
                  tenantId={project.tenantId}
                  journeyId={journeyId}
                  accessToken={accessToken}
                  onUpload={handleUpload}
                  onAssess={handleAssess}
                />
              ))}
              {workspace.documents.length === 0 && (
                <div className="uc03-c1-empty">No Booking document requirements are configured for this case.</div>
              )}
            </div>
          </section>

          <section className="uc03-c1-section">
            <header className="uc03-c1-section-heading">
              <div>
                <span className="uc03-c1-eyebrow">2 · Work in Parallel</span>
                <h2>Booking Details</h2>
                <p>PC-entered fields save directly to their existing Audit Core business domains. The screen does not become the system of record.</p>
              </div>
            </header>
            <div className="uc03-c1-capture-grid">
              {CAPTURE_FIELDS.map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <div className="uc03-c1-inline-field">
                    <input
                      type={key === 'BOOKING_DATE' ? 'date' : 'text'}
                      value={captureValues[key] ?? ''}
                      disabled={!active || busy}
                      onChange={(event) => setCaptureValues((current) => ({ ...current, [key]: event.target.value }))}
                    />
                    <button type="button" disabled={!active || busy || !(captureValues[key] ?? '').trim()} onClick={() => void handleCapture(key)}>
                      Save
                    </button>
                  </div>
                </label>
              ))}
              <div className="uc03-c1-choice-field">
                <span>Exchange Taken?</span>
                <div>
                  <button
                    type="button"
                    className={workspace.capture.EXCHANGE_TAKEN === true ? 'is-active' : ''}
                    disabled={!active || busy}
                    onClick={() => void handleExchange(true)}
                  >Yes</button>
                  <button
                    type="button"
                    className={workspace.capture.EXCHANGE_TAKEN === false ? 'is-active' : ''}
                    disabled={!active || busy}
                    onClick={() => void handleExchange(false)}
                  >No</button>
                </div>
              </div>
            </div>
          </section>

          <section className="uc03-c1-section">
            <header className="uc03-c1-section-heading">
              <div>
                <span className="uc03-c1-eyebrow">3 · Review Extraction</span>
                <h2>Review Extracted Values</h2>
                <p>Extracted fields are shown with their document above. This detailed review opens the source when a value needs confirmation or correction.</p>
              </div>
            </header>
            <DocumentFieldReview
              tenantId={project.tenantId}
              journeyId={journeyId}
              accessToken={accessToken}
              proposals={workspace.proposals}
              disabled={busy || !active}
              onAccept={(proposal) => handleProposal(proposal, 'accept')}
              onCorrect={(proposal, value) => handleProposal(proposal, 'correct', value)}
            />
          </section>

          <section className="uc03-c1-section uc03-c1-flags-section">
            <header className="uc03-c1-section-heading">
              <div>
                <span className="uc03-c1-eyebrow">4 · Audit Flags</span>
                <h2>Observations &amp; Flags</h2>
                <p>Flags are audit findings, not a substitute business status. Ordinary flags remain visible without blocking progression.</p>
              </div>
            </header>
            <div className="uc03-c1-flag-layout">
              <div className="uc03-c1-flag-list">
                {workspace.flags.map((flag) => (
                  <article key={flag.flagId} className="uc03-c1-card uc03-c1-flag-card">
                    <header><strong>{flag.title}</strong><StatusPill value={flag.severity} compact /></header>
                    <p>{flag.description || displayName(flag.category)}</p>
                    <footer><StatusPill value={flag.status} compact /><span>{displayName(flag.originKind)}</span></footer>
                  </article>
                ))}
                {workspace.flags.length === 0 && <div className="uc03-c1-empty">No Booking Flags.</div>}
              </div>
              {active && (
                <form className="uc03-c1-flag-form" onSubmit={(event) => { event.preventDefault(); if (flagSummary.trim()) void handleFlag(); }}>
                  <h3>Raise a PC Flag</h3>
                  <label><span>Category</span><select value={flagCategory} onChange={(event) => setFlagCategory(event.target.value)}>{HUMAN_FLAG_CATEGORIES.map((value) => <option key={value} value={value}>{displayName(value)}</option>)}</select></label>
                  <label><span>Severity</span><select value={flagSeverity} onChange={(event) => setFlagSeverity(event.target.value)}>{['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value} value={value}>{displayName(value)}</option>)}</select></label>
                  <label><span>Summary</span><input value={flagSummary} maxLength={500} onChange={(event) => setFlagSummary(event.target.value)} required /></label>
                  <label><span>Remarks</span><textarea value={flagRemarks} maxLength={4000} onChange={(event) => setFlagRemarks(event.target.value)} /></label>
                  <button type="submit" className="uc03-c1-secondary" disabled={busy || !flagSummary.trim()}>Raise Flag</button>
                </form>
              )}
            </div>
          </section>

          <section className="uc03-c1-section uc03-c1-checkpoint-section">
            <header className="uc03-c1-section-heading">
              <div>
                <span className="uc03-c1-eyebrow">5 · Booking Checkpoint</span>
                <h2>{workspace.completion.ready ? 'Ready to Conclude' : 'Outstanding Audit Work'}</h2>
                <p>Only configured completion guards stop normal Booking closure. Open non-blocking flags remain visible.</p>
              </div>
              <StatusPill value={workspace.completion.ready ? 'READY' : 'INCOMPLETE'} />
            </header>
            {workspace.completion.blockers.length > 0 && (
              <ul className="uc03-c1-blockers">
                {workspace.completion.blockers.map((blocker) => <li key={`${blocker.code}-${blocker.label}`}>{blocker.label}</li>)}
              </ul>
            )}

            {active && (
              <div className="uc03-c1-conclusion">
                <label>
                  <span>Conclusion</span>
                  <select
                    value={conclusion}
                    onChange={(event) => {
                      setConclusion(event.target.value as ConclusionAction);
                      setReasonName('');
                    }}
                  >
                    {CONCLUSION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                {(conclusion === 'close-no-delivery' || conclusion === 'cancel') && (
                  <label>
                    <span>Reason</span>
                    <input
                      list="uc03-booking-reasons"
                      value={reasonName}
                      onChange={(event) => setReasonName(event.target.value)}
                      placeholder={conclusion === 'cancel' ? 'Customer Cancelled' : 'Finance Not Approved'}
                    />
                    <datalist id="uc03-booking-reasons">
                      {reasonSuggestions.map((reason) => <option key={reason} value={reason} />)}
                    </datalist>
                  </label>
                )}
                <label><span>Remarks</span><textarea value={conclusionRemarks} onChange={(event) => setConclusionRemarks(event.target.value)} /></label>
                <button
                  type="button"
                  className="uc03-c1-primary"
                  disabled={busy || (conclusion === 'close-ready' && !workspace.completion.ready) || ((conclusion === 'close-no-delivery' || conclusion === 'cancel') && !reasonName.trim())}
                  onClick={() => void handleConclusion()}
                >Record Conclusion</button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
