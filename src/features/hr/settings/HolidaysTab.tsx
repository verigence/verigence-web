import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { hrErrorMessage, HrHttpError } from '../../../services/hr/client';
import {
  addHoliday,
  changeHoliday,
  getHolidayScopeOptions,
  listHolidays,
  removeHoliday,
  type Holiday,
  type HolidayScopeProject,
} from '../../../services/hr/hrSettings';
import Field from '../Field';
import {
  HOLIDAY_DAY_PART_LABEL,
  HOLIDAY_STATUS_LABEL,
  asWorkingSunday,
  describeAppliesTo,
  describeDraftScope,
  draftDayPart,
  draftFromHoliday,
  draftToInput,
  emptyHolidayDraft,
  formatHolidayDate,
  holidaySummary,
  outletLabel,
  projectLabel,
  scopeKey,
  sortHolidays,
  toggleScope,
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

type Notice = { kind: 'success' | 'error'; title: string; text?: string } | null;

/** A Carbon inline notification: a title, an optional line, coloured by kind. */
function InlineNotification({ notice }: { notice: NonNullable<Notice> | { kind: 'warning' | 'info'; title: string; text?: string } }) {
  return (
    <div className={`hrs-notification hrs-notification--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
      <strong>{notice.title}</strong>
      {notice.text && <span>{notice.text}</span>}
    </div>
  );
}

interface TileOption<T extends string> {
  value: T;
  title: string;
  text: string;
}

/** Carbon radio tiles: one choice of a few, each with a line saying what it means. */
function RadioTiles<T extends string>({
  legend,
  name,
  value,
  options,
  disabled,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: TileOption<T>[];
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="hrs-tiles">
      <legend>{legend}</legend>
      <div className="hrs-tiles__row">
        {options.map((o) => (
          <label key={o.value} className={`hrs-tile${value === o.value ? ' is-checked' : ''}`}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} disabled={disabled} onChange={() => onChange(o.value)} />
            <span className="hrs-tile__title">{o.title}</span>
            <span className="hrs-tile__text">{o.text}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Projects with their outlets, as checkboxes grouped by project. A whole project covers its outlets. */
function ScopePicker({
  projects,
  scope,
  disabled,
  error,
  onToggle,
}: {
  projects: HolidayScopeProject[];
  scope: string[];
  disabled: boolean;
  error?: string;
  onToggle: (tenantId: string, outletId: string | null) => void;
}) {
  const [filter, setFilter] = useState('');
  const wanted = filter.trim().toLowerCase();
  const shown = projects
    .map((p) => {
      const projectMatches = !wanted || projectLabel(p).toLowerCase().includes(wanted);
      const outlets = projectMatches ? p.outlets : p.outlets.filter((o) => outletLabel(o).toLowerCase().includes(wanted));
      return { project: p, outlets, visible: projectMatches || outlets.length > 0 };
    })
    .filter((x) => x.visible);
  return (
    <div className={`hrs-scope${error ? ' has-error' : ''}`}>
      <div className="hr-field">
        <label htmlFor="holiday-scope-filter">Find a project or outlet</label>
        <input id="holiday-scope-filter" type="search" value={filter} autoComplete="off" disabled={disabled} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {projects.length === 0 && <p className="hrs-intro">No projects in the work context yet. Refresh it on the Work context tab.</p>}
      <div className="hrs-scope__list">
        {shown.map(({ project, outlets }) => {
          const whole = scope.includes(scopeKey(project.tenantId, null));
          const label = projectLabel(project);
          return (
            <fieldset key={project.tenantId} className="hrs-scope__project">
              <legend>
                <label className="hrs-check">
                  <input type="checkbox" checked={whole} disabled={disabled} onChange={() => onToggle(project.tenantId, null)} />
                  <span><strong>{label}</strong> <small>whole project</small></span>
                </label>
              </legend>
              {outlets.length > 0 && (
                <div className="hrs-scope__outlets">
                  {outlets.map((o) => (
                    <label key={o.outletId} className="hrs-check">
                      <input
                        type="checkbox"
                        checked={whole || scope.includes(scopeKey(project.tenantId, o.outletId))}
                        disabled={disabled || whole}
                        onChange={() => onToggle(project.tenantId, o.outletId)}
                      />
                      <span>{outletLabel(o)}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          );
        })}
        {projects.length > 0 && shown.length === 0 && <p className="hrs-intro">Nothing matches “{filter}”.</p>}
      </div>
      {error ? (
        <span className="hr-field__error" role="alert">{error}</span>
      ) : (
        scope.length > 0 && <p className="hrs-scope__summary">Applies to: {describeDraftScope(scope, projects)}</p>
      )}
    </div>
  );
}

function DayPartTag({ h }: { h: Holiday }) {
  if (h.kind === 'WORKING_DAY') return <span className="hr-tag hr-tag--teal">Working Sunday</span>;
  const part = h.dayPart ?? 'FULL_DAY';
  return <span className={`hr-tag ${part === 'FULL_DAY' ? 'hr-tag--cool-gray' : 'hr-tag--blue'}`}>{HOLIDAY_DAY_PART_LABEL[part]}</span>;
}

export default function HolidaysTab({ accessToken }: Props) {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(currentYear);
  const [draft, setDraft] = useState<HolidayDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<HolidayErrors>({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rowError, setRowError] = useState('');

  const query = useQuery({
    queryKey: settingsKeys.holidays(year),
    queryFn: () => listHolidays(accessToken, year),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const items = sortHolidays(query.data?.items ?? []);

  const options = useQuery({
    queryKey: settingsKeys.holidayScopeOptions,
    queryFn: () => getHolidayScopeOptions(accessToken),
    enabled: draft?.appliesTo === 'SELECTED',
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });
  const projects = useMemo(() => options.data?.projects ?? [], [options.data]);

  const save = useMutation({
    mutationFn: (d: HolidayDraft) => (editingId ? changeHoliday(accessToken, editingId, draftToInput(d)) : addHoliday(accessToken, draftToInput(d))),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.holidaysAll });
      setYear(Number(saved.date.slice(0, 4)));
      setNotice({
        kind: 'success',
        title: `${saved.name} on ${formatHolidayDate(saved.date)} saved.`,
        text: holidaySummary(saved),
      });
      setDraft(null);
      setEditingId(null);
      setFormError('');
      setErrors({});
    },
    onError: (error) => {
      setNotice(null);
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
    mutationFn: (h: Holiday) => removeHoliday(accessToken, h.holidayId),
    onSuccess: (_data, h) => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.holidaysAll });
      setConfirmId(null);
      setRowError('');
      setNotice({ kind: 'success', title: `${h.name} on ${formatHolidayDate(h.date)} was removed.`, text: 'It stays in the history of changes.' });
    },
    onError: (error) => {
      setNotice(null);
      setRowError(hrErrorMessage(error));
      if (error instanceof HrHttpError && error.status === 404) {
        setConfirmId(null);
        void queryClient.invalidateQueries({ queryKey: settingsKeys.holidaysAll });
      }
    },
  });

  const busy = save.isPending || remove.isPending;

  const reset = () => {
    setErrors({});
    setFormError('');
    setNotice(null);
    setConfirmId(null);
  };
  const startAdd = () => {
    setDraft(emptyHolidayDraft(year));
    setEditingId(null);
    reset();
  };
  const startEdit = (h: Holiday) => {
    setDraft(draftFromHoliday(h));
    setEditingId(h.holidayId);
    reset();
  };
  const cancel = () => {
    setDraft(null);
    setEditingId(null);
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
        if (key === 'scope' || key === 'appliesTo') delete next.scope;
      }
      return next;
    });
  };
  const stepYear = (delta: number) => {
    setYear((y) => Math.min(MAX_YEAR, Math.max(MIN_YEAR, y + delta)));
    setConfirmId(null);
    setRowError('');
    setNotice(null);
  };

  const dayPart = draft ? draftDayPart(draft) : 'FULL_DAY';

  return (
    <div className="hr-sections">
      <InlineNotification
        notice={{
          kind: 'warning',
          title: 'Tentative dates are not final. Final holidays are declared by HR.',
          text:
            'Only declared holidays count as non-working days: in leave days, in the working days payroll counts, and on the attendance screen. ' +
            'A half-day holiday counts as half a working day; the other half must be worked. A holiday for selected projects or outlets applies only to the people working there on that date. ' +
            'Every Sunday is non-working unless it is made a working Sunday for some projects or outlets (or everyone).',
        }}
      />

      <div className="hrs-yearbar">
        <button type="button" className="uc01-admin-button hrs-touch" onClick={() => stepYear(-1)} disabled={year <= MIN_YEAR} aria-label="Previous year">‹</button>
        <strong className="hrs-year" aria-live="polite">{year}</strong>
        <button type="button" className="uc01-admin-button hrs-touch" onClick={() => stepYear(1)} disabled={year >= MAX_YEAR} aria-label="Next year">›</button>
        <button type="button" className="uc01-admin-button uc01-admin-button--primary hrs-touch hrs-yearbar__add" onClick={startAdd} disabled={busy}>
          Add holiday
        </button>
      </div>

      {notice && <InlineNotification notice={notice} />}

      {draft && (
        <SectionCard title={editingId ? 'Edit holiday' : 'Add holiday'}>
          <form
            className="hr-form hrs-holiday-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="hr-form-grid">
              <Field label="Date" htmlFor="holiday-date" required error={errors.date} hint={draft.kind === 'WORKING_DAY' ? 'A Sunday.' : undefined}>
                <input
                  id="holiday-date"
                  type="date"
                  min={`${MIN_YEAR}-01-01`}
                  max={`${MAX_YEAR}-12-31`}
                  value={draft.date}
                  disabled={busy}
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
            </div>

            <RadioTiles
              legend="Type"
              name="holiday-kind"
              value={draft.kind}
              disabled={busy}
              onChange={(kind) =>
                kind === 'WORKING_DAY'
                  ? setDraft((current) => (current ? asWorkingSunday(current) : current))
                  : change({ kind, name: draft.name === 'Working Sunday' ? '' : draft.name })
              }
              options={[
                { value: 'HOLIDAY', title: 'Holiday', text: 'A day, or half a day, off.' },
                { value: 'WORKING_DAY', title: 'Working Sunday', text: 'This Sunday is a normal working day for the people chosen.' },
              ]}
            />
            {draft.kind === 'HOLIDAY' && (
              <RadioTiles
                legend="Length"
                name="holiday-length"
                value={draft.length}
                disabled={busy}
                onChange={(length) => change({ length })}
                options={[
                  { value: 'FULL', title: 'Full day', text: 'The whole day is off.' },
                  { value: 'HALF', title: 'Half day', text: 'One half is off; the other half is a working day.' },
                ]}
              />
            )}
            {draft.kind === 'HOLIDAY' && draft.length === 'HALF' && (
              <RadioTiles
                legend="Which half is off"
                name="holiday-half"
                value={draft.half}
                disabled={busy}
                onChange={(half) => change({ half })}
                options={[
                  { value: 'MORNING', title: 'Morning off', text: 'Work starts at the half-day split; late is judged from there.' },
                  { value: 'AFTERNOON', title: 'Afternoon off', text: 'Work ends at the split; no check-in by then is an absence.' },
                ]}
              />
            )}
            {draft.kind === 'HOLIDAY' && (
              <RadioTiles
                legend="Status"
                name="holiday-status"
                value={draft.status}
                disabled={busy}
                onChange={(status) => change({ status })}
                options={[
                  { value: 'TENTATIVE', title: HOLIDAY_STATUS_LABEL.TENTATIVE, text: 'A proposal only. It changes nothing yet.' },
                  { value: 'DECLARED', title: HOLIDAY_STATUS_LABEL.DECLARED, text: 'Counts as a holiday in attendance, leave and payroll.' },
                ]}
              />
            )}
            <RadioTiles
              legend="Applies to"
              name="holiday-applies"
              value={draft.appliesTo}
              disabled={busy}
              onChange={(appliesTo) => change({ appliesTo })}
              options={[
                { value: 'ALL', title: 'Whole company', text: 'Everyone, including head office.' },
                { value: 'SELECTED', title: 'Selected projects and outlets', text: 'Only people working there on that date.' },
              ]}
            />
            {draft.appliesTo === 'SELECTED' && (
              <>
                {options.isLoading && <div className="uc01-admin-state">Loading projects and outlets…</div>}
                {options.isError && (
                  <InlineNotification notice={{ kind: 'error', title: 'Projects and outlets could not be loaded.', text: hrErrorMessage(options.error) }} />
                )}
                {options.data && (
                  <ScopePicker
                    projects={projects}
                    scope={draft.scope}
                    disabled={busy}
                    error={errors.scope}
                    onToggle={(tenantId, outletId) => change({ scope: toggleScope(draft.scope, tenantId, outletId) })}
                  />
                )}
              </>
            )}
            {!options.data && errors.scope && <span className="hr-field__error" role="alert">{errors.scope}</span>}

            <p className="hrs-intro" aria-live="polite">
              {draft.kind === 'WORKING_DAY'
                ? `Working Sunday${draft.appliesTo === 'ALL' ? ' for the whole company' : ' for the selected projects and outlets'}: an ordinary working day for them (check-in rules, leave, payroll and earned leave as on any working day). Everyone else keeps the Sunday off.`
                : `${HOLIDAY_DAY_PART_LABEL[dayPart]}${draft.appliesTo === 'ALL' ? ' for the whole company' : ' for the selected projects and outlets'}${draft.status === 'DECLARED' ? ', declared.' : ', tentative.'}`}
            </p>

            {formError && <InlineNotification notice={{ kind: 'error', title: formError }} />}
            <div className="hr-actions hr-actions--form">
              <button type="submit" className="uc01-admin-button uc01-admin-button--primary" disabled={busy}>{save.isPending ? 'Saving…' : 'Save holiday'}</button>
              <button type="button" className="uc01-admin-button" disabled={busy} onClick={cancel}>Cancel</button>
            </div>
          </form>
        </SectionCard>
      )}

      {rowError && <InlineNotification notice={{ kind: 'error', title: rowError }} />}

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
                  <th>Day part</th>
                  <th>Applies to</th>
                  <th>Status</th>
                  <th><span className="hr-visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((h) => (
                  <tr key={h.holidayId}>
                    <td data-label="Date"><strong>{formatHolidayDate(h.date)}</strong></td>
                    <td data-label="Holiday"><span>{h.name}</span></td>
                    <td data-label="Day part"><DayPartTag h={h} /></td>
                    <td data-label="Applies to"><span className="hrs-applies">{describeAppliesTo(h)}</span></td>
                    <td data-label="Status">
                      <span className={`hr-tag ${h.status === 'DECLARED' ? 'hr-tag--green' : 'hr-tag--warm-gray'}`}>{HOLIDAY_STATUS_LABEL[h.status]}</span>
                    </td>
                    <td data-label="Actions">
                      {confirmId === h.holidayId ? (
                        <div className="hrs-confirm" role="group" aria-label={`Remove ${h.name}`}>
                          <span>Remove this holiday?</span>
                          <div className="hr-row-actions">
                            <button type="button" className="uc01-admin-button uc01-admin-button--danger-primary hrs-touch" disabled={busy} onClick={() => remove.mutate(h)}>
                              {remove.isPending ? 'Removing…' : 'Remove'}
                            </button>
                            <button type="button" className="uc01-admin-button hrs-touch" disabled={busy} onClick={() => setConfirmId(null)}>Keep</button>
                          </div>
                        </div>
                      ) : (
                        <div className="hr-row-actions">
                          <button type="button" className="uc01-admin-button hrs-touch" disabled={busy} onClick={() => startEdit(h)} aria-label={`Edit ${h.name}`}>Edit</button>
                          <button
                            type="button"
                            className="uc01-admin-button uc01-admin-button--danger hrs-touch"
                            disabled={busy}
                            onClick={() => {
                              setConfirmId(h.holidayId);
                              setRowError('');
                              setNotice(null);
                            }}
                            aria-label={`Remove ${h.name}`}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={6} className="uc01-admin-empty">No holidays have been added for {year} yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
