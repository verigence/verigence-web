import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { hrErrorMessage } from '../../../services/hr/client';
import { listEmployees, type LoginStatus } from '../../../services/hr/employees';
import { loginLabels } from '../hrLabels';
import { messageKeys } from './messageKeys';
import { countLabel, type Recipient } from './messagePlan';

interface Props {
  accessToken: string;
  selected: Recipient[];
  onChange: (next: Recipient[]) => void;
  disabled: boolean;
  isWelcome: boolean;
}

const LIST_LIMIT = 100;

const loginClass: Record<LoginStatus, string> = { CREATED: 'active', FAILED: 'pending', NOT_CREATED: 'rejected' };

export default function RecipientPicker({ accessToken, selected, onChange, disabled, isWelcome }: Props) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  // One request after the person stops typing, not one per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const list = useQuery({
    queryKey: messageKeys.recipients(query),
    queryFn: () => listEmployees(accessToken, { q: query, status: 'ACTIVE', limit: LIST_LIMIT }),
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const shown: Recipient[] = (list.data?.items ?? []).map((e) => ({
    employeeId: e.employeeId,
    fullName: e.fullName,
    employeeCode: e.employeeCode,
    personalEmail: e.personalEmail,
    loginStatus: e.loginStatus,
  }));
  const selectedIds = new Set(selected.map((r) => r.employeeId));
  const hiddenSelected = selected.filter((r) => !shown.some((s) => s.employeeId === r.employeeId)).length;
  const allShownSelected = shown.length > 0 && shown.every((r) => selectedIds.has(r.employeeId));

  const toggle = (person: Recipient) => {
    if (selectedIds.has(person.employeeId)) onChange(selected.filter((r) => r.employeeId !== person.employeeId));
    else onChange([...selected, person]);
  };
  const selectAllShown = () => onChange([...selected, ...shown.filter((r) => !selectedIds.has(r.employeeId))]);

  return (
    <SectionCard title="2. Choose the people" description="Only active employees are listed. Your choice is kept while you search.">
      <div className="hrm-picker-tools">
        <label className="uc01-admin-search">
          <span>Search employees</span>
          <input type="search" value={search} placeholder="Name, code or email" onChange={(e) => setSearch(e.target.value)} />
        </label>
        <div className="hr-actions">
          <button type="button" className="uc01-admin-button" disabled={disabled || shown.length === 0 || allShownSelected} onClick={selectAllShown}>
            Select all shown
          </button>
          <button type="button" className="uc01-admin-button" disabled={disabled || selected.length === 0} onClick={() => onChange([])}>
            Clear
          </button>
        </div>
      </div>

      <p className="hr-count" aria-live="polite">
        {selected.length === 0 ? 'No one selected' : `${selected.length} selected`}
        {hiddenSelected > 0 ? ` (${hiddenSelected} not shown by this search)` : ''}
      </p>

      {list.isLoading && <div className="uc01-admin-state">Loading employees…</div>}
      {list.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>Employees could not be loaded.</strong>
          <span>{hrErrorMessage(list.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => list.refetch()}>Try again</button>
        </div>
      )}
      {!list.isLoading && !list.isError && shown.length === 0 && (
        <div className="uc01-admin-state">{query ? 'No active employees match this search.' : 'There are no active employees yet.'}</div>
      )}
      {shown.length > 0 && (
        <ul className="hrm-people" aria-label="Employees">
          {shown.map((person) => {
            const checked = selectedIds.has(person.employeeId);
            const willSkip = isWelcome && person.loginStatus !== 'CREATED';
            return (
              <li key={person.employeeId}>
                <label className={`hrm-person${checked ? ' is-selected' : ''}`}>
                  <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(person)} />
                  <span className="hrm-person__text">
                    <strong>{person.fullName}</strong>
                    <small>{person.employeeCode} · {person.personalEmail}</small>
                  </span>
                  <span className="hrm-person__chip">
                    <span className={`uc01-admin-status uc01-admin-status--${loginClass[person.loginStatus]}`}>{loginLabels[person.loginStatus]}</span>
                    {willSkip && <small>May be skipped</small>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {list.data && list.data.total > shown.length && (
        <p className="hr-muted">Showing the first {countLabel(shown.length, 'employee', 'employees')} of {list.data.total}. Search to narrow the list.</p>
      )}
    </SectionCard>
  );
}
