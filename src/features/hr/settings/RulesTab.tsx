import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { hrErrorMessage, HrHttpError } from '../../../services/hr/client';
import { listSettings, updateSettings, type SettingItem } from '../../../services/hr/hrSettings';
import Field from '../Field';
import {
  collectChanges,
  describeBounds,
  describeDefault,
  groupSettings,
  placeServerProblem,
  valueToText,
} from './settingsForm';
import { settingsKeys } from './settingsKeys';

interface Props {
  accessToken: string;
}

const GROUP_HELP: Record<string, string> = {
  Attendance: 'Check-in and check-out times and the location checks used when people mark attendance.',
  Leave: 'Leave days given each year.',
  Reimbursement: 'Limits and dates used when claims are reviewed and paid.',
};

function inputProps(item: SettingItem): { type: string; inputMode?: 'numeric' | 'decimal' | 'text'; maxLength?: number } {
  if (item.kind === 'time') return { type: 'time' };
  if (item.kind === 'int') return { type: 'text', inputMode: 'numeric' };
  if (item.kind === 'text') return { type: 'text', inputMode: 'text', maxLength: 300 };
  return { type: 'text', inputMode: 'decimal' };
}

export default function RulesTab({ accessToken }: Props) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  // Only fields a person has touched are held here, as typed.
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const query = useQuery({
    queryKey: settingsKeys.settings,
    queryFn: () => listSettings(accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const focusFirstProblem = () => {
    window.requestAnimationFrame(() => {
      const field = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      field?.focus();
      field?.scrollIntoView?.({ block: 'center' });
    });
  };
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const groups = useMemo(() => groupSettings(items), [items]);
  const pending = useMemo(() => collectChanges(items, edited), [items, edited]);
  const changedCount = Object.keys(pending.changes).length;

  const save = useMutation({
    mutationFn: (values: Parameters<typeof updateSettings>[1]) => updateSettings(accessToken, values),
    onSuccess: (data, values) => {
      queryClient.setQueryData(settingsKeys.settings, data);
      setEdited({});
      setServerErrors({});
      setFormError('');
      const n = Object.keys(values).length;
      setNotice(n === 1 ? 'Saved. 1 setting changed.' : `Saved. ${n} settings changed.`);
    },
    onError: (error) => {
      setNotice('');
      if (error instanceof HrHttpError && error.code === 'HR_SETTING_INVALID') {
        const placed = placeServerProblem(items, error.message);
        setServerErrors(placed.fields);
        setFormError(
          placed.general
            ? placed.general
            : 'The service did not accept a value. It is marked in the form. Nothing was saved.',
        );
        if (placed.general === '') focusFirstProblem();
        return;
      }
      setServerErrors({});
      setFormError(hrErrorMessage(error));
    },
  });

  const edit = (key: string, value: string) => {
    setEdited((current) => ({ ...current, [key]: value }));
    setClientErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setServerErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setNotice('');
  };

  const discard = () => {
    setEdited({});
    setClientErrors({});
    setServerErrors({});
    setFormError('');
    setNotice('');
  };

  const submit = () => {
    setNotice('');
    setServerErrors({});
    const { changes, errors } = collectChanges(items, edited);
    setClientErrors(errors);
    if (Object.keys(errors).length > 0) {
      setFormError('Some values need attention. They are marked in the form. Nothing was saved.');
      focusFirstProblem();
      return;
    }
    if (Object.keys(changes).length === 0) {
      setFormError('');
      setNotice('Nothing was changed.');
      return;
    }
    setFormError('');
    save.mutate(changes);
  };

  if (query.isLoading) return <div className="uc01-admin-state">Loading settings…</div>;
  if (query.isError) {
    return (
      <div className="uc01-admin-state uc01-admin-state--error" role="alert">
        <strong>Settings could not be loaded.</strong>
        <span>{hrErrorMessage(query.error)}</span>
        <button type="button" className="uc01-admin-button" onClick={() => query.refetch()} disabled={query.isFetching}>Try again</button>
      </div>
    );
  }
  if (items.length === 0) return <div className="uc01-admin-state">There are no settings to show.</div>;

  return (
    <form
      ref={formRef}
      className="hr-form hrs-rules"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <p className="hrs-intro">
        These are the company rules the HR service uses. Change what you need and save once; only the values you
        changed are sent. The service checks every value and tells you if one is not allowed. Saved changes are
        recorded in the audit history.
      </p>

      {groups.map((group) => (
        <SectionCard key={group.name} title={group.name} description={GROUP_HELP[group.name]}>
          <div className="hr-form-grid hrs-grid">
            {group.items.map((item) => {
              const id = `setting-${item.key.replace(/[^a-z0-9]+/gi, '-')}`;
              const typed = item.key in edited;
              const value = typed ? edited[item.key] : valueToText(item.value);
              const bounds = describeBounds(item);
              const hint = [`Default: ${describeDefault(item)}`, item.unit ? `Unit: ${item.unit}` : '', bounds]
                .filter(Boolean)
                .join(' · ');
              const error = clientErrors[item.key] ?? serverErrors[item.key];
              const props = inputProps(item);
              const changed = typed && item.key in pending.changes;
              return (
                <div key={item.key} className={`hrs-setting${changed ? ' is-changed' : ''}`}>
                  <Field label={item.label} htmlFor={id} error={error} hint={hint} wide={item.kind === 'text'}>
                    <input
                      id={id}
                      type={props.type}
                      inputMode={props.inputMode}
                      maxLength={props.maxLength}
                      value={value}
                      placeholder={item.kind === 'money_or_null' ? 'None set' : undefined}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `${id}-error` : `${id}-hint`}
                      disabled={save.isPending}
                      autoComplete="off"
                      onChange={(event) => edit(item.key, event.target.value)}
                    />
                  </Field>
                </div>
              );
            })}
          </div>
        </SectionCard>
      ))}

      {formError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{formError}</div>}
      {notice && <div className="uc01-admin-message uc01-admin-message--success" role="status">{notice}</div>}

      <div className="hr-actions hr-actions--form">
        <button type="submit" className="uc01-admin-button uc01-admin-button--primary" disabled={save.isPending || Object.keys(edited).length === 0}>
          {save.isPending ? 'Saving…' : changedCount > 0 ? `Save ${changedCount} ${changedCount === 1 ? 'change' : 'changes'}` : 'Save changes'}
        </button>
        <button type="button" className="uc01-admin-button" disabled={save.isPending || Object.keys(edited).length === 0} onClick={discard}>
          Discard edits
        </button>
      </div>
    </form>
  );
}
