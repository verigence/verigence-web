import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { hrErrorMessage, HrHttpError } from '../../../services/hr/client';
import {
  deleteHoliday,
  listHolidays,
  putHoliday,
  type Holiday,
  type HolidayStatus,
} from '../../../services/hr/hrSettings';
import Field from '../Field';
import {
  HOLIDAY_STATUS_LABEL,
  formatHolidayDate,
  sortHolidays,
  validateHoliday,
  type HolidayDraft,
  type HolidayErrors,
} from './settingsForm';
import { settingsKeys } from './settingsKeys';

interface Props {
  accessToken: string;
}

const MIN_YEAR = 2020;
const MAX_YEAR = 2100;

function currentYear(): number {
  return Math.min(MAX_YEAR, Math.max(MIN_YEAR, new Date().getFullYear()));
}

export default function HolidaysTab({ accessToken }: Props) {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(currentYear);
  const [draft, setDraft] = useState<HolidayDraft | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [errors, setErrors] = useState<HolidayErrors>({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDate, setConfirmDate] = useState<string | null>(null);
  const [rowError, setRowError] = useState('');

  const query = useQuery({
    queryKey: settingsKeys.holidays(year),
    queryFn: () => listHolidays(accessToken, year),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const items = sortHolidays(query.data?.items ?? []);

  const save = useMutation({
    mutationFn: (d: HolidayDraft) => putHoliday(accessToken, d.date, { name: d.name.trim(), status: d.status }),
    onSuccess: (saved) => {
      const savedYear = Number(saved.date.slice(0, 4));
      void queryClient.invalidateQueries({ queryKey: settingsKeys.holidaysAll });
      setYear(savedYear);
      setNotice(`${saved.name} on ${formatHolidayDate(saved.date)} saved as ${HOLIDAY_STATUS_LABEL[saved.status].toLowerCase()}.`);
      setDraft(null);
      setEditingDate(null);
      setFormError('');
      setErrors({});
    },
    onError: (error) => {
      setNotice('');
      if (error instanceof HrHttpError && error.problems.length > 0) {
        const next: HolidayErrors = {};
        for (const p of error.problems) {
          const field = p.field.split('.').pop();
          if (field === 'name') next.name = p.message;
          else if (field === 'holiday_date' || field === 'date') next.date = p.message;
        }
        setErrors(next);
      }
      setFormError(hrErrorMessage(error));
    },
  });

  const remove = useMutation({
    mutationFn: (date: string) => deleteHoliday(accessToken, date),
    onSuccess: (_data, date) => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.holidaysAll });
      setConfirmDate(null);
      setRowError('');
      setNotice(`The holiday on ${formatHolidayDate(date)} was removed.`);
    },
    onError: (error) => {
      setNotice('');
      setRowError(hrErrorMessage(error));
      if (error instanceof HrHttpError && error.status === 404) {
        setConfirmDate(null);
        void queryClient.invalidateQueries({ queryKey: settingsKeys.holidaysAll });
      }
    },
  });

  const busy = save.isPending || remove.isPending;

  const startAdd = () => {
    setDraft({ date: `${year}-01-01`, name: '', status: 'TENTATIVE' });
    setEditingDate(null);
    setErrors({});
    setFormError('');
    setNotice('');
    setConfirmDate(null);
  };
  const startEdit = (h: Holiday) => {
    setDraft({ date: h.date, name: h.name, status: h.status });
    setEditingDate(h.date);
    setErrors({});
    setFormError('');
    setNotice('');
    setConfirmDate(null);
  };
  const cancel = () => {
    setDraft(null);
    setEditingDate(null);
    setErrors({});
    setFormError('');
  };
  const submit = () => {
    if (!draft) return;
    const found = validateHoliday(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError('Some details need attention. They are marked below.');
      return;
    }
    setFormError('');
    save.mutate(draft);
  };
  const change = (patch: Partial<HolidayDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch) as Array<keyof HolidayDraft>) {
        if (key === 'date' || key === 'name') delete next[key];
      }
      return next;
    });
  };
  const stepYear = (delta: number) => {
    setYear((y) => Math.min(MAX_YEAR, Math.max(MIN_YEAR, y + delta)));
    setConfirmDate(null);
    setRowError('');
    setNotice('');
  };

  return (
    <div className="hr-sections">
      <div className="hrs-caveat" role="note">
        <strong>Tentative dates are not final. Final holidays are declared by HR.</strong>
        <span>
          Only declared holidays count as non-working days. They are left out when leave days are counted, when
          payroll works out the working days of a month, and on the attendance screen. A tentative date changes
          nothing until HR declares it. Sundays are always non-working.
        </span>
      </div>

      <div className="hrs-yearbar">
        <button type="button" className="uc01-admin-button hrs-touch" onClick={() => stepYear(-1)} disabled={year <= MIN_YEAR} aria-label="Previous year">‹</button>
        <strong className="hrs-year" aria-live="polite">{year}</strong>
        <button type="button" className="uc01-admin-button hrs-touch" onClick={() => stepYear(1)} disabled={year >= MAX_YEAR} aria-label="Next year">›</button>
        <button
          type="button"
          className="uc01-admin-button uc01-admin-button--primary hrs-touch hrs-yearbar__add"
          onClick={startAdd}
          disabled={busy}
        >
          Add holiday
        </button>
      </div>

      {notice && <div className="uc01-admin-message uc01-admin-message--success" role="status">{notice}</div>}

      {draft && (
        <SectionCard title={editingDate ? 'Edit holiday' : 'Add holiday'}>
          <form
            className="hr-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="hr-form-grid">
              <Field label="Date" htmlFor="holiday-date" required error={errors.date} hint={editingDate ? 'To move a holiday, remove it and add it on the new date.' : undefined}>
                <input
                  id="holiday-date"
                  type="date"
                  min={`${MIN_YEAR}-01-01`}
                  max={`${MAX_YEAR}-12-31`}
                  value={draft.date}
                  disabled={busy || editingDate !== null}
                  aria-invalid={errors.date ? true : undefined}
                  onChange={(event) => change({ date: event.target.value })}
                />
              </Field>
              <Field label="Holiday name" htmlFor="holiday-name" required error={errors.name}>
                <input
                  id="holiday-name"
                  type="text"
                  maxLength={120}
                  value={draft.name}
                  disabled={busy}
                  autoComplete="off"
                  aria-invalid={errors.name ? true : undefined}
                  onChange={(event) => change({ name: event.target.value })}
                />
              </Field>
              <Field
                label="Status"
                htmlFor="holiday-status"
                hint={draft.status === 'DECLARED' ? 'Declared: counts as a non-working day.' : 'Tentative: a proposal only. It changes nothing yet.'}
              >
                <select
                  id="holiday-status"
                  value={draft.status}
                  disabled={busy}
                  onChange={(event) => change({ status: event.target.value as HolidayStatus })}
                >
                  <option value="TENTATIVE">{HOLIDAY_STATUS_LABEL.TENTATIVE}</option>
                  <option value="DECLARED">{HOLIDAY_STATUS_LABEL.DECLARED}</option>
                </select>
              </Field>
            </div>
            {formError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{formError}</div>}
            <div className="hr-actions hr-actions--form">
              <button type="submit" className="uc01-admin-button uc01-admin-button--primary" disabled={busy}>{save.isPending ? 'Saving…' : 'Save holiday'}</button>
              <button type="button" className="uc01-admin-button" disabled={busy} onClick={cancel}>Cancel</button>
            </div>
          </form>
        </SectionCard>
      )}

      {rowError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{rowError}</div>}

      {query.isLoading && <div className="uc01-admin-state">Loading holidays…</div>}
      {query.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>Holidays could not be loaded.</strong>
          <span>{hrErrorMessage(query.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => query.refetch()} disabled={query.isFetching}>Try again</button>
        </div>
      )}

      {!query.isLoading && !query.isError && (
        <>
          <p className="hr-count" aria-live="polite">{items.length === 1 ? `1 holiday in ${year}` : `${items.length} holidays in ${year}`}</p>
          <div className="uc01-admin-table-wrap">
            <table className="uc01-admin-table hr-table hrs-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Holiday</th>
                  <th>Status</th>
                  <th><span className="hr-visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((h) => (
                  <tr key={h.date}>
                    <td data-label="Date"><strong>{formatHolidayDate(h.date)}</strong></td>
                    <td data-label="Holiday"><span>{h.name}</span></td>
                    <td data-label="Status">
                      <span className={`uc01-admin-status uc01-admin-status--${h.status === 'DECLARED' ? 'active' : 'pending'}`}>{HOLIDAY_STATUS_LABEL[h.status]}</span>
                    </td>
                    <td data-label="Actions">
                      {confirmDate === h.date ? (
                        <div className="hrs-confirm" role="group" aria-label={`Remove ${h.name}`}>
                          <span>Remove this holiday?</span>
                          <div className="hr-row-actions">
                            <button type="button" className="uc01-admin-button uc01-admin-button--danger-primary hrs-touch" disabled={busy} onClick={() => remove.mutate(h.date)}>
                              {remove.isPending ? 'Removing…' : 'Remove'}
                            </button>
                            <button type="button" className="uc01-admin-button hrs-touch" disabled={busy} onClick={() => setConfirmDate(null)}>Keep</button>
                          </div>
                        </div>
                      ) : (
                        <div className="hr-row-actions">
                          <button type="button" className="uc01-admin-button hrs-touch" disabled={busy} onClick={() => startEdit(h)} aria-label={`Edit ${h.name}`}>Edit</button>
                          <button type="button" className="uc01-admin-button uc01-admin-button--danger hrs-touch" disabled={busy} onClick={() => { setConfirmDate(h.date); setRowError(''); setNotice(''); }} aria-label={`Remove ${h.name}`}>Remove</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={4} className="uc01-admin-empty">No holidays have been added for {year} yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
