import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getAppVersionImpact,
  getAppVersionPolicy,
  setAppVersionPolicy,
  type DevicesBelow,
} from '../../services/security/appVersion';
import { isVersion } from './appVersionLogic';

const policyKey = ['security', 'app-version-policy'] as const;

/** A stored instant as the value of a datetime-local input, in India time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** A datetime-local value, read as India time, as an ISO instant. */
function fromLocalInput(value: string): string | null {
  return value ? `${value}:00+05:30` : null;
}

function formatIst(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

function BelowList({ rows }: { rows: DevicesBelow[] }) {
  if (rows.length === 0) return <p className="hr-field__hint">No app installation seen in the last 30 days is below this version.</p>;
  const people = rows.reduce((n, r) => n + r.people, 0);
  return (
    <div>
      <p className="hr-field__hint">Seen in the last 30 days and below this version: {people} {people === 1 ? 'person' : 'people'}.</p>
      <ul className="ar-version-list">
        {rows.map((r) => (
          <li key={r.appVersion ?? 'unknown'}>
            <b>{r.appVersion ?? 'Too old to report a version'}</b>: {r.devices} {r.devices === 1 ? 'device' : 'devices'}, {r.people} {r.people === 1 ? 'person' : 'people'}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * SuperAdmin: the oldest app version that may still be used. From the chosen time, an older app
 * shows "Update required" and Security refuses its sign-in and session renewal. Browsers are never
 * affected.
 */
export default function AppVersionPolicyPanel({ accessToken, latest }: { accessToken?: string; latest?: string }) {
  const queryClient = useQueryClient();
  const policy = useQuery({
    queryKey: policyKey,
    queryFn: () => getAppVersionPolicy(accessToken!),
    enabled: Boolean(accessToken),
    retry: false,
  });
  const [version, setVersion] = useState('');
  const [from, setFrom] = useState('');
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!policy.data) return;
    setVersion(policy.data.minimumVersion ?? '');
    setFrom(toLocalInput(policy.data.effectiveFrom));
  }, [policy.data]);

  const candidate = version.trim();
  const impact = useQuery({
    queryKey: [...policyKey, 'impact', candidate],
    queryFn: () => getAppVersionImpact(accessToken!, candidate),
    enabled: Boolean(accessToken) && isVersion(candidate) && candidate !== policy.data?.minimumVersion,
    retry: false,
  });

  const save = useMutation({
    mutationFn: (input: { minimumVersion: string | null; effectiveFrom: string | null }) => setAppVersionPolicy(accessToken!, input),
    onSuccess: (saved) => {
      setProblem('');
      setNotice(saved.minimumVersion
        ? `Saved. Apps older than ${saved.minimumVersion} ${saved.inForce ? 'can no longer be used.' : `stop working from ${formatIst(saved.effectiveFrom!)}.`}`
        : 'Saved. Every app version may be used.');
      queryClient.setQueryData(policyKey, saved);
    },
    onError: (error) => { setNotice(''); setProblem(error instanceof Error ? error.message : 'The change could not be saved.'); },
  });

  const submit = () => {
    setNotice('');
    if (candidate && !isVersion(candidate)) { setProblem('Write the version as three numbers, for example 1.5.0.'); return; }
    save.mutate({ minimumVersion: candidate || null, effectiveFrom: candidate ? fromLocalInput(from) : null });
  };

  if (policy.isLoading) return <div className="uc01-admin-state">Loading the app version rule…</div>;
  if (policy.isError) return <div className="uc01-admin-state uc01-admin-state--error" role="alert">The app version rule could not be loaded.</div>;
  const current = policy.data!;

  return (
    <section className="ar-version-policy" aria-labelledby="app-version-policy-title">
      <h3 id="app-version-policy-title">Oldest app version allowed</h3>
      <p className="hr-field__hint">
        {current.minimumVersion
          ? current.inForce
            ? `Apps older than ${current.minimumVersion} cannot be used: they show "Update required" and cannot sign in.`
            : `Apps older than ${current.minimumVersion} stop working from ${formatIst(current.effectiveFrom!)}.`
          : 'No minimum is set: every app version can be used.'}
        {' '}Web browsers are never affected.
      </p>
      <div className="hr-form-grid">
        <div className="hr-field">
          <label htmlFor="app-min-version">Minimum version</label>
          <input id="app-min-version" value={version} placeholder={latest ?? '1.5.0'} inputMode="decimal"
            onChange={(e) => { setVersion(e.target.value); setProblem(''); setNotice(''); }} />
          {latest && <span className="hr-field__hint">The newest version in use is {latest}.</span>}
        </div>
        <div className="hr-field">
          <label htmlFor="app-min-from">Stops working from (India time)</label>
          <input id="app-min-from" type="datetime-local" value={from} onChange={(e) => { setFrom(e.target.value); setNotice(''); }} />
          <span className="hr-field__hint">Leave empty for at once.</span>
        </div>
      </div>
      {isVersion(candidate) && (
        candidate === current.minimumVersion
          ? <BelowList rows={current.devicesBelow} />
          : impact.data ? <BelowList rows={impact.data.devicesBelow} /> : null
      )}
      {problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem}</div>}
      {notice && <div className="uc01-admin-message uc01-admin-message--success" role="status">{notice}</div>}
      <div className="hr-actions">
        <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={save.isPending} onClick={submit}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        {current.minimumVersion && (
          <button type="button" className="uc01-admin-button" disabled={save.isPending}
            onClick={() => { setVersion(''); setFrom(''); save.mutate({ minimumVersion: null, effectiveFrom: null }); }}>
            Remove the minimum
          </button>
        )}
      </div>
    </section>
  );
}
