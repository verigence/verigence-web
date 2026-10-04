import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import { HrHttpError, hrErrorMessage } from '../../services/hr/client';
import { cancelClaim, resubmitClaim, type ClaimInput } from '../../services/hr/claims';
import { useSessionStore } from '../../store/sessionStore';
import ClaimDetailView from '../../features/hr/claims/ClaimDetailView';
import ClaimForm from '../../features/hr/claims/ClaimForm';
import { describeClaimError, type ClaimProblem } from '../../features/hr/claims/claimErrors';
import { formatDate } from '../../features/hr/hrLabels';
import { claimKeys, useClaim, useClaimAccess, useClaimCategories } from '../../features/hr/claims/claimQueries';
import '../../styles/hr-claims.css';

const CANCELLABLE = ['SUBMITTED', 'CORRECTION_REQUESTED'];

/** One claim: its status, receipts and history; for the owner, Cancel and (when sent back) edit and resubmit. */
export default function HrClaimDetailPage() {
  const { claimId } = useParams<{ claimId: string }>();
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useClaimAccess();
  const location = useLocation();
  const queryClient = useQueryClient();
  const claim = useClaim(claimId);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [problem, setProblem] = useState<ClaimProblem | null>(null);
  const [cancelError, setCancelError] = useState('');
  const [flash, setFlash] = useState<string>(() => {
    const state = location.state as { flash?: string } | null;
    return state?.flash === 'submitted' ? 'Your claim was sent. You can follow it here.' : '';
  });
  const lastPerKm = useRef(false);

  const data = claim.data;
  const isOwner = Boolean(data?.isOwner);
  const canEdit = isOwner && data?.status === 'CORRECTION_REQUESTED';
  const canCancel = isOwner && Boolean(data) && CANCELLABLE.includes(data!.status);
  const categories = useClaimCategories(editing);

  const refresh = () => queryClient.invalidateQueries({ queryKey: claimKeys.all });

  const resubmit = useMutation({
    mutationFn: (input: ClaimInput) => resubmitClaim(accessToken!, claimId!, input),
    onSuccess: async () => {
      await refresh();
      setEditing(false);
      setProblem(null);
      setFlash('Your corrected claim was sent again. It starts the review from the beginning.');
    },
    onError: (error) => setProblem(describeClaimError(error, lastPerKm.current)),
  });

  const cancel = useMutation({
    mutationFn: () => cancelClaim(accessToken!, claimId!),
    onSuccess: async () => {
      setConfirmCancel(false);
      setFlash('The claim was cancelled.');
      await refresh();
    },
    onError: (error) => {
      setConfirmCancel(false);
      setCancelError(describeClaimError(error).message);
      // The claim may have moved on; show where it stands now.
      if (error instanceof HrHttpError && error.status === 409) void refresh();
    },
  });

  const back = isOwner || !access.canListAll ? '/hr/claims' : '/hr/claims/all';
  const backLabel = back === '/hr/claims' ? 'My claims' : 'All claims';

  const header = (
    <PageHeader
      eyebrow="HR"
      title="Claim"
      description={data ? `${data.categoryLabel}, ${formatDate(data.expenseDate)}` : undefined}
      actions={<Link className="uc01-admin-button" to={back}>{backLabel}</Link>}
    />
  );

  if (claim.isLoading || access.loading) {
    return (
      <section className="uc01-admin-page hr-page hrc-page" aria-label="Claim">
        {header}
        <div className="uc01-admin-state">Loading the claim…</div>
      </section>
    );
  }
  if (claim.isError || !data) {
    const missing = claim.error instanceof HrHttpError && claim.error.status === 404;
    return (
      <section className="uc01-admin-page hr-page hrc-page" aria-label="Claim">
        {header}
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>{missing ? 'This claim was not found.' : 'The claim could not be loaded.'}</strong>
          <span>{missing ? 'It may not exist, or it is not one you can see.' : hrErrorMessage(claim.error)}</span>
          {!missing && <button type="button" className="uc01-admin-button" onClick={() => void claim.refetch()}>Try again</button>}
        </div>
      </section>
    );
  }

  if (editing && canEdit) {
    return (
      <section className="uc01-admin-page hr-page hrc-page" aria-label="Correct claim">
        <PageHeader eyebrow="HR" title="Correct your claim" description="Change what is wrong, then send it again. It goes back to the first reviewer." />
        {categories.isLoading && <div className="uc01-admin-state">Loading categories…</div>}
        {categories.isError && (
          <div className="uc01-admin-state uc01-admin-state--error" role="alert">
            <strong>The claim categories could not be loaded.</strong>
            <span>{hrErrorMessage(categories.error)}</span>
            <button type="button" className="uc01-admin-button" onClick={() => void categories.refetch()}>Try again</button>
          </div>
        )}
        {categories.data && (
          <>
            <ClaimDetailNote claim={data} />
            <div className="section-card hrc-formcard">
              <ClaimForm
                categories={categories.data}
                claim={data}
                busy={resubmit.isPending}
                problem={problem}
                submitLabel="Send corrected claim"
                onCancel={() => { setEditing(false); setProblem(null); }}
                onSubmit={(input) => {
                  setProblem(null);
                  lastPerKm.current = Boolean(categories.data?.find((c) => c.code === input.category)?.perKm);
                  resubmit.mutate(input);
                }}
              />
            </div>
          </>
        )}
        {!categories.isLoading && !categories.data && (
          <button type="button" className="uc01-admin-button" onClick={() => setEditing(false)}>Back to the claim</button>
        )}
      </section>
    );
  }

  return (
    <section className="uc01-admin-page hr-page hrc-page" aria-label="Claim">
      {header}
      {flash && <div className="uc01-admin-message uc01-admin-message--success" role="status">{flash}</div>}
      {cancelError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{cancelError}</div>}

      {(canEdit || canCancel) && (
        <div className="hr-actions hrc-owner-actions">
          {canEdit && (
            <button type="button" className="uc01-admin-button uc01-admin-button--primary" onClick={() => { setFlash(''); setCancelError(''); setEditing(true); }}>
              Edit and send again
            </button>
          )}
          {canCancel && (
            <button type="button" className="uc01-admin-button uc01-admin-button--danger" onClick={() => { setCancelError(''); setConfirmCancel(true); }}>
              Cancel this claim
            </button>
          )}
        </div>
      )}

      <ClaimDetailView claim={data} showPerson={!isOwner} eagerReceipts={isOwner} />

      {confirmCancel && (
        <div className="uc01-admin-dialog-backdrop" role="presentation">
          <div className="uc01-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="claim-cancel-title">
            <div>
              <h2 id="claim-cancel-title">Cancel this claim?</h2>
              <p>The claim will be withdrawn and nobody will review it. You cannot undo this; send a new claim if you change your mind.</p>
            </div>
            <div className="uc01-admin-dialog__actions">
              <button type="button" className="uc01-admin-button" autoFocus disabled={cancel.isPending} onClick={() => setConfirmCancel(false)}>Keep claim</button>
              <button type="button" className="uc01-admin-button uc01-admin-button--danger-primary" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                {cancel.isPending ? 'Cancelling…' : 'Yes, cancel claim'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** The reviewer's reason, repeated above the form so the person fixes the right thing. */
function ClaimDetailNote({ claim }: { claim: { history: { event: string; note: string | null }[] } }) {
  const last = [...claim.history].reverse().find((entry) => entry.event === 'CORRECTION_REQUESTED');
  if (!last) return null;
  return (
    <div className="hrc-callout hrc-callout--action" role="note">
      <strong>Why it was sent back</strong>
      <span>{last.note || 'No reason was written.'}</span>
    </div>
  );
}
