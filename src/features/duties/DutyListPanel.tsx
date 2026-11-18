import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import DialogShell from '../hr/attendance/DialogShell';
import {
  addStandardDuties, createDuty, getDutyDefinitions, updateDuty, updateDutySettings,
  type DutiesMode, type DutyDefinition, type DutyDefinitionInput, type DutyDefinitions, type DutyInput,
} from '../../services/audit-core/duties';
import { WEEKDAYS, weekdaysLabel } from './dutiesFormat';
import { dutiesKeys } from './useMyDuties';

function errorText(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : 'The change could not be saved.';
}

const SCOPE_LABEL: Record<DutyDefinition['outletScope'], string> = {
  ALL: 'All outlets', ONSITE: 'Onsite outlets', SATELLITE: 'Satellite outlets', SELECTED: 'Chosen outlets',
};

/** What stops a duty being saved, if anything. */
export function dutyProblem(values: DutyDefinitionInput): string | undefined {
  if (!values.title?.trim()) return 'Give the duty a name.';
  if (!(values.weekdays ?? []).length) return 'Choose at least one day.';
  if (values.closeMode === 'AUTO' && !values.checkerCode) return 'Choose what the system reads for this duty.';
  if (values.outletScope === 'SELECTED' && !(values.outletIds ?? []).length) return 'Choose at least one outlet.';
  if ((values.inputs ?? []).some((i) => !i.label.trim())) return 'Give each value a name, or remove it.';
  return undefined;
}

function Weekdays({ legend, value, onChange, disabled = false }: {
  legend: string; value: number[]; onChange: (days: number[]) => void; disabled?: boolean;
}) {
  return (
    <fieldset className="dty-weekdays" disabled={disabled}><legend>{legend}</legend>
      {WEEKDAYS.map((d) => (
        <label key={d.day} className={value.includes(d.day) ? 'is-active' : ''}>
          <input type="checkbox" checked={value.includes(d.day)}
            onChange={() => onChange(value.includes(d.day) ? value.filter((x) => x !== d.day) : [...value, d.day].sort((a, b) => a - b))} />{d.label}
        </label>
      ))}
    </fieldset>
  );
}

