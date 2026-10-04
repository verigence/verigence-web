import type { SalaryTemplate } from '../../services/hr/payroll';
import Field from './Field';
import { isInBand, parseGross, validateProposal, type ProposalErrors, type ProposalForm } from './payroll/salaryRules';
import '../../styles/hr-payroll.css';

/** The salary a person fills in; the employee is added when it is sent. */
export type SalaryDraft = Omit<ProposalForm, 'employeeId'>;

export const emptySalaryDraft: SalaryDraft = { gross: '', effectiveFrom: '', templateId: '', bandConfirmed: false, note: '' };

/** Nothing typed in the required fields: the salary is being left for later. */
export const isSalaryDraftEmpty = (d: SalaryDraft) => !d.gross.trim() && !d.effectiveFrom && !d.templateId;

/** Same rules as the Salaries page; the person is not known yet, so a placeholder stands in. */
export const validateSalaryDraft = (d: SalaryDraft): ProposalErrors => {
  const errors = validateProposal({ ...d, employeeId: 'pending' });
  delete errors.employeeId;
  return errors;
};

interface Props {
  idPrefix: string;
  draft: SalaryDraft;
  errors: ProposalErrors;
  disabled?: boolean;
  templates: SalaryTemplate[];
  templatesLoading: boolean;
  templatesError: string;
  onChange: (patch: Partial<SalaryDraft>) => void;
}

/** Monthly gross, start date, template and note: the fields of a salary proposal, using the Salaries page rules. */
export default function SalaryEntryFields({ idPrefix, draft, errors, disabled, templates, templatesLoading, templatesError, onChange }: Props) {
  const gross = parseGross(draft.gross);
  const inBand = gross.ok && isInBand(gross.value);
  const activeTemplates = templates.filter((t) => t.active);
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <div className="hr-form">
      <div className="hr-form-grid hr-pay-grid">
        <Field label="Monthly gross (₹)" htmlFor={id('gross')} required error={errors.gross} hint="Before any deductions. Digits, with up to two decimals.">
          <input id={id('gross')} inputMode="decimal" autoComplete="off" value={draft.gross} disabled={disabled} aria-invalid={Boolean(errors.gross)} onChange={(e) => onChange({ gross: e.target.value })} />
        </Field>
        <Field label="Effective from" htmlFor={id('from')} required error={errors.effectiveFrom}>
          <input id={id('from')} type="date" value={draft.effectiveFrom} disabled={disabled} aria-invalid={Boolean(errors.effectiveFrom)} onChange={(e) => onChange({ effectiveFrom: e.target.value })} />
        </Field>
        <Field
          label="Template"
          htmlFor={id('template')}
          required={inBand}
          error={errors.templateId}
          hint={inBand ? undefined : 'Leave on the default unless this person needs a different layout.'}
          wide
        >
          <select id={id('template')} value={draft.templateId} disabled={disabled || templatesLoading} aria-invalid={Boolean(errors.templateId)} onChange={(e) => onChange({ templateId: e.target.value, bandConfirmed: false })}>
            <option value="">{inBand ? 'Choose a template' : 'Default for this amount'}</option>
            {activeTemplates.map((t) => <option key={t.templateId} value={t.templateId}>{t.name} ({t.code})</option>)}
          </select>
        </Field>
      </div>

      {templatesError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">The templates could not be loaded. {templatesError}</div>}

      {inBand && (
        <div className="hr-pay-band" role="group" aria-labelledby={id('band')}>
          <strong id={id('band')}>This amount has no default template</strong>
          <p>A gross from ₹21,001 to ₹25,000 is not covered by a default template. Choose the template yourself and confirm it below.</p>
          <label className={`hr-check${errors.bandConfirmed ? ' hr-pay-check--error' : ''}`}>
            <input type="checkbox" checked={draft.bandConfirmed} disabled={!draft.templateId || disabled} onChange={(e) => onChange({ bandConfirmed: e.target.checked })} />
            <span>
              I chose this template on purpose for this salary.
              <small>{draft.templateId ? 'Required before this can be proposed.' : 'Choose a template first.'}</small>
            </span>
          </label>
          {errors.bandConfirmed && <span className="hr-field__error" role="alert">{errors.bandConfirmed}</span>}
        </div>
      )}

      <Field label="Note for Finance (optional)" htmlFor={id('note')} error={errors.note} hint="Up to 300 characters." wide>
        <textarea id={id('note')} rows={2} maxLength={300} value={draft.note} disabled={disabled} onChange={(e) => onChange({ note: e.target.value })} />
      </Field>
    </div>
  );
}
