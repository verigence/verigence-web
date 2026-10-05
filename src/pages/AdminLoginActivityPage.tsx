import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { formatWhenIst } from '../features/announcements/announcementLogic';
import {
  STATE_LABEL,
  STATE_ORDER,
  countByState,
  reasonLabel,
  reportCsv,
  visiblePeople,
  type ViewFilter,
} from '../features/admin/loginActivity/loginActivityLogic';
import { getLoginActivity, type LoginPerson } from '../services/security/loginActivity';
import { useSessionStore } from '../store/sessionStore';
import '../styles/login-activity.css';

const messageOf = (error: unknown) => (error instanceof Error && error.message ? error.message : 'The report could not be loaded. Please try again.');

function downloadCsv(people: readonly LoginPerson[]) {
  const blob = new Blob([`﻿${reportCsv(people)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `verigence-login-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** SuperAdmin: who tried to sign in, who got in, who downloaded and signed in on the Android app. */
export default function AdminLoginActivityPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const [filter, setFilter] = useState<ViewFilter>({ state: 'ALL', employeesOnly: false, search: '' });

  const data = useQuery({ queryKey: ['security', 'login-activity'], queryFn: () => getLoginActivity(accessToken!), enabled: Boolean(accessToken), retry: false });
  const people = useMemo(() => data.data?.people ?? [], [data.data]);
  const scope = useMemo(() => (filter.employeesOnly ? people.filter((p) => p.isEmployee) : people), [people, filter.employeesOnly]);
  const counts = useMemo(() => countByState(scope), [scope]);
  const rows = useMemo(() => visiblePeople(people, filter), [people, filter]);
  const unknown = data.data?.unknown ?? [];

  return (
    <section className="uc01-admin-page hr-page" aria-label="Login activity">
      <PageHeader
        eyebrow="Administration"
        title="Login activity"
        description="Who tried to sign in, who got in, and who has downloaded and signed in on the Android app. Recorded from the day this was switched on."
      />
      {data.isError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">The report could not be loaded. {messageOf(data.error)}</div>}

      <SectionCard
        title="People"
        description={data.isLoading ? 'Loading…' : `${rows.length} shown of ${scope.length}.`}
        action={rows.length ? <button type="button" className="uc01-admin-button" onClick={() => downloadCsv(rows)}>Download report (CSV)</button> : undefined}
      >
        <div className="la-chips" role="group" aria-label="Show">
          <button type="button" className="la-chip" aria-pressed={filter.state === 'ALL'} onClick={() => setFilter({ ...filter, state: 'ALL' })}>All<strong>{scope.length}</strong></button>
          {STATE_ORDER.map((state) => (
            <button key={state} type="button" className="la-chip" aria-pressed={filter.state === state} onClick={() => setFilter({ ...filter, state })}>
              {STATE_LABEL[state]}<strong>{counts[state]}</strong>
            </button>
          ))}
        </div>
        <div className="la-tools">
          <input type="search" aria-label="Search by name or email" placeholder="Search name or email" value={filter.search} onChange={(event) => setFilter({ ...filter, search: event.target.value })} />
          <label><input type="checkbox" checked={filter.employeesOnly} onChange={(event) => setFilter({ ...filter, employeesOnly: event.target.checked })} /> Employees only</label>
        </div>

        {!data.isLoading && rows.length === 0 && <p>No one matches.</p>}
        {rows.map((p) => (
          <div key={p.userId} className="la-row">
            <div className="la-head">
              <span><strong>{p.name}</strong><small>{p.email}</small></span>
              <span className={`la-state la-state--${p.state}`}>{STATE_LABEL[p.state]}</span>
            </div>
            <ul className="la-facts">
              <li>Signed in: {p.loginsOk} time{p.loginsOk === 1 ? '' : 's'}{p.loginsOk > 0 ? ` (first ${formatWhenIst(p.firstLoginAt)}, last ${formatWhenIst(p.lastLoginAt)})` : ''}</li>
              <li>On the app: {p.appLogins}{p.appVersion ? ` (version ${p.appVersion})` : ''} · On the web: {p.webLogins}</li>
              <li>Downloaded the app: {p.downloads} time{p.downloads === 1 ? '' : 's'}{p.downloads > 0 ? ` (last ${formatWhenIst(p.lastDownloadAt)})` : ''}</li>
              <li>Could not sign in: {p.loginsFailed} time{p.loginsFailed === 1 ? '' : 's'}{p.lastOutcome === 'FAILED' ? ` · last try ${formatWhenIst(p.lastAttemptAt)}: ${reasonLabel(p.lastReason)}` : ''}</li>
            </ul>
          </div>
        ))}
      </SectionCard>

      {unknown.length > 0 && (
        <SectionCard title="IDs that are not in Verigence" description="Someone typed these and no user matched. Often a typing mistake in the email address.">
          {unknown.map((u) => (
            <div key={u.identifier} className="la-row">
              <strong>{u.identifier}</strong>
              <ul className="la-facts"><li>{u.attempts} {u.attempts === 1 ? 'try' : 'tries'} · last {formatWhenIst(u.lastAt)}</li></ul>
            </div>
          ))}
        </SectionCard>
      )}
    </section>
  );
}
