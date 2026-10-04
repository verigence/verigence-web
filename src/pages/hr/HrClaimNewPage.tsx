import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import { hrErrorMessage } from '../../services/hr/client';
import { submitClaim, type ClaimInput } from '../../services/hr/claims';
import { useSessionStore } from '../../store/sessionStore';
import ClaimForm from '../../features/hr/claims/ClaimForm';
import { describeClaimError, type ClaimProblem } from '../../features/hr/claims/claimErrors';
import { claimKeys, useClaimAccess, useClaimCategories } from '../../features/hr/claims/claimQueries';
import '../../styles/hr-claims.css';

/** Submit a new claim. Sent once per press; a refusal is shown and the person decides what to do. */
export default function HrClaimNewPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useClaimAccess();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const categories = useClaimCategories(access.isEmployee);
  const [problem, setProblem] = useState<ClaimProblem | null>(null);
  const lastPerKm = useRef(false);

  const send = useMutation({
    mutationFn: (input: ClaimInput) => submitClaim(accessToken!, input),
    onSuccess: async (claim) => {
      await queryClient.invalidateQueries({ queryKey: claimKeys.all });
      navigate(`/hr/claims/${claim.claimId}`, { replace: true, state: { flash: 'submitted' } });
    },
    onError: (error) => setProblem(describeClaimError(error, lastPerKm.current)),
  });

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!access.isEmployee) {
    return (
      <section className="uc01-admin-page hr-page hrc-page" aria-label="Submit a claim">
        <PageHeader eyebrow="HR" title="Submit a claim" />
        <div className="uc01-admin-state uc01-admin-state--error">
          <strong>Your login is not linked to an employee record.</strong>
          <span>Claims are made by employees. Ask HR to link your login to your employee record.</span>
          <Link to="/hr/claims">Back to claims</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="uc01-admin-page hr-page hrc-page" aria-label="Submit a claim">
      <PageHeader
        eyebrow="HR"
        title="Submit a claim"
        description="Travel and meals. Attach a photo of each receipt. HR checks the limits again when you send."
        actions={<Link className="uc01-admin-button" to="/hr/claims" onClick={(e) => { if (send.isPending) e.preventDefault(); }}>Cancel</Link>}
      />
      {categories.isLoading && <div className="uc01-admin-state">Loading categories…</div>}
      {categories.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>The claim categories could not be loaded.</strong>
          <span>{hrErrorMessage(categories.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => void categories.refetch()}>Try again</button>
        </div>
      )}
      {categories.data && categories.data.length === 0 && (
        <div className="uc01-admin-state"><strong>No claim categories are set up yet.</strong><span>Ask HR to set them up.</span></div>
      )}
      {categories.data && categories.data.length > 0 && (
        <div className="section-card hrc-formcard">
          <ClaimForm
            categories={categories.data}
            busy={send.isPending}
            problem={problem}
            submitLabel="Send claim"
            onCancel={() => navigate('/hr/claims')}
            onSubmit={(input) => {
              setProblem(null);
              lastPerKm.current = Boolean(categories.data?.find((c) => c.code === input.category)?.perKm);
              send.mutate(input);
            }}
          />
        </div>
      )}
    </section>
  );
}
