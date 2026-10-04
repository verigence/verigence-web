import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getRunLine, payrollKeys, setLineInputs, type RunLine, type RunLineDetail } from '../../../services/hr/payroll';
import { useSessionStore } from '../../../store/sessionStore';
import { formatDate } from '../hrLabels';
import Field from '../Field';
import { buildInputs, formFromLine, hasInputErrors, MAX_ADJUSTMENTS, newAdjustment, validateInputs, type InputsErrors, type InputsForm } from './lineInputs';
import Modal from './Modal';
import { formatDays, formatRupees, formatSignedRupees } from './money';
import { payrollErrorMessage } from './payrollErrors';
import { ErrorState, LoadingState } from './PayrollStates';

function Rows({ title, rows, empty }: { title: string; rows: Array<{ key: string; label: string; sub?: string; amount: ReactNode }>; empty?: string }) {
  if (rows.length === 0 && !empty) return null;
  return (
    <section className="hr-pay-block">
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="hr-pay-sub">{empty}</p> : (
        <ul className="hr-pay-rows">
          {rows.map((r) => (
            <li key={r.key}>
              <span>{r.label}{r.sub && <small>{r.sub}</small>}</span>
              <span className="hr-pay-money">{r.amount}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Breakdown({ line }: { line: RunLineDetail }) {
  const f = line.figures;
  const d = f.days;
  return (
    <div className="hr-pay-breakdown">
      <section className="hr-pay-block">
        <h3>Days</h3>
        <dl className="hr-pay-facts">
          <div><dt>Days in month</dt><dd>{d.inMonth}</dd></div>
          <div><dt>Working days</dt><dd>{d.workingDays}</dd></div>
          <div><dt>Present</dt><dd>{formatDays(d.presentDays)}</dd></div>
          <div><dt>Paid leave</dt><dd>{formatDays(d.paidLeaveDays)}</dd></div>
          <div><dt>Unpaid leave</dt><dd>{formatDays(d.unpaidLeaveDays)}</dd></div>
          <div><dt>Extra loss of pay (HR)</dt><dd>{formatDays(d.extraLopDays)}</dd></div>
          <div><dt>Before joining</dt><dd>{d.beforeJoiningDays}</dd></div>
          <div><dt>Absent</dt><dd>{formatDays(d.absentDays)}</dd></div>
          <div><dt>Loss of pay</dt><dd>{formatDays(d.lopDays)}</dd></div>
          <div><dt>Paid days</dt><dd><strong>{formatDays(d.paidDays)}</strong></dd></div>
        </dl>
      </section>
      <Rows title="Earnings" rows={f.earnings.map((e) => ({ key: e.code, label: e.label, sub: `Full month ${formatRupees(e.monthly)}`, amount: formatRupees(e.amount) }))} />
      <Rows title="Deductions" empty="No deductions." rows={f.deductions.map((e) => ({ key: e.code, label: e.label, amount: formatRupees(e.amount) }))} />
      <Rows title="Employer contributions (not taken from pay)" rows={f.employer.map((e) => ({ key: e.code, label: e.label, amount: formatRupees(e.amount) }))} />
      <Rows
        title="Adjustments"
        rows={f.adjustments.map((a, i) => ({
          key: `${i}-${a.label}`,
          label: a.label,
          sub: [a.taxable ? 'taxable' : 'not taxable', a.note].filter(Boolean).join(' · '),
          amount: formatSignedRupees(a.amount),
        }))}
      />
      <Rows
        title="Reimbursements (paid with salary, not part of pay)"
        rows={f.reimbursements.map((r) => ({ key: r.claimId, label: r.label, sub: formatDate(r.date), amount: formatRupees(r.amount) }))}
      />
      <section className="hr-pay-block hr-pay-block--totals">
        <h3>Totals</h3>
        <ul className="hr-pay-rows">
          <li><span>Gross for a full month</span><span className="hr-pay-money">{formatRupees(f.gross_full)}</span></li>
          <li><span>Gross earned</span><span className="hr-pay-money">{formatRupees(f.gross_earned)}</span></li>
          <li><span>Total deductions</span><span className="hr-pay-money">{formatRupees(f.total_deductions)}</span></li>
          <li><span>Net pay</span><span className="hr-pay-money hr-pay-money--strong">{formatRupees(f.net_pay)}</span></li>
          <li><span>Reimbursements</span><span className="hr-pay-money">{formatRupees(f.reimbursement_total)}</span></li>
          <li><span>Payable</span><span className="hr-pay-money hr-pay-money--strong">{formatRupees(f.payable_total)}</span></li>
        </ul>
      </section>
    </div>
  );
}

function InputsEditor({ runId, line }: { runId: string; line: RunLineDetail }) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<InputsForm>(() => formFromLine(line.extraLopDays, line.adjustments));
  const [errors, setErrors] = useState<InputsErrors>({ rows: {} });
  const [problem, setProblem] = useState('');
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () => setLineInputs(accessToken!, runId, line.employeeId, buildInputs(form)),
    onSuccess: (updated) => {
      queryClient.setQueryData(payrollKeys.line(runId, line.employeeId), updated);
      // The run's totals changed too; the next look at the run fetches them.
      void queryClient.invalidateQueries({ queryKey: payrollKeys.run(runId), exact: true });
      void queryClient.invalidateQueries({ queryKey: payrollKeys.runs });
      setSaved(true);
    },
    onError: (error) => setProblem(payrollErrorMessage(error)),
  });

  const change = (next: InputsForm) => {
    setForm(next);
    setErrors({ rows: {} });
    setSaved(false);
  };
  const changeRow = (index: number, patch: Partial<InputsForm['adjustments'][number]>) =>
    change({ ...form, adjustments: form.adjustments.map((a, i) => (i === index ? { ...a, ...patch } : a)) });

  const submit = () => {
    const found = validateInputs(form);
    setErrors(found);
    if (hasInputErrors(found)) {
      setProblem('Some details need attention. They are marked below.');
      return;
    }
    setProblem('');
    save.mutate();
  };

  return (
    <form className="hr-form hr-pay-inputs" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <h3>Loss of pay and adjustments</h3>
      <p className="hr-pay-sub">
        While the run is a draft you can add days of loss of pay and one-off adjustments for this person. They are kept when you recompute.
        Use a minus sign for a deduction, for example -500.
      </p>
      <Field label="Extra loss-of-pay days" htmlFor="lop-days" error={errors.extraLop} hint="On top of unpaid leave. Up to one decimal, for example 1.5.">
        <input id="lop-days" inputMode="decimal" value={form.extraLop} disabled={save.isPending} onChange={(e) => change({ ...form, extraLop: e.target.value })} aria-invalid={Boolean(errors.extraLop)} />
      </Field>
      {form.adjustments.map((row, index) => {
        const rowErrors = errors.rows[index] ?? {};
        return (
          <fieldset key={row.key} className="hr-pay-comp" disabled={save.isPending}>
            <legend>Adjustment {index + 1}</legend>
            <div className="hr-pay-comp__grid">
              <Field label="What it is for" htmlFor={`${row.key}-label`} error={rowErrors.label}>
                <input id={`${row.key}-label`} value={row.label} maxLength={80} onChange={(e) => changeRow(index, { label: e.target.value })} />
              </Field>
              <Field label="Amount (₹)" htmlFor={`${row.key}-amount`} error={rowErrors.amount}>
                <input id={`${row.key}-amount`} inputMode="decimal" value={row.amount} placeholder="1000 or -500" onChange={(e) => changeRow(index, { amount: e.target.value })} />
              </Field>
              <Field label="Note (optional)" htmlFor={`${row.key}-note`} error={rowErrors.note}>
                <input id={`${row.key}-note`} value={row.note} maxLength={200} onChange={(e) => changeRow(index, { note: e.target.value })} />
              </Field>
            </div>
            <div className="hr-pay-comp__flags">
              <label className="hr-check"><input type="checkbox" checked={row.taxable} onChange={(e) => changeRow(index, { taxable: e.target.checked })} /><span>Taxable</span></label>
              <button type="button" className="uc01-admin-button uc01-admin-button--danger hr-pay-button" onClick={() => change({ ...form, adjustments: form.adjustments.filter((_, i) => i !== index) })}>Remove</button>
            </div>
          </fieldset>
        );
      })}
      {errors.general && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{errors.general}</div>}
      {problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem}</div>}
      {saved && <div className="uc01-admin-message uc01-admin-message--success" role="status">Saved. The figures above have been worked out again.</div>}
      <div className="hr-actions">
        <button type="button" className="uc01-admin-button hr-pay-button" disabled={save.isPending || form.adjustments.length >= MAX_ADJUSTMENTS} onClick={() => change({ ...form, adjustments: [...form.adjustments, newAdjustment()] })}>Add an adjustment</button>
        <button type="submit" className="uc01-admin-button uc01-admin-button--primary hr-pay-button" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save and recalculate'}</button>
      </div>
    </form>
  );
}

interface Props {
  runId: string;
  line: RunLine;
  canEdit: boolean;
  onClose: () => void;
}

export default function LineDialog({ runId, line, canEdit, onClose }: Props) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const detail = useQuery({
    queryKey: payrollKeys.line(runId, line.employeeId),
    queryFn: () => getRunLine(accessToken!, runId, line.employeeId),
    enabled: Boolean(accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });

  return (
    <Modal wide eyebrow={`${line.employeeCode}${line.designation ? ` · ${line.designation}` : ''}`} title={line.employeeName} titleId="run-line" onClose={onClose}>
      {detail.isLoading && <LoadingState>Loading the breakdown…</LoadingState>}
      {detail.isError && <ErrorState title="The breakdown could not be loaded." error={detail.error} onRetry={() => detail.refetch()} busy={detail.isFetching} />}
      {detail.data && (
        <>
          <Breakdown line={detail.data} />
          {canEdit && <InputsEditor runId={runId} line={detail.data} />}
        </>
      )}
      <div className="uc01-admin-dialog__actions">
        <button type="button" className="uc01-admin-button hr-pay-button" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
