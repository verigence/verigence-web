import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getLoginActivity, type LoginPerson } from '../../../services/security/loginActivity';
import {
  ago, appInstallsCsv, byAppFirst, matches, newestVersion, releasesBehind, standing, updatePending, versionsInUse,
  type AppStanding,
} from './appInstallsLogic';

/**
 * Who has the Verigence Android app, and which version (product owner
 * 2026-10-30: "I need to maintain the history somewhere which all employees
 * have downloaded the mobile app and they are on which version"; redesigned
 * 2026-10-31: "not at all professional and very less informative").
 *
 * Two different facts, kept apart on purpose:
 *   - what they DOWNLOADED: every download is recorded, so the history is the
 *     list of downloads with the version each one handed out;
 *   - what they are RUNNING: the app reports its own version at every
 *     sign-in, which is the one that matters for "are they on the latest".
 * A person can have downloaded a new version and not opened it yet.
 */

const STATE_LABEL: Record<LoginPerson['state'], string> = {
  APP_SIGNED_IN: 'On the app',
  DOWNLOADED: 'Downloaded, never signed in',
  WEB_ONLY: 'Web only',
  TRIED_FAILED: 'Could not sign in',
  NOT_TRIED: 'Never signed in',
};

const STANDING: Record<AppStanding, { label: string; tone: string }> = {
  LATEST: { label: 'On the latest', tone: 'ok' },
  BEHIND: { label: 'Needs update', tone: 'warn' },
  NOT_OPENED: { label: 'Downloaded, not opened', tone: 'info' },
  NOT_ON_APP: { label: 'Not on the app', tone: 'muted' },
};

type Filter = 'ALL' | AppStanding;

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
}

