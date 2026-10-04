import { useState, type FormEvent } from 'react';

import type { LeaveApplyInput, LeaveType } from '../../../services/hr/leave';
import HolidayNote from './HolidayNote';
import {
  ADVANCE_DAYS,
  addDays,
  BACKDATE_DAYS,
  buildApplyPayload,
  istToday,
  leaveTypeLabels,
  REASON_MAX,
  validateApply,
  type ApplyErrors,
  type ApplyForm,
} from './leaveLogic';

interface Props {
  busy: boolean;
  /** A problem the server reported for the last attempt, in plain words. */
  serverError: string;
  onSubmit: (payload: LeaveApplyInput) => void;
  onEdit: () => void;
}

const TYPES: LeaveType[] = ['SICK', 'EARNED', 'UNPAID'];

const empty: ApplyForm = { leaveType: '', fromDate: '', toDate: '', halfDay: false, reason: '' };

export default function ApplyLeaveForm({ busy, serverError, onSubmit, onEdit }: Props) {
  const [form, setForm] = useState<ApplyForm>(empty);
  const [errors, setErrors] = useState<ApplyErrors>({});
  const [summary, setSummary] = useState('');
  const today = istToday();
  const singleDay = Boolean(form.fromDate) && form.fromDate === form.toDate;

  const change = (patch: Partial<ApplyForm>) => {
    setForm((current) => {
      const next = { ...current, ...patch };
      // Choosing the first day fills the last day so a one-day leave is two taps.
      if (patch.fromDate !== undefined && (!current.toDate || current.toDate < patch.fromDate)) next.toDate = patch.fromDate;
      if (next.halfDay && next.fromDate !== next.toDate) next.halfDay = false;
      return next;
    });
    setErrors((current) => {
      const rest = { ...current };
      for (const key of Object.keys(patch)) delete rest[key as keyof ApplyErrors];
      delete rest.toDate;
      delete rest.halfDay;
      return rest;
    });
    setSummary('');
    onEdit();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const found = validateApply(form, today);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setSummary('Some details need attention. They are marked below.');
      return;
    }
    setSummary('');
    onSubmit(buildApplyPayload(form));
  };

  const field = (key: keyof ApplyErrors) => (errors[key] ? ' hr-field--error' : '');

  return (
    <form className="hr-form hr-leave-form" noValidate onSubmit={submit} aria-label="Apply for leave">
      <div className="hr-form-grid">
        <div className={`hr-field${field('leaveType')}`}>
          <label htmlFor="leave-type">Type of leave <span className="hr-field__required">*</span></label>
          <select
            id="leave-type"
            value={form.leaveType}
            aria-invalid={Boolean(errors.leaveType)}
            onChange={(e) => change({ leaveType: e.target.value as LeaveType | '' })}
          >
            <option value="">Choose…</option>
            {TYPES.map((t) => <option key={t} value={t}>{leaveTypeLabels[t]}</option>)}
          </select>
          {errors.leaveType && <span className="hr-field__error">{errors.leaveType}</span>}
          {form.leaveType === 'UNPAID' && (
            <span className="hr-field__hint">Unpaid leave does not use your Sick or Earned balance. HR decides it.</span>
          )}
        </div>

        <div className={`hr-field${field('fromDate')}`}>
          <label htmlFor="leave-from">From <span className="hr-field__required">*</span></label>
          <input
            id="leave-from"
            type="date"
            value={form.fromDate}
            min={addDays(today, -BACKDATE_DAYS)}
            max={addDays(today, ADVANCE_DAYS)}
            aria-invalid={Boolean(errors.fromDate)}
            onChange={(e) => change({ fromDate: e.target.value })}
          />
          {errors.fromDate && <span className="hr-field__error">{errors.fromDate}</span>}
        </div>

        <div className={`hr-field${field('toDate')}`}>
          <label htmlFor="leave-to">To <span className="hr-field__required">*</span></label>
          <input
            id="leave-to"
            type="date"
            value={form.toDate}
            min={form.fromDate || addDays(today, -BACKDATE_DAYS)}
            max={addDays(today, ADVANCE_DAYS)}
            aria-invalid={Boolean(errors.toDate)}
            onChange={(e) => change({ toDate: e.target.value })}
          />
          {errors.toDate && <span className="hr-field__error">{errors.toDate}</span>}
        </div>

        <div className={`hr-field hr-field--wide${field('halfDay')}`}>
          <label className="hr-check" htmlFor="leave-half">
            <input
              id="leave-half"
              type="checkbox"
              checked={form.halfDay}
              disabled={!singleDay}
              onChange={(e) => change({ halfDay: e.target.checked })}
            />
            <span>
              Half day
              <small>{singleDay ? 'Counts as half a day.' : 'Available when the leave is for a single date.'}</small>
            </span>
          </label>
          {errors.halfDay && <span className="hr-field__error">{errors.halfDay}</span>}
        </div>

        <div className={`hr-field hr-field--wide${field('reason')}`}>
          <label htmlFor="leave-reason">Reason (optional)</label>
          <textarea
            id="leave-reason"
            rows={3}
            maxLength={REASON_MAX + 50}
            value={form.reason}
            aria-invalid={Boolean(errors.reason)}
            onChange={(e) => change({ reason: e.target.value })}
          />
          {errors.reason && <span className="hr-field__error">{errors.reason}</span>}
        </div>
      </div>

      {form.fromDate && <HolidayNote fromDate={form.fromDate} toDate={form.toDate} />}

      <p className="hr-field__hint">
        The number of days is worked out when you apply. Sundays and declared holidays are not counted. You can apply up to {BACKDATE_DAYS} days
        after the fact, and a request stays within one calendar year.
      </p>

      {summary && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{summary}</div>}
      {serverError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{serverError}</div>}

      <div className="hr-actions hr-actions--form">
        <button type="submit" className="uc01-admin-button uc01-admin-button--primary" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit leave request'}
        </button>
      </div>
    </form>
  );
}
