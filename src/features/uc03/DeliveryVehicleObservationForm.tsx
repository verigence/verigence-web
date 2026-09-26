import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getDeliveryVehicleObservationProposal, getDeliveryWorkspace } from '../../services/audit-core/uc03Delivery';
import '../../styles/uc03-journey-documents.css';

const RECONCILIATION_LABEL: Record<string, string> = {
  MATCH: 'Matches the journey’s expected VIN/Chassis',
  MISMATCH: 'Does not match the journey’s expected VIN/Chassis',
  REVIEW_REQUIRED: 'No comparable expected VIN/Chassis on file yet',
};

/**
 * The PC's own half of the photo-or-manual-VIN vehicle-proof requirement
 * (see uc03_delivery_commands.py::_ensure_vehicle_photos_task's own
 * docstring): shown inline on the DELIVERY_VEHICLE_PHOTOS_MISSING Task
 * Queue card when a photo isn't available. Direct product instruction: a
 * PC's own upload flow stays 100% entry-free -- these two fields are the
 * one exception, and only reachable through this Task Queue action, never
 * a standalone form page. Submitting here does not itself record the
 * observation -- it raises a DELIVERY_VIN_MANUAL_ENTRY_REVIEW task for a TL
 * to approve first (see propose_delivery_vehicle_observation's own
 * docstring), same as this page's other proposal-shaped task types.
 */
export default function DeliveryVehicleObservationForm({
  tenantId,
  journeyId,
  accessToken,
  onSubmit,
  onSubmitted,
}: {
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  onSubmit: (aggregateVersion: number, vin: string, chassisNumber: string) => Promise<unknown>;
  onSubmitted?: () => void;
}) {
  const [vin, setVin] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);

  const workspaceQuery = useQuery({
    queryKey: ['uc03-delivery-workspace-vehicle-observation', tenantId, journeyId],
    queryFn: () => getDeliveryWorkspace(tenantId, journeyId, accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const canSubmit = Boolean(vin.trim() || chassisNumber.trim()) && !busy;

  const submit = async () => {
    if (!canSubmit || !workspaceQuery.data) return;
    setBusy(true);
    setError(undefined);
    try {
      await onSubmit(workspaceQuery.data.delivery.aggregateVersion, vin, chassisNumber);
      setDone(true);
      onSubmitted?.();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'That could not be submitted. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="uc03-jd-success" role="status">
        Sent for Team Lead approval — this task is done on your side.
      </div>
    );
  }

  if (workspaceQuery.isPending) {
    return <p className="uc03-jd-empty">Loading this Delivery…</p>;
  }

  if (workspaceQuery.isError) {
    return <p className="uc03-jd-empty">This Delivery could not be loaded. Try again.</p>;
  }

  return (
    <>
      <div className="uc03-booking-details-grid">
        <label className="uc03-booking-field">
          <span>Observed VIN</span>
          <input value={vin} onChange={(event) => setVin(event.target.value)} placeholder="Enter/read from vehicle" disabled={busy} />
        </label>
        <label className="uc03-booking-field">
          <span>Observed chassis</span>
          <input value={chassisNumber} onChange={(event) => setChassisNumber(event.target.value)} placeholder="Enter if available" disabled={busy} />
        </label>
      </div>
      {error ? <div className="uc03-jd-error" role="alert">{error}</div> : null}
      <div className="uc03-jd-sku-picker__actions">
        <button type="button" className="uc03-c3-primary" disabled={!canSubmit} onClick={() => void submit()}>
          {busy ? 'Submitting…' : 'Submit for Team Lead approval'}
        </button>
      </div>
    </>
  );
}

/**
 * The TL's own half: shows exactly what the PC proposed (no photographic
 * proof behind it, which is why this exists at all) before Approve/Reject.
 * Approve writes it via apply_confirmed_delivery_vin_observation
 * (tasks_api.py's Complete-task dispatch, outcome=CORRECT); Reject needs no
 * special handling here -- nothing is written, and a fresh PC task reopens
 * on its own once the self-heal sweep notices the gap is still open.
 */
export function DeliveryVinObservationReview({
  tenantId,
  journeyId,
  workflowTaskId,
  accessToken,
  onDecide,
  busy,
}: {
  tenantId: string;
  journeyId: string;
  workflowTaskId: string;
  accessToken?: string;
  onDecide: (outcome: 'CORRECT' | 'INCORRECT') => void;
  busy: boolean;
}) {
  const proposalQuery = useQuery({
    queryKey: ['uc03-delivery-vin-observation-proposal', tenantId, journeyId, workflowTaskId],
    queryFn: () => getDeliveryVehicleObservationProposal(tenantId, journeyId, workflowTaskId, accessToken),
    enabled: Boolean(tenantId && journeyId && workflowTaskId && accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (proposalQuery.isPending) {
    return <p className="uc03-jd-empty">Loading the proposed VIN/Chassis…</p>;
  }
  if (proposalQuery.isError || !proposalQuery.data) {
    return <p className="uc03-jd-empty">This proposal could not be loaded. Try again.</p>;
  }

  const proposal = proposalQuery.data;
  return (
    <>
      <div className="uc03-v2-carried-forward">
        <span>Proposed VIN: {proposal.observedVin || 'Not provided'}</span>
        <span>Proposed chassis: {proposal.observedChassisNumber || 'Not provided'}</span>
        <span>{RECONCILIATION_LABEL[proposal.computedReconciliationStatus] ?? proposal.computedReconciliationStatus}</span>
      </div>
      <button type="button" className="revq-btn revq-btn--reject" disabled={busy} onClick={() => onDecide('INCORRECT')}>
        Reject
      </button>
      <button type="button" className="revq-btn revq-btn--accept" disabled={busy} onClick={() => onDecide('CORRECT')}>
        Approve
      </button>
    </>
  );
}
