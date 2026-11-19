import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getProjectVersionImpact,
  setProjectVersionPolicy,
  type AppVersionPolicy,
  type ProjectVersionPolicy,
} from '../../services/security/appVersion';
import BelowList from './BelowList';
import { isVersion } from './appVersionLogic';
import { coveredByEveryone, formatIst, fromLocalInput, policyKey, toLocalInput } from './appVersionPolicyFormat';

interface Props {
  accessToken?: string;
  tenantId: string;
  projectName: string;
  /** The Project's own minimum, when it has one. */
  current?: ProjectVersionPolicy;
  /** The minimum for everyone that is in force, or null. */
  everyoneMinimum: string | null;
  latest?: string;
}

/**
 * SuperAdmin, Project Administration: the minimum app version for the people who work in this
 * Project (product owner, 19 Nov 2026). Their Android app below it is refused at sign-in and when
 * its session renews, with where to download the latest. People of other Projects and web browsers
 * are not affected.
 */
export default function ProjectVersionPolicyPanel({ accessToken, tenantId, projectName, current, everyoneMinimum, latest }: Props) {
  const queryClient = useQueryClient();
  const [version, setVersion] = useState(current?.minimumVersion ?? '');
  const [from, setFrom] = useState(toLocalInput(current?.effectiveFrom ?? null));
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setVersion(current?.minimumVersion ?? '');
    setFrom(toLocalInput(current?.effectiveFrom ?? null));
  }, [current?.minimumVersion, current?.effectiveFrom]);

  const candidate = version.trim();
  const impact = useQuery({
    queryKey: [...policyKey, 'project-impact', tenantId, candidate],
    queryFn: () => getProjectVersionImpact(accessToken!, tenantId, candidate),
    enabled: Boolean(accessToken) && isVersion(candidate) && candidate !== current?.minimumVersion,
    retry: false,
  });

  const save = useMutation({
    mutationFn: (input: { minimumVersion: string | null; effectiveFrom: string | null }) =>
      setProjectVersionPolicy(accessToken!, tenantId, input),
    onSuccess: (saved: AppVersionPolicy) => {
      setProblem('');
      const now = saved.projects?.find((p) => p.tenantId === tenantId);
      setNotice(now
        ? `Saved. For ${projectName}, apps older than ${now.minimumVersion} ${now.inForce ? 'can no longer be used.' : `stop working from ${formatIst(now.effectiveFrom!)}.`}`
        : `Saved. ${projectName} has no minimum of its own now.`);
      queryClient.setQueryData(policyKey, saved);
    },
    onError: (error) => { setNotice(''); setProblem(error instanceof Error ? error.message : 'The change could not be saved.'); },
  });

  const submit = () => {
    setNotice('');
    if (!isVersion(candidate)) { setProblem('Write the version as three numbers, for example 1.5.0.'); return; }
    save.mutate({ minimumVersion: candidate, effectiveFrom: fromLocalInput(from) });
  };

  return (
    <section className="ar-version-policy" aria-labelledby="app-version-project-title">
      <h3 id="app-version-project-title">Oldest app version allowed for {projectName}</h3>
      <p className="hr-field__hint">
        {current
          ? current.inForce
            ? `Apps older than ${current.minimumVersion} cannot be used by the people of this Project.`
            : `Apps older than ${current.minimumVersion} stop working for the people of this Project from ${formatIst(current.effectiveFrom!)}.`
          : 'This Project has no minimum of its own.'}
        {' '}{everyoneMinimum ? `The minimum for everyone is ${everyoneMinimum}.` : 'There is no minimum for everyone.'}
      </p>
      <p className="hr-field__hint">
        For the people who work in the Project, on the Android app. Below this version the app is refused at sign-in and when
        its session renews, and says where to download the latest. People of other Projects are not affected, and web
        browsers never are.
      </p>
      <div className="hr-form-grid">
        <div className="hr-field">
          <label htmlFor="app-min-project-version">Minimum version</label>
          <input id="app-min-project-version" value={version} placeholder={latest ?? '1.5.0'} inputMode="decimal"
            onChange={(e) => { setVersion(e.target.value); setProblem(''); setNotice(''); }} />
          {latest && <span className="hr-field__hint">The newest version in use is {latest}.</span>}
        </div>
        <div className="hr-field">
          <label htmlFor="app-min-project-from">Stops working from (India time)</label>
          <input id="app-min-project-from" type="datetime-local" value={from} onChange={(e) => { setFrom(e.target.value); setNotice(''); }} />
          <span className="hr-field__hint">Leave empty for at once.</span>
        </div>
      </div>
      {isVersion(candidate) && coveredByEveryone(candidate, everyoneMinimum) && (
        <p className="hr-field__hint">The minimum for everyone is already {everyoneMinimum}: this would change nothing for the Project.</p>
      )}
      {isVersion(candidate) && (
        candidate === current?.minimumVersion
          ? <BelowList rows={current.devicesBelow} />
          : impact.data ? <BelowList rows={impact.data.devicesBelow} /> : null
      )}
      {problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem}</div>}
      {notice && <div className="uc01-admin-message uc01-admin-message--success" role="status">{notice}</div>}
      <div className="hr-actions">
        <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={save.isPending} onClick={submit}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        {current && (
          <button type="button" className="uc01-admin-button" disabled={save.isPending}
            onClick={() => save.mutate({ minimumVersion: null, effectiveFrom: null })}>
            Remove the Project's minimum
          </button>
        )}
      </div>
    </section>
  );
}
