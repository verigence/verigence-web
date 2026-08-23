import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import {
  assessDeliveryDocument,
  completeDelivery,
  getDeliveryWorkspace,
  recordDeliveryIntimation,
  recordDeliveryVehicleObservation,
  startDelivery,
  type DeliveryDocumentAnswer,
  type DeliveryDocumentView,
  uploadDeliveryEvidence,
} from '../services/audit-core/uc03Delivery';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

function friendly(value?: string | null): string {
  if (!value) return 'Not started';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function mutationMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The Delivery action could not be completed.';
}

export default function DeliveryWorkspacePage() {
  const { journeyId = '' } = useParams();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [nonIntimationReason, setNonIntimationReason] = useState('');
  const [vin, setVin] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [busyDocument, setBusyDocument] = useState<string>();

  const queryKey = useMemo(
    () => ['uc03-delivery-workspace', project?.tenantId, journeyId],
    [project?.tenantId, journeyId],
  );
  const workspaceQuery = useQuery({
    queryKey,
    queryFn: () => getDeliveryWorkspace(project!.tenantId, journeyId, accessToken),
    enabled: Boolean(project?.tenantId && journeyId && accessToken),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void workspaceQuery.refetch();
    };
    const reconnect = () => void workspaceQuery.refetch();
    window.addEventListener('online', reconnect);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('online', reconnect);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [workspaceQuery.refetch]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };

  const startMutation = useMutation({
    mutationFn: () => startDelivery(project!.tenantId, journeyId, accessToken),
    onSuccess: refresh,
  });
  const intimationMutation = useMutation({
    mutationFn: (payload: { answer: 'YES' | 'NO'; reason?: string }) =>
      recordDeliveryIntimation(
        project!.tenantId,
        journeyId,
        payload.answer,
        workspaceQuery.data!.delivery.aggregateVersion,
        accessToken,
        payload.reason,
      ),
    onSuccess: refresh,
  });
  const vehicleMutation = useMutation({
    mutationFn: () => {
      const carPicture = workspaceQuery.data?.documents.find((item) => item.requirementKey === 'CAR_PICTURES');
      return recordDeliveryVehicleObservation(
        project!.tenantId,
        journeyId,
        workspaceQuery.data!.delivery.aggregateVersion,
        {
          vin,
          chassisNumber,
          sourceEvidenceId: carPicture?.evidenceId,
        },
        accessToken,
      );
    },
    onSuccess: refresh,
  });
  const completeMutation = useMutation({
    mutationFn: () => completeDelivery(
      project!.tenantId,
      journeyId,
      workspaceQuery.data!.delivery.aggregateVersion,
      accessToken,
    ),
    onSuccess: refresh,
  });

  if (!project) return null;

  if (workspaceQuery.isPending) {
    return <div className="uc03-c2-load" role="status">Loading Delivery workspace…</div>;
  }

  if (workspaceQuery.isError && !workspaceQuery.data) {
    return (
      <div className="screen-stack uc03-c2-workspace">
        <PageHeader
          eyebrow={`${project.projectCode} · Delivery Audit`}
          title="Start Delivery"
          description="Record the real Delivery event first. Outstanding Booking audit work will be flagged, not used to hide or reject the Delivery."
        />
        <section className="uc03-c2-start-card">
          <strong>Delivery has not started for this transaction.</strong>
          <p>Starting Delivery creates the Delivery workflow event and preserves the current Booking state exactly as it is.</p>
          {startMutation.isError && <p className="uc03-c2-error" role="alert">{mutationMessage(startMutation.error)}</p>}
          <div className="uc03-c2-actions">
            <Link to="/dashboard" className="uc03-c1-secondary">Back to work list</Link>
            <button type="button" onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
              {startMutation.isPending ? 'Starting…' : 'Start Delivery'}
            </button>
          </div>
        </section>
      </div>
    );
  }

  const workspace = workspaceQuery.data!;
  const completed = workspace.delivery.businessStatus === 'DELIVERY_COMPLETED';
  const carPictures = workspace.documents.find((item) => item.requirementKey === 'CAR_PICTURES');
  const actionError = intimationMutation.error || vehicleMutation.error || completeMutation.error;

  const assess = async (document: DeliveryDocumentView, answer: DeliveryDocumentAnswer) => {
    setBusyDocument(document.requirementKey);
    try {
      await assessDeliveryDocument(
        project.tenantId,
        journeyId,
        document.requirementKey,
        answer,
        workspace.delivery.aggregateVersion,
        accessToken,
        document.evidenceId,
      );
      await refresh();
    } finally {
      setBusyDocument(undefined);
    }
  };

  const upload = async (document: DeliveryDocumentView, file?: File) => {
    if (!file) return;
    setBusyDocument(document.requirementKey);
    try {
      const evidence = await uploadDeliveryEvidence(project.tenantId, journeyId, document, file, accessToken);
      await assessDeliveryDocument(
        project.tenantId,
        journeyId,
        document.requirementKey,
        'YES',
        workspace.delivery.aggregateVersion,
        accessToken,
        evidence.evidenceId,
        'Evidence captured in Delivery workspace.',
      );
      await refresh();
    } finally {
      setBusyDocument(undefined);
    }
  };

  return (
    <div className="screen-stack uc03-c2-workspace">
      <PageHeader
        eyebrow={`${project.projectCode} · Delivery Audit`}
        title="Delivery workspace"
        description="Physical Delivery status and audit completion are independent. Record what happened, then finish the audit trail."
      />

      <section className="uc03-c2-stage-strip">
        <div><span>Delivery status</span><strong>{friendly(workspace.delivery.businessStatus)}</strong></div>
        <div><span>Audit state</span><StatusPill value={workspace.delivery.auditState} /></div>
        <div><span>Audit flags</span><StatusPill value={workspace.delivery.auditStatus} /></div>
      </section>

      {workspace.booking.incompleteAtDelivery && (
        <section className="uc03-c2-warning" role="status">
          <strong>Booking audit is still incomplete.</strong>
          <p>{workspace.booking.warning}</p>
          <Link to={`/bookings/${journeyId}`}>Open Booking audit</Link>
        </section>
      )}

      {completed && workspace.delivery.auditState === 'IN_PROGRESS' && (
        <section className="uc03-c2-completed-audit-open" role="status">
          <strong>Physical Delivery completed. Audit work remains open.</strong>
          <p>Continue adding evidence and resolving audit gaps; the real Delivery timestamp remains unchanged.</p>
        </section>
      )}

      <div className="uc03-c2-grid">
        <section className="uc03-c2-panel">
          <div className="uc03-c2-panel__heading">
            <div><span>1</span><h2>Delivery intimation</h2></div>
            <StatusPill value={workspace.intimation.answer} compact />
          </div>
          <p>Was this Delivery intimated to you?</p>
          <div className="uc03-c2-segmented">
            <button type="button" onClick={() => intimationMutation.mutate({ answer: 'YES' })} disabled={intimationMutation.isPending}>Yes</button>
            <button type="button" onClick={() => intimationMutation.mutate({ answer: 'NO', reason: nonIntimationReason })} disabled={intimationMutation.isPending || !nonIntimationReason.trim()}>No</button>
          </div>
          <label className="uc03-c2-field">
            <span>Reason when not intimated</span>
            <textarea value={nonIntimationReason} onChange={(event) => setNonIntimationReason(event.target.value)} placeholder={workspace.intimation.reason || 'Required when answer is No'} />
          </label>
        </section>

        <section className="uc03-c2-panel uc03-c2-panel--wide">
          <div className="uc03-c2-panel__heading">
            <div><span>2</span><h2>Delivery evidence checklist</h2></div>
            <small>{workspace.documents.filter((item) => item.answer !== 'UNANSWERED').length}/{workspace.documents.length} addressed</small>
          </div>
          <div className="uc03-c2-documents">
            {workspace.documents.map((document) => (
              <article key={document.requirementKey} className={`uc03-c2-document is-${document.answer.toLowerCase()}`}>
                <div className="uc03-c2-document__copy">
                  <strong>{friendly(document.requirementKey)}</strong>
                  <span>{document.requirementLevel} · {friendly(document.requirementStatus)}</span>
                  {document.applicabilityReason && <small>{document.applicabilityReason}</small>}
                </div>
                <div className="uc03-c2-document__controls">
                  {document.applicabilityState !== 'NOT_APPLICABLE' && (
                    <label className="uc03-c2-upload">
                      <span>{document.requirementKey === 'CAR_PICTURES' ? 'Camera / photo' : 'Add evidence'}</span>
                      <input
                        type="file"
                        accept={document.requirementKey === 'CAR_PICTURES' ? 'image/*' : 'image/*,application/pdf'}
                        capture={document.requirementKey === 'CAR_PICTURES' ? 'environment' : undefined}
                        disabled={busyDocument === document.requirementKey}
                        onChange={(event) => void upload(document, event.target.files?.[0])}
                      />
                    </label>
                  )}
                  <div className="uc03-c2-answer-buttons">
                    {document.applicabilityState === 'NOT_APPLICABLE' ? (
                      <button type="button" onClick={() => void assess(document, 'NA')} disabled={busyDocument === document.requirementKey}>NA</button>
                    ) : (
                      <>
                        <button type="button" onClick={() => void assess(document, 'YES')} disabled={busyDocument === document.requirementKey || !document.evidenceId}>Yes</button>
                        <button type="button" onClick={() => void assess(document, 'NO')} disabled={busyDocument === document.requirementKey}>No</button>
                      </>
                    )}
                  </div>
                </div>
                {document.evidenceId && <small className="uc03-c2-evidence-id">Evidence linked · {document.evidenceId.slice(0, 8)}…</small>}
              </article>
            ))}
          </div>
        </section>

        <section className="uc03-c2-panel">
          <div className="uc03-c2-panel__heading">
            <div><span>3</span><h2>VIN / chassis reconciliation</h2></div>
            <StatusPill value={workspace.vehicle.reconciliationStatus} compact />
          </div>
          <div className="uc03-c2-expected">
            <span>Expected VIN</span><strong>{workspace.vehicle.expectedVin || 'Not available'}</strong>
            <span>Expected chassis</span><strong>{workspace.vehicle.expectedChassisNumber || 'Not available'}</strong>
          </div>
          <label className="uc03-c2-field"><span>Observed VIN</span><input value={vin} onChange={(event) => setVin(event.target.value)} placeholder={workspace.vehicle.observedVin || 'Enter/read from vehicle'} /></label>
          <label className="uc03-c2-field"><span>Observed chassis</span><input value={chassisNumber} onChange={(event) => setChassisNumber(event.target.value)} placeholder={workspace.vehicle.observedChassisNumber || 'Enter if available'} /></label>
          <button type="button" onClick={() => vehicleMutation.mutate()} disabled={vehicleMutation.isPending || (!vin.trim() && !chassisNumber.trim())}>
            {vehicleMutation.isPending ? 'Checking…' : 'Record & reconcile'}
          </button>
          {carPictures?.evidenceId && <small>Car-picture evidence will be attached to this observation.</small>}
          <p className="uc03-c2-policy-note">Different-length/ambiguous VIN representations are sent to review; the app does not invent an 8-vs-17 matching rule.</p>
        </section>

        <section className="uc03-c2-panel">
          <div className="uc03-c2-panel__heading"><div><span>4</span><h2>Payment verification</h2></div><small>{workspace.payments.length} payment{workspace.payments.length === 1 ? '' : 's'}</small></div>
          {workspace.payments.length === 0 ? <p>No payment records are linked to this Journey yet.</p> : (
            <div className="uc03-c2-payments">
              {workspace.payments.map((payment) => (
                <div key={payment.paymentId}>
                  <strong>{payment.currencyCode} {payment.amount}</strong>
                  <span>{friendly(payment.paymentMethodCode)} · {payment.paymentReference || 'No reference'}</span>
                  <StatusPill value={payment.verificationResult || 'UNVERIFIED'} compact />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="uc03-c2-panel uc03-c2-panel--wide">
          <div className="uc03-c2-panel__heading"><div><span>5</span><h2>Audit flags</h2></div><small>{workspace.flags.length} total</small></div>
          {workspace.flags.length === 0 ? <p>No Booking/Delivery flags are currently recorded.</p> : (
            <div className="uc03-c2-flags">
              {workspace.flags.map((flag) => (
                <article key={flag.flagId}>
                  <StatusPill value={flag.severity} compact />
                  <div><strong>{flag.title}</strong><p>{flag.description || flag.ruleKey || flag.type}</p></div>
                  <StatusPill value={flag.status} compact />
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {actionError && <p className="uc03-c2-error" role="alert">{mutationMessage(actionError)}</p>}

      <section className="uc03-c2-complete-bar">
        <div>
          <strong>{completed ? 'Delivery has been recorded as completed.' : 'Physical handover complete?'}</strong>
          <p>Audit gaps do not erase or block the physical Delivery event. They remain visible as open audit work.</p>
        </div>
        <div className="uc03-c2-actions">
          <Link to="/dashboard" className="uc03-c1-secondary">Back to work list</Link>
          {!completed && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Record physical Delivery as completed? Outstanding audit gaps will remain open.')) completeMutation.mutate();
              }}
              disabled={completeMutation.isPending}
            >
              {completeMutation.isPending ? 'Recording…' : 'Complete Delivery'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
