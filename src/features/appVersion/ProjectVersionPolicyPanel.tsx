import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getProjectVersionImpact,
  setProjectVersionPolicy,
  type AppVersionPolicy,
  type ProjectChoice,
  type ProjectVersionPolicy,
} from '../../services/security/appVersion';
import BelowList from './BelowList';
import { isVersion } from './appVersionLogic';
import {
  coveredByEveryone,
  formatIst,
  fromLocalInput,
  peopleBelow,
  policyKey,
  projectFromLabel,
  projectOptions,
  toLocalInput,
} from './appVersionPolicyFormat';

interface Props {
  accessToken?: string;
  latest?: string;
  projects: ProjectVersionPolicy[];
  choices: ProjectChoice[];
  /** The minimum for everyone that is in force, or null. */
  everyoneMinimum: string | null;
}

/**
 * SuperAdmin: a minimum app version for the people who work in one Project (product owner,
 * 19 Nov 2026). Their Android app below it is refused at sign-in and when its session renews, with
 * where to download the latest. People of other Projects and web browsers are not affected.
 */
export default function ProjectVersionPolicyPanel({ accessToken, latest, projects, choices, everyoneMinimum }: Props) {
  const queryClient = useQueryClient();
  const options = projectOptions(choices, projects);
  const [tenantId, setTenantId] = useState('');
  const [version, setVersion] = useState('');
  const [from, setFrom] = useState('');
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');

  const existing = projects.find((p) => p.tenantId === tenantId);
  const candidate = version.trim();
  const impact = useQuery({
    queryKey: [...policyKey, 'project-impact', tenantId, candidate],
    queryFn: () => getProjectVersionImpact(accessToken!, tenantId, candidate),
    enabled: Boolean(accessToken) && Boolean(tenantId) && isVersion(candidate) && candidate !== existing?.minimumVersion,
    retry: false,
  });

  const choose = (id: string) => {
    const current = projects.find((p) => p.tenantId === id);
    setTenantId(id);
    setVersion(current?.minimumVersion ?? '');
    setFrom(toLocalInput(current?.effectiveFrom ?? null));
    setProblem('');
    setNotice('');
  };

  const nameOf = (id: string) => options.find((o) => o.tenantId === id)?.tenantName ?? 'the Project';

  const save = useMutation({
    mutationFn: (input: { tenantId: string; minimumVersion: string | null; effectiveFrom: string | null }) =>
      setProjectVersionPolicy(accessToken!, input.tenantId, { minimumVersion: input.minimumVersion, effectiveFrom: input.effectiveFrom }),
    onSuccess: (saved: AppVersionPolicy, input) => {
      setProblem('');
      const now = saved.projects?.find((p) => p.tenantId === input.tenantId);
      setNotice(now
        ? `Saved. For ${now.tenantName}, apps older than ${now.minimumVersion} ${now.inForce ? 'can no longer be used.' : `stop working from ${formatIst(now.effectiveFrom!)}.`}`
        : `Saved. ${nameOf(input.tenantId)} has no minimum of its own now.`);
      queryClient.setQueryData(policyKey, saved);
      if (!now) { setVersion(''); setFrom(''); }
    },
    onError: (error) => { setNotice(''); setProblem(error instanceof Error ? error.message : 'The change could not be saved.'); },
  });

  const submit = () => {
    setNotice('');
    if (!tenantId) { setProblem('Choose the Project.'); return; }
    if (!isVersion(candidate)) { setProblem('Write the version as three numbers, for example 1.5.0.'); return; }
    save.mutate({ tenantId, minimumVersion: candidate, effectiveFrom: fromLocalInput(from) });
  };

  return (
    <div className="ar-version-projects" aria-labelledby="app-version-project-title">
      <h3 id="app-version-project-title">Oldest app version allowed for one Project</h3>
      <p className="hr-field__hint">
        For the people who work in the Project, on the Android app. Below this version the app is refused at sign-in and when
        its session renews, and says where to download the latest. People of other Projects are not affected, and web
        browsers never are.
      </p>
      {projects.length > 0 && (
        <div className="ar-table-wrap">
        <table className="ar-table">
          <thead>
            <tr><th scope="col">Project</th><th scope="col">Minimum version</th><th scope="col">Status</th><th scope="col">Still below it</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const below = peopleBelow(p.devicesBelow);
              return (
                <tr key={p.tenantId}>
                  <th scope="row" data-label="Project">{nameOf(p.tenantId)}</th>
                  <td data-label="Minimum version">{p.minimumVersion}</td>
                  <td data-label="Status">{projectFromLabel(p)}</td>
                  <td data-label="Still below it">{below === 0 ? 'Nobody' : `${below} ${below === 1 ? 'person' : 'people'}`}</td>
                  <td className="ar-version-projects__actions">
                    <button type="button" className="uc01-admin-button" disabled={save.isPending} onClick={() => choose(p.tenantId)}>Change</button>
                    <button type="button" className="uc01-admin-button" disabled={save.isPending}
                      onClick={() => { setTenantId(p.tenantId); save.mutate({ tenantId: p.tenantId, minimumVersion: null, effectiveFrom: null }); }}>
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
      <div className="hr-form-grid">
        <div className="hr-field">
          <label htmlFor="app-min-project">Project</label>
          <select id="app-min-project" value={tenantId} onChange={(e) => choose(e.target.value)}>
            <option value="">Choose a Project</option>
            {options.map((o) => <option key={o.tenantId} value={o.tenantId}>{o.tenantName}</option>)}
          </select>
        </div>
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
      {tenantId && isVersion(candidate) && coveredByEveryone(candidate, everyoneMinimum) && (
        <p className="hr-field__hint">The minimum for everyone is already {everyoneMinimum}: this would change nothing for the Project.</p>
      )}
      {tenantId && isVersion(candidate) && (
        candidate === existing?.minimumVersion
          ? <BelowList rows={existing.devicesBelow} />
          : impact.data ? <BelowList rows={impact.data.devicesBelow} /> : null
      )}
      {problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem}</div>}
      {notice && <div className="uc01-admin-message uc01-admin-message--success" role="status">{notice}</div>}
      <div className="hr-actions">
        <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={save.isPending} onClick={submit}>
          {save.isPending ? 'Saving…' : 'Save for this Project'}
        </button>
      </div>
    </div>
  );
}
