import { useState } from 'react';

import type { Degree } from '../../services/hr/employees';
import Field from './Field';
import {
  emptyQualification,
  toQualificationInput,
  validateQualification,
  type QualificationFormValues,
} from './employeeValidation';
import type { QualificationInput } from '../../services/hr/employees';

interface Props {
  degrees: Degree[];
  initial?: QualificationFormValues;
  idPrefix: string;
  submitLabel: string;
  busy?: boolean;
  serverError?: string;
  onSubmit: (input: QualificationInput) => void;
  onCancel?: () => void;
}

/** One degree: its name from the catalogue, marks as a percentage, and the year passed. */
export default function QualificationEditor({
  degrees,
  initial = emptyQualification,
  idPrefix,
  submitLabel,
  busy = false,
  serverError,
  onSubmit,
  onCancel,
}: Props) {
  const [values, setValues] = useState<QualificationFormValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof QualificationFormValues, string>>>({});
  const set = (key: keyof QualificationFormValues, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const levels = Array.from(new Set(degrees.map((d) => d.level)));

  const submit = () => {
    const found = validateQualification(values);
    setErrors(found);
    if (Object.keys(found).length === 0) onSubmit(toQualificationInput(values));
  };

  return (
    <div className="hr-qualification-editor" role="group" aria-label="Qualification details">
      <div className="hr-form-grid">
        <Field label="Degree" htmlFor={`${idPrefix}-degree`} error={errors.degreeCode} required wide>
          <select id={`${idPrefix}-degree`} value={values.degreeCode} onChange={(e) => set('degreeCode', e.target.value)}>
            <option value="">Choose a degree…</option>
            {levels.map((level) => (
              <optgroup key={level} label={level}>
                {degrees.filter((d) => d.level === level).map((d) => (
                  <option key={d.code} value={d.code}>{d.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        {values.degreeCode === 'OTHER' && (
          <Field label="Degree name" htmlFor={`${idPrefix}-other`} error={errors.degreeOther} required wide>
            <input id={`${idPrefix}-other`} value={values.degreeOther} maxLength={120} onChange={(e) => set('degreeOther', e.target.value)} />
          </Field>
        )}
        <Field label="Marks (%)" htmlFor={`${idPrefix}-pct`} error={errors.percentage} required>
          <input id={`${idPrefix}-pct`} inputMode="decimal" value={values.percentage} onChange={(e) => set('percentage', e.target.value)} />
        </Field>
        <Field label="Year of passing" htmlFor={`${idPrefix}-year`} error={errors.yearOfPassing} required>
          <input id={`${idPrefix}-year`} inputMode="numeric" maxLength={4} value={values.yearOfPassing} onChange={(e) => set('yearOfPassing', e.target.value)} />
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
