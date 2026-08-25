import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import BookingDocumentDetails from '../features/uc03/BookingDocumentDetails';
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
import { displayName, valueToCode } from '../utils/displayNames';

const CAPTURE_FIELDS = [
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

function DocumentCard({
  document,
  uploadBusy,
  detailsBusy,
  selected,
  disabled,
  onUpload,
  onGetDetails,
  onAssess,
}: {
  document: BookingDocumentView;
  uploadBusy: boolean;
  detailsBusy: boolean;
  selected: boolean;
  disabled: boolean;
  onUpload: (document: BookingDocumentView, files: File[]) => Promise<void>;
  onGetDetails: (document: BookingDocumentView) => Promise<void>;
  onAssess: (document: BookingDocumentView, answer: 'YES' | 'NO' | 'NA') => Promise<void>;
}) {
  const documentName = displayName(document.documentTypeKey || document.requirementKey, 'Document');
  const hidden = document.applicabilityState === 'NOT_APPLICABLE' && document.answer === 'NA';
  if (hidden) return null;

  const canUpload = document.applicabilityState === 'APPLICABLE';
  const cardBusy = uploadBusy || detailsBusy;

  return (
    <article className={`uc03-c1-card uc03-c1-document-card${selected ? ' is-selected' : ''}`}>
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
        <label className={`uc03-c1-file-button ${!canUpload || uploadBusy || disabled ? 'is-disabled' : ''}`}>
          <span>{uploadBusy ? 'Uploading…' : document.evidenceId ? 'Add / Replace Files' : 'Upload Files'}</span>
          <input
            type="file"
            accept="image/*,.pdf"
            multiple
            disabled={!canUpload || uploadBusy || disabled}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) void onUpload(document, files);
              event.currentTarget.value = '';
            }}
          />
        </label>
        <span className="uc03-c1-upload-hint">Upload one or more images or PDFs. Other document cards remain available while this upload runs.</span>
        {document.evidenceId && <span className="uc03-c1-evidence-ok">Document Linked</span>}
      </div>

      {document.evidenceId ? (
        <div className="uc03-c1-document-tools">
          <div>
            <strong>{selected ? 'Details Open' : 'Ready for Review'}</strong>
            <span>Get Details reads the latest Document Intelligence result and opens the uploaded document with its extracted fields.</span>
          </div>
          <button
            type="button"
            className="uc03-c1-get-details"
            disabled={detailsBusy || disabled}
            onClick={() => void onGetDetails(document)}
          >
            {detailsBusy ? 'Getting Details…' : 'Get Details'}
          </button>
        </div>
      ) : (
        <div className="uc03-c1-extraction-empty">Upload this document first. You can continue with other documents and Booking fields in any order.</div>
      )}

      <div className="uc03-c1-answer-row" role="group" aria-label={`Assessment for ${documentName}`}>
        {(['YES', 'NO'] as const).map((answer) => (
          <button
            type="button"
            key={answer}
            className={document.answer === answer ? 'is-active' : ''}
            disabled={cardBusy || disabled || document.applicabilityState !== 'APPLICABLE'}
            onClick={() => void onAssess(document, answer)}
          >
            {answer === 'YES' ? 'Yes — Available' : 'No — Missing / Mismatch'}
          </button>
        ))}
        {document.applicabilityState === 'NOT_APPLICABLE' && (
          <button
            type="button"
            className={document.answer === 'NA' ? 'is-active' : ''}
            disabled={cardBusy || disabled}
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
  const [dirtyFields, setDirtyFields] = useState<Record<string, boolean>>({});
  const [uploadingRequirements, setUploadingRequirements] = useState<Record<string, boolean>>({});
  const [detailsBusyKey, setDetailsBusyKey] = useState<string>();
  const [selectedReviewKey, setSelectedReviewKey] = useState<string>();
  const [detailsRefreshKey, setDetailsRefreshKey] = useState<string>();
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
    refetchInterval: workspaceQuery.data?.processingSummary?.pendingCount ? 5_000 : false,
  });

  const refreshWorkspace = useCallback(async () => {
    if (!project?.tenantId || !journeyId || !accessToken) return;
    await workspaceQuery.refetch();
  }, [accessToken, journeyId, project?.tenantId, workspaceQuery.refetch]);

  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState !== 'visible') return;
      void workspaceQuery.refetch();
      void processingQuery.refetch();
    };
    const onOnline = () => {
      void workspaceQuery.refetch();
      void processingQuery.refetch();
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('online', onOnline);
    };
  }, [processingQuery.refetch, workspaceQuery.refetch]);

  useEffect(() => {
    const capture = workspaceQuery.data?.capture;
    if (!capture) return;
    setCaptureValues((current) => {
      const next = { ...current };
      CAPTURE_FIELDS.forEach(([key]) => {
        if (!dirtyFields[key]) next[key] = displayValue(capture[key]);
      });
      return next;
    });
  }, [dirtyFields, workspaceQuery.data?.capture]);

  if (!project || !journeyId) return null;
  const workspace = workspaceQuery.data;

  const anyUploadBusy = Object.values(uploadingRequirements).some(Boolean);

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
      throw cause;
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async () => {
    try {
      await run(
        () => startBooking(project.tenantId, journeyId, workspace?.aggregateVersion ?? 0, accessToken),
        'Booking Started.',
      );
    } catch {
      // Message is already shown by run().
    }
  };

  const handleCapture = async (fieldKey: string) => {
    try {
      await run(
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
      setDirtyFields((current) => ({ ...current, [fieldKey]: false }));
    } catch {
      // Message is already shown by run().
    }
  };

  const handleExchange = async (value: boolean) => {
    try {
      await run(
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
    } catch {
      // Message is already shown by run().
    }
  };

  const handleUpload = async (documentView: BookingDocumentView, files: File[]) => {
    const requirementKey = documentView.requirementKey;
    const documentName = displayName(documentView.documentTypeKey || requirementKey, 'Document');
    setUploadingRequirements((current) => ({ ...current, [requirementKey]: true }));
    setError(undefined);
    setMessage(undefined);
    try {
      await Promise.all(files.map((file) => uploadBookingDocument(
        project.tenantId,
        journeyId,
        requirementKey,
        file,
        accessToken,
      )));
      setMessage(`${documentName}: ${files.length} ${files.length === 1 ? 'File' : 'Files'} Uploaded. Processing Continues in the Background.`);
      await Promise.all([workspaceQuery.refetch(), processingQuery.refetch()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${documentName} could not be uploaded.`);
    } finally {
      setUploadingRequirements((current) => ({ ...current, [requirementKey]: false }));
    }
  };

  const handleGetDetails = async (documentView: BookingDocumentView) => {
    if (!documentView.evidenceId) return;
    setDetailsBusyKey(documentView.requirementKey);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await refreshBookingExtraction(project.tenantId, journeyId, accessToken);
      await Promise.all([workspaceQuery.refetch(), processingQuery.refetch()]);
      setSelectedReviewKey(documentView.requirementKey);
      setDetailsRefreshKey(`${Date.now()}-${result.aggregateVersion}`);
      if (result.failedDocuments > 0) {
        setError('Document Intelligence could not complete one or more documents. Review the document status and retry Get Details.');
      } else if (result.createdProposals === 0) {
        setMessage('Latest document details loaded. If processing is still running, use Get Details again after it completes.');
      } else {
        setMessage('Latest document details loaded for review.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Document details could not be loaded.');
    } finally {
      setDetailsBusyKey(undefined);
    }
  };

  const handleAssess = async (
    documentView: BookingDocumentView,
    answer: 'YES' | 'NO' | 'NA',
  ) => {
    try {
      await run(
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
    } catch {
      // Message is already shown by run().
    }
  };

  const handleProposal = async (
    proposal: ExtractionProposalView,
    mode: 'accept' | 'correct',
    correctedValue?: string,
  ) => {
    try {
      await run(
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
          : 'Edit Saved. The Original System Read Value Is Retained in Audit History.',
      );
      setDetailsRefreshKey(`${Date.now()}-${proposal.proposalId}`);
    } catch {
      // Message is already shown by run().
    }
  };

  const handleFlag = async () => {
    try {
      await run(
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
      );
      setFlagSummary('');
      setFlagRemarks('');
    } catch {
      // Message is already shown by run().
    }
  };

  const handleConclusion = async () => {
    try {
      await run(
        () => concludeBooking(
          project.tenantId,
          journeyId,
          conclusion,
          workspace!.aggregateVersion,
          accessToken,
          reasonName.trim() ? valueToCode(reasonName) : undefined,
          conclusionRemarks || undefined,
        ),
        conclusion === 'close-ready' ? 'Booking Submitted.' : 'Booking Outcome Recorded.',
      );
    } catch {
      // Message is already shown by run().
    }
  };

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
  const customerName = displayValue(workspace.capture.CUSTOMER_NAME) || 'Customer';
  const bookingReference = displayValue(workspace.capture.BOOKING_REFERENCE) || 'Booking Reference Pending';
  const selectedReviewDocument = selectedReviewKey
    ? workspace.documents.find((item) => item.requirementKey === selectedReviewKey)
    : undefined;
  const selectedProposals = selectedReviewDocument?.evidenceId
    ? workspace.proposals.filter((proposal) => proposal.sourceEvidenceId === selectedReviewDocument.evidenceId)
    : [];
  const actionLockedByUpload = anyUploadBusy;

  return (
    <div className="screen-stack uc03-c1-workspace">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button>
        <span>Project · {project.projectName}</span>
      </div>

      <PageHeader
        eyebrow={`Booking Capture · ${displayName(workspace.operatingRole)}`}
        title={customerName}
        description={`${bookingReference}. Upload documents and enter Booking fields in any order. Use Get Details on an uploaded document when you are ready to compare its System Read values with the source.`}
      />

      <section className="uc03-c1-customer-lock" aria-label="Locked Customer Name">
        <div>
          <span>Customer Name</span>
          <strong>{customerName}</strong>
          <small>Locked when Add Details created this Journey. Document Intelligence can validate this name but cannot silently replace it.</small>
        </div>
        <span className="uc03-c1-customer-lock__badge">Locked</span>
      </section>

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
            <p>Start this legacy Journey before capturing Booking evidence and details.</p>
          </div>
          <button type="button" className="uc03-c1-primary" disabled={busy || anyUploadBusy} onClick={() => void handleStart()}>
            Start Booking
          </button>
        </section>
      )}

      {started && (
        <>
          <section className="uc03-c1-section uc03-c1-section--documents">
            <header className="uc03-c1-section-heading">
              <div>
                <span className="uc03-c1-eyebrow">1 · Documents</span>
                <h2>Booking Documents</h2>
                <p>Document cards are independent. Upload Aadhaar, Booking Docket and other applicable evidence in any order; each upload can run without blocking another document card.</p>
              </div>
              <div className="uc03-c1-processing-summary">
                <strong>{pendingCount}</strong><span>Processing</span>
                <strong>{processing?.readyProposalCount ?? 0}</strong><span>Ready to Review</span>
                <strong>{failedCount}</strong><span>Need Attention</span>
              </div>
            </header>

            {failedCount > 0 && (
              <div className="uc03-c1-feedback is-error">
                {processingQuery.data?.userMessage || 'One or more documents need attention. Upload a clearer document or use Get Details to refresh its status.'}
              </div>
            )}

            <div className="uc03-c1-document-grid">
              {workspace.documents.map((documentView) => (
                <DocumentCard
                  key={documentView.requirementKey}
                  document={documentView}
                  uploadBusy={Boolean(uploadingRequirements[documentView.requirementKey])}
                  detailsBusy={detailsBusyKey === documentView.requirementKey}
                  selected={selectedReviewKey === documentView.requirementKey}
                  disabled={busy}
                  onUpload={handleUpload}
                  onGetDetails={handleGetDetails}
                  onAssess={handleAssess}
                />
              ))}
              {workspace.documents.length === 0 && (
                <div className="uc03-c1-empty">No Booking document requirements are configured for this case.</div>
              )}
            </div>

            {selectedReviewDocument?.evidenceId && (
              <BookingDocumentDetails
                key={`${selectedReviewDocument.evidenceId}-${detailsRefreshKey || 'initial'}`}
                tenantId={project.tenantId}
                journeyId={journeyId}
                accessToken={accessToken}
                evidenceId={selectedReviewDocument.evidenceId}
                documentName={displayName(selectedReviewDocument.documentTypeKey || selectedReviewDocument.requirementKey, 'Document')}
                proposals={selectedProposals}
                lockedCustomerName={customerName}
                disabled={busy || anyUploadBusy}
                refreshKey={detailsRefreshKey}
                onAccept={(proposal) => handleProposal(proposal, 'accept')}
                onCorrect={(proposal, value) => handleProposal(proposal, 'correct', value)}
                onClose={() => setSelectedReviewKey(undefined)}
              />
            )}
          </section>

          <section className="uc03-c1-section">
            <header className="uc03-c1-section-heading">
              <div>
                <span className="uc03-c1-eyebrow">2 · Booking Details</span>
                <h2>Additional Booking Details</h2>
                <p>Enter the remaining Booking fields in any order while documents process. Values confirmed from Document Intelligence populate the same Booking record. A later Save/Edit creates another Audit History event.</p>
              </div>
            </header>
            <div className="uc03-c1-capture-grid">
              {CAPTURE_FIELDS.map(([key, label]) => {
                const serverValue = displayValue(workspace.capture[key]);
                const currentValue = captureValues[key] ?? '';
                const changed = dirtyFields[key] && currentValue !== serverValue;
                return (
                  <label key={key}>
                    <span>{label}</span>
                    <div className="uc03-c1-inline-field">
                      <input
                        type={key === 'BOOKING_DATE' ? 'date' : 'text'}
                        value={currentValue}
                        disabled={!active || busy}
                        onChange={(event) => {
                          const value = event.target.value;
                          setCaptureValues((current) => ({ ...current, [key]: value }));
                          setDirtyFields((current) => ({ ...current, [key]: true }));
                        }}
                      />
                      <button
                        type="button"
                        disabled={!active || busy || actionLockedByUpload || !currentValue.trim() || !changed}
                        onClick={() => void handleCapture(key)}
                      >
                        {serverValue ? 'Save Edit' : 'Save'}
                      </button>
                    </div>
                  </label>
                );
              })}
              <div className="uc03-c1-choice-field">
                <span>Exchange Taken?</span>
                <div>
                  <button
                    type="button"
                    className={workspace.capture.EXCHANGE_TAKEN === true ? 'is-active' : ''}
                    disabled={!active || busy || actionLockedByUpload}
                    onClick={() => void handleExchange(true)}
                  >Yes</button>
                  <button
                    type="button"
                    className={workspace.capture.EXCHANGE_TAKEN === false ? 'is-active' : ''}
                    disabled={!active || busy || actionLockedByUpload}
                    onClick={() => void handleExchange(false)}
                  >No</button>
                </div>
              </div>
            </div>
            {anyUploadBusy && (
              <p className="uc03-c1-async-note">Documents are uploading in the background. You can continue typing Booking details; Save actions re-enable as soon as the active upload request completes.</p>
            )}
          </section>

          <section className="uc03-c1-section uc03-c1-flags-section">
            <header className="uc03-c1-section-heading">
              <div>
                <span className="uc03-c1-eyebrow">3 · Audit Flags</span>
                <h2>Observations &amp; Flags</h2>
                <p>Raise an observation only when needed. Flags remain separate from the Booking business status.</p>
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
                <form className="uc03-c1-flag-form" onSubmit={(event) => { event.preventDefault(); if (flagSummary.trim() && !anyUploadBusy) void handleFlag(); }}>
                  <h3>Raise a PC Flag</h3>
                  <label><span>Category</span><select value={flagCategory} onChange={(event) => setFlagCategory(event.target.value)}>{HUMAN_FLAG_CATEGORIES.map((value) => <option key={value} value={value}>{displayName(value)}</option>)}</select></label>
                  <label><span>Severity</span><select value={flagSeverity} onChange={(event) => setFlagSeverity(event.target.value)}>{['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value} value={value}>{displayName(value)}</option>)}</select></label>
                  <label><span>Summary</span><input value={flagSummary} maxLength={500} onChange={(event) => setFlagSummary(event.target.value)} required /></label>
                  <label><span>Remarks</span><textarea value={flagRemarks} maxLength={4000} onChange={(event) => setFlagRemarks(event.target.value)} /></label>
                  <button type="submit" className="uc03-c1-secondary" disabled={busy || anyUploadBusy || !flagSummary.trim()}>Raise Flag</button>
                </form>
              )}
            </div>
          </section>

          <section className="uc03-c1-section uc03-c1-checkpoint-section">
            <header className="uc03-c1-section-heading">
              <div>
                <span className="uc03-c1-eyebrow">4 · Submit</span>
                <h2>{workspace.completion.ready ? 'Ready to Submit' : 'Booking Still Needs Attention'}</h2>
                <p>Submit becomes available when the configured required documents, document assessments, extraction validations and blocking audit conditions are complete.</p>
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
                  <span>Booking Outcome</span>
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
                  disabled={busy || anyUploadBusy || (conclusion === 'close-ready' && !workspace.completion.ready) || ((conclusion === 'close-no-delivery' || conclusion === 'cancel') && !reasonName.trim())}
                  onClick={() => void handleConclusion()}
                >
                  {conclusion === 'close-ready' ? 'Submit Booking' : 'Record Outcome'}
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
