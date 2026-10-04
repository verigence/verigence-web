import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { proposeStructure, payrollKeys, type SalaryStructure, type SalaryTemplate } from '../../../services/hr/payroll';
import { useSessionStore } from '../../../store/sessionStore';
import { formatDate } from '../hrLabels';
import Field from '../Field';
import ComponentsTable from './ComponentsTable';
import EmployeePicker, { type PickedEmployee } from './EmployeePicker';
import { formatRupees } from './money';
import { payrollErrorMessage } from './payrollErrors';
import { buildProposal, isInBand, parseGross, validateProposal, type ProposalErrors, type ProposalForm } from './salaryRules';
import { describeComponent } from './templateForm';

const empty: ProposalForm = { employeeId: '', gross: '', effectiveFrom: '', templateId: '', bandConfirmed: false, note: '' };

interface Props {
  templates: SalaryTemplate[];
  templatesLoading: boolean;
  templatesError: string;
  onProposed: (structure: SalaryStructure, person: PickedEmployee) => void;
}

export default function ProposeSalaryForm({ templates, templatesLoading, templatesError, onProposed }: Props) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ProposalForm>(empty);
  const [person, setPerson] = useState<PickedEmployee | null>(null);
  const [errors, setErrors] = useState<ProposalErrors>({});
  const [problem, setProblem] = useState('');
  const [result, setResult] = useState<{ structure: SalaryStructure; person: PickedEmployee } | null>(null);

  const gross = parseGross(form.gross);
  const inBand = gross.ok && isInBand(gross.value);
  const activeTemplates = templates.filter((t) => t.active);
  const chosen = activeTemplates.find((t) => t.templateId === form.templateId);

  const set = (change: Partial<ProposalForm>) => {
    setForm((current) => ({ ...current, ...change }));
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(change) as Array<keyof ProposalForm>) delete next[key];
      return next;
    });
  };

  const propose = useMutation({
    mutationFn: () => proposeStructure(accessToken!, buildProposal(form)),
    onSuccess: (structure) => {
      void queryClient.invalidateQueries({ queryKey: payrollKeys.structuresAll });
      const who = person!;
      setResult({ structure, person: who });
      setForm(empty);
      setPerson(null);
      onProposed(structure, who);
    },
    onError: (error) => setProblem(payrollErrorMessage(error)),
  });

  const submit = () => {
    const found = validateProposal(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setProblem('Some details need attention. They are marked below.');
      return;
    }
    setProblem('');
    setResult(null);
    propose.mutate();
  };

  return (
    <SectionCard title="Propose a salary" description="Finance approves it before it counts. The parts are worked out by the HR service from the template and stay fixed once proposed.">
      {result && (
        <div className="hr-pay-outcome" role="status">
          <div className="uc01-admin-message uc01-admin-message--success">
            Proposed for {result.person.fullName} ({result.person.employeeCode}), starting {formatDate(result.structure.effectiveFrom)}. It now waits for Finance.
          </div>
          <p className="hr-pay-sub">As worked out by the HR service, for {formatRupees(result.structure.grossMonthly)} a month:</p>
          <ComponentsTable components={result.structure.components} gross={result.structure.grossMonthly} caption="Components worked out for this proposal" />
        </div>
      )}

      <form className="hr-form" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <div className="hr-form-grid hr-pay-grid">
          <div className="hr-field--wide hr-field">
            <EmployeePicker id="propose-person" label="Person" value={person} error={errors.employeeId} disabled={propose.isPending}
              onChange={(p) => { setPerson(p); set({ employeeId: p?.employeeId ?? '' }); }} />
          </div>
          <Field label="Monthly gross (₹)" htmlFor="propose-gross" required error={errors.gross} hint="Before any deductions. Digits, with up to two decimals.">
            <input id="propose-gross" inputMode="decimal" autoComplete="off" value={form.gross} disabled={propose.isPending}
              onChange={(e) => set({ gross: e.target.value })} aria-invalid={Boolean(errors.gross)} />
          </Field>
          <Field label="Effective from" htmlFor="propose-from" required error={errors.effectiveFrom}>
            <input id="propose-from" type="date" value={form.effectiveFrom} disabled={propose.isPending}
              onChange={(e) => set({ effectiveFrom: e.target.value })} aria-invalid={Boolean(errors.effectiveFrom)} />
          </Field>
          <Field
            label="Template"
            htmlFor="propose-template"
            required={inBand}
            error={errors.templateId}
            hint={inBand ? undefined : 'Leave on the default unless this person needs a different layout.'}
            wide
          >
            <select id="propose-template" value={form.templateId} disabled={propose.isPending || templatesLoading}
              onChange={(e) => set({ templateId: e.target.value, bandConfirmed: false })} aria-invalid={Boolean(errors.templateId)}>
              <option value="">{inBand ? 'Choose a template' : 'Default for this amount'}</option>
              {activeTemplates.map((t) => <option key={t.templateId} value={t.templateId}>{t.name} ({t.code})</option>)}
            </select>
          </Field>
        </div>

        {templatesError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">The templates could not be loaded. {templatesError}</div>}

        {inBand && (
          <div className="hr-pay-band" role="group" aria-labelledby="band-title">
            <strong id="band-title">This amount has no default template</strong>
            <p>A gross from ₹21,001 to ₹25,000 is not covered by a default template. Choose the template yourself and confirm it below.</p>
            <label className={`hr-check${errors.bandConfirmed ? ' hr-pay-check--error' : ''}`}>
              <input type="checkbox" checked={form.bandConfirmed} disabled={!form.templateId || propose.isPending}
                onChange={(e) => set({ bandConfirmed: e.target.checked })} />
              <span>
                I chose this template on purpose for this salary.
                <small>{form.templateId ? 'Required before this can be proposed.' : 'Choose a template first.'}</small>
              </span>
            </label>
            {errors.bandConfirmed && <span className="hr-field__error" role="alert">{errors.bandConfirmed}</span>}
          </div>
        )}

        {chosen && (
          <div className="hr-pay-preview">
            <strong>{chosen.name} uses these components</strong>
            <ul>
              {chosen.components.map((c) => <li key={c.code}>{describeComponent(c)}</li>)}
            </ul>
            <small>The rupee amounts are worked out by the HR service when you propose, and shown here afterwards.</small>
          </div>
        )}

        <Field label="Note for Finance (optional)" htmlFor="propose-note" error={errors.note} hint="Up to 300 characters." wide>
          <textarea id="propose-note" rows={2} maxLength={300} value={form.note} disabled={propose.isPending} onChange={(e) => set({ note: e.target.value })} />
        </Field>

        {problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem}</div>}
        <div className="hr-actions hr-actions--form">
          <button type="submit" className="uc01-admin-button uc01-admin-button--primary hr-pay-button" disabled={propose.isPending}>
            {propose.isPending ? 'Proposing…' : 'Propose salary'}
          </button>
        </div>
      </form>
    </SectionCard>
  );
}
