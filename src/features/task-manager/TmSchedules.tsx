import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createTmSchedule, getTmSchedules, skipTmScheduleDate, updateTmSchedule,
  type TaskManagerMode, type TmContext, type TmSchedule, type TmScheduleInput,
} from '../../services/audit-core/taskManager';
import {
  addDays, assigneeRuleLabel, durationLabel, EXPECTED_TIME_OPTIONS, personName, roleLabel, scheduleLabel,
} from './tmFormat';

function errorText(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : 'The change could not be saved.';
}

const WEEKDAYS: Array<{ day: number; label: string }> = [
  { day: 1, label: 'Mon' }, { day: 2, label: 'Tue' }, { day: 3, label: 'Wed' }, { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' }, { day: 6, label: 'Sat' }, { day: 7, label: 'Sun' },
];

/** What blocks a recurring task from being saved, if anything. */
export function scheduleProblem(values: TmScheduleInput): string | undefined {
  if (!values.title?.trim()) return 'Give the recurring task a title.';
  if ((values.description ?? '').trim().length < 5) return 'Describe what has to be done (at least 5 characters).';
  if (!(Number(values.expectedCloseMinutes) > 0)) return 'Set the expected time to close each occurrence.';
  if (values.frequency === 'MONTHLY' && !(Number(values.monthDay) >= 1 && Number(values.monthDay) <= 31)) {
    return 'Choose the day of the month (1 to 31).';
  }
  const days = (values.weekdays ?? []).filter((d) => values.frequency !== 'DAILY' || d !== 7);
  if (values.frequency !== 'MONTHLY' && !days.length) return 'Choose at least one weekday (not Sunday for a daily task).';
  if (values.assigneeMode === 'ACTOR' && !values.assignedActorId) return 'Choose the person who gets it.';
  if (values.assigneeMode === 'ROLE_EACH' && !values.assignedRole) return 'Choose the role whose people get it.';
  return undefined;
}

function ScheduleDialog({ mode, tenantId, accessToken, context, editing, onClose, onSaved }: {
  mode: TaskManagerMode; tenantId: string; accessToken?: string; context: TmContext; editing?: TmSchedule;
  onClose: () => void; onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<TmScheduleInput>(() => editing ? {
    title: editing.title, description: editing.description, priority: editing.priority, frequency: editing.frequency,
    weekdays: editing.weekdays, monthDay: editing.monthDay ?? null, runTimeIst: editing.runTimeIst,
    expectedCloseMinutes: editing.expectedCloseMinutes, assigneeMode: editing.assigneeMode,
    assignedRole: editing.assignedRole ?? null, assignedActorId: editing.assignedActorId ?? null,
    outletId: editing.outletId ?? null, endsOn: editing.endsOn ?? null,
  } : {
    title: '', description: '', priority: 'NORMAL', frequency: 'DAILY', weekdays: [1, 2, 3, 4, 5, 6], monthDay: 1,
    runTimeIst: '09:00', expectedCloseMinutes: 240, assigneeMode: 'ROLE_EACH', assignedRole: 'PC',
    assignedActorId: null, outletId: null, startsOn: context.today, endsOn: null,
  });
  const [error, setError] = useState<string>();
  const set = (patch: TmScheduleInput) => { setValues((v) => ({ ...v, ...patch })); setError(undefined); };
  const save = useMutation({
    mutationFn: async () => {
      const problem = scheduleProblem(values);
      if (problem) throw new Error(problem);
      const body = { ...values, monthDay: values.frequency === 'MONTHLY' ? Number(values.monthDay) : null };
      if (editing) await updateTmSchedule(mode, tenantId, editing.scheduleId, body, accessToken);
      else await createTmSchedule(mode, tenantId, body, accessToken);
      return editing ? 'Recurring task updated.' : 'Recurring task created. Occurrences are raised at the time set.';
    },
    onSuccess: (message) => {
      void queryClient.invalidateQueries({ queryKey: ['tm-schedules', mode, tenantId] });
      onSaved(message);
    },
    onError: (cause) => setError(errorText(cause)),
  });
  const toggleDay = (day: number) => set({
    weekdays: (values.weekdays ?? []).includes(day)
      ? (values.weekdays ?? []).filter((d) => d !== day) : [...(values.weekdays ?? []), day].sort(),
  });
  const presetMinutes = EXPECTED_TIME_OPTIONS.some((o) => o.minutes === values.expectedCloseMinutes);

  return (
    <div className="p2w-dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="p2w-dialog p2w-raise tm-raise" role="dialog" aria-modal="true" aria-labelledby="tm-schedule-title"
        onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <h3 id="tm-schedule-title">{editing ? 'Edit recurring task' : 'New recurring task'}</h3>
        <p>Raised automatically on the days chosen. A Project Manager reviews every occurrence (none when it goes to a PM);
          no daily task is raised on a Sunday, and a weekly or monthly one that falls on a Sunday moves to the Monday.</p>
        <label className="p2w-raise__field"><span>Title</span>
          <input value={values.title ?? ''} maxLength={300} onChange={(e) => set({ title: e.target.value })} /></label>
        <label className="p2w-raise__field"><span>Description</span>
          <textarea rows={3} value={values.description ?? ''} maxLength={4000} onChange={(e) => set({ description: e.target.value })} /></label>

        <div className="p2w-raise__row">
          <label className="p2w-raise__field"><span>Repeats</span>
            <select value={values.frequency} onChange={(e) => set({ frequency: e.target.value, weekdays: e.target.value === 'WEEKLY' ? [1] : [1, 2, 3, 4, 5, 6] })}>
              <option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option>
            </select></label>
          {values.frequency === 'MONTHLY' ? (
            <label className="p2w-raise__field"><span>Day of month</span>
              <input type="number" min={1} max={31} value={values.monthDay ?? ''} onChange={(e) => set({ monthDay: Number(e.target.value) })} /></label>
          ) : null}
          <label className="p2w-raise__field"><span>Raised at (IST)</span>
            <input type="time" value={values.runTimeIst ?? '09:00'} onChange={(e) => set({ runTimeIst: e.target.value })} /></label>
        </div>
        {values.frequency !== 'MONTHLY' ? (
          <fieldset className="tm-weekdays"><legend>On</legend>
            {WEEKDAYS.filter((d) => values.frequency !== 'DAILY' || d.day !== 7).map((d) => (
              <label key={d.day} className={(values.weekdays ?? []).includes(d.day) ? 'is-active' : ''}>
                <input type="checkbox" checked={(values.weekdays ?? []).includes(d.day)} onChange={() => toggleDay(d.day)} />{d.label}
              </label>
            ))}
          </fieldset>
        ) : null}

        <div className="p2w-raise__row">
          <label className="p2w-raise__field"><span>Goes to</span>
            <select value={values.assigneeMode} disabled={Boolean(editing?.systemKind)} onChange={(e) => set({ assigneeMode: e.target.value })}>
              <option value="ROLE_EACH">Everyone in a role</option>
              <option value="ACTOR">One person</option>
              <option value="OUTLET_PCS">One task per outlet, for its PCs</option>
            </select></label>
          {values.assigneeMode === 'ROLE_EACH' ? (
            <label className="p2w-raise__field"><span>Role</span>
              <select value={values.assignedRole ?? ''} onChange={(e) => set({ assignedRole: e.target.value })}>
                {context.canAssignTo.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select></label>
          ) : null}
          {values.assigneeMode === 'ACTOR' ? (
            <label className="p2w-raise__field"><span>Person</span>
              <select value={values.assignedActorId ?? ''} onChange={(e) => set({ assignedActorId: e.target.value || null })}>
                <option value="">Choose…</option>
                {context.assignees.map((p) => (
                  <option key={p.actorId} value={p.actorId}>{personName(p.displayName, p.actorId)} · {roleLabel(p.roleCode)}</option>
                ))}
              </select></label>
          ) : null}
          <label className="p2w-raise__field"><span>Outlet (optional)</span>
            <select value={values.outletId ?? ''} onChange={(e) => set({ outletId: e.target.value || null })}>
              <option value="">All outlets</option>
              {context.outlets.map((o) => <option key={o.outletId} value={o.outletId}>{o.outletName}</option>)}
            </select></label>
        </div>

        <div className="p2w-raise__row">
          <label className="p2w-raise__field"><span>Expected time to close</span>
            <select value={presetMinutes ? values.expectedCloseMinutes : -1}
              onChange={(e) => set({ expectedCloseMinutes: Number(e.target.value) > 0 ? Number(e.target.value) : 60 })}>
              {EXPECTED_TIME_OPTIONS.map((o) => <option key={o.minutes} value={o.minutes}>{o.label}</option>)}
              <option value={-1}>Custom (hours)</option>
            </select></label>
          {!presetMinutes ? (
            <label className="p2w-raise__field"><span>Hours</span>
              <input type="number" min={0.5} step={0.5} value={(values.expectedCloseMinutes ?? 60) / 60}
                onChange={(e) => set({ expectedCloseMinutes: Math.round(Number(e.target.value) * 60) })} /></label>
          ) : null}
          <label className="p2w-raise__field"><span>Ends on (optional)</span>
            <input type="date" value={values.endsOn ?? ''} onChange={(e) => set({ endsOn: e.target.value || null })} /></label>
        </div>
        <label className="p2w-check">
          <input type="checkbox" checked={values.priority === 'HIGH'} onChange={(e) => set({ priority: e.target.checked ? 'HIGH' : 'NORMAL' })} /> High priority
        </label>
        {error ? <div className="p2w-alert p2w-alert--error" role="alert">{error}</div> : null}
        <div className="p2w-dialog__actions">
          <button type="button" className="p2w-button p2w-button--ghost" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" className="p2w-button p2w-button--primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}

function SkipForm({ mode, tenantId, accessToken, schedule, today, onDone }: {
  mode: TaskManagerMode; tenantId: string; accessToken?: string; schedule: TmSchedule; today: string;
  onDone: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(addDays(today, 1));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const skip = useMutation({
    mutationFn: () => skipTmScheduleDate(mode, tenantId, schedule.scheduleId, date, reason.trim(), accessToken),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['tm-schedules', mode, tenantId] });
      void queryClient.invalidateQueries({ queryKey: ['tm-tasks', mode, tenantId] });
      onDone(`${date} skipped.${result.cancelledTasks ? ` ${result.cancelledTasks} task(s) of that day cancelled.` : ''}`);
    },
    onError: (cause) => setError(errorText(cause)),
  });
  return (
    <form className="tm-skip" onSubmit={(e) => { e.preventDefault(); if (!reason.trim()) { setError('Give the reason (a holiday, say).'); return; } skip.mutate(); }}>
      <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
      <input value={reason} maxLength={1000} placeholder="Reason, e.g. Diwali holiday" onChange={(e) => { setReason(e.target.value); setError(undefined); }} />
      <button type="submit" className="p2w-button p2w-button--secondary" disabled={skip.isPending}>Skip this date</button>
      {error ? <span className="p2w-tone p2w-tone--danger">{error}</span> : null}
    </form>
  );
}

/** The Project's recurring tasks: Executive and Superadmin manage them, a PM sees them. */
export default function TmSchedules({ mode, tenantId, accessToken, context, onNotice }: {
  mode: TaskManagerMode; tenantId: string; accessToken?: string; context: TmContext; onNotice: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ editing?: TmSchedule } | null>(null);
  const [skipping, setSkipping] = useState<string>();
  const schedules = useQuery({
    queryKey: ['tm-schedules', mode, tenantId],
    queryFn: () => getTmSchedules(mode, tenantId, accessToken),
    enabled: context.canSeeSchedules,
  });
  const toggle = useMutation({
    mutationFn: (s: TmSchedule) => updateTmSchedule(mode, tenantId, s.scheduleId,
      { status: s.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' }, accessToken),
    onSuccess: (s) => {
      void queryClient.invalidateQueries({ queryKey: ['tm-schedules', mode, tenantId] });
      onNotice(s.status === 'ACTIVE' ? 'Resumed.' : 'Paused. No new occurrences until resumed.');
    },
    onError: (cause) => onNotice(errorText(cause)),
  });
  const manage = context.canCreateSchedules;
  return (
    <div className="tm-schedules">
      {manage ? (
        <div className="p2w-header-links">
          <button type="button" className="p2w-button p2w-button--primary" onClick={() => setDialog({})}>New recurring task</button>
        </div>
      ) : <p className="p2w-muted">Recurring tasks are set up by an Executive or Superadmin.</p>}
      {schedules.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{errorText(schedules.error)}</div> : null}
      <ul className="tm-schedule-list">
        {(schedules.data?.items ?? []).map((s) => (
          <li key={s.scheduleId} className={`tm-schedule${s.status !== 'ACTIVE' ? ' is-paused' : ''}`}>
            <div className="tm-schedule__head">
              <strong>{s.title}</strong>
              <span className={`p2w-chip p2w-chip--${s.status === 'ACTIVE' ? 'success' : 'neutral'}`}>{s.status === 'ACTIVE' ? 'Active' : 'Paused'}</span>
              {s.systemKind ? <span className="p2w-chip p2w-chip--info">System</span> : null}
            </div>
            <p className="p2w-muted">{s.description}</p>
            <dl className="tm-facts">
              <div><dt>When</dt><dd>{scheduleLabel(s)}</dd></div>
              <div><dt>Goes to</dt><dd>{assigneeRuleLabel(s)}</dd></div>
              <div><dt>Expected time</dt><dd>{s.systemKind ? 'By 23:59 the next day' : durationLabel(s.expectedCloseMinutes)}</dd></div>
              <div><dt>Review</dt><dd>{s.systemKind ? 'The system (gate pass finished)' : 'Project Manager'}</dd></div>
              {s.skipDates.length ? <div><dt>Skipped</dt><dd>{s.skipDates.join(', ')}</dd></div> : null}
              <div><dt>Set up by</dt><dd>{personName(s.createdByName, null, s.createdByRole)}</dd></div>
            </dl>
            {manage ? (
              <div className="p2w-task__actions">
                {!s.systemKind ? <button type="button" className="p2w-button p2w-button--secondary" onClick={() => setDialog({ editing: s })}>Edit</button> : null}
                <button type="button" className="p2w-button p2w-button--ghost" disabled={toggle.isPending} onClick={() => toggle.mutate(s)}>
                  {s.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                </button>
                <button type="button" className="p2w-button p2w-button--ghost" onClick={() => setSkipping(skipping === s.scheduleId ? undefined : s.scheduleId)}>
                  Skip a date
                </button>
              </div>
            ) : null}
            {skipping === s.scheduleId ? (
              <SkipForm mode={mode} tenantId={tenantId} accessToken={accessToken} schedule={s} today={context.today}
                onDone={(m) => { setSkipping(undefined); onNotice(m); }} />
            ) : null}
          </li>
        ))}
        {schedules.data && !schedules.data.items.length ? <li className="p2w-empty">No recurring tasks yet.</li> : null}
      </ul>
      {dialog ? (
        <ScheduleDialog mode={mode} tenantId={tenantId} accessToken={accessToken} context={context} editing={dialog.editing}
          onClose={() => setDialog(null)} onSaved={(m) => { setDialog(null); onNotice(m); }} />
      ) : null}
    </div>
  );
}
