import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { raiseTmTasks, type TaskManagerMode, type TmContext } from '../../services/audit-core/taskManager';
import { ASSIGNABLE_ORDER, EXPECTED_TIME_OPTIONS, personName, roleLabel } from './tmFormat';

function errorText(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : 'The task could not be raised.';
}

/** What blocks the form from being sent, if anything (same rules as the server). */
export function raiseProblem(values: {
  title: string; description: string; assignees: string[]; minutes: number;
}): string | undefined {
  if (!values.title.trim()) return 'Give the task a title.';
  if (values.description.trim().length < 5) return 'Describe what has to be done (at least 5 characters).';
  if (!values.assignees.length) return 'Choose at least one person.';
  if (!(values.minutes > 0)) return 'Set the expected time to close the task.';
  return undefined;
}

/**
 * Raise a Task Manager task (not tied to a booking) to one or more people.
 * Who can be chosen comes from the role matrix the server enforces; the
 * expected time to close is required and becomes the due time.
 */
export default function RaiseTmTaskDialog({ mode, tenantId, accessToken, context, onClose, onRaised }: {
  mode: TaskManagerMode;
  tenantId: string;
  accessToken?: string;
  context: TmContext;
  onClose: () => void;
  onRaised: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [minutes, setMinutes] = useState(0);
  const [customHours, setCustomHours] = useState('');
  const [priority, setPriority] = useState<'NORMAL' | 'HIGH'>('NORMAL');
  const [outletId, setOutletId] = useState('');
  const [error, setError] = useState<string>();

  const people = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return [...context.assignees]
      .filter((p) => !needle || personName(p.displayName, p.actorId).toLowerCase().includes(needle)
        || p.outlets.some((o) => (o.outletName ?? '').toLowerCase().includes(needle)))
      .sort((a, b) => ASSIGNABLE_ORDER.indexOf(a.roleCode) - ASSIGNABLE_ORDER.indexOf(b.roleCode)
        || personName(a.displayName, a.actorId).localeCompare(personName(b.displayName, b.actorId)));
  }, [context.assignees, filter]);
  const custom = minutes === -1;
  const effectiveMinutes = custom ? Math.round(Number(customHours) * 60) : minutes;

  const raise = useMutation({
    mutationFn: async () => {
      const problem = raiseProblem({ title, description, assignees, minutes: effectiveMinutes });
      if (problem) throw new Error(problem);
      const result = await raiseTmTasks(mode, tenantId, {
        title: title.trim(), description: description.trim(), assigneeActorIds: assignees,
        expectedCloseMinutes: effectiveMinutes, priority, outletId: outletId || null,
      }, accessToken);
      return result.taskIds.length === 1 ? 'Task raised.' : `${result.taskIds.length} tasks raised, one per person.`;
    },
    onSuccess: (message) => {
      void queryClient.invalidateQueries({ queryKey: ['tm-tasks', mode, tenantId] });
      onRaised(message);
    },
    onError: (cause) => setError(errorText(cause)),
  });

  const toggle = (actorId: string) => {
    setAssignees((current) => (current.includes(actorId) ? current.filter((a) => a !== actorId) : [...current, actorId]));
    setError(undefined);
  };

  return (
    <div className="p2w-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="p2w-dialog p2w-raise tm-raise" role="dialog" aria-modal="true" aria-labelledby="tm-raise-title"
        onSubmit={(event) => { event.preventDefault(); setError(undefined); raise.mutate(); }}>
        <h3 id="tm-raise-title">New task</h3>
        <p>You can assign to: {context.canAssignTo.map(roleLabel).join(', ')}. Each person chosen gets their own task.</p>

        <label className="p2w-raise__field">
          <span>Title</span>
          <input value={title} maxLength={300} onChange={(e) => { setTitle(e.target.value); setError(undefined); }}
            placeholder="What is to be done, in a few words" />
        </label>
        <label className="p2w-raise__field">
          <span>Description</span>
          <textarea rows={3} value={description} maxLength={4000}
            onChange={(e) => { setDescription(e.target.value); setError(undefined); }}
            placeholder="What exactly has to be done, and what counts as done" />
        </label>

        <fieldset className="tm-people">
          <legend>Assign to {assignees.length ? <b>({assignees.length})</b> : null}</legend>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search by name or outlet" autoComplete="off" />
          <div className="tm-people__list">
            {people.map((person) => (
              <label key={person.actorId} className={`tm-people__item${assignees.includes(person.actorId) ? ' is-active' : ''}`}>
                <input type="checkbox" checked={assignees.includes(person.actorId)} onChange={() => toggle(person.actorId)} />
                <span>{personName(person.displayName, person.actorId)}</span>
                <span className="p2w-muted">
                  {roleLabel(person.roleCode)}
                  {person.outlets.length ? ` · ${person.outlets.map((o) => o.outletName).filter(Boolean).join(', ')}` : ''}
                </span>
              </label>
            ))}
            {!people.length ? <span className="p2w-muted">Nobody you can assign to{filter ? ' matches' : ' is active in this Project'}.</span> : null}
          </div>
        </fieldset>

        <div className="p2w-raise__row">
          <label className="p2w-raise__field">
            <span>Expected time to close</span>
            <select value={minutes} onChange={(e) => { setMinutes(Number(e.target.value)); setError(undefined); }}>
              <option value={0}>Choose…</option>
              {EXPECTED_TIME_OPTIONS.map((o) => <option key={o.minutes} value={o.minutes}>{o.label}</option>)}
              <option value={-1}>Custom (hours)</option>
            </select>
          </label>
          {custom ? (
            <label className="p2w-raise__field">
              <span>Hours</span>
              <input type="number" min={0.5} step={0.5} value={customHours} onChange={(e) => setCustomHours(e.target.value)} />
            </label>
          ) : null}
          <label className="p2w-raise__field">
            <span>Outlet (optional)</span>
            <select value={outletId} onChange={(e) => setOutletId(e.target.value)}>
              <option value="">Whole Project</option>
              {context.outlets.map((o) => <option key={o.outletId} value={o.outletId}>{o.outletName}</option>)}
            </select>
          </label>
        </div>

        <label className="p2w-check">
          <input type="checkbox" checked={priority === 'HIGH'} onChange={(e) => setPriority(e.target.checked ? 'HIGH' : 'NORMAL')} /> High priority
        </label>
        <p className="p2w-muted">
          The person completes it with a comment; you then accept it or send it back (within 2 days). A task given to a
          Project Manager closes when they complete it.
        </p>

        {error ? <div className="p2w-alert p2w-alert--error" role="alert">{error}</div> : null}
        <div className="p2w-dialog__actions">
          <button type="button" className="p2w-button p2w-button--ghost" onClick={onClose} disabled={raise.isPending}>Cancel</button>
          <button type="submit" className="p2w-button p2w-button--primary" disabled={raise.isPending}>
            {raise.isPending ? 'Raising…' : assignees.length > 1 ? `Raise ${assignees.length} tasks` : 'Raise task'}
          </button>
        </div>
      </form>
    </div>
  );
}
