import { useEffect, useState, type FormEvent } from 'react';

import type { ApplyLeaveType, LeaveApplyInput } from '../../../services/hr/leave';
import HolidayNote from './HolidayNote';
import RecentLeaveNote from './RecentLeaveNote';
import {
  ADVANCE_DAYS,
  addDays,
  BACKDATE_DAYS,
  buildApplyPayload,
  dayWord,
  istToday,
  leaveTypeLabels,
  OCCASION_MAX,
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
  /** Dates chosen elsewhere on the page (for example a day with no attendance). A new value replaces the form's dates. */
  prefill?: { fromDate: string; toDate: string };
  /** The earning settings, when loaded, so the paid leave hint shows the real numbers. */
  earning?: { attendanceDaysNeeded: number; paidDaysEarned: number };
}

const TYPES: ApplyLeaveType[] = ['PAID', 'SPECIAL', 'COMP_OFF', 'UNPAID'];

const empty: ApplyForm = { leaveType: '', fromDate: '', toDate: '', halfDay: false, reason: '', occasion: '' };

function paidHint(earning: Props['earning']): string {
  const needed = earning?.attendanceDaysNeeded ?? 22;
  const earned = earning?.paidDaysEarned ?? 1;
  return `Paid leave is earned: ${dayWord(earned)} for every ${needed} days of attendance (see 'How you earn paid leave' above).`;
}

export default function ApplyLeaveForm({ busy, serverError, onSubmit, onEdit, prefill, earning }: Props) {
  const [form, setForm] = useState<ApplyForm>(() => (prefill ? { ...empty, ...prefill } : empty));
  const [errors, setErrors] = useState<ApplyErrors>({});
  const [summary, setSummary] = useState('');
  const today = istToday();
  const singleDay = Boolean(form.fromDate) && form.fromDate === form.toDate;

  // A date chosen elsewhere on the page replaces the dates here; the type and reason are kept.
  // Each choice is a new object, so choosing the same date again also puts it back.
  useEffect(() => {
    if (!prefill?.fromDate || !prefill.toDate) return;
    const { fromDate, toDate } = prefill;
    setForm((current) => ({ ...current, fromDate, toDate, halfDay: false }));
    setErrors((current) => {
      const rest = { ...current };
      delete rest.fromDate;
      delete rest.toDate;
      delete rest.halfDay;
      return rest;
    });
  }, [prefill]);

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
            onChange={(e) => change({ leaveType: e.target.value as ApplyLeaveType | '' })}
          >
            <option value="">Choose…</option>
            {TYPES.map((t) => <option key={t} value={t}>{leaveTypeLabels[t]}</option>)}
          </select>
          {errors.leaveType && <span className="hr-field__error">{errors.leaveType}</span>}
          {form.leaveType === 'PAID' && <span className="hr-field__hint">{paidHint(earning)}</span>}
          {form.leaveType === 'COMP_OFF' && <span className="hr-field__hint">Earned by approved work on a Sunday or holiday.</span>}
          {form.leaveType === 'UNPAID' && <span className="hr-field__hint">Unpaid leave does not use any balance. HR decides it.</span>}
        </div>

        {form.leaveType === 'SPECIAL' && (
          <div className={`hr-field hr-field--wide${field('occasion')}`}>
            <label htmlFor="leave-occasion">Occasion <span className="hr-field__required">*</span></label>
            <input
              id="leave-occasion"
              type="text"
              maxLength={OCCASION_MAX + 20}
              placeholder="For example: own wedding, sister's wedding"
              value={form.occasion}
              aria-invalid={Boolean(errors.occasion)}
              onChange={(e) => change({ occasion: e.target.value })}
            />
            {errors.occasion
              ? <span className="hr-field__error">{errors.occasion}</span>
              : <span className="hr-field__hint">Special occasion leave has its own yearly quota. Your Team Lead decides it.</span>}
          </div>
        )}

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

      {form.fromDate && <HolidayNote fromDate={form.fromDate} toDate={form.toDate} halfDay={form.halfDay} />}
      {form.fromDate && <RecentLeaveNote fromDate={form.fromDate} />}

      <p className="hr-field__hint">
        The number of days is worked out when you apply. Sundays and declared holidays are not counted (a Sunday made a working day for you is); a half-day holiday counts half. You can apply up to {BACKDATE_DAYS} days
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
