import { useState } from 'react';

import type { ExperienceInput } from '../../services/hr/employees';
import Field from './Field';
import {
  emptyExperience,
  isoToday,
  toExperienceInput,
  validateExperience,
  type ExperienceFormValues,
} from './employeeValidation';

interface Props {
  initial?: ExperienceFormValues;
  idPrefix: string;
  submitLabel: string;
  busy?: boolean;
  serverError?: string;
  onSubmit: (input: ExperienceInput) => void;
  onCancel?: () => void;
}

/** One previous job: company, place, designation, the dates worked and an optional note. */
export default function ExperienceEditor({ initial = emptyExperience, idPrefix, submitLabel, busy = false, serverError, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<ExperienceFormValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof ExperienceFormValues, string>>>({});
  const set = (key: keyof ExperienceFormValues, value: string) => setValues((v) => ({ ...v, [key]: value }));
  const max = isoToday();

  const submit = () => {
    const found = validateExperience(values);
    setErrors(found);
    if (Object.keys(found).length === 0) onSubmit(toExperienceInput(values));
  };

  return (
    <div className="hr-qualification-editor" role="group" aria-label="Previous experience details">
      <div className="hr-form-grid">
        <Field label="Company" htmlFor={`${idPrefix}-company`} error={errors.company} required wide>
          <input id={`${idPrefix}-company`} value={values.company} maxLength={120} autoComplete="off" onChange={(e) => set('company', e.target.value)} />
        </Field>
        <Field label="Designation" htmlFor={`${idPrefix}-designation`} error={errors.designation} required>
          <input id={`${idPrefix}-designation`} value={values.designation} maxLength={80} autoComplete="off" onChange={(e) => set('designation', e.target.value)} />
        </Field>
        <Field label="Location" htmlFor={`${idPrefix}-location`} error={errors.location}>
          <input id={`${idPrefix}-location`} value={values.location} maxLength={80} autoComplete="off" onChange={(e) => set('location', e.target.value)} />
        </Field>
        <Field label="From" htmlFor={`${idPrefix}-from`} error={errors.fromDate} required>
          <input id={`${idPrefix}-from`} type="date" max={max} value={values.fromDate} onChange={(e) => set('fromDate', e.target.value)} />
        </Field>
        <Field label="To" htmlFor={`${idPrefix}-to`} error={errors.toDate} required>
          <input id={`${idPrefix}-to`} type="date" min={values.fromDate || undefined} max={max} value={values.toDate} onChange={(e) => set('toDate', e.target.value)} />
        </Field>
        <Field label="Note" htmlFor={`${idPrefix}-description`} error={errors.description} wide hint="Optional. What you did there.">
          <textarea id={`${idPrefix}-description`} rows={2} maxLength={500} value={values.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
      </div>
      {serverError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{serverError}</div>}
      <div className="hr-actions">
        <button type="button" className="uc01-admin-button uc01-admin-button--primary uc01-admin-button--compact" disabled={busy} onClick={submit}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
