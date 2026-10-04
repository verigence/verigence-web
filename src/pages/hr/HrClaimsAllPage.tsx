import { useState } from 'react';
import { Link } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import { hrErrorMessage } from '../../services/hr/client';
import { CLAIM_STATUSES, type ClaimStatus } from '../../services/hr/claims';
import ClaimList from '../../features/hr/claims/ClaimList';
import { statusLabel } from '../../features/hr/claims/claimFormat';
import { useAllClaims, useClaimAccess } from '../../features/hr/claims/claimQueries';
import '../../styles/hr-claims.css';

/** The service returns at most this many claims, newest first. */
const SERVICE_LIMIT = 300;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** HR and Finance: every claim, filterable, each opening the same claim page. */
export default function HrClaimsAllPage() {
  const access = useClaimAccess();
  const [status, setStatus] = useState<'' | ClaimStatus>('');
  const [month, setMonth] = useState('');
  const [person, setPerson] = useState('');
  const monthOk = month === '' || MONTH.test(month);
  const list = useAllClaims({ status, month: monthOk ? month : '' }, access.canListAll);

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!access.canListAll) {
    return (
      <section className="uc01-admin-page hr-page hrc-page" aria-label="All claims">
        <PageHeader eyebrow="HR" title="All claims" />
        <div className="uc01-admin-state uc01-admin-state--error">
          <strong>You do not have access to every claim.</strong>
          <span>Only HR and Finance can list all claims. You can see your own under My claims.</span>
          <Link to="/hr/claims">My claims</Link>
        </div>
      </section>
    );
  }

  const needle = person.trim().toLowerCase();
  const all = list.data ?? [];
  const items = needle
    ? all.filter((c) => c.employeeName.toLowerCase().includes(needle) || c.employeeCode.toLowerCase().includes(needle))
    : all;
  const filtered = Boolean(status || month || needle);

  return (
    <section className="uc01-admin-page hr-page hrc-page" aria-label="All claims">
      <PageHeader
        eyebrow="HR"
        title="All claims"
        description="Every reimbursement claim, from submission to payment. Open one to see its receipts and history."
        actions={<Link className="uc01-admin-button" to="/hr/claims">My claims</Link>}
      />

      <div className="uc01-admin-toolbar hrc-filters">
        <label className="uc01-admin-search">
          <span>Person</span>
          <input type="search" value={person} placeholder="Name or employee code" onChange={(e) => setPerson(e.target.value)} />
        </label>
        <label className="uc01-admin-filter">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as '' | ClaimStatus)}>
            <option value="">All statuses</option>
            {CLAIM_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </label>
        <label className="uc01-admin-filter">
          <span>Payroll month</span>
          <input type="month" value={month} placeholder="YYYY-MM" aria-invalid={!monthOk} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <button type="button" className="uc01-admin-button" onClick={() => void list.refetch()} disabled={list.isFetching}>
          {list.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {!monthOk && <div className="uc01-admin-message uc01-admin-message--error" role="alert">Enter the payroll month like 2026-10.</div>}

      {list.isLoading && <div className="uc01-admin-state">Loading claims…</div>}
      {list.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>Claims could not be loaded.</strong>
          <span>{hrErrorMessage(list.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => void list.refetch()}>Try again</button>
        </div>
      )}
      {list.data && (
        <>
          <p className="hr-count" aria-live="polite">{items.length === 1 ? '1 claim' : `${items.length} claims`}</p>
          {items.length === 0 ? (
            <div className="uc01-admin-state">
              <strong>{filtered ? 'No claims match these filters.' : 'No claims have been sent yet.'}</strong>
            </div>
          ) : (
            <ClaimList claims={items} label="All claims" />
          )}
          {all.length >= SERVICE_LIMIT && (
            <p className="hr-muted">Showing the latest {SERVICE_LIMIT} claims. Use the status and month filters to narrow the list.</p>
          )}
        </>
      )}
    </section>
  );
}
