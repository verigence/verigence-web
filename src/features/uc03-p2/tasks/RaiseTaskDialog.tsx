import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getP2JourneyAssignees, getP2Journeys, P2_RAISED_TASK_KINDS, raiseP2Task,
  type P2Assignee, type P2JourneyListItem, type P2RaisedTaskKind,
} from '../../../services/audit-core/uc03P2';

function errorText(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : 'The task could not be raised.';
}

export function assigneeLabel(person: P2Assignee): string {
  const name = person.displayName?.trim() || person.actorId;
  return person.journeyPc ? `${name} · this journey's PC` : name;
}

/** What blocks the form from being sent, if anything (same rules as the server). */
export function raiseTaskProblem(values: {
  journeyId: string; kind: P2RaisedTaskKind; description: string; amount: string; reason: string;
}): string | undefined {
  if (!values.journeyId) return 'Pick the journey first.';
  if (values.kind === 'SYSTEM_MR') {
    if (!(Number(values.amount) > 0)) return 'Enter the MR amount to enable.';
    if (values.reason.trim().length < 5) return 'Give the reason for the referral (at least 5 characters).';
    return undefined;
  }
  if (values.description.trim().length < 5) return 'Describe what the PC has to do (at least 5 characters).';
  return undefined;
}

/**
 * A Team Lead or PMO raises a task by hand (decision 2026-09-30): pick the
 * journey, the PC it goes to, the kind of task and describe it. The System
 * task (Enable MR) goes to the Team Lead with the amount and reason.
 */
