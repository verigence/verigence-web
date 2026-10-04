import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { hrErrorMessage } from '../../../services/hr/client';
import { listMessageRecipients } from '../../../services/hr/messages';
import { messageKeys } from './messageKeys';
import {
  countLabel,
  filterRecipients,
  recipientFilterText,
  recipientStatusClass,
  recipientStatusText,
  toRecipient,
  type Recipient,
  type RecipientFilter,
} from './messagePlan';

interface Props {
  accessToken: string;
  selected: Recipient[];
  onChange: (next: Recipient[]) => void;
  disabled: boolean;
  isWelcome: boolean;
}

const PAGE_SIZE = 100;

function skipHint(person: Recipient, isWelcome: boolean): string {
  if (person.status === 'PENDING') return isWelcome ? 'Waiting for SuperAdmin to allow; will be skipped' : '';
  if (person.status !== 'ACTIVE') return 'Not active; will be skipped';
  return '';
}

export default function RecipientPicker({ accessToken, selected, onChange, disabled, isWelcome }: Props) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RecipientFilter>('all');

  // One request after the person stops typing, not one per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim().slice(0, 100)), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  // 100 users per page; the next page is fetched only when "Load more" is pressed.
  const list = useInfiniteQuery({
    queryKey: messageKeys.recipients(query),
    queryFn: ({ pageParam }) => listMessageRecipients(accessToken, { q: query, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.items.length >= PAGE_SIZE ? all.length * PAGE_SIZE : undefined),
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const loaded: Recipient[] = (list.data?.pages ?? []).flatMap((page) => page.items.map(toRecipient));
  const shown = filterRecipients(loaded, filter);
  const selectedIds = new Set(selected.map((r) => r.userId));
  const hiddenSelected = selected.filter((r) => !shown.some((s) => s.userId === r.userId)).length;
  const allShownSelected = shown.length > 0 && shown.every((r) => selectedIds.has(r.userId));

  const toggle = (person: Recipient) => {
    if (selectedIds.has(person.userId)) onChange(selected.filter((r) => r.userId !== person.userId));
    else onChange([...selected, person]);
  };
  const selectAllShown = () => onChange([...selected, ...shown.filter((r) => !selectedIds.has(r.userId))]);

  return (
    <SectionCard
      title="2. Choose who gets it: Verigence users"
      description="Everyone in the Verigence Users group is listed, whether or not they are an employee. Your choice is kept while you search."
    >
      <div className="hrm-picker-tools">
        <label className="uc01-admin-search">
          <span>Search users</span>
          <input type="search" value={search} placeholder="Name or email" onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="uc01-admin-filter hrm-filter">
          <span>Show</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value as RecipientFilter)}>
            {(Object.keys(recipientFilterText) as RecipientFilter[]).map((key) => (
              <option key={key} value={key}>{recipientFilterText[key]}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="hr-actions">
        <button type="button" className="uc01-admin-button" disabled={disabled || shown.length === 0 || allShownSelected} onClick={selectAllShown}>
          Select all shown
        </button>
        <button type="button" className="uc01-admin-button" disabled={disabled || selected.length === 0} onClick={() => onChange([])}>
          Clear
        </button>
      </div>

      <p className="hr-count" aria-live="polite">
        {selected.length === 0 ? 'No one selected' : `${selected.length} selected`}
        {hiddenSelected > 0 ? ` (${hiddenSelected} not shown by this search or filter)` : ''}
      </p>

      {list.isLoading && <div className="uc01-admin-state">Loading users…</div>}
      {list.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>Users could not be loaded.</strong>
          <span>{hrErrorMessage(list.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => list.refetch()}>Try again</button>
        </div>
      )}
      {!list.isLoading && !list.isError && shown.length === 0 && (
        <div className="uc01-admin-state">
          {query ? 'No users match this search.' : filter !== 'all' && loaded.length > 0 ? 'No loaded users match this filter.' : 'There are no users yet.'}
        </div>
      )}
      {shown.length > 0 && (
        <ul className="hrm-people" aria-label="Users">
          {shown.map((person) => {
            const checked = selectedIds.has(person.userId);
            const hint = skipHint(person, isWelcome);
            return (
              <li key={person.userId}>
                <label className={`hrm-person${checked ? ' is-selected' : ''}`}>
                  <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(person)} />
                  <span className="hrm-person__text">
                    <strong>{person.name}</strong>
                    <small>{person.email ?? 'No email address'}</small>
                  </span>
                  <span className="hrm-person__chip">
                    {person.isEmployee && <span className="hrm-tag">Employee</span>}
                    <span className={`uc01-admin-status uc01-admin-status--${recipientStatusClass(person.status)}`}>{recipientStatusText(person.status)}</span>
                    {hint && <small>{hint}</small>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {list.hasNextPage && (
        <div className="hr-actions">
          <button type="button" className="uc01-admin-button" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
            {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
          <span className="hr-muted">{countLabel(loaded.length, 'user', 'users')} loaded.</span>
        </div>
      )}
      {list.isFetchNextPageError && (
        <div className="uc01-admin-message uc01-admin-message--error" role="alert">{hrErrorMessage(list.error)}</div>
      )}
    </SectionCard>
  );
}
