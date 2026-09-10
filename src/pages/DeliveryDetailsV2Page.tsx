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

/**
 * Step 2 of Delivery capture -- one combined submission, not three separate
 * ones. Previously each section (intimation, VIN/chassis, photo) saved
 * itself immediately behind its own "Save" button, and a final, separate
 * "Submit" button closed out document capture on top of that -- four
 * distinct network actions for what is conceptually one handover record.
 * The vehicle photograph still uploads on its own (it's a file, not a form
 * field, so it has to reach storage before anything else can reference it),
 * but intimation and VIN/chassis are now plain local fields that travel
 * together in the single "Submit Delivery Details" action at the bottom --
 * the same one-continuous-flow, one-action-at-the-end shape as the
 * Documents step this page follows.
 */
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
  const canSubmit = intimationComplete && !uploadingPhoto && !submitting;

  if (!project || !journeyId) return null;

  const refresh = async () => {
    await workspaceQuery.refetch();
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

  // One action: save whatever intimation/vehicle fields actually changed
  // (in sequence -- each carries the aggregate version forward from the
  // last write, since the two share one optimistic-concurrency version),
  // then close out document capture. Nothing here fires until this single
  // button is pressed.
  const submit = async () => {
    if (!canSubmit || !workspace) return;
    setSubmitting(true);
    setError(undefined);
    try {
      let version = workspace.delivery.aggregateVersion;

      const savedAnswer = workspace.intimation.answer === 'UNANSWERED' ? '' : workspace.intimation.answer;
      if (intimationAnswer && (intimationAnswer !== savedAnswer || intimationReason.trim() !== (workspace.intimation.reason || ''))) {
        const result = await recordDeliveryIntimation(
          project.tenantId,
          journeyId,
          intimationAnswer,
          version,
          accessToken,
          intimationReason,
        );
        version = result.aggregateVersion;
      }

      if (vin.trim() !== (workspace.vehicle.observedVin || '') || chassisNumber.trim() !== (workspace.vehicle.observedChassisNumber || '')) {
        const result = await recordDeliveryVehicleObservation(
          project.tenantId,
          journeyId,
          version,
          { vin, chassisNumber, sourceEvidenceId: vehiclePhoto?.evidenceId || null },
          accessToken,
        );
        version = result.aggregateVersion;
      }

      if (!captureAlreadySubmitted) {
        await submitDeliveryCaptureV2(project.tenantId, journeyId, accessToken);
      }
      // PC capture ends at the Work Queue. TL/system review is a separate workflow and
      // must never become the PC's next screen merely because Delivery capture finished.
      navigate('/dashboard', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delivery details could not be submitted.');
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
        description="Step 2 of 2 · Fill in what's available below, then submit once at the bottom -- nothing here saves on its own."
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
          <div><span className="uc03-c1-eyebrow">Handover</span><h2>Delivery confirmation</h2></div>
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

        <div className="uc03-booking-details-grid" style={{ marginTop: 14 }}>
          <label className="uc03-booking-field"><span>Observed VIN</span><input value={vin} onChange={(event) => setVin(event.target.value)} placeholder="Enter/read from vehicle" /></label>
          <label className="uc03-booking-field"><span>Observed chassis</span><input value={chassisNumber} onChange={(event) => setChassisNumber(event.target.value)} placeholder="Enter if available" /></label>
        </div>
        <div className="uc03-v2-carried-forward" style={{ marginTop: 8 }}>
          <strong>Expected from the journey</strong>
          <span>VIN: {workspace.vehicle.expectedVin || 'Not available'}</span>
          <span>Chassis: {workspace.vehicle.expectedChassisNumber || 'Not available'}</span>
          {workspace.vehicle.reconciliationStatus !== 'NOT_EVALUATED' && (
            <StatusPill value={workspace.vehicle.reconciliationStatus} compact />
          )}
        </div>

        <div className="uc03-booking-step-footer" style={{ marginTop: 14 }}>
          <span>Vehicle photograph (optional evidence, uploads immediately)</span>
          {vehiclePhoto ? (
            <label className="uc03-c1-secondary" aria-disabled={uploadingPhoto}>
              {uploadingPhoto ? 'Uploading…' : vehiclePhotoAvailable ? 'Replace Photo' : 'Take / Upload Photo'}
              <input type="file" accept="image/*" capture="environment" disabled={uploadingPhoto} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void uploadVehiclePhoto(file); }} />
            </label>
          ) : null}
        </div>
        {vehiclePhoto ? (
          <StatusPill value={vehiclePhotoAvailable ? 'UPLOADED' : vehiclePhotoExpected ? 'EXPECTED' : 'OPTIONAL'} compact />
        ) : (
          <div className="uc03-booking-journey-feedback is-warning" role="status">Vehicle-photo evidence is not configured for this Delivery.</div>
        )}
      </section>

      <section className="uc03-delivery-v2-summary" aria-label="Delivery context">
        <div><span>Delivery status</span><strong>{workspace.delivery.businessStatus || 'In progress'}</strong></div>
        <div><span>Payments linked</span><strong>{workspace.payments.length}</strong></div>
        <div><span>Audit flags</span><strong>{workspace.flags.length}</strong></div>
        <div><span>Vehicle check</span><strong>{workspace.vehicle.reconciliationStatus}</strong></div>
      </section>

      <section className="uc03-delivery-v2-submit-bar">
        <div>
          <strong>{canSubmit ? 'Ready to submit Delivery details' : 'Complete Delivery intimation'}</strong>
          <span>{!intimationComplete ? 'Delivery intimation is required. ' : vehiclePhotoExpected && !vehiclePhotoAvailable ? 'Expected vehicle-photo evidence is missing; it will not block progression. ' : ''}One submission saves intimation, VIN/chassis, and closes out document capture together, then returns you to the Work Queue.</span>
        </div>
        <button type="button" className="uc03-c1-primary" disabled={!canSubmit} onClick={() => void submit()}>{submitting ? 'Submitting…' : 'Submit Delivery Details'}</button>
      </section>
    </div>
  );
}
