import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  RESULT_LABEL,
  fieldLabel,
  getJourneyVerified,
  markJourneyVerified,
  shown,
  withdrawJourneyVerified,
} from '../../../services/audit-core/uc03VerifiedBookings';

/**
 * Journey 360: the booking's verified mark (product owner 2026-11-17). A Team Lead
 * or Reviewer who has checked the figures against the papers marks it verified, with
 * a comment saying what was checked. From then on the system compares it every
 * night and after each deploy; the tag says whether it still matches.
 */
export default function VerifiedBookingControl({ tenantId, journeyId, accessToken }: {
  tenantId: string;
  journeyId: string;
  accessToken?: string;
}) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'mark' | 'withdraw' | 'details'>();
  const [text, setText] = useState('');
  const key = ['p2-journey-verified', tenantId, journeyId];
  const state = useQuery({ queryKey: key, queryFn: () => getJourneyVerified(tenantId, journeyId, accessToken) });
  const done = () => { setDialog(undefined); setText(''); void queryClient.invalidateQueries({ queryKey: key }); };
  const mark = useMutation({ mutationFn: () => markJourneyVerified(tenantId, journeyId, text.trim(), accessToken), onSuccess: done });
  const withdraw = useMutation({ mutationFn: () => withdrawJourneyVerified(tenantId, journeyId, text.trim(), accessToken), onSuccess: done });

  if (!state.data?.canSee) return null;
  const verified = state.data.verified;
  const result = verified?.lastResult ?? 'MATCHES';
  const tone = result === 'MATCHES' ? 'success' : result === 'PAPERS_CHANGED' ? 'progress' : 'danger';
  const busy = mark.isPending || withdraw.isPending;
  const failure = mark.error ?? withdraw.error;

  return (
    <>
      {verified ? (
        <button type="button" className={`p2w-chip p2w-chip--${tone} vb-chip`} onClick={() => setDialog('details')}
          title={`Verified by ${verified.verifiedBy}`}>
          Verified · {RESULT_LABEL[result]}
        </button>
      ) : state.data.canMark ? (
        <button type="button" className="p2w-button p2w-button--secondary" onClick={() => setDialog('mark')}>
          Mark as verified
        </button>
      ) : null}

      {dialog ? (
        <div className="p2w-dialog-backdrop" role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDialog(undefined); }}>
          {dialog === 'details' && verified ? (
            <div className="p2w-dialog p2w-raise vb-dialog" role="dialog" aria-modal="true" aria-labelledby="vb-details">
              <h3 id="vb-details">Verified booking</h3>
              <p>
                Verified by <strong>{verified.verifiedBy}</strong>
                {verified.verifiedRole ? ` (${verified.verifiedRole})` : ''} on {new Date(verified.verifiedAt).toLocaleString('en-IN')}.
                {verified.comment ? <><br /><span className="p2w-muted">{verified.comment}</span></> : null}
              </p>
              <p>
                Last compared {verified.lastCheckedAt ? new Date(verified.lastCheckedAt).toLocaleString('en-IN') : '—'}:{' '}
                <strong>{RESULT_LABEL[result]}</strong>.
              </p>
              {verified.changes.length ? (
                <table className="p2du-table p2du-table--stack">
                  <thead><tr><th>Figure</th><th>As verified</th><th>Now</th></tr></thead>
                  <tbody>
                    {verified.changes.map((c) => (
                      <tr key={c.field}>
                        <td data-label="Figure">{fieldLabel(c.field)}</td>
                        <td data-label="As verified" className="num">{shown(c.verified)}</td>
                        <td data-label="Now" className="num">{shown(c.now)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <div className="p2w-dialog__actions">
                {state.data.canMark ? (
                  <>
                    <button type="button" className="p2w-button p2w-button--ghost" onClick={() => setDialog('withdraw')}>Withdraw</button>
                    <button type="button" className="p2w-button p2w-button--secondary" onClick={() => setDialog('mark')}>Verify again</button>
                  </>
                ) : null}
                <button type="button" className="p2w-button p2w-button--primary" autoFocus onClick={() => setDialog(undefined)}>Close</button>
              </div>
            </div>
          ) : (
            <form className="p2w-dialog p2w-raise vb-dialog" role="dialog" aria-modal="true" aria-labelledby="vb-form"
              onSubmit={(event) => { event.preventDefault(); if (dialog === 'mark') mark.mutate(); else withdraw.mutate(); }}>
              <h3 id="vb-form">{dialog === 'mark' ? 'Mark this booking as verified?' : 'Withdraw the verified mark?'}</h3>
              <p>
                {dialog === 'mark'
                  ? 'Mark it only after checking the Deal, the payments and the Audit Summary against the papers. Its figures as they are now are kept; the system compares them every night and after each change to the system.'
                  : 'The booking is no longer compared.'}
              </p>
              <label className="p2w-raise__field">
                <span>{dialog === 'mark' ? 'What you checked' : 'Reason'}</span>
                <textarea rows={3} value={text} maxLength={2000} autoFocus
                  placeholder={dialog === 'mark' ? 'For example: NDC charges, discounts, receipts and loan checked with the papers' : ''}
                  onChange={(event) => setText(event.target.value)} />
              </label>
              {failure ? (
                <div className="p2w-alert p2w-alert--error" role="alert">
                  {failure instanceof Error && failure.message ? failure.message : 'That did not go through.'}
                </div>
              ) : null}
              <div className="p2w-dialog__actions">
                <button type="button" className="p2w-button p2w-button--ghost" disabled={busy} onClick={() => setDialog(undefined)}>Cancel</button>
                <button type="submit" className="p2w-button p2w-button--primary"
                  disabled={busy || (dialog === 'mark' && text.trim().length < 5)}>
                  {busy ? 'Saving…' : dialog === 'mark' ? 'Mark as verified' : 'Withdraw'}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </>
  );
}
