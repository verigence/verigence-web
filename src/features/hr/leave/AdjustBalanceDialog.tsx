import { useState, type FormEvent } from 'react';

import type { LeaveAdjustInput, PaidLeaveType } from '../../../services/hr/leave';
import LeaveDialog from './LeaveDialog';
import { paidTypeLabels, parseAdjustDays, validateAdjust, type AdjustErrors, type AdjustForm } from './leaveLogic';

interface Props {
  employeeName: string;
  defaultYear: number;
  busy: boolean;
  error: string;
  onSubmit: (input: LeaveAdjustInput) => void;
  onClose: () => void;
}

/** HR adds or takes off days. A reason is required; it is kept in the balance ledger and audit history. */
export default function AdjustBalanceDialog({ employeeName, defaultYear, busy, error, onSubmit, onClose }: Props) {
  const [form, setForm] = useState<AdjustForm>({ leaveType: 'SICK', year: String(defaultYear), days: '', note: '' });
  const [errors, setErrors] = useState<AdjustErrors>({});

  const change = (patch: Partial<AdjustForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setErrors((current) => {
      const rest = { ...current };
      for (const key of Object.keys(patch)) delete rest[key as keyof AdjustErrors];
      return rest;
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const found = validateAdjust(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSubmit({ leave_type: form.leaveType, year: Number(form.year), days: parseAdjustDays(form.days)!, note: form.note.trim() });
  };

  const days = parseAdjustDays(form.days);
  const preview = days === null || errors.year
    ? ''
    : `${days > 0 ? 'Adds' : 'Takes off'} ${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} ${days > 0 ? 'to' : 'from'} ${employeeName}'s ${paidTypeLabels[form.leaveType]} balance for ${form.year}.`;

  return (
    <LeaveDialog title={`Adjust balance for ${employeeName}`} titleId="leave-adjust-title" eyebrow="Leave overview" busy={busy} onClose={onClose}>
      <form className="hr-form" noValidate onSubmit={submit}>
        <div className="hr-form-grid hr-leave-adjust-grid">
          <div className="hr-field">
            <label htmlFor="adjust-type">Type</label>
            <select id="adjust-type" value={form.leaveType} onChange={(e) => change({ leaveType: e.target.value as PaidLeaveType })}>
              <option value="SICK">Sick</option>
              <option value="EARNED">Earned</option>
            </select>
          </div>
          <div className={`hr-field${errors.year ? ' hr-field--error' : ''}`}>
            <label htmlFor="adjust-year">Year</label>
            <input id="adjust-year" type="number" inputMode="numeric" min={2020} max={2100} value={form.year} onChange={(e) => change({ year: e.target.value })} />
            {errors.year && <span className="hr-field__error">{errors.year}</span>}
          </div>
          <div className={`hr-field hr-field--wide${errors.days ? ' hr-field--error' : ''}`}>
            <label htmlFor="adjust-days">Days to add or take off <span className="hr-field__required">*</span></label>
            <input id="adjust-days" type="text" inputMode="decimal" placeholder="For example 2 or -1.5" value={form.days} aria-invalid={Boolean(errors.days)} onChange={(e) => change({ days: e.target.value })} />
            {errors.days ? <span className="hr-field__error">{errors.days}</span> : <span className="hr-field__hint">A minus sign takes days off the balance.</span>}
          </div>
          <div className={`hr-field hr-field--wide${errors.note ? ' hr-field--error' : ''}`}>
            <label htmlFor="adjust-note">Reason <span className="hr-field__required">*</span></label>
            <textarea id="adjust-note" rows={3} maxLength={300} value={form.note} aria-invalid={Boolean(errors.note)} onChange={(e) => change({ note: e.target.value })} />
            {errors.note ? <span className="hr-field__error">{errors.note}</span> : <span className="hr-field__hint">Kept with the change in the leave history.</span>}
          </div>
        </div>
        {preview && <div className="uc01-admin-message uc01-admin-message--info" role="status">{preview}</div>}
        {error && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</div>}
        <div className="uc01-admin-dialog__actions">
          <button type="button" className="uc01-admin-button" disabled={busy} onClick={onClose}>Close</button>
          <button type="submit" className="uc01-admin-button uc01-admin-button--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Confirm adjustment'}
          </button>
        </div>
      </form>
    </LeaveDialog>
  );
}