function DutyDialog({ mode, tenantId, accessToken, setup, editing, onClose, onSaved }: {
  mode: DutiesMode; tenantId: string; accessToken?: string; setup: DutyDefinitions; editing?: DutyDefinition;
  onClose: () => void; onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<DutyDefinitionInput>(() => editing ? {
    title: editing.title, description: editing.description, mandatory: editing.mandatory, weekdays: editing.weekdays,
    outletScope: editing.outletScope, outletIds: editing.outletIds, dayOffset: editing.dayOffset,
    closeMode: editing.closeMode, checkerCode: editing.checkerCode, inputs: editing.inputs,
    allowNotReceived: editing.allowNotReceived, rolling: editing.rolling, carryDays: editing.carryDays,
    sortOrder: editing.sortOrder, status: editing.status,
  } : {
    title: '', description: '', mandatory: true, weekdays: [1, 2, 3, 4, 5, 6], outletScope: 'ALL', outletIds: [],
    dayOffset: 0, closeMode: 'TICK', checkerCode: null, inputs: [], allowNotReceived: false, rolling: false,
    carryDays: null, sortOrder: (Math.max(0, ...setup.items.map((d) => d.sortOrder)) || 0) + 10, status: 'ACTIVE',
  });
  const [error, setError] = useState<string>();
  const set = (patch: DutyDefinitionInput) => { setValues((v) => ({ ...v, ...patch })); setError(undefined); };
  const inputs = values.inputs ?? [];
  const setInput = (index: number, patch: Partial<DutyInput>) => set({
    inputs: inputs.map((input, i) => (i === index ? { ...input, ...patch } : input)),
  });
  const system = values.closeMode === 'AUTO';
  const save = useMutation({
    mutationFn: async () => {
      const problem = dutyProblem(values);
      if (problem) throw new Error(problem);
      const body: DutyDefinitionInput = {
        ...values, title: values.title?.trim(), description: values.description?.trim() ?? '',
        checkerCode: system ? values.checkerCode : null, inputs: system ? [] : inputs,
        outletIds: values.outletScope === 'SELECTED' ? values.outletIds : [],
      };
      if (editing) await updateDuty(mode, tenantId, editing.dutyId, body, accessToken);
      else await createDuty(mode, tenantId, body, accessToken);
      return editing ? 'Duty updated. The change shows on the days not yet started.' : 'Duty added. It is on today’s lists.';
    },
    onSuccess: (message) => {
      void queryClient.invalidateQueries({ queryKey: dutiesKeys.definitions(mode, tenantId) });
      onSaved(message);
    },
    onError: (cause) => setError(errorText(cause)),
  });

  return (
    <DialogShell title={editing ? 'Edit duty' : 'Add a duty'} eyebrow="Daily duties" onClose={onClose} locked={save.isPending} wide>
      <form className="dty-form" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <label className="dty-field dty-form__wide"><span>Name</span>
          <input value={values.title ?? ''} maxLength={200} onChange={(e) => set({ title: e.target.value })} /></label>
        <label className="dty-field dty-form__wide"><span>What the PC has to do</span>
          <textarea rows={2} value={values.description ?? ''} maxLength={2000} onChange={(e) => set({ description: e.target.value })} /></label>

        <label className="dty-field"><span>Who ticks it</span>
          <select value={values.closeMode} onChange={(e) => set({ closeMode: e.target.value as 'TICK' | 'AUTO' })}>
            <option value="TICK">The PC is asked</option>
            <option value="AUTO">Read from the system</option>
          </select></label>
        {system ? (
          <label className="dty-field"><span>What the system reads</span>
            <select value={values.checkerCode ?? ''} onChange={(e) => set({ checkerCode: e.target.value || null })}>
              <option value="">Choose</option>
              {setup.checkers.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select></label>
        ) : <span />}

        <label className="dty-field"><span>It is for</span>
          <select value={values.dayOffset} onChange={(e) => set({ dayOffset: Number(e.target.value) as 0 | -1 })}>
            <option value={0}>The same day</option>
            <option value={-1}>The previous day</option>
          </select></label>
        <label className="dty-field"><span>Carry days (blank: the Project&apos;s {setup.settings.defaultCarryDays})</span>
          <input type="number" min={0} max={30} value={values.carryDays ?? ''}
            onChange={(e) => set({ carryDays: e.target.value === '' ? null : Number(e.target.value) })} /></label>

        <div className="dty-form__wide">
          <Weekdays legend="Days it is for" value={values.weekdays ?? []} onChange={(weekdays) => set({ weekdays })} />
        </div>

        <label className="dty-field"><span>Outlets</span>
          <select value={values.outletScope} onChange={(e) => set({ outletScope: e.target.value as DutyDefinition['outletScope'] })}>
            {(Object.keys(SCOPE_LABEL) as Array<DutyDefinition['outletScope']>).map((k) => <option key={k} value={k}>{SCOPE_LABEL[k]}</option>)}
          </select></label>
        <label className="dty-field"><span>Order on the list</span>
          <input type="number" min={0} max={100000} value={values.sortOrder ?? 100} onChange={(e) => set({ sortOrder: Number(e.target.value) })} /></label>
        {values.outletScope === 'SELECTED' ? (
          <fieldset className="dty-weekdays dty-form__wide"><legend>Chosen outlets</legend>
            {setup.outlets.map((o) => {
              const on = (values.outletIds ?? []).includes(o.outletId);
              return (
                <label key={o.outletId} className={on ? 'is-active' : ''}>
                  <input type="checkbox" checked={on} onChange={() => set({
                    outletIds: on ? (values.outletIds ?? []).filter((x) => x !== o.outletId) : [...(values.outletIds ?? []), o.outletId],
                  })} />{o.outletName}
                </label>
              );
            })}
          </fieldset>
        ) : null}

        {!system ? (
          <div className="dty-form__wide dty-inputs">
            <span className="dty-check-line">Values the PC enters with the tick (up to 6)</span>
            {inputs.map((input, index) => (
              <div key={index} className="dty-inputs__row">
                <input aria-label="Name of the value" placeholder="For example: Amount" value={input.label} maxLength={60}
                  onChange={(e) => setInput(index, { label: e.target.value })} />
                <select aria-label="Type" value={input.type} onChange={(e) => setInput(index, { type: e.target.value as DutyInput['type'] })}>
                  <option value="NUMBER">Whole number</option><option value="AMOUNT">Amount</option><option value="TEXT">Text</option>
                </select>
                <label className="dty-check-line">
                  <input type="checkbox" checked={input.required} onChange={(e) => setInput(index, { required: e.target.checked })} />Required
                </label>
                <button type="button" className="uc01-admin-button uc01-admin-button--compact"
                  onClick={() => set({ inputs: inputs.filter((_, i) => i !== index) })}>Remove</button>
              </div>
            ))}
            {inputs.length < 6 ? (
              <button type="button" className="uc01-admin-button uc01-admin-button--compact" style={{ alignSelf: 'flex-start' }}
                onClick={() => set({ inputs: [...inputs, { key: '', label: '', type: 'NUMBER', required: true }] })}>Add a value</button>
            ) : null}
          </div>
        ) : null}

        <label className="dty-check-line">
          <input type="checkbox" checked={values.mandatory ?? true} onChange={(e) => set({ mandatory: e.target.checked })} />
          Mandatory (a reason is asked when it is not done)
        </label>
        <label className="dty-check-line">
          <input type="checkbox" checked={values.allowNotReceived ?? false} onChange={(e) => set({ allowNotReceived: e.target.checked })} />
          The PC can say &quot;Not received today&quot; (and is asked about the WhatsApp group)
        </label>
        <label className="dty-check-line">
          <input type="checkbox" checked={values.rolling ?? false} onChange={(e) => set({ rolling: e.target.checked })} />
          One open item at a time (comes when the dealership gives it)
        </label>
        <label className="dty-check-line">
          <input type="checkbox" checked={values.status !== 'INACTIVE'} onChange={(e) => set({ status: e.target.checked ? 'ACTIVE' : 'INACTIVE' })} />
          Active
        </label>

        {error ? <div className="uc01-admin-message uc01-admin-message--error dty-form__wide" role="alert">{error}</div> : null}
        <div className="uc01-admin-dialog__actions dty-form__wide">
          <button type="button" className="uc01-admin-button" disabled={save.isPending} onClick={onClose}>Cancel</button>
          <button type="submit" className="uc01-admin-button uc01-admin-button--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

/**
 * The duty list of a Project and its switch (Audit Core .../duties/definitions and /settings). An
 * Executive or SuperAdmin changes it; a Team Lead or PM reads it (product owner 2026-11-18: "exec and
 * superadmin only"; "we should be able to switch on/off this any time").
 */
export default function DutyListPanel({ mode, tenantId, accessToken }: { mode: DutiesMode; tenantId: string; accessToken?: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<DutyDefinition | 'new' | null>(null);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState<{ cutoffTimeIst: string; defaultCarryDays: string; workingWeekdays: number[] } | null>(null);
  const setup = useQuery({
    queryKey: dutiesKeys.definitions(mode, tenantId),
    queryFn: () => getDutyDefinitions(mode, tenantId, accessToken),
    enabled: Boolean(tenantId && accessToken),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: dutiesKeys.definitions(mode, tenantId) });
    void queryClient.invalidateQueries({ queryKey: ['duties', 'team', mode, tenantId] });
  };
  const settings = useMutation({
    mutationFn: (body: Parameters<typeof updateDutySettings>[2]) => updateDutySettings(mode, tenantId, body, accessToken),
    onSuccess: (saved) => {
      setDraft(null); setError(undefined);
      setNotice(saved.enabled ? 'Saved. Daily duties are on for this Project.' : 'Saved. Daily duties are off for this Project.');
      refresh();
    },
    onError: (cause) => setError(errorText(cause)),
  });
  const standard = useMutation({
    mutationFn: () => addStandardDuties(mode, tenantId, accessToken),
    onSuccess: (result) => { setError(undefined); setNotice(`${result.added} standard ${result.added === 1 ? 'duty' : 'duties'} added.`); refresh(); },
    onError: (cause) => setError(errorText(cause)),
  });

  if (setup.isLoading) return <div className="uc01-admin-state">Loading the duty list…</div>;
  if (setup.isError || !setup.data) {
    return <div className="uc01-admin-message uc01-admin-message--error" role="alert">The duty list could not be loaded. {errorText(setup.error)}</div>;
  }
  const data = setup.data;
  const can = data.canManage;
  const current = data.settings;
  const form = draft ?? {
    cutoffTimeIst: current.cutoffTimeIst, defaultCarryDays: String(current.defaultCarryDays), workingWeekdays: current.workingWeekdays,
  };
  const checkerLabel = (code: string | null) => data.checkers.find((c) => c.code === code)?.label ?? code ?? '';

  return (
    <div className="dty-stack">
      {notice ? (
        <div className="uc01-admin-message uc01-admin-message--success" role="status">
          {notice}{' '}
          <button type="button" className="uc01-admin-button uc01-admin-button--compact" onClick={() => setNotice(undefined)}>Dismiss</button>
        </div>
      ) : null}
      {error ? <div className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</div> : null}

      <div className="dty-switch">
        <div>
          <strong>Daily duties are {current.enabled ? 'on' : 'off'} for this Project</strong>
          <p>
            {current.enabled
              ? `On since ${current.enabledFrom ?? 'today'}. PCs see their list after check-in and give reasons at check-out.`
              : 'Off: no list, no reasons at check-out, nothing counted. Everything else works as before.'}
            {current.updatedByName ? ` Last changed by ${current.updatedByName}.` : ''}
          </p>
        </div>
        {can ? (
          <button type="button" className={`uc01-admin-button${current.enabled ? '' : ' uc01-admin-button--primary'}`}
            disabled={settings.isPending || (!current.enabled && data.items.every((d) => d.status !== 'ACTIVE'))}
            onClick={() => settings.mutate({ enabled: !current.enabled })}>
            {settings.isPending ? 'Saving…' : current.enabled ? 'Switch off' : 'Switch on'}
          </button>
        ) : null}
      </div>
      {can && !current.enabled && data.items.every((d) => d.status !== 'ACTIVE') ? (
        <p className="dty-row__text">Add at least one duty before switching on.</p>
      ) : null}

      <div className="dty-settings">
        <label className="dty-field"><span>Day cut-off (IST): after this, a PC who has not closed shows as not closed</span>
          <input type="time" value={form.cutoffTimeIst} disabled={!can} onChange={(e) => setDraft({ ...form, cutoffTimeIst: e.target.value })} /></label>
        <label className="dty-field"><span>Carry days: how long a duty not done stays on the list</span>
          <input type="number" min={0} max={30} value={form.defaultCarryDays} disabled={!can}
            onChange={(e) => setDraft({ ...form, defaultCarryDays: e.target.value })} /></label>
        <Weekdays legend="PCs' working days" value={form.workingWeekdays} disabled={!can}
          onChange={(workingWeekdays) => setDraft({ ...form, workingWeekdays })} />
      </div>
      {can && draft ? (
        <div className="dty-row__actions">
          <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={settings.isPending}
            onClick={() => settings.mutate({
              cutoffTimeIst: form.cutoffTimeIst, defaultCarryDays: Number(form.defaultCarryDays), workingWeekdays: form.workingWeekdays,
            })}>Save settings</button>
          <button type="button" className="uc01-admin-button" disabled={settings.isPending} onClick={() => setDraft(null)}>Cancel</button>
        </div>
      ) : null}

      {can ? (
        <div className="dty-row__actions">
          <button type="button" className="uc01-admin-button uc01-admin-button--primary" onClick={() => setEditing('new')}>Add a duty</button>
          {data.standardMissing.length > 0 ? (
            <button type="button" className="uc01-admin-button" disabled={standard.isPending} onClick={() => standard.mutate()}>
              {standard.isPending ? 'Adding…' : `Add the standard duties (${data.standardMissing.length})`}
            </button>
          ) : null}
        </div>
      ) : null}

      {data.items.length === 0 ? (
        <div className="uc01-admin-state">
          <strong>No duties yet.</strong>
          <span>{can ? 'Add the standard duties (gate register, files received, uploads, physical delivery verification, bank statement, cash ledger), or add your own.' : 'An Executive or SuperAdmin sets up the duty list.'}</span>
        </div>
      ) : (
        <div className="dty-table-wrap">
          <table className="dty-table">
            <thead><tr><th scope="col">Duty</th><th scope="col">Who ticks it</th><th scope="col">Days</th><th scope="col">Outlets</th>
              <th scope="col">Rules</th>{can ? <th scope="col" /> : null}</tr></thead>
            <tbody>
              {data.items.map((d) => (
                <tr key={d.dutyId}>
                  <td><strong>{d.title}</strong><small>{d.description}</small></td>
                  <td data-label="Who ticks it">
                    {d.closeMode === 'AUTO' ? <>Read from the system<small>{checkerLabel(d.checkerCode)}</small></> : (
                      <>The PC is asked{d.inputs.length ? <small>Enters: {d.inputs.map((i) => i.label).join(', ')}</small> : null}</>
                    )}
                  </td>
                  <td data-label="Days">{weekdaysLabel(d.weekdays)}<small>{d.dayOffset === -1 ? 'For the previous day' : 'For the same day'}</small></td>
                  <td data-label="Outlets">{SCOPE_LABEL[d.outletScope]}{d.outletScope === 'SELECTED' ? <small>{d.outletIds.length} chosen</small> : null}</td>
                  <td data-label="Rules">
                    <span className={`dty-tag ${d.status === 'ACTIVE' ? 'dty-tag--ok' : ''}`}>{d.status === 'ACTIVE' ? 'Active' : 'Inactive'}</span>{' '}
                    <span className="dty-tag">{d.mandatory ? 'Mandatory' : 'Optional'}</span>{' '}
                    {d.allowNotReceived ? <><span className="dty-tag">Not received allowed</span>{' '}</> : null}
                    {d.rolling ? <><span className="dty-tag">One at a time</span>{' '}</> : null}
                    <span className="dty-tag">Carry {d.carryDays ?? current.defaultCarryDays} days</span>
                  </td>
                  {can ? (
                    <td><button type="button" className="uc01-admin-button uc01-admin-button--compact" onClick={() => setEditing(d)}>Edit</button></td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <DutyDialog mode={mode} tenantId={tenantId} accessToken={accessToken} setup={data}
          editing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)}
          onSaved={(message) => { setEditing(null); setNotice(message); refresh(); }} />
      ) : null}
    </div>
  );
}
