import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import {
  bookingWorkspaceQueryKey,
  pcVerificationQueryKey,
  UC03_OPERATIONAL_GC_MS,
  UC03_OPERATIONAL_STALE_MS,
} from '../features/uc03/queryKeys';
import {
  getBookingProcessingStatus,
  getBookingWorkspace,
  startBooking,
  uploadBookingDocument,
  type BookingDocumentView,
  type BookingWorkspace,
} from '../services/audit-core/uc03Booking';
import {
  getPcVerification,
  submitPcBookingCapture,
} from '../services/audit-core/uc03PcVerification';
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

function DocumentCard({
  document,
  busy,
  onUpload,
}: {
  document: BookingDocumentView;
  busy: boolean;
  onUpload: (document: BookingDocumentView, file: File) => Promise<void>;
}) {
  const hidden = document.applicabilityState === 'NOT_APPLICABLE';
  if (hidden) return null;

  const canUpload = document.applicabilityState !== 'NOT_APPLICABLE';
  return (
    <article className="uc03-c1-card uc03-c1-document-card">
      <header>
        <div>
          <span className="uc03-c1-eyebrow">{document.requirementLevel}</span>
          <h3>{friendly(document.requirementKey)}</h3>
          <p>{friendly(document.documentTypeKey)}</p>
        </div>
        <div className="uc03-c1-status-stack">
          {document.evidenceId ? <StatusPill value="UPLOADED" compact /> : <StatusPill value="PENDING" compact />}
        </div>
      </header>

      {document.applicabilityState === 'UNRESOLVED' && (
        <div className="uc03-c1-notice">Upload this document if it is available. Applicability can be resolved from Booking Details later.</div>
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
        {document.evidenceId && <span className="uc03-c1-evidence-ok">Document linked to Booking</span>}
      </div>
    </article>
  );
}

export default function BookingWorkspacePage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [captureValues, setCaptureValues] = useState<Record<string, string>>({});
  const [exchangeTaken, setExchangeTaken] = useState<boolean | null>(null);

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
  const workspaceKey = bookingWorkspaceQueryKey(project?.tenantId, journeyId);
  const verificationKey = pcVerificationQueryKey(project?.tenantId, journeyId);

  const workspaceQuery = useQuery({
    queryKey: workspaceKey,
    queryFn: () => getBookingWorkspace(project!.tenantId, journeyId!, accessToken),
    enabled,
    staleTime: UC03_OPERATIONAL_STALE_MS,
    gcTime: UC03_OPERATIONAL_GC_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const verificationQuery = useQuery({
    queryKey: verificationKey,
    queryFn: () => getPcVerification(project!.tenantId, journeyId!, accessToken),
    enabled: enabled && Boolean(workspaceQuery.data?.bookingStage.businessStatus),
    staleTime: 30_000,
    gcTime: UC03_OPERATIONAL_GC_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

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
    if (exchangeTaken === null && typeof capture.EXCHANGE_TAKEN === 'boolean') {
      setExchangeTaken(capture.EXCHANGE_TAKEN);
    }
  }, [exchangeTaken, workspaceQuery.data?.capture]);

  if (!project || !journeyId) return null;
  const workspace = workspaceQuery.data;

  const reconcileProcessingStatus = () => {
    void getBookingProcessingStatus(project.tenantId, journeyId, accessToken)
      .then((processing) => {
        queryClient.setQueryData<BookingWorkspace>(workspaceKey, (current) => current ? {
          ...current,
          aggregateVersion: processing.version,
          documents: processing.documents,
          processingSummary: {
            pendingCount: processing.pendingCount,
            failedCount: processing.failedCount,
            readyProposalCount: processing.readyProposalCount,
          },
        } : current);
      })
      .catch(() => undefined);
  };

  const handleStart = async () => {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await startBooking(project.tenantId, journeyId, workspace?.aggregateVersion ?? 0, accessToken);
      queryClient.setQueryData<BookingWorkspace>(workspaceKey, (current) => current ? {
        ...current,
        bookingStage: {
          ...current.bookingStage,
          businessStatus: result.businessStatus,
        },
        aggregateVersion: result.aggregateVersion,
        permittedActions: current.permittedActions.includes('CAPTURE')
          ? current.permittedActions
          : [...current.permittedActions, 'CAPTURE'],
      } : current);
      setMessage('Booking started.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Booking action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (documentView: BookingDocumentView, file: File) => {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await uploadBookingDocument(
        project.tenantId,
        journeyId,
        documentView.requirementKey,
        file,
        accessToken,
      );
      const updatedAtUtc = new Date().toISOString();
      queryClient.setQueryData<BookingWorkspace>(workspaceKey, (current) => current ? {
        ...current,
        bookingStage: {
          ...current.bookingStage,
          businessStatus: 'BOOKING_IN_PROGRESS',
        },
        // UC03 Booking evidence linking advances the Booking aggregate exactly once
        // for a successful idempotent upload. The lightweight processing-status call
        // below reconciles the authoritative version asynchronously.
        aggregateVersion: current.aggregateVersion + 1,
        documents: current.documents.map((item) => item.requirementKey === documentView.requirementKey ? {
          ...item,
          evidenceId: result.evidenceId,
          processingStatus: result.processingStatus,
          updatedAtUtc,
        } : item),
      } : current);
      setMessage(`${friendly(documentView.requirementKey)} uploaded. Document Intelligence will process it asynchronously.`);
      reconcileProcessingStatus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Booking action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!workspace) return;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const values: Record<string, unknown> = {};
      CAPTURE_FIELDS.forEach(([key]) => {
        const value = captureValues[key]?.trim();
        if (value) values[key] = value;
      });
      if (exchangeTaken !== null) values.EXCHANGE_TAKEN = exchangeTaken;

      const verification = await submitPcBookingCapture(
        project.tenantId,
        journeyId,
        workspace.aggregateVersion,
        values,
        accessToken,
      );
      queryClient.setQueryData(verificationKey, verification);
      queryClient.setQueryData<BookingWorkspace>(workspaceKey, (current) => current ? {
        ...current,
        capture: { ...current.capture, ...values },
        aggregateVersion: verification.aggregateVersion,
      } : current);
      navigate(`/bookings/${journeyId}/review`, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Booking capture could not be submitted.');
    } finally {
      setBusy(false);
    }
  };

  if (workspaceQuery.isPending) {
    return <div className="uc03-c1-loading" role="status">Loading Booking…</div>;
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
  const verification = verificationQuery.data;
  const captureSubmitted = verification?.captureSubmitted ?? false;
  const verified = verification?.pcVerificationStatus === 'VERIFIED';

  return (
    <div className="screen-stack uc03-c1-workspace">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work list</button>
        <span>Project · {project.projectName}</span>
      </div>

      <PageHeader
        eyebrow="PC Booking Capture"
        title={(workspace.capture.BOOKING_REFERENCE as string) || 'Booking reference pending'}
        description="Upload the available Booking documents, capture whatever Booking information is available, then submit. Document verification is handled separately."
      />

      <section className="uc03-c1-stage-strip" aria-label="Booking capture status">
        <div><span>Booking status</span><strong>{friendly(workspace.bookingStage.businessStatus)}</strong></div>
        <div><span>Capture</span><StatusPill value={captureSubmitted ? 'SUBMITTED' : started ? 'IN_PROGRESS' : 'NOT_STARTED'} /></div>
        <div><span>PC verification</span><StatusPill value={verification?.pcVerificationStatus || 'NOT_SUBMITTED'} /></div>
        <div><span>Documents linked</span><strong>{workspace.documents.filter((item) => item.evidenceId).length}</strong></div>
      </section>

      {message && <div className="uc03-c1-feedback is-success" role="status">{message}</div>}
      {error && <div className="uc03-c1-feedback is-error" role="alert">{error}</div>}

      {!started && (
        <section className="uc03-c1-start-panel">
          <div>
            <span className="uc03-c1-eyebrow">PC Booking journey</span>
            <h2>Start Booking</h2>
            <p>Start the Booking capture before uploading documents or entering Booking details.</p>
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
                <span className="uc03-c1-eyebrow">1 · Documents</span>
                <h2>Booking documents</h2>
                <p>Upload the documents available to the PC. They are sent to Document Intelligence immediately and continue processing asynchronously. Booking capture does not wait for extraction.</p>
              </div>
            </header>

            <div className="uc03-c1-document-grid">
              {workspace.documents.map((documentView) => (
                <DocumentCard
                  key={documentView.requirementKey}
                  document={documentView}
                  busy={busy || verified}
                  onUpload={handleUpload}
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
                <span className="uc03-c1-eyebrow">2 · Booking Details</span>
                <h2>Capture available information</h2>
                <p>Enter only what is available at Booking stage. Missing values are not required merely to submit Booking capture.</p>
              </div>
            </header>

            <div className="uc03-c1-capture-grid">
              {CAPTURE_FIELDS.map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <input
                    type={key === 'BOOKING_DATE' ? 'date' : 'text'}
                    value={captureValues[key] ?? ''}
                    disabled={!active || busy || verified}
                    onChange={(event) => setCaptureValues((current) => ({ ...current, [key]: event.target.value }))}
                  />
                </label>
              ))}
              <div className="uc03-c1-choice-field">
                <span>Exchange taken?</span>
                <div>
                  <button
                    type="button"
                    className={exchangeTaken === true ? 'is-active' : ''}
                    disabled={!active || busy || verified}
                    onClick={() => setExchangeTaken(true)}
                  >Yes</button>
                  <button
                    type="button"
                    className={exchangeTaken === false ? 'is-active' : ''}
                    disabled={!active || busy || verified}
                    onClick={() => setExchangeTaken(false)}
                  >No</button>
                </div>
              </div>
            </div>

            <div className="uc03-c1-conclusion">
              <button type="button" className="uc03-c1-secondary" disabled={busy} onClick={() => navigate('/dashboard')}>
                Back to Work List
              </button>
              {verified ? (
                <button type="button" className="uc03-c1-primary" onClick={() => navigate(`/bookings/${journeyId}/review`)}>
                  View Verification
                </button>
              ) : captureSubmitted ? (
                <button type="button" className="uc03-c1-primary" disabled={busy} onClick={() => navigate(`/bookings/${journeyId}/review`)}>
                  Review Documents
                </button>
              ) : (
                <button type="button" className="uc03-c1-primary" disabled={!active || busy} onClick={() => void handleSubmit()}>
                  Submit Booking
                </button>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
