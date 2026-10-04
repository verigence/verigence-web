import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createTemplate, payrollKeys, updateTemplate, type ComponentBasis, type SalaryTemplate } from '../../../services/hr/payroll';
import { useSessionStore } from '../../../store/sessionStore';
import Field from '../Field';
import Modal from './Modal';
import { errorCode, payrollErrorMessage } from './payrollErrors';
import {
  BASES,
  BASIS_LABELS,
  blankRow,
  blankTemplateForm,
  buildTemplateInput,
  formFromTemplate,
  hasTemplateErrors,
  MAX_COMPONENTS,
  validateTemplate,
  type ComponentRow,
  type TemplateErrors,
  type TemplateForm,
} from './templateForm';

interface Props {
  /** The template being edited, or null to create a new one. */
  template: SalaryTemplate | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export default function TemplateEditorDialog({ template, onClose, onSaved }: Props) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const mode = template ? 'edit' : 'create';
  const [form, setForm] = useState<TemplateForm>(() => (template ? formFromTemplate(template) : blankTemplateForm()));
  const [errors, setErrors] = useState<TemplateErrors>({ rows: {} });
  const [problem, setProblem] = useState('');

  const save = useMutation({
    mutationFn: () => {
      const input = buildTemplateInput(form);
      return template ? updateTemplate(accessToken!, template.templateId, input) : createTemplate(accessToken!, form.code, input);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: payrollKeys.templates });
      onSaved(`${mode === 'create' ? 'Template created' : 'Template saved'}: ${saved.name}.`);
    },
    onError: (error) => {
      if (errorCode(error) === 'TEMPLATE_CODE_EXISTS') setErrors((e) => ({ ...e, code: 'A template with this code already exists.' }));
      setProblem(payrollErrorMessage(error));
    },
  });

  const change = (patch: Partial<TemplateForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors({ rows: {} });
  };
  const changeRow = (index: number, patch: Partial<ComponentRow>) =>
    change({ components: form.components.map((row, i) => (i === index ? { ...row, ...patch } : row)) });

  const submit = () => {
    const found = validateTemplate(form, mode);
    setErrors(found);
    if (hasTemplateErrors(found)) {
      setProblem('Some details need attention. They are marked below.');
      return;
    }
    setProblem('');
    save.mutate();
  };

  const busy = save.isPending;

  return (
    <Modal wide eyebrow="Salary template" title={template ? `Edit ${template.name}` : 'New salary template'} titleId="template-editor" busy={busy} onClose={onClose}>
      <p>
        A template says how a monthly gross is split. When a salary is proposed the parts are worked out and stored, so changing a template
        later never changes a salary that was already proposed.
      </p>
      <form className="hr-form" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <div className="hr-form-grid hr-pay-grid">
          {mode === 'create' ? (
            <Field label="Code" htmlFor="tpl-code" required error={errors.code} hint="Capital letters, digits and underscores, for example SALES_TEAM. It cannot be changed later.">
              <input id="tpl-code" value={form.code} maxLength={30} autoCapitalize="characters" disabled={busy}
                onChange={(e) => change({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} aria-invalid={Boolean(errors.code)} />
            </Field>
          ) : (
            <Field label="Code" htmlFor="tpl-code" hint="The code cannot be changed.">
              <input id="tpl-code" value={form.code} disabled readOnly />
            </Field>
          )}
          <Field label="Name" htmlFor="tpl-name" required error={errors.name}>
            <input id="tpl-name" value={form.name} maxLength={100} disabled={busy} onChange={(e) => change({ name: e.target.value })} aria-invalid={Boolean(errors.name)} />
          </Field>
          <Field label="Description (optional)" htmlFor="tpl-desc" error={errors.description} wide>
            <input id="tpl-desc" value={form.description} maxLength={300} disabled={busy} onChange={(e) => change({ description: e.target.value })} />
          </Field>
        </div>
        <label className="hr-check">
          <input type="checkbox" checked={form.active} disabled={busy} onChange={(e) => change({ active: e.target.checked })} />
          <span>In use<small>Only templates in use can be chosen when proposing a salary.</small></span>
        </label>

        <div className="hr-pay-components">
          <h3>Components</h3>
          <p className="hr-pay-sub">
            Percentages of gross and fixed amounts come first, then percentages of Basic (needs a component coded BASIC). Exactly one component is the
            remainder and takes whatever is left, so the parts always add up to the gross.
          </p>
          {form.components.map((row, index) => {
            const rowErrors = errors.rows[index] ?? {};
            return (
              <fieldset key={row.key} className="hr-pay-comp" disabled={busy}>
                <legend>Component {index + 1}</legend>
                <div className="hr-pay-comp__grid">
                  <Field label="Code" htmlFor={`${row.key}-code`} error={rowErrors.code}>
                    <input id={`${row.key}-code`} value={row.code} maxLength={20}
                      onChange={(e) => changeRow(index, { code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} />
                  </Field>
                  <Field label="Label" htmlFor={`${row.key}-label`} error={rowErrors.label}>
                    <input id={`${row.key}-label`} value={row.label} maxLength={60} onChange={(e) => changeRow(index, { label: e.target.value })} />
                  </Field>
                  <Field label="Worked out as" htmlFor={`${row.key}-basis`}>
                    <select id={`${row.key}-basis`} value={row.basis} onChange={(e) => changeRow(index, { basis: e.target.value as ComponentBasis })}>
                      {BASES.map((b) => <option key={b} value={b}>{BASIS_LABELS[b]}</option>)}
                    </select>
                  </Field>
                  {row.basis !== 'REMAINDER' ? (
                    <Field label={row.basis === 'FIXED' ? 'Amount (₹)' : 'Percent'} htmlFor={`${row.key}-value`} error={rowErrors.value}>
                      <input id={`${row.key}-value`} inputMode="decimal" value={row.value} onChange={(e) => changeRow(index, { value: e.target.value })} />
                    </Field>
                  ) : (
                    <div className="hr-field"><span className="hr-field__hint hr-pay-remainder">Takes whatever is left of the gross.</span></div>
                  )}
                </div>
                <div className="hr-pay-comp__flags">
                  <label className="hr-check"><input type="checkbox" checked={row.pfWage} onChange={(e) => changeRow(index, { pfWage: e.target.checked })} /><span>Counts as PF wage</span></label>
                  <label className="hr-check"><input type="checkbox" checked={row.esiWage} onChange={(e) => changeRow(index, { esiWage: e.target.checked })} /><span>Counts as ESI wage</span></label>
                  <button type="button" className="uc01-admin-button uc01-admin-button--danger hr-pay-button" disabled={form.components.length <= 2}
                    onClick={() => change({ components: form.components.filter((_, i) => i !== index) })}>Remove</button>
                </div>
              </fieldset>
            );
          })}
          {errors.general && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{errors.general}</div>}
          <button type="button" className="uc01-admin-button hr-pay-button" disabled={busy || form.components.length >= MAX_COMPONENTS}
            onClick={() => change({ components: [...form.components, blankRow('FIXED')] })}>Add a component</button>
        </div>

        {problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem}</div>}
        <div className="uc01-admin-dialog__actions">
          <button type="button" className="uc01-admin-button hr-pay-button" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="uc01-admin-button uc01-admin-button--primary hr-pay-button" disabled={busy}>
            {busy ? 'Saving…' : mode === 'create' ? 'Create template' : 'Save template'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
