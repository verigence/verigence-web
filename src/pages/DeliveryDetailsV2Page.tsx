import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import {
  assessDeliveryDocument,
  getDeliveryWorkspace,
  recordDeliveryIntimation,
  recordDeliveryVehicleObservation,
  uploadDeliveryEvidence,
  type DeliveryDocumentView,
} from '../services/audit-core/uc03Delivery';
import { submitDeliveryCaptureV2 } from '../services/audit-core/uc03DeliveryCaptureV2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-document-capture-v2.css';
import '../styles/uc03-delivery-capture-v2.css';

function isVehiclePhoto(document: DeliveryDocumentView): boolean {
  const value = `${document.requirementKey} ${document.documentTypeKey}`.toUpperCase();
  return value.includes('CAR_PICTURE') || value.includes('VEHICLE_PICTURE') || value.includes('VEHICLE_PHOTO') || value.includes('CAR_PHOTO');
}

export default function DeliveryDetailsV2Page() {
  const { journeyId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [intimationAnswer, setIntimationAnswer] = useState<'YES' | 'NO' | ''>('');
  const [intimationReason, setIntimationReason] = useState('');
  const [vin, setVin] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [savingIntimation, setSavingIntimation] = useState(false);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
  const captureAlreadySubmitted = searchParams.get('captureSubmitted') === '1';
  const workspaceQuery = useQuery({
    queryKey: ['uc03-delivery-details-v2', project?.tenantId, journeyId],
    queryFn: () => getDeliveryWorkspace(project!.tenantId, journeyId, accessToken),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const workspace = workspaceQuery.data;

  useEffect(() => {
    if (!workspace) return;
    setIntimationAnswer(workspace.intimation.answer === 'UNANSWERED' ? '' : workspace.intimation.answer);
    setIntimationReason(workspace.intimation.reason || '');
    setVin(workspace.vehicle.observedVin || '');
    setChassisNumber(workspace.vehicle.observedChassisNumber || '');
  }, [workspace]);

  const vehiclePhoto = useMemo(() => workspace?.documents.find(isVehiclePhoto), [workspace?.documents]);
  const vehiclePhotoExpected = Boolean(vehiclePhoto && vehiclePhoto.requirementLevel === 'REQUIRED' && vehiclePhoto.applicabilityState !== 'NOT_APPLICABLE');
  const vehiclePhotoAvailable = Boolean(vehiclePhoto?.evidenceId);
  const intimationComplete = intimationAnswer === 'YES' || (intimationAnswer === 'NO' && Boolean(intimationReason.trim()));
  const canSubmit = intimationComplete && !savingIntimation && !savingVehicle && !uploadingPhoto && !submitting;

  if (!project || !journeyId) return null;

  const refresh = async () => {
    await workspaceQuery.refetch();
  };

  const saveIntimation = async () => {
    if (!workspace || !intimationAnswer) return;
    if (intimationAnswer === 'NO' && !intimationReason.trim()) {
      setError('Reason is required when Delivery was not intimated.');
      return;
    }
    setSavingIntimation(true);
    setError(undefined);
    try {
      await recordDeliveryIntimation(
        project.tenantId,
        journeyId,
        intimationAnswer,
        workspace.delivery.aggregateVersion,
        accessToken,
        intimationReason,
      );
      await refresh();
      setMessage('Delivery intimation saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delivery intimation could not be saved.');
    } finally {
      setSavingIntimation(false);
    }
  };

  const saveVehicle = async () => {
    if (!workspace || (!vin.trim() && !chassisNumber.trim())) return;
    setSavingVehicle(true);
    setError(undefined);
    try {
      await recordDeliveryVehicleObservation(
        project.tenantId,
        journeyId,
        workspace.delivery.aggregateVersion,
        { vin, chassisNumber, sourceEvidenceId: vehiclePhoto?.evidenceId || null },
        accessToken,
      );
      await refresh();
      setMessage('Vehicle details saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Vehicle details could not be saved.');
    } finally {
      setSavingVehicle(false);
    }
  };

  const uploadVehiclePhoto = async (file?: File) => {
    if (!workspace || !vehiclePhoto || !file) return;
    setUploadingPhoto(true);
    setError(undefined);
    try {
      const evidence = await uploadDeliveryEvidence(project.tenantId, journeyId, vehiclePhoto, file, accessToken);
      await assessDeliveryDocument(
        project.tenantId,
        journeyId,
        vehiclePhoto.requirementKey,
        'YES',
        workspace.delivery.aggregateVersion,
        accessToken,
        evidence.evidenceId,
        'Vehicle photograph captured during Delivery.',
      );
      await refresh();
      setMessage('Vehicle photograph added.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Vehicle photograph could not be uploaded.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(undefined);
    try {
      if (!captureAlreadySubmitted) {
        await submitDeliveryCaptureV2(project.tenantId, journeyId, accessToken);
      }
      navigate(`/v2/deliveries/${journeyId}/review`, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delivery capture could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  };

  if (workspaceQuery.isPending) return <div className="uc03-c1-loading" role="status">Loading Delivery Details…</div>;

  if (workspaceQuery.isError || !workspace) {
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy">
          <strong>We couldn't open Delivery Details.</strong>
          <p>{workspaceQuery.error instanceof Error ? workspaceQuery.error.message : 'Please try again.'}</p>
        </div>
        <button type="button" className="user-menu-button" onClick={() => navigate(`/v2/deliveries/${journeyId}`)}>Back to Documents</button>
      </section>
    );
  }

  return (
    <div className="screen-stack uc03-booking-journey uc03-v2-capture uc03-delivery-v2-page">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate(`/v2/deliveries/${journeyId}`)}>← Documents</button>
        <span>Delivery capture</span>
      </div>

      <PageHeader
        eyebrow="Delivery · V2"
        title="Delivery Details & Vehicle Evidence"
        description="Step 2 of 2 · Record the Delivery handover details and any vehicle evidence available, then continue to Review."
      />

      <nav className="uc03-booking-steps" aria-label="Delivery capture steps">
        <button type="button" onClick={() => navigate(`/v2/deliveries/${journeyId}`)}>1 <span>Documents</span></button>
        <button type="button" className="is-active" disabled>2 <span>Delivery Details</span></button>
      </nav>

      {message ? <div className="uc03-booking-journey-feedback is-success" role="status">{message}</div> : null}
      {error ? <div className="uc03-booking-journey-feedback is-error" role="alert">{error}</div> : null}

      {captureAlreadySubmitted ? (
        <div className="uc03-booking-journey-feedback is-warning" role="status">
          The document step was already submitted by the earlier Delivery flow. Complete the Delivery details below; Verigence will not submit the document capture a second time.
        </div>
      ) : null}

      <section className="uc03-booking-step-panel">
        <header className="uc03-booking-step-heading">
          <div><span className="uc03-c1-eyebrow">Step 2</span><h2>Delivery intimation</h2></div>
          <span>Record what happened at handover.</span>
        </header>

        <fieldset className="uc03-booking-choice">
          <legend>Was this Delivery intimated to you?</legend>
          <label><input type="radio" checked={intimationAnswer === 'YES'} onChange={() => { setIntimationAnswer('YES'); setError(undefined); }} /> Yes</label>
          <label><input type="radio" checked={intimationAnswer === 'NO'} onChange={() => { setIntimationAnswer('NO'); setError(undefined); }} /> No</label>
        </fieldset>
        {intimationAnswer === 'NO' ? (
          <label className="uc03-booking-field">
            <span>Reason when not intimated</span>
            <textarea value={intimationReason} onChange={(event) => setIntimationReason(event.target.value)} placeholder="Enter reason" />
          </label>
        ) : null}
        <div className="uc03-booking-step-footer">
          <span>{workspace.intimation.answer === 'UNANSWERED' ? 'Save the Delivery intimation before continuing.' : `Saved as ${workspace.intimation.answer}.`}</span>
          <button type="button" className="uc03-c1-secondary" disabled={savingIntimation || !intimationAnswer} onClick={() => void saveIntimation()}>{savingIntimation ? 'Saving…' : 'Save Intimation'}</button>
        </div>
      </section>

      <section className="uc03-booking-step-panel">
        <header className="uc03-booking-step-heading">
          <div><span className="uc03-c1-eyebrow">Vehicle</span><h2>VIN / chassis observation</h2></div>
          <StatusPill value={workspace.vehicle.reconciliationStatus} compact />
        </header>
        <div className="uc03-v2-carried-forward">
          <strong>Expected from the journey</strong>
          <span>VIN: {workspace.vehicle.expectedVin || 'Not available'}</span>
          <span>Chassis: {workspace.vehicle.expectedChassisNumber || 'Not available'}</span>
        </div>
        <div className="uc03-booking-details-grid">
          <label className="uc03-booking-field"><span>Observed VIN</span><input value={vin} onChange={(event) => setVin(event.target.value)} placeholder="Enter/read from vehicle" /></label>
          <label className="uc03-booking-field"><span>Observed chassis</span><input value={chassisNumber} onChange={(event) => setChassisNumber(event.target.value)} placeholder="Enter if available" /></label>
        </div>
        <div className="uc03-booking-step-footer">
          <span>Record what is visible on the vehicle. Any mismatch remains an audit observation.</span>
          <button type="button" className="uc03-c1-secondary" disabled={savingVehicle || (!vin.trim() && !chassisNumber.trim())} onClick={() => void saveVehicle()}>{savingVehicle ? 'Saving…' : 'Save Vehicle Details'}</button>
        </div>
      </section>

      <section className="uc03-booking-step-panel">
        <header className="uc03-booking-step-heading">
          <div><span className="uc03-c1-eyebrow">Evidence</span><h2>Vehicle photograph</h2></div>
          <StatusPill value={vehiclePhotoAvailable ? 'UPLOADED' : vehiclePhotoExpected ? 'EXPECTED' : 'OPTIONAL'} compact />
        </header>
        {vehiclePhoto ? (
          <div className="uc03-booking-step-footer">
            <span>{vehiclePhotoAvailable ? 'Vehicle photograph is linked to this Delivery.' : vehiclePhotoExpected ? 'Vehicle photograph is expected audit evidence. If it is unavailable, Delivery can still continue and the missing evidence remains visible for follow-up.' : 'Add a vehicle photograph when available. This is evidence-only and is not part of document classification.'}</span>
            <label className="uc03-c1-primary" aria-disabled={uploadingPhoto}>
              {uploadingPhoto ? 'Uploading…' : vehiclePhotoAvailable ? 'Replace Photo' : 'Take / Upload Photo'}
              <input type="file" accept="image/*" capture="environment" disabled={uploadingPhoto} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void uploadVehiclePhoto(file); }} />
            </label>
          </div>
        ) : <div className="uc03-booking-journey-feedback is-warning" role="status">Vehicle-photo evidence is not configured for this Delivery.</div>}
      </section>

      <section className="uc03-delivery-v2-summary" aria-label="Delivery context">
        <div><span>Delivery status</span><strong>{workspace.delivery.businessStatus || 'In progress'}</strong></div>
        <div><span>Payments linked</span><strong>{workspace.payments.length}</strong></div>
        <div><span>Audit flags</span><strong>{workspace.flags.length}</strong></div>
        <div><span>Vehicle check</span><strong>{workspace.vehicle.reconciliationStatus}</strong></div>
      </section>

      <section className="uc03-delivery-v2-submit-bar">
        <div>
          <strong>{canSubmit ? (captureAlreadySubmitted ? 'Ready for Delivery Review' : 'Ready to submit Delivery capture') : 'Complete Delivery intimation'}</strong>
          <span>{!intimationComplete ? 'Delivery intimation is required. ' : vehiclePhotoExpected && !vehiclePhotoAvailable ? 'Expected vehicle-photo evidence is missing; it will not block progression. ' : ''}{captureAlreadySubmitted ? 'Continue to Delivery Review.' : 'Submitting opens Delivery Review.'}</span>
        </div>
        <button type="button" className="uc03-c1-primary" disabled={!canSubmit} onClick={() => void submit()}>{submitting ? 'Working…' : captureAlreadySubmitted ? 'Continue → Review' : 'Submit Delivery → Review'}</button>
      </section>
    </div>
  );
}
