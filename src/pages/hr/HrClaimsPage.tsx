import { Link } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import { hrErrorMessage } from '../../services/hr/client';
import ClaimList from '../../features/hr/claims/ClaimList';
import ClaimSummaryCard from '../../features/hr/claims/ClaimSummaryCard';
import { useClaimAccess, useClaimSummary, useMyClaims } from '../../features/hr/claims/claimQueries';
import '../../styles/hr-claims.css';

/** My claims: this month's travel against the limit, and every claim I have sent. */
export default function HrClaimsPage() {
  const access = useClaimAccess();
  const summary = useClaimSummary('', access.isEmployee);
  const claims = useMyClaims(access.isEmployee);

  const actions = (
    <>
      {access.canListAll && <Link className="uc01-admin-button" to="/hr/claims/all">All claims</Link>}
      {access.isEmployee && <Link className="uc01-admin-button uc01-admin-button--primary" to="/hr/claims/new">Submit a claim</Link>}
    </>
  );

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!access.isEmployee) {
    return (
      <section className="uc01-admin-page hr-page hrc-page" aria-label="My claims">
        <PageHeader eyebrow="HR" title="My claims" actions={actions} />
        <div className="uc01-admin-state">
          <strong>Your login is not linked to an employee record.</strong>
          <span>Claims are made by employees. Ask HR to link your login to your employee record.</span>
        </div>
      </section>
    );
  }

  const items = claims.data ?? [];
  const sentBack = items.filter((c) => c.status === 'CORRECTION_REQUESTED').length;

  return (
    <section className="uc01-admin-page hr-page hrc-page" aria-label="My claims">
      <PageHeader
        eyebrow="HR"
        title="My claims"
        description="Send an expense with its receipt photos and follow it until it is paid with your salary."
        actions={actions}
      />

      {summary.isLoading && <div className="uc01-admin-state">Loading this month's limits…</div>}
      {summary.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>This month's travel total could not be loaded.</strong>
          <span>{hrErrorMessage(summary.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => void summary.refetch()}>Try again</button>
        </div>
      )}
      {summary.data && <ClaimSummaryCard summary={summary.data} />}

      {sentBack > 0 && (
        <div className="hrc-callout hrc-callout--action" role="status">
          <strong>{sentBack === 1 ? '1 claim was sent back to you' : `${sentBack} claims were sent back to you`}</strong>
          <span>Open it, read the reason, correct it and send it again.</span>
        </div>
      )}

      <div className="hrc-listhead">
        <h2>Your claims</h2>
        <button type="button" className="uc01-admin-button uc01-admin-button--compact" onClick={() => { void claims.refetch(); void summary.refetch(); }} disabled={claims.isFetching}>
          {claims.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {claims.isLoading && <div className="uc01-admin-state">Loading your claims…</div>}
      {claims.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>Your claims could not be loaded.</strong>
          <span>{hrErrorMessage(claims.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => void claims.refetch()}>Try again</button>
        </div>
      )}
      {claims.data && items.length === 0 && (
        <div className="uc01-admin-state">
          <strong>You have not sent any claims yet.</strong>
          <span>Travel and meals can be claimed with a photo of the receipt.</span>
          <Link className="uc01-admin-button uc01-admin-button--primary hrc-inline-button" to="/hr/claims/new">Submit a claim</Link>
        </div>
      )}
      {items.length > 0 && <ClaimList claims={items} label="Your claims" />}
    </section>
  );
}