export default function RaiseTaskDialog({ tenantId, accessToken, journeyId: presetJourneyId, onClose, onRaised }: {
  tenantId: string;
  accessToken?: string;
  /** The journey the queue is already filtered to, if any. */
  journeyId?: string;
  onClose: () => void;
  onRaised: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [journeyId, setJourneyId] = useState(presetJourneyId ?? '');
  const [assignee, setAssignee] = useState('');
  const [kind, setKind] = useState<P2RaisedTaskKind>('DOCUMENT_UPLOAD');
  const [priority, setPriority] = useState<'NORMAL' | 'HIGH'>('NORMAL');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();

  const journeys = useQuery({
    queryKey: ['p2-journeys', tenantId, 'raise-task', search],
    queryFn: () => getP2Journeys(tenantId, accessToken, search, 'open', 100),
    staleTime: 30_000,
  });
  const people = useQuery({
    queryKey: ['p2-assignees', tenantId, journeyId, 'PC'],
    queryFn: () => getP2JourneyAssignees(tenantId, journeyId, accessToken, 'PC'),
    enabled: Boolean(journeyId),
    staleTime: 60_000,
  });
  const items: P2JourneyListItem[] = useMemo(() => {
    const list = journeys.data?.items ?? [];
    // The queue is already on one journey: keep it selectable even when the
    // open-journey list does not carry it (a closed journey, say).
    return presetJourneyId && !list.some((j) => j.journey_id === presetJourneyId)
      ? [{ journey_id: presetJourneyId, customer_name: 'This journey' } as P2JourneyListItem, ...list]
      : list;
  }, [journeys.data, presetJourneyId]);
  const journey = items.find((j) => j.journey_id === journeyId);

  useEffect(() => {
    // Default to the journey's own PC once the people are known.
    const list = people.data?.items ?? [];
    if (!list.length) { setAssignee(''); return; }
    setAssignee((current) => (list.some((p) => p.actorId === current) ? current : (list.find((p) => p.journeyPc) ?? list[0]).actorId));
  }, [people.data]);

  const raise = useMutation({
    mutationFn: async () => {
      const problem = raiseTaskProblem({ journeyId, kind, description, amount, reason });
      if (problem) throw new Error(problem);
      await raiseP2Task(tenantId, journeyId, {
        kind, description: description.trim(), priority,
        assignedActorId: kind === 'SYSTEM_MR' ? undefined : assignee || undefined,
        amount: kind === 'SYSTEM_MR' ? String(Number(amount)) : undefined,
        reason: kind === 'SYSTEM_MR' ? reason.trim() : undefined,
      }, accessToken);
      const person = (people.data?.items ?? []).find((p) => p.actorId === assignee);
      const who = kind === 'SYSTEM_MR' ? 'the Team Lead' : person ? (person.displayName?.trim() || 'the PC') : 'the PC';
      return `Task raised for ${who}${journey ? ` on ${journey.customer_name}` : ''}. It is on both queues.`;
    },
    onSuccess: (message) => {
      void queryClient.invalidateQueries({ queryKey: ['p2-tasks', tenantId] });
      void queryClient.invalidateQueries({ queryKey: ['p2-journeys', tenantId] });
      onRaised(message);
    },
    onError: (cause) => setError(errorText(cause)),
  });

  const chosen = P2_RAISED_TASK_KINDS.find((item) => item.kind === kind);

  return (
    <div className="p2w-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="p2w-dialog p2w-raise" role="dialog" aria-modal="true" aria-labelledby="p2w-raise-title"
        onSubmit={(event) => { event.preventDefault(); setError(undefined); raise.mutate(); }}>
        <h3 id="p2w-raise-title">Raise a task</h3>
        <p>Pick the journey and the PC, choose the kind of task and say what has to be done.</p>

        <label className="p2w-raise__field">
          <span>Journey</span>
          {!presetJourneyId ? (
            <input value={search} placeholder="Search by customer, reference or mobile" autoComplete="off"
              onChange={(event) => setSearch(event.target.value)} />
          ) : null}
          <select value={journeyId} onChange={(event) => { setJourneyId(event.target.value); setError(undefined); }} disabled={Boolean(presetJourneyId)}>
            <option value="">{journeys.isLoading ? 'Loading journeys…' : 'Select the journey…'}</option>
            {items.map((item) => (
              <option key={item.journey_id} value={item.journey_id}>
                {item.customer_name}{item.vehicle ? ` · ${item.vehicle}` : ''}{item.outlet_name ? ` · ${item.outlet_name}` : ''}{item.journey_reference ? ` · ${item.journey_reference}` : ''}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="p2w-raise__kinds">
          <legend>Task</legend>
          {P2_RAISED_TASK_KINDS.map((item) => (
            <label key={item.kind} className={`p2w-raise__kind${kind === item.kind ? ' is-active' : ''}`}>
              <input type="radio" name="p2w-raise-kind" value={item.kind} checked={kind === item.kind}
                onChange={() => { setKind(item.kind); setError(undefined); }} />
              <span>{item.label}</span>
            </label>
          ))}
          {chosen ? <span className="p2w-muted p2w-raise__hint">{chosen.hint}</span> : null}
        </fieldset>

        {kind !== 'SYSTEM_MR' ? (
          <label className="p2w-raise__field">
            <span>PC</span>
            <select value={assignee} onChange={(event) => setAssignee(event.target.value)} disabled={!journeyId || people.isLoading}>
              {!journeyId ? <option value="">Pick the journey first</option> : null}
              {journeyId && people.isLoading ? <option value="">Loading PCs…</option> : null}
              {journeyId && !people.isLoading && !(people.data?.items ?? []).length ? <option value="">Any PC on this outlet</option> : null}
              {(people.data?.items ?? []).map((person) => (
                <option key={person.actorId} value={person.actorId}>{assigneeLabel(person)}</option>
              ))}
            </select>
          </label>
        ) : (
          <div className="p2w-raise__row">
            <label className="p2w-raise__field">
              <span>MR amount (₹)</span>
              <input type="number" min={1} step="1" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </label>
            <label className="p2w-raise__field">
              <span>Reason</span>
              <input value={reason} maxLength={200} placeholder="Why this referral" onChange={(event) => setReason(event.target.value)} />
            </label>
          </div>
        )}

        <label className="p2w-raise__field">
          <span>{kind === 'SYSTEM_MR' ? 'Note for the Team Lead (optional)' : 'Task description'}</span>
          <textarea rows={3} value={description} maxLength={2000} placeholder={kind === 'SYSTEM_MR' ? 'Anything the Team Lead should know' : 'What the PC has to do, and on which document or value'}
            onChange={(event) => { setDescription(event.target.value); setError(undefined); }} />
        </label>

        {kind !== 'SYSTEM_MR' ? (
          <label className="p2w-check">
            <input type="checkbox" checked={priority === 'HIGH'} onChange={(event) => setPriority(event.target.checked ? 'HIGH' : 'NORMAL')} /> High priority
          </label>
        ) : null}

        {error ? <div className="p2w-alert p2w-alert--error" role="alert">{error}</div> : null}
        <div className="p2w-dialog__actions">
          <button type="button" className="p2w-button p2w-button--ghost" onClick={onClose} disabled={raise.isPending}>Cancel</button>
          <button type="submit" className="p2w-button p2w-button--primary" disabled={raise.isPending || !journeyId}>
            {raise.isPending ? 'Raising…' : 'Raise task'}
          </button>
        </div>
      </form>
    </div>
  );
}
