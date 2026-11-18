import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  SEVERITY_LABEL,
  getJourneySeverity,
  setJourneySeverity,
  type ObservationSeverity,
} from '../../../services/audit-core/uc03ObservationSeverity';

/**
 * Journey 360: the journey's observation severity (product owner 2026-11-18). The
 * tag shows it (the system's, or the one a person set); a Reviewer, Team Lead or
 * Project Manager changes it with a reason, or sets it back to the system's.
 */
export default function ObservationSeverityControl({ tenantId, journeyId, accessToken }: {
  tenantId: string;
  journeyId: string;
  accessToken?: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<ObservationSeverity | 'SYSTEM'>('HIGH');
  const [reason, setReason] = useState('');
  const key = ['p2-journey-severity', tenantId, journeyId];
  const state = useQuery({ queryKey: key, queryFn: () => getJourneySeverity(tenantId, journeyId, accessToken) });
  const save = useMutation({
    mutationFn: () => setJourneySeverity(tenantId, journeyId, choice === 'SYSTEM' ? null : choice, reason.trim(), accessToken),
    onSuccess: () => {
      setOpen(false); setReason('');
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ['p2-journey-page'] });
      void queryClient.invalidateQueries({ queryKey: ['p2-360', tenantId, journeyId, 'remarks'] });
    },
  });
  const data = state.data;
  if (!data) return null;
  const severity = data.severity;
  if (!severity && !data.canChange) return null;
  const start = () => { setChoice(severity ?? 'HIGH'); setReason(''); setOpen(true); };

  return (
    <>
      <button type="button" disabled={!data.canChange}
        className={`p2w-chip obs-chip obs-chip--${(severity ?? 'none').toLowerCase()}`}
        title={[...data.reasons.map((r) => r.text), data.override ? `Set by ${data.override.by ?? data.override.role}: ${data.override.reason}` : '']
          .filter(Boolean).join('\n') || undefined}
        onClick={start}>
        {severity ? `Observation: ${SEVERITY_LABEL[severity]}` : 'Set observation severity'}
        {data.override ? ' · set by a person' : ''}
      </button>
      {open ? (
        <div className="p2w-dialog-backdrop" role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget && !save.isPending) setOpen(false); }}>
          <form className="p2w-dialog p2w-raise" role="dialog" aria-modal="true" aria-labelledby="obs-form"
            onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
            <h3 id="obs-form">Observation severity</h3>
            <p className="p2w-muted">
              {data.system ? `The system sets ${SEVERITY_LABEL[data.system]}` : 'The system sets none'}
              {data.reasons.length ? `: ${data.reasons.map((r) => r.text).join('; ')}.` : '.'}
            </p>
            <fieldset className="obs-choices">
              <legend className="p2w-visually-hidden">Severity</legend>
              {(['HIGH', 'MEDIUM', 'LOW'] as const).map((value) => (
                <label key={value} className={`obs-choice obs-choice--${value.toLowerCase()}`}>
                  <input type="radio" name="obs-severity" checked={choice === value} onChange={() => setChoice(value)} />
                  {SEVERITY_LABEL[value]}
                </label>
              ))}
              {data.override ? (
                <label className="obs-choice">
                  <input type="radio" name="obs-severity" checked={choice === 'SYSTEM'} onChange={() => setChoice('SYSTEM')} />
                  Back to the system&rsquo;s
                </label>
              ) : null}
            </fieldset>
            <label className="p2w-raise__field">
              <span>Reason</span>
              <textarea rows={3} value={reason} maxLength={2000} autoFocus onChange={(event) => setReason(event.target.value)}
                placeholder="Why this severity: it is recorded in the System remarks" />
            </label>
            {save.error ? (
              <div className="p2w-alert p2w-alert--error" role="alert">
                {save.error instanceof Error && save.error.message ? save.error.message : 'That did not go through.'}
              </div>
            ) : null}
            <div className="p2w-dialog__actions">
              <button type="button" className="p2w-button p2w-button--ghost" disabled={save.isPending} onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="p2w-button p2w-button--primary" disabled={save.isPending || reason.trim().length < 5}>
                {save.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
