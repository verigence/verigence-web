import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getLoginActivity, type LoginPerson } from '../../../services/security/loginActivity';
import { appInstallsCsv, byAppFirst, versionsInUse } from './appInstallsLogic';

/**
 * Who has the Verigence Android app, and which version (product owner
 * 2026-10-30: "I need to maintain the history somewhere which all employees
 * have downloaded the mobile app and they are on which version").
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

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

function day(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

export default function AppInstalls({ accessToken }: { accessToken?: string }) {
  const [employeesOnly, setEmployeesOnly] = useState(true);
  const [open, setOpen] = useState<string>();

  const activity = useQuery({
    queryKey: ['security', 'login-activity'],
    queryFn: () => getLoginActivity(accessToken!),
    enabled: Boolean(accessToken),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const people = useMemo(
    () => byAppFirst(activity.data?.people ?? [], { employeesOnly }),
    [activity.data, employeesOnly],
  );
  const running = useMemo(() => versionsInUse(people), [people]);

  const withApp = people.filter((p) => p.appVersion).length;
  const downloaded = people.filter((p) => p.downloads > 0).length;
  const latest = running[0]?.[0];

  const download = () => {
    const blob = new Blob([`\ufeff${appInstallsCsv(people, STATE_LABEL)}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `verigence-app-versions-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (activity.isPending) return <p className="p2w-muted">Reading who has the app…</p>;
  if (activity.isError) {
    return <div className="uc01-admin-message uc01-admin-message--error">Who has the app could not be read.</div>;
  }

  return (
    <div className="app-installs">
      <dl className="asum-facts">
        <div className="asum-fact"><dt>On the app</dt><dd>{withApp}<small>of {people.length} people</small></dd></div>
        <div className="asum-fact"><dt>Have downloaded it</dt><dd>{downloaded}</dd></div>
        <div className="asum-fact">
          <dt>Versions in use</dt>
          <dd>{running.length ? running.map(([v, n]) => `${v} (${n})`).join(' · ') : '—'}
            {latest ? <small>newest in use: {latest}</small> : null}</dd>
        </div>
      </dl>

      <div className="app-installs__actions">
        <label className="p2w-check">
          <input type="checkbox" checked={employeesOnly} onChange={(e) => setEmployeesOnly(e.target.checked)} />
          <span>Employees only</span>
        </label>
        <button type="button" className="uc01-admin-button" onClick={download} disabled={!people.length}>
          Download ({people.length}) as CSV
        </button>
      </div>

      <div className="oem-masters__table-wrap">
        <table className="oem-masters__table">
          <thead>
            <tr>
              <th>Person</th><th>Status</th><th>Downloads</th><th>Last download</th>
              <th>Version downloaded</th><th>Version running</th><th>Last app sign-in</th><th />
            </tr>
          </thead>
          <tbody>
            {people.map((person) => {
              const behind = Boolean(person.appVersion && latest && person.appVersion !== latest);
              return (
                <Fragment key={person.userId}>
                  <tr>
                    <td data-label="Person">{person.name}<span className="p2w-muted"> · {person.email}</span></td>
                    <td data-label="Status">{STATE_LABEL[person.state]}</td>
                    <td data-label="Downloads">{person.downloads || '—'}</td>
                    <td data-label="Last download">{day(person.lastDownloadAt)}</td>
                    <td data-label="Version downloaded">{person.lastDownloadVersion ?? '—'}</td>
                    <td data-label="Version running">
                      {person.appVersion
                        ? <span className={behind ? 'app-installs__behind' : undefined}>{person.appVersion}</span>
                        : '—'}
                    </td>
                    <td data-label="Last app sign-in">{person.appLogins ? when(person.lastLoginAt) : '—'}</td>
                    <td>
                      {person.downloadHistory.length ? (
                        <button type="button" className="p2w-link"
                          aria-expanded={open === person.userId}
                          onClick={() => setOpen(open === person.userId ? undefined : person.userId)}>
                          {open === person.userId ? 'Hide' : 'History'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {open === person.userId ? (
                    <tr className="app-installs__history">
                      <td colSpan={8}>
                        <ul>
                          {person.downloadHistory.map((entry) => (
                            <li key={`${entry.at}-${entry.version ?? ''}`}>
                              <strong>{entry.version ?? 'version not recorded'}</strong>
                              <span className="p2w-muted">{when(entry.at)}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {!people.length ? <p className="p2w-muted">Nobody to show.</p> : null}
    </div>
  );
}
