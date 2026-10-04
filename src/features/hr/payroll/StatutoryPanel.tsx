import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { confirmStatutory, getStatutory, payrollKeys, putStatutory, type Rounding } from '../../../services/hr/payroll';
import { useSessionStore } from '../../../store/sessionStore';
import Field from '../Field';
import { formatDateTime } from '../hrLabels';
import Modal from './Modal';
import { payrollErrorMessage } from './payrollErrors';
import { ErrorState, LoadingState } from './PayrollStates';
import {
  formFromConfig,
  formSignature,
  newSlab,
  ROUNDING_LABELS,
  ROUNDINGS,
  validateStatutory,
  type StatutoryErrors,
  type StatutoryForm,
} from './statutoryForm';

function RoundingSelect({ id, value, disabled, onChange }: { id: string; value: Rounding; disabled: boolean; onChange: (value: Rounding) => void }) {
  return (
    <Field label="Rounding" htmlFor={id}>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as Rounding)}>
        {ROUNDINGS.map((r) => <option key={r} value={r}>{ROUNDING_LABELS[r]}</option>)}
      </select>
    </Field>
  );
}

export default function StatutoryPanel({ canManage }: { canManage: boolean }) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<StatutoryForm | null>(null);
  const [baseline, setBaseline] = useState('');
  const [errors, setErrors] = useState<StatutoryErrors>({});
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmNote, setConfirmNote] = useState('');
  const [confirmProblem, setConfirmProblem] = useState('');
  const [askSave, setAskSave] = useState(false);

  const view = useQuery({
    queryKey: payrollKeys.statutory,
    queryFn: () => getStatutory(accessToken!),
    enabled: Boolean(accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const data = view.data;

  // Start from exactly what the service holds; fields it has no value for stay empty.
  useEffect(() => {
    if (!data) return;
    const loaded = formFromConfig(data.config);
    setForm(loaded);
    setBaseline(formSignature(loaded));
  }, [data]);

  const dirty = useMemo(() => (form ? formSignature(form) !== baseline : false), [form, baseline]);

  const save = useMutation({
    mutationFn: () => putStatutory(accessToken!, validateStatutory(form!).input),
    onSuccess: (saved) => {
      queryClient.setQueryData(payrollKeys.statutory, saved);
      setNotice('Saved. These settings are not confirmed yet: the CA has to confirm exactly what is saved.');
      setProblem('');
    },
    onError: (error) => setProblem(payrollErrorMessage(error)),
    onSettled: () => setAskSave(false),
  });

  const confirm = useMutation({
    mutationFn: () => confirmStatutory(accessToken!, confirmNote.trim()),
    onSuccess: (saved) => {
      queryClient.setQueryData(payrollKeys.statutory, saved);
      setConfirmNote('');
      setConfirmProblem('');
      setNotice('Recorded: the CA has confirmed these settings.');
    },
    onError: (error) => setConfirmProblem(payrollErrorMessage(error)),
  });

  if (view.isLoading) return <LoadingState>Loading the statutory settings…</LoadingState>;
  if (view.isError || !data || !form) {
    return <ErrorState title="The statutory settings could not be loaded." error={view.error} onRetry={() => view.refetch()} busy={view.isFetching} />;
  }

  const readOnly = !canManage || save.isPending;
  const update = (change: (f: StatutoryForm) => StatutoryForm) => {
    setForm((f) => (f ? change(f) : f));
    setErrors({});
    setNotice('');
  };

  const trySave = () => {
    const { errors: found } = validateStatutory(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setProblem('Some numbers need attention. They are marked below.');
      return;
    }
    setProblem('');
    if (data.confirmed) setAskSave(true);
    else save.mutate();
  };

  const trySubmitConfirm = () => {
    if (confirmNote.trim().length < 5) {
      setConfirmProblem('Write who confirmed it and how, in at least 5 characters.');
      return;
    }
    setConfirmProblem('');
    confirm.mutate();
  };

  const slabError = (index: number, field: 'from' | 'to' | 'monthly') => errors[`pt.${index}.${field}`];

  return (
    <div className="hr-sections">
      <div className="hr-pay-warning" role="note">
        <strong>These numbers must be confirmed by your CA.</strong>
        <p>
          HR enters every rate, ceiling and slab here. The system does not supply or check any of them, and no payroll run can be approved
          until the CA has confirmed what is saved.
        </p>
      </div>

      <div className={`hr-pay-confirmation hr-pay-confirmation--${data.confirmed ? 'yes' : 'no'}`} role="status">
        <span className={`hr-pay-pill hr-pay-pill--${data.confirmed ? 'approved' : 'pending'}`}>{data.confirmed ? 'Confirmed by CA' : 'Not confirmed'}</span>
        {data.confirmed ? (
          <span>Confirmed {data.confirmedAt ? formatDateTime(data.confirmedAt) : ''}{data.confirmationNote ? `: ${data.confirmationNote}` : ''}</span>
        ) : (
          <span>Settings last saved {formatDateTime(data.updatedAt)}. A payroll run cannot be approved until they are confirmed.</span>
        )}
      </div>

      {notice && <div className="uc01-admin-message uc01-admin-message--success" role="status">{notice}</div>}

      <form className="hr-sections" noValidate onSubmit={(event) => { event.preventDefault(); trySave(); }}>
        <section className="hr-pay-scheme" aria-labelledby="scheme-pf">
          <label className="hr-check"><input type="checkbox" checked={form.pf.enabled} disabled={readOnly} onChange={(e) => update((f) => ({ ...f, pf: { ...f.pf, enabled: e.target.checked } }))} />
            <span id="scheme-pf">Provident Fund (PF) applies<small>Worked out on the components marked as PF wage.</small></span></label>
          <div className="hr-form-grid hr-pay-grid">
            <Field label="Employee rate (%)" htmlFor="pf-emp" error={errors['pf.employeeRate']}>
              <input id="pf-emp" inputMode="decimal" value={form.pf.employeeRate} disabled={readOnly} onChange={(e) => update((f) => ({ ...f, pf: { ...f.pf, employeeRate: e.target.value } }))} />
            </Field>
            <Field label="Employer rate (%)" htmlFor="pf-er" error={errors['pf.employerRate']}>
              <input id="pf-er" inputMode="decimal" value={form.pf.employerRate} disabled={readOnly} onChange={(e) => update((f) => ({ ...f, pf: { ...f.pf, employerRate: e.target.value } }))} />
            </Field>
            <Field label="Monthly wage ceiling (₹)" htmlFor="pf-ceil" error={errors['pf.wageCeiling']} hint="Leave empty if there is no ceiling.">
              <input id="pf-ceil" inputMode="decimal" value={form.pf.wageCeiling} disabled={readOnly} onChange={(e) => update((f) => ({ ...f, pf: { ...f.pf, wageCeiling: e.target.value } }))} />
            </Field>
            <RoundingSelect id="pf-round" value={form.pf.rounding} disabled={readOnly} onChange={(rounding) => update((f) => ({ ...f, pf: { ...f.pf, rounding } }))} />
          </div>
        </section>

        <section className="hr-pay-scheme" aria-labelledby="scheme-esi">
          <label className="hr-check"><input type="checkbox" checked={form.esi.enabled} disabled={readOnly} onChange={(e) => update((f) => ({ ...f, esi: { ...f.esi, enabled: e.target.checked } }))} />
            <span id="scheme-esi">Employees' State Insurance (ESI) applies<small>Only for people whose full monthly gross is within the threshold below.</small></span></label>
          <div className="hr-form-grid hr-pay-grid">
            <Field label="Employee rate (%)" htmlFor="esi-emp" error={errors['esi.employeeRate']}>
              <input id="esi-emp" inputMode="decimal" value={form.esi.employeeRate} disabled={readOnly} onChange={(e) => update((f) => ({ ...f, esi: { ...f.esi, employeeRate: e.target.value } }))} />
            </Field>
            <Field label="Employer rate (%)" htmlFor="esi-er" error={errors['esi.employerRate']}>
              <input id="esi-er" inputMode="decimal" value={form.esi.employerRate} disabled={readOnly} onChange={(e) => update((f) => ({ ...f, esi: { ...f.esi, employerRate: e.target.value } }))} />
            </Field>
            <Field label="Gross threshold (₹ a month)" htmlFor="esi-thr" error={errors['esi.grossThreshold']}>
              <input id="esi-thr" inputMode="decimal" value={form.esi.grossThreshold} disabled={readOnly} onChange={(e) => update((f) => ({ ...f, esi: { ...f.esi, grossThreshold: e.target.value } }))} />
            </Field>
            <RoundingSelect id="esi-round" value={form.esi.rounding} disabled={readOnly} onChange={(rounding) => update((f) => ({ ...f, esi: { ...f.esi, rounding } }))} />
          </div>
        </section>

        <section className="hr-pay-scheme" aria-labelledby="scheme-pt">
          <label className="hr-check"><input type="checkbox" checked={form.pt.enabled} disabled={readOnly} onChange={(e) => update((f) => ({ ...f, pt: { ...f.pt, enabled: e.target.checked } }))} />
            <span id="scheme-pt">Professional tax applies<small>One monthly amount, chosen by the slab that the month's earned gross falls in.</small></span></label>
          <div className="hr-form-grid hr-pay-grid">
            <Field label="State (optional)" htmlFor="pt-state" hint="For your own reference.">
              <input id="pt-state" value={form.pt.state} disabled={readOnly} maxLength={60} onChange={(e) => update((f) => ({ ...f, pt: { ...f.pt, state: e.target.value } }))} />
            </Field>
          </div>
          <div className="hr-pay-slabs">
            {form.pt.slabs.map((slab, index) => (
              <fieldset key={slab.key} className="hr-pay-comp" disabled={readOnly}>
                <legend>Slab {index + 1}</legend>
                <div className="hr-pay-comp__grid">
                  <Field label="From (₹)" htmlFor={`${slab.key}-from`} error={slabError(index, 'from')}>
                    <input id={`${slab.key}-from`} inputMode="decimal" value={slab.from} onChange={(e) => update((f) => ({ ...f, pt: { ...f.pt, slabs: f.pt.slabs.map((s, i) => (i === index ? { ...s, from: e.target.value } : s)) } }))} />
                  </Field>
                  <Field label="To (₹)" htmlFor={`${slab.key}-to`} error={slabError(index, 'to')} hint="Empty means no upper limit.">
                    <input id={`${slab.key}-to`} inputMode="decimal" value={slab.to} onChange={(e) => update((f) => ({ ...f, pt: { ...f.pt, slabs: f.pt.slabs.map((s, i) => (i === index ? { ...s, to: e.target.value } : s)) } }))} />
                  </Field>
                  <Field label="Tax each month (₹)" htmlFor={`${slab.key}-monthly`} error={slabError(index, 'monthly')}>
                    <input id={`${slab.key}-monthly`} inputMode="decimal" value={slab.monthly} onChange={(e) => update((f) => ({ ...f, pt: { ...f.pt, slabs: f.pt.slabs.map((s, i) => (i === index ? { ...s, monthly: e.target.value } : s)) } }))} />
                  </Field>
                </div>
                <div className="hr-pay-comp__flags">
                  <button type="button" className="uc01-admin-button uc01-admin-button--danger hr-pay-button" onClick={() => update((f) => ({ ...f, pt: { ...f.pt, slabs: f.pt.slabs.filter((_, i) => i !== index) } }))}>Remove slab</button>
                </div>
              </fieldset>
            ))}
            {errors['pt.slabs'] && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{errors['pt.slabs']}</div>}
            {canManage && (
              <button type="button" className="uc01-admin-button hr-pay-button" disabled={readOnly} onClick={() => update((f) => ({ ...f, pt: { ...f.pt, slabs: [...f.pt.slabs, newSlab()] } }))}>Add a slab</button>
            )}
          </div>
        </section>

        {problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem}</div>}

        {canManage ? (
          <div className="hr-pay-savebar">
            <p className="hr-pay-note">
              {data.confirmed
                ? 'Saving changes clears the CA confirmation. The CA must confirm again before the next run can be approved.'
                : 'Saving changes keeps these settings unconfirmed until the CA confirms them below.'}
            </p>
            <button type="submit" className="uc01-admin-button uc01-admin-button--primary hr-pay-button" disabled={save.isPending || !dirty}>
              {save.isPending ? 'Saving…' : dirty ? 'Save settings' : 'No changes to save'}
            </button>
          </div>
        ) : (
          <p className="hr-pay-note">You can read these settings. Only people who manage HR settings can change them.</p>
        )}
      </form>

      {canManage && !data.confirmed && (
        <section className="hr-pay-scheme" aria-labelledby="ca-confirm">
          <h3 id="ca-confirm">Record the CA's confirmation</h3>
          <p className="hr-pay-sub">Use this only after your CA has checked exactly what is saved above. Say who confirmed and how, for example the CA's name and the date.</p>
          <label className="uc01-admin-reason">
            <span>Confirmation note (required)</span>
            <textarea rows={2} maxLength={300} value={confirmNote} disabled={confirm.isPending || dirty} onChange={(e) => { setConfirmNote(e.target.value); setConfirmProblem(''); }} />
          </label>
          {dirty && <p className="hr-pay-note">Save your changes first. The CA confirms what is saved, not what is on screen.</p>}
          {confirmProblem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{confirmProblem}</div>}
          <div>
            <button type="button" className="uc01-admin-button uc01-admin-button--primary hr-pay-button" disabled={confirm.isPending || dirty} onClick={trySubmitConfirm}>
              {confirm.isPending ? 'Recording…' : 'The CA has confirmed these settings'}
            </button>
          </div>
        </section>
      )}

      {askSave && (
        <Modal eyebrow="Statutory settings" title="Save and clear the CA confirmation?" titleId="statutory-save" busy={save.isPending} onClose={() => setAskSave(false)}>
          <p>These settings are confirmed by the CA today. Saving your changes removes that confirmation, and the CA has to confirm the new settings before any run can be approved.</p>
          <div className="uc01-admin-dialog__actions">
            <button type="button" className="uc01-admin-button hr-pay-button" disabled={save.isPending} onClick={() => setAskSave(false)}>Keep editing</button>
            <button type="button" className="uc01-admin-button uc01-admin-button--primary hr-pay-button" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : 'Save and clear confirmation'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