function day(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

export default function AppInstalls({ accessToken }: { accessToken?: string }) {
  const [employeesOnly, setEmployeesOnly] = useState(true);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string>();

  const activity = useQuery({
    queryKey: ['security', 'login-activity'],
    queryFn: () => getLoginActivity(accessToken!),
    enabled: Boolean(accessToken),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const everyone = useMemo(
    () => byAppFirst(activity.data?.people ?? [], { employeesOnly }),
    [activity.data, employeesOnly],
  );
  const latest = useMemo(() => newestVersion(everyone), [everyone]);
  const running = useMemo(() => versionsInUse(everyone), [everyone]);
  const counts = useMemo(() => {
    const out: Record<AppStanding, number> = { LATEST: 0, BEHIND: 0, NOT_OPENED: 0, NOT_ON_APP: 0 };
    for (const p of everyone) out[standing(p, latest)] += 1;
    return out;
  }, [everyone, latest]);
  const people = useMemo(
    () => everyone.filter((p) => (filter === 'ALL' || standing(p, latest) === filter) && matches(p, search)),
    [everyone, filter, search, latest],
  );
  const onApp = counts.LATEST + counts.BEHIND;
  const pending = everyone.filter(updatePending).length;

  const download = () => {
    const blob = new Blob([`﻿${appInstallsCsv(people, STATE_LABEL)}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `verigence-app-versions-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (activity.isPending) return <p className="ar-muted">Reading who has the app…</p>;
  if (activity.isError) {
    return <div className="uc01-admin-message uc01-admin-message--error">Who has the app could not be read.</div>;
  }
  const pct = (n: number) => (everyone.length ? Math.round((n / everyone.length) * 100) : 0);

  return (
    <div className="ar-report">
      <div className="ar-kpis">
        <button type="button" className={`ar-kpi is-ok${filter === 'LATEST' ? ' is-active' : ''}`}
          onClick={() => setFilter(filter === 'LATEST' ? 'ALL' : 'LATEST')}>
          <span className="ar-kpi__label">On the latest{latest ? ` (${latest})` : ''}</span>
          <strong>{counts.LATEST}</strong>
          <span className="ar-kpi__sub">{pct(counts.LATEST)}% of {everyone.length} people</span>
        </button>
        <button type="button" className={`ar-kpi is-warn${filter === 'BEHIND' ? ' is-active' : ''}`}
          onClick={() => setFilter(filter === 'BEHIND' ? 'ALL' : 'BEHIND')}>
          <span className="ar-kpi__label">Need to update</span>
          <strong>{counts.BEHIND}</strong>
          <span className="ar-kpi__sub">{pending ? `${pending} downloaded it, not opened` : 'running an older version'}</span>
        </button>
        <button type="button" className={`ar-kpi is-info${filter === 'NOT_OPENED' ? ' is-active' : ''}`}
          onClick={() => setFilter(filter === 'NOT_OPENED' ? 'ALL' : 'NOT_OPENED')}>
          <span className="ar-kpi__label">Downloaded, never opened</span>
          <strong>{counts.NOT_OPENED}</strong>
          <span className="ar-kpi__sub">no sign-in from the app yet</span>
        </button>
        <button type="button" className={`ar-kpi is-muted${filter === 'NOT_ON_APP' ? ' is-active' : ''}`}
          onClick={() => setFilter(filter === 'NOT_ON_APP' ? 'ALL' : 'NOT_ON_APP')}>
          <span className="ar-kpi__label">Not on the app</span>
          <strong>{counts.NOT_ON_APP}</strong>
          <span className="ar-kpi__sub">web only or never signed in</span>
        </button>
      </div>

      {running.length ? (
        <section className="ar-card" aria-label="Versions in use">
          <div className="ar-card__head">
            <h3>Versions in use</h3>
            <span className="ar-muted">{onApp} of {everyone.length} people run the app</span>
          </div>
          <div className="ar-bar" role="img"
            aria-label={running.map(([v, n]) => `${v}: ${n}`).join(', ')}>
            {running.map(([version, n], i) => (
              <span key={version} className={`ar-bar__seg ${i === 0 && version === latest ? 'is-ok' : i < 2 ? 'is-warn' : 'is-bad'}`}
                style={{ flexGrow: n }} title={`${version}: ${n}`} />
            ))}
          </div>
          <ul className="ar-legend">
            {running.map(([version, n], i) => (
              <li key={version}>
                <i className={`ar-swatch ${i === 0 && version === latest ? 'is-ok' : i < 2 ? 'is-warn' : 'is-bad'}`} />
                <b>{version}</b> {n} {n === 1 ? 'person' : 'people'}
                {version === latest ? <span className="ar-tag is-ok">latest</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="ar-toolbar">
        <input type="search" className="ar-search" placeholder="Search name or e-mail" value={search}
          onChange={(e) => setSearch(e.target.value)} aria-label="Search people" />
        <div className="ar-segment" role="tablist" aria-label="Show">
          {(['ALL', 'LATEST', 'BEHIND', 'NOT_OPENED', 'NOT_ON_APP'] as Filter[]).map((key) => (
            <button key={key} type="button" role="tab" aria-selected={filter === key}
              className={filter === key ? 'is-active' : ''} onClick={() => setFilter(key)}>
              {key === 'ALL' ? `All ${everyone.length}` : `${STANDING[key].label} ${counts[key]}`}
            </button>
          ))}
        </div>
        <label className="ar-check">
          <input type="checkbox" checked={employeesOnly} onChange={(e) => setEmployeesOnly(e.target.checked)} />
          <span>Employees only</span>
        </label>
        <button type="button" className="ar-button" onClick={download} disabled={!people.length}>
          Download CSV ({people.length})
        </button>
      </div>

      <div className="ar-table-wrap">
        <table className="ar-table">
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Standing</th>
              <th scope="col">Running</th>
              <th scope="col">Last download</th>
              <th scope="col" className="is-num">Downloads</th>
              <th scope="col">Last app sign-in</th>
              <th scope="col"><span className="ar-sr">History</span></th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => {
              const where = standing(person, latest);
              const behind = where === 'BEHIND' ? releasesBehind(person.appVersion, everyone) : 0;
              const isOpen = open === person.userId;
              return (
                <Fragment key={person.userId}>
                  <tr className={isOpen ? 'is-open' : undefined}>
                    <th scope="row" data-label="Person">
                      <span className="ar-person">
                        <span className="ar-avatar" aria-hidden="true">{person.name.slice(0, 1).toUpperCase()}</span>
                        <span>
                          <b>{person.name}</b>
                          <small>{person.email}</small>
                        </span>
                      </span>
                    </th>
                    <td data-label="Standing">
                      <span className={`ar-chip is-${STANDING[where].tone}`}>{STANDING[where].label}</span>
                      {where === 'NOT_ON_APP' ? <small className="ar-sub">{STATE_LABEL[person.state]}</small> : null}
                    </td>
                    <td data-label="Running">
                      {person.appVersion ? (
                        <span className="ar-version">
                          <b className={where === 'BEHIND' ? 'is-warn' : 'is-ok'}>{person.appVersion}</b>
                          {behind ? <small>{behind} release{behind === 1 ? '' : 's'} behind</small> : <small>latest</small>}
                          {updatePending(person) ? <small className="is-info">{person.lastDownloadVersion} downloaded, not opened</small> : null}
                        </span>
                      ) : <span className="ar-muted">—</span>}
                    </td>
                    <td data-label="Last download">
                      {person.downloads ? (
                        <span className="ar-version">
                          <b>{person.lastDownloadVersion ?? 'version not recorded'}</b>
                          <small>{day(person.lastDownloadAt)}</small>
                        </span>
                      ) : <span className="ar-muted">Never</span>}
                    </td>
                    <td data-label="Downloads" className="is-num">{person.downloads || '—'}</td>
                    <td data-label="Last app sign-in">
                      {person.appLogins ? (
                        <span className="ar-version" title={when(person.lastLoginAt)}>
                          <b>{ago(person.lastLoginAt)}</b>
                          <small>{person.appLogins} app sign-in{person.appLogins === 1 ? '' : 's'}</small>
                        </span>
                      ) : <span className="ar-muted">—</span>}
                    </td>
                    <td data-label="History">
                      {person.downloadHistory.length ? (
                        <button type="button" className="ar-link" aria-expanded={isOpen}
                          onClick={() => setOpen(isOpen ? undefined : person.userId)}>
                          {isOpen ? 'Hide' : `History (${person.downloadHistory.length})`}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className="ar-expand">
                      <td colSpan={7}>
                        <ol className="ar-timeline">
                          {person.downloadHistory.map((entry, i) => (
                            <li key={`${entry.at}-${entry.version ?? ''}-${i}`}>
                              <b>{entry.version ?? 'version not recorded'}</b>
                              <span className="ar-muted">downloaded {when(entry.at)}</span>
                            </li>
                          ))}
                        </ol>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {!people.length ? <p className="ar-muted">Nobody matches.</p> : null}
    </div>
  );
}
