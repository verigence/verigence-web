import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import {
  assessBookingDocument,
  captureBookingValue,
  concludeBooking,
  createBookingFlag,
  decideExtractionProposal,
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

const CAPTURE_FIELDS = [
  ['CUSTOMER_NAME', 'Customer name'],
  ['CUSTOMER_NUMBER', 'Customer number'],
  ['CUSTOMER_EMAIL', 'Email ID'],
  ['CUSTOMER_TYPE', 'Type of customer'],
  ['BOOKING_REFERENCE', 'Booking reference'],
  ['BOOKING_DATE', 'Booking date'],
  ['DEAL_TYPE', 'Type of deal'],
  ['DEAL_SOURCE', 'Deal source'],
  ['LEAD_SOURCE', 'Lead generated through'],
  ['REGISTRATION_STATE', 'Registration state'],
  ['TERRITORY_CATEGORIZATION', 'Territory categorization'],
  ['DISTRICT_NAME', 'District name'],
  ['REGISTRATION_TYPE', 'Registration type'],
  ['REGISTRATION_CATEGORY', 'Registration category'],
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
  ['close-ready', 'Booking complete — proceed to Delivery'],
  ['close-no-delivery', 'Close — no Delivery'],
  ['cancel', 'Cancel Booking'],
  ['mark-duplicate', 'Mark duplicate Booking'],
] as const;

type ConclusionAction = (typeof CONCLUSION_OPTIONS)[number][0];

function friendly(value?: string | null): string {
  if (!value) return 'Not started';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return JSON.stringify(value);
}

function confidenceLabel(value: number | null): string {
  if (value === null) return 'Confidence unavailable';
  return `${Math.round(value * 100)}% confidence`;
}

function isCleanProposal(proposal: ExtractionProposalView): boolean {
  return proposal.status === 'PENDING' && proposal.canAccept && (proposal.confidence ?? 0) >= 0.85;
}

function DocumentCard({
  document,
  busy,
  onUpload,
  onAssess,
}: {
  document: BookingDocumentView;
  busy: boolean;
  onUpload: (document: BookingDocumentView, file: File) => Promise<void>;
  onAssess: (document: BookingDocumentView, answer: 'YES' | 'NO' | 'NA') => Promise<void>;
}) {
  const hidden = document.applicabilityState === 'NOT_APPLICABLE' && document.answer === 'NA';
  if (hidden) return null;

  const canUpload = document.applicabilityState === 'APPLICABLE';
  return (
    <article className="uc03-c1-card uc03-c1-document-card">
      <header>
        <div>
          <span className="uc03-c1-eyebrow">{document.requirementLevel}</span>
          <h3>{friendly(document.requirementKey)}</h3>
          <p>{friendly(document.documentTypeKey)}</p>
        </div>
        <div className="uc03-c1-status-stack">
          <StatusPill value={document.requirementStatus} compact />
          {document.processingStatus && <StatusPill value={document.processingStatus} compact />}
        </div>
      </header>

      {document.applicabilityState === 'UNRESOLVED' && (
        <div className="uc03-c1-notice">Applicability will update when the related Booking details are captured.</div>
      )}
      {document.applicabilityReason && <p className="uc03-c1-muted">{document.applicabilityReason}</p>}

      <div className="uc03-c1-document-actions">
        <label className={`uc03-c1-file-button ${!canUpload || busy ? 'is-disabled' : ''}`}>
          <span>{document.evidenceId ? 'Replace / add clearer document' : 'Upload document'}</span>
          <input
            type="file"
            accept="image/*,.pdf"
            disabled={!canUpload || busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onUpload(document, file);
              event.currentTarget.value = '';
            }}
          />
        </label>
        {document.evidenceId && <span className="uc03-c1-evidence-ok">Document linked</span>}
      </div>

      <div className="uc03-c1-answer-row" role="group" aria-label={`Assessment for ${document.requirementKey}`}>
        {(['YES', 'NO'] as const).map((answer) => (
          <button
            type="button"
            key={answer}
            className={document.answer === answer ? 'is-active' : ''}
            disabled={busy || document.applicabilityState !== 'APPLICABLE'}
            onClick={() => void onAssess(document, answer)}
          >
            {answer === 'YES' ? 'Yes — available' : 'No — missing / mismatch'}
          </button>
        ))}
        {document.applicabilityState === 'NOT_APPLICABLE' && (
          <button
            type="button"
            className={document.answer === 'NA' ? 'is-active' : ''}
            disabled={busy}
            onClick={() => void onAssess(document, 'NA')}
          >
            Not applicable
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
  const [proposalEdits, setProposalEdits] = useState<Record<string, string>>({});
  const [flagCategory, setFlagCategory] = useState('PHYSICAL_OBSERVATION');
  const [flagSeverity, setFlagSeverity] = useState('MEDIUM');
  const [flagSummary, setFlagSummary] = useState('');
  const [flagRemarks, setFlagRemarks] = useState('');
  const [conclusion, setConclusion] = useState<ConclusionAction>('close-ready');
  const [reasonCode, setReasonCode] = useState('');
  const [conclusionRemarks, setConclusionRemarks] = useState('');

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
  const workspaceQuery = useQuery({
    queryKey: ['uc03-booking-workspace', project?.tenantId, journeyId],
    queryFn: () => getBookingWorkspace(project!.tenantId, journeyId!, accessToken),
    enabled,
    refetchOnWindowFocus: false,
  });

  const processingQuery = useQuery({
    queryKey: ['uc03-booking-processing', project?.tenantId, journeyId],
    queryFn: () => getBookingProcessingStatus(project!.tenantId, journeyId!, accessToken),
    enabled: enabled && Boolean(workspaceQuery.data?.bookingStage.businessStatus),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && data.pendingCount > 0 ? 4_000 : false;
    },
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const refreshWorkspace = useCallback(async () => {
    if (!project?.tenantId || !journeyId || !accessToken) return;
    const current = workspaceQuery.data;
    if (current?.processingSummary?.pendingCount) {
      try {
        await refreshBookingExtraction(project.tenantId, journeyId, accessToken);
      } catch {
        // Processing failure is rendered from the safe server status on the next read.
      }
    }
    await Promise.all([workspaceQuery.refetch(), processingQuery.refetch()]);
  }, [accessToken, journeyId, processingQuery, project?.tenantId, workspaceQuery]);

  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState === 'visible') void refreshWorkspace();
    };
    const onOnline = () => void refreshWorkspace();
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onOnline);
    };
  }, [refreshWorkspace]);

  useEffect(() => {
    const pending = processingQuery.data?.pendingCount ?? 0;
    if (pending <= 0 || !project?.tenantId || !journeyId || !accessToken) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void refreshBookingExtraction(project.tenantId, journeyId, accessToken)
        .then(() => workspaceQuery.refetch())
        .catch(() => undefined);
    }, 4_000);
    return () => window.clearInterval(id);
  }, [accessToken, journeyId, processingQuery.data?.pendingCount, project?.tenantId, workspaceQuery]);

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

  const cleanProposals = useMemo(
    () => workspaceQuery.data?.proposals.filter(isCleanProposal) ?? [],
    [workspaceQuery.data?.proposals],
  );

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
    'Booking started.',
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
    `${friendly(fieldKey)} saved.`,
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
    'Exchange applicability updated.',
  );

  const handleUpload = async (documentView: BookingDocumentView, file: File) => {
    await run(async () => {
      await uploadBookingDocument(
        project.tenantId,
        journeyId,
        documentView.requirementKey,
        file,
        accessToken,
      );
      await refreshBookingExtraction(project.tenantId, journeyId, accessToken).catch(() => undefined);
    }, `${friendly(documentView.requirementKey)} uploaded. Processing continues in the background.`);
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
    `${friendly(documentView.requirementKey)} assessment saved.`,
  );

  const handleProposal = (proposal: ExtractionProposalView, mode: 'accept' | 'correct') => run(
    () => decideExtractionProposal(
      project.tenantId,
      journeyId,
      proposal.proposalId,
      mode,
      workspace!.aggregateVersion,
      accessToken,
      proposalEdits[proposal.proposalId],
    ),
    mode === 'accept' ? 'Extracted value accepted.' : 'Correction saved with the original machine value retained.',
  );

  const handleBulkAccept = async () => {
    if (!workspace || cleanProposals.length === 0) return;
    setBusy(true);
    setError(undefined);
    try {
      let version = workspace.aggregateVersion;
      for (const proposal of cleanProposals) {
        const result = await decideExtractionProposal(
          project.tenantId,
          journeyId,
          proposal.proposalId,
          'accept',
          version,
          accessToken,
        );
        version = result.aggregateVersion;
      }
      setMessage(`${cleanProposals.length} clean extraction proposal${cleanProposals.length === 1 ? '' : 's'} accepted.`);
      await refreshWorkspace();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Clean proposals could not be accepted.');
    } finally {
      setBusy(false);
    }
  };

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
    'Audit Flag raised. It does not stop business progression unless policy explicitly marks it blocking.',
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
      reasonCode || undefined,
      conclusionRemarks || undefined,
    ),
    'Booking conclusion recorded.',
  );

  if (workspaceQuery.isPending) {
    return <div className="uc03-c1-loading" role="status">Loading Booking workspace…</div>;
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
  const processing = processingQuery.data ?? workspace.processingSummary;
  const failedCount = processing?.failedCount ?? 0;
  const pendingCount = processing?.pendingCount ?? 0;

  return (
    <div className="screen-stack uc03-c1-workspace">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work list</button>
        <span>Project · {project.projectName}</span>
      </div>

      <PageHeader
        eyebrow={`Booking audit · ${workspace.operatingRole}`}
        title={(workspace.capture.BOOKING_REFERENCE as string) || 'Booking reference pending'}
        description="Upload evidence, continue PC capture while documents process, review extracted proposals, and conclude the Booking when the checkpoint is ready."
      />

      <section className="uc03-c1-stage-strip" aria-label="Booking stage status">
        <div><span>Business status</span><strong>{friendly(workspace.bookingStage.businessStatus)}</strong></div>
        <div><span>Audit State</span><StatusPill value={workspace.bookingStage.auditState} /></div>
        <div><span>Audit Status</span><StatusPill value={workspace.bookingStage.auditStatus} /></div>
        <div><span>Open flags</span><strong>{workspace.flagSummary?.openCount ?? workspace.flags.length}</strong></div>
      </section>

      {message && <div className="uc03-c1-feedback is-success" role="status">{message}</div>}
      {error && <div className="uc03-c1-feedback is-error" role="alert">{error}</div>}

      {!started && (
        <section className="uc03-c1-start-panel">
          <div>
            <span className="uc03-c1-eyebrow">C1 Booking journey</span>
            <h2>Start Booking audit</h2>
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
                <span className="uc03-c1-eyebrow">1 · Evidence first</span>
                <h2>Booking documents</h2>
                <p>Upload applicable evidence first. Each document processes independently; you can continue entering Booking details below.</p>
              </div>
              <div className="uc03-c1-processing-summary">
                <strong>{pendingCount}</strong><span>processing</span>
                <strong>{processing?.readyProposalCount ?? 0}</strong><span>proposals</span>
                <strong>{failedCount}</strong><span>need attention</span>
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
                <span className="uc03-c1-eyebrow">2 · Work in parallel</span>
                <h2>Booking details</h2>
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
                <span>Exchange taken?</span>
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
                <span className="uc03-c1-eyebrow">3 · Review extraction</span>
                <h2>Extracted proposals</h2>
                <p>Machine values are proposals only. Accepting or correcting writes to the typed business owner and retains the original machine value, source and confidence.</p>
              </div>
              {cleanProposals.length > 0 && (
                <button type="button" className="uc03-c1-secondary" disabled={busy} onClick={() => void handleBulkAccept()}>
                  Accept {cleanProposals.length} clean proposal{cleanProposals.length === 1 ? '' : 's'}
                </button>
              )}
            </header>
            <div className="uc03-c1-proposal-list">
              {workspace.proposals.map((proposal) => (
                <article key={proposal.proposalId} className="uc03-c1-card uc03-c1-proposal-card">
                  <header>
                    <div>
                      <span className="uc03-c1-eyebrow">{friendly(proposal.sourceDocumentTypeKey)}</span>
                      <h3>{friendly(proposal.fieldKey)}</h3>
                    </div>
                    <div className="uc03-c1-status-stack">
                      <StatusPill value={proposal.status} compact />
                      <span>{confidenceLabel(proposal.confidence)}</span>
                    </div>
                  </header>
                  <div className="uc03-c1-proposal-value">
                    <span>Machine proposal</span>
                    <strong>{displayValue(proposal.proposedValue) || 'No readable value'}</strong>
                  </div>
                  {proposal.status === 'PENDING' && proposal.canAccept && (
                    <div className="uc03-c1-proposal-actions">
                      <button type="button" disabled={busy} onClick={() => void handleProposal(proposal, 'accept')}>Accept</button>
                      <input
                        aria-label={`Correct ${proposal.fieldKey}`}
                        placeholder="Correct value"
                        value={proposalEdits[proposal.proposalId] ?? displayValue(proposal.proposedValue)}
                        onChange={(event) => setProposalEdits((current) => ({ ...current, [proposal.proposalId]: event.target.value }))}
                      />
                      <button
                        type="button"
                        disabled={busy || !(proposalEdits[proposal.proposalId] ?? displayValue(proposal.proposedValue)).trim()}
                        onClick={() => void handleProposal(proposal, 'correct')}
                      >Save correction</button>
                    </div>
                  )}
                  {proposal.status === 'PENDING' && !proposal.canAccept && (
                    <p className="uc03-c1-muted">Review only — this value requires configured master resolution before it can become authoritative.</p>
                  )}
                  {(proposal.status === 'ACCEPTED' || proposal.status === 'CORRECTED') && (
                    <p className="uc03-c1-muted">Accepted value: <strong>{displayValue(proposal.acceptedValue)}</strong></p>
                  )}
                </article>
              ))}
              {workspace.proposals.length === 0 && (
                <div className="uc03-c1-empty">No extracted proposals yet. Continue working while uploaded documents process.</div>
              )}
            </div>
          </section>

          <section className="uc03-c1-section uc03-c1-flags-section">
            <header className="uc03-c1-section-heading">
              <div>
                <span className="uc03-c1-eyebrow">4 · Audit Flags</span>
                <h2>Observations &amp; flags</h2>
                <p>Flags are audit findings, not a substitute business status. Ordinary flags remain visible without blocking progression.</p>
              </div>
            </header>
            <div className="uc03-c1-flag-layout">
              <div className="uc03-c1-flag-list">
                {workspace.flags.map((flag) => (
                  <article key={flag.flagId} className="uc03-c1-card uc03-c1-flag-card">
                    <header><strong>{flag.title}</strong><StatusPill value={flag.severity} compact /></header>
                    <p>{flag.description || friendly(flag.category)}</p>
                    <footer><StatusPill value={flag.status} compact /><span>{friendly(flag.originKind)}</span></footer>
                  </article>
                ))}
                {workspace.flags.length === 0 && <div className="uc03-c1-empty">No Booking flags.</div>}
              </div>
              {active && (
                <form className="uc03-c1-flag-form" onSubmit={(event) => { event.preventDefault(); if (flagSummary.trim()) void handleFlag(); }}>
                  <h3>Raise a PC flag</h3>
                  <label><span>Category</span><select value={flagCategory} onChange={(event) => setFlagCategory(event.target.value)}>{HUMAN_FLAG_CATEGORIES.map((value) => <option key={value} value={value}>{friendly(value)}</option>)}</select></label>
                  <label><span>Severity</span><select value={flagSeverity} onChange={(event) => setFlagSeverity(event.target.value)}>{['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value}>{value}</option>)}</select></label>
                  <label><span>Summary</span><input value={flagSummary} maxLength={500} onChange={(event) => setFlagSummary(event.target.value)} required /></label>
                  <label><span>Remarks</span><textarea value={flagRemarks} maxLength={4000} onChange={(event) => setFlagRemarks(event.target.value)} /></label>
                  <button type="submit" className="uc03-c1-secondary" disabled={busy || !flagSummary.trim()}>Raise flag</button>
                </form>
              )}
            </div>
          </section>

          <section className="uc03-c1-section uc03-c1-checkpoint-section">
            <header className="uc03-c1-section-heading">
              <div>
                <span className="uc03-c1-eyebrow">5 · Booking checkpoint</span>
                <h2>{workspace.completion.ready ? 'Ready to conclude' : 'Outstanding audit work'}</h2>
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
                <label><span>Conclusion</span><select value={conclusion} onChange={(event) => setConclusion(event.target.value as ConclusionAction)}>{CONCLUSION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                {(conclusion === 'close-no-delivery' || conclusion === 'cancel') && (
                  <label><span>Reason code</span><input value={reasonCode} onChange={(event) => setReasonCode(event.target.value.toUpperCase())} placeholder={conclusion === 'cancel' ? 'CUSTOMER_CANCELLED' : 'FINANCE_NOT_APPROVED'} /></label>
                )}
                <label><span>Remarks</span><textarea value={conclusionRemarks} onChange={(event) => setConclusionRemarks(event.target.value)} /></label>
                <button
                  type="button"
                  className="uc03-c1-primary"
                  disabled={busy || (conclusion === 'close-ready' && !workspace.completion.ready) || ((conclusion === 'close-no-delivery' || conclusion === 'cancel') && !reasonCode.trim())}
                  onClick={() => void handleConclusion()}
                >Record conclusion</button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
