import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import DialogShell from '../features/hr/attendance/DialogShell';
import { formatWhenIst } from '../features/announcements/announcementLogic';
import { nightControlKeys } from '../features/night-control/nightControl';
import { ALL_FEATURES, grantErrorMessage, grantFeatureLabel, isHhMm, noteProblem, revokeErrorMessage } from '../features/night-control/nightAdmin';
import { MoonIcon } from '../features/night-control/NightControlBridge';
import {
  getNightControlOverview,
  grantNightAccess,
  revokeNightAccess,
  setNightFeature,
  type NightFeatureSetting,
  type NightGrant,
} from '../services/security/nightControl';
import { listGlobalUsers, type GlobalUserDirectoryItem } from '../services/security/onboardingAdmin';
import { useSessionStore } from '../store/sessionStore';
import '../styles/feature-rollout.css';
import '../styles/night-control.css';

type Notice = { ok: boolean; text: string } | null;

const messageOf = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** One feature row: switch, start and end, in force now, Save. */
function FeatureRow({ feature, busy, onSave }: {
  feature: NightFeatureSetting;
  busy: boolean;
  onSave: (input: { enabled: boolean; startsAt: string; endsAt: string }) => void;
}) {
  const [enabled, setEnabled] = useState(feature.enabled);
  const [startsAt, setStartsAt] = useState(feature.startsAt);
  const [endsAt, setEndsAt] = useState(feature.endsAt);
  useEffect(() => {
    setEnabled(feature.enabled);
    setStartsAt(feature.startsAt);
    setEndsAt(feature.endsAt);
  }, [feature.enabled, feature.startsAt, feature.endsAt]);

  const dirty = enabled !== feature.enabled || startsAt !== feature.startsAt || endsAt !== feature.endsAt;
  const valid = isHhMm(startsAt) && isHhMm(endsAt) && startsAt !== endsAt;
  const id = `night-${feature.featureKey}`;

  return (
    <tr>
      <td data-label="Feature"><strong id={`${id}-label`}>{feature.label || feature.featureKey}</strong><small>{feature.featureKey}</small></td>
      <td data-label="Night control">
        <span className="night-admin__toggle">
          <button type="button" role="switch" className="rollout-toggle" aria-checked={enabled} aria-labelledby={`${id}-label`}
            disabled={busy} onClick={() => setEnabled(!enabled)} />
          {enabled ? 'On' : 'Off'}
        </span>
      </td>
      <td data-label="Starts"><input type="time" aria-label={`${feature.label} starts (India time)`} value={startsAt} disabled={busy} onChange={(e) => setStartsAt(e.target.value)} /></td>
      <td data-label="Ends"><input type="time" aria-label={`${feature.label} ends (India time)`} value={endsAt} disabled={busy} onChange={(e) => setEndsAt(e.target.value)} /></td>
      <td data-label="Right now">
        <span className={`uc01-admin-status ${feature.active ? 'uc01-admin-status--pending' : feature.enabled ? 'uc01-admin-status--active' : ''}`}>
          {feature.active ? 'In force' : feature.enabled ? 'Not in force' : 'Off'}
        </span>
      </td>
      <td>
        <div className="uc01-admin-row-actions">
          <button type="button" className="uc01-admin-button uc01-admin-button--primary uc01-admin-button--compact"
            disabled={busy || !dirty || !valid} onClick={() => onSave({ enabled, startsAt, endsAt })}>Save</button>
        </div>
        {!valid && <small className="hr-muted">Start and end must be different times.</small>}
      </td>
    </tr>
  );
}

/** Pick a person from the Security directory (the one the Users and Feature rollout screens use). */
function PersonPicker({ accessToken, picked, onPick, disabled }: {
  accessToken: string | undefined;
  picked: GlobalUserDirectoryItem | null;
  onPick: (user: GlobalUserDirectoryItem | null) => void;
  disabled: boolean;
}) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [term]);

  const search = useQuery({
    queryKey: ['security', 'platform-users', 'search', debounced],
    queryFn: () => listGlobalUsers(accessToken!, 'ACTIVE', debounced),
    enabled: Boolean(accessToken) && debounced.length >= 2 && !picked,
    staleTime: 30_000,
    retry: false,
  });
  const results = (search.data ?? []).slice(0, 8);

  if (picked) {
    return (
      <div className="night-admin__field">
        <span>Person</span>
        <div className="night-admin__picked">
          <span><strong>{picked.displayName}</strong><small>{picked.primaryEmail ?? 'No email'}</small></span>
          <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={disabled} onClick={() => { onPick(null); setTerm(''); }}>Change</button>
        </div>
      </div>
    );
  }

  return (
    <div className="uc01-admin-search">
      <label htmlFor="night-person-search">Person</label>
      <input id="night-person-search" type="search" placeholder="Search name or email" autoComplete="off"
        value={term} disabled={disabled} onChange={(e) => setTerm(e.target.value)} />
      {debounced.length >= 2 && (
        search.isLoading ? <small className="hr-muted">Searching…</small>
          : search.isError ? <small className="hr-muted">People could not be searched. {messageOf(search.error, '')}</small>
            : results.length === 0 ? <small className="hr-muted">No active person matches.</small>
              : (
                <ul className="night-admin__people" role="listbox" aria-label="Matching people">
                  {results.map((u) => (
                    <li key={u.userId}>
                      <button type="button" role="option" aria-selected={false} onClick={() => onPick(u)}>
                        <strong>{u.displayName}</strong><small>{u.primaryEmail ?? 'No email'}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )
      )}
    </div>
  );
}

function GiveAccess({ accessToken, features, onDone }: {
  accessToken: string | undefined;
  features: NightFeatureSetting[];
  onDone: (text: string) => Promise<void>;
}) {
  const [person, setPerson] = useState<GlobalUserDirectoryItem | null>(null);
  const [featureKey, setFeatureKey] = useState(ALL_FEATURES);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const problem = noteProblem(note);

  const give = useMutation({
    mutationFn: () => grantNightAccess(accessToken!, { userId: person!.userId, featureKey: featureKey === ALL_FEATURES ? null : featureKey, note: note.trim() }),
    onSuccess: async () => {
      const what = grantFeatureLabel(featureKey === ALL_FEATURES ? null : featureKey, features);
      setError('');
      setPerson(null);
      setFeatureKey(ALL_FEATURES);
      setNote('');
      await onDone(`${person?.displayName ?? 'The person'} now has night access: ${what}.`);
    },
    onError: (cause) => setError(grantErrorMessage(cause)),
  });

  return (
    <SectionCard title="Give access" description="The person can use the feature at night until you remove the access.">
      <form className="night-admin__form" onSubmit={(e) => { e.preventDefault(); if (person && !problem) give.mutate(); }}>
        <PersonPicker accessToken={accessToken} picked={person} onPick={(u) => { setPerson(u); setError(''); }} disabled={give.isPending} />
        <label className="night-admin__field">
          <span>Feature</span>
          <select value={featureKey} disabled={give.isPending} onChange={(e) => { setFeatureKey(e.target.value); setError(''); }}>
            <option value={ALL_FEATURES}>All features</option>
            {features.map((f) => <option key={f.featureKey} value={f.featureKey}>{f.label || f.featureKey}</option>)}
          </select>
        </label>
        <label className="uc01-admin-reason">
          <span>Note (why this person needs access)</span>
          <textarea value={note} maxLength={500} disabled={give.isPending} onChange={(e) => setNote(e.target.value)} />
          {note && problem ? <small className="hr-muted">{problem}</small> : null}
        </label>
        {error && <div className="uc01-admin-message uc01-admin-message--error night-admin__form-actions" role="alert">{error}</div>}
        <div className="night-admin__form-actions">
          <button type="submit" className="uc01-admin-button uc01-admin-button--primary" disabled={give.isPending || !person || Boolean(problem)}>
            {give.isPending ? 'Giving access…' : 'Give access'}
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

function RemoveAccessDialog({ grant, what, accessToken, onClose, onDone }: {
  grant: NightGrant;
  what: string;
  accessToken: string | undefined;
  onClose: () => void;
  onDone: (text: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const problem = noteProblem(note);
  const name = grant.displayName || grant.email || 'This person';
  const remove = useMutation({
    mutationFn: () => revokeNightAccess(accessToken!, grant.grantId, note.trim()),
    onSuccess: async () => { await onDone(`Night access removed for ${name}: ${what}.`); onClose(); },
    onError: async (cause) => {
      setError(revokeErrorMessage(cause));
    },
  });

  return (
    <DialogShell title="Remove access" eyebrow="Night control" onClose={onClose} locked={remove.isPending}>
      <p>{name} will be blocked from {what === 'All features' ? 'every night-controlled feature' : what} at night again.</p>
      <label className="uc01-admin-reason">
        <span>Note (why the access is removed)</span>
        <textarea value={note} maxLength={500} disabled={remove.isPending} onChange={(e) => setNote(e.target.value)} />
        {note && problem ? <small className="hr-muted">{problem}</small> : null}
      </label>
      {error && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</div>}
      <div className="uc01-admin-dialog__actions">
        <button type="button" className="uc01-admin-button" disabled={remove.isPending} onClick={onClose}>Cancel</button>
        <button type="button" className="uc01-admin-button uc01-admin-button--danger-primary" disabled={remove.isPending || Boolean(problem)} onClick={() => remove.mutate()}>
          {remove.isPending ? 'Removing…' : 'Remove access'}
        </button>
      </div>
    </DialogShell>
  );
}

/** SuperAdmin: night control -- which features close at night, when, and who may still use them. */
export default function AdminNightControlPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<Notice>(null);
  const [removing, setRemoving] = useState<NightGrant | null>(null);

  const overview = useQuery({
    queryKey: nightControlKeys.admin,
    queryFn: () => getNightControlOverview(accessToken!),
    enabled: Boolean(accessToken),
    retry: false,
    refetchInterval: 60_000,
  });
  const features = useMemo(() => overview.data?.features ?? [], [overview.data]);
  const grants = overview.data?.grants ?? [];

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: nightControlKeys.admin });
    await queryClient.invalidateQueries({ queryKey: nightControlKeys.mine });
  };
  const done = async (text: string) => { setNotice({ ok: true, text }); await refresh(); };

  const save = useMutation({
    mutationFn: (run: { feature: NightFeatureSetting; input: { enabled: boolean; startsAt: string; endsAt: string } }) =>
      setNightFeature(accessToken!, run.feature.featureKey, run.input),
    onSuccess: async (_data, run) => {
      const { enabled, startsAt, endsAt } = run.input;
      await done(`${run.feature.label}: ${enabled ? `closed at night from ${startsAt} to ${endsAt}` : 'night control is off'}.`);
    },
    onError: async (error) => { setNotice({ ok: false, text: messageOf(error, 'The change could not be saved. Please try again.') }); await refresh(); },
  });

  const exemptRoles = overview.data?.exemptRoles?.length ? overview.data.exemptRoles : ['SuperAdmin', 'Executive'];

  return (
    <section className="uc01-admin-page hr-page night-admin" aria-label="Night control">
      <PageHeader
        eyebrow="Administration"
        title="Night control"
        description={`At night the features below are closed and people see "${overview.data?.message || 'Night Mode On'}". Times are India time. Give a person access when they need a feature at night; it stays until you remove it.`}
      />

      <div className="uc01-admin-message uc01-admin-message--info night-admin__exempt" role="note">
        <MoonIcon size={18} />
        <span>{exemptRoles.join(' and ')} are never blocked.</span>
      </div>

      {notice && <div className={`uc01-admin-message uc01-admin-message--${notice.ok ? 'success' : 'error'}`} role={notice.ok ? 'status' : 'alert'}>{notice.text}</div>}
      {overview.isLoading && <div className="uc01-admin-state">Loading…</div>}
      {overview.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>Night control could not be loaded.</strong>
          <span>{messageOf(overview.error, 'Please try again.')}</span>
          <button type="button" className="uc01-admin-button" onClick={() => overview.refetch()}>Try again</button>
        </div>
      )}

      {overview.data && (
        <>
          <SectionCard title="Features" description="Each feature is kept on its own. Change the switch or the times, then Save that row.">
            <div className="uc01-admin-table-wrap">
              <table className="uc01-admin-table">
                <thead>
                  <tr><th scope="col">Feature</th><th scope="col">Night control</th><th scope="col">Starts</th><th scope="col">Ends</th><th scope="col">Right now</th><th scope="col"><span className="visually-hidden">Save</span></th></tr>
                </thead>
                <tbody>
                  {features.length === 0 && <tr><td colSpan={6} className="uc01-admin-empty">No night-controlled features.</td></tr>}
                  {features.map((f) => (
                    <FeatureRow key={f.featureKey} feature={f} busy={save.isPending}
                      onSave={(input) => save.mutate({ feature: f, input })} />
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="People with access" description={grants.length ? `${grants.length} ${grants.length === 1 ? 'person has' : 'people have'} access at night.` : 'Nobody has access at night.'}>
            {grants.length > 0 && (
              <div className="uc01-admin-table-wrap">
                <table className="uc01-admin-table">
                  <thead>
                    <tr><th scope="col">Person</th><th scope="col">Access to</th><th scope="col">Note</th><th scope="col">Given by</th><th scope="col">Given at</th><th scope="col"><span className="visually-hidden">Remove</span></th></tr>
                  </thead>
                  <tbody>
                    {grants.map((g) => (
                      <tr key={g.grantId}>
                        <td data-label="Person"><strong>{g.displayName || 'Unknown person'}</strong><small>{g.email ?? 'No email'}</small></td>
                        <td data-label="Access to">{grantFeatureLabel(g.featureKey, features)}</td>
                        <td data-label="Note">{g.note}</td>
                        <td data-label="Given by">{g.grantedBy || '—'}</td>
                        <td data-label="Given at">{formatWhenIst(g.grantedAt)}</td>
                        <td>
                          <div className="uc01-admin-row-actions">
                            <button type="button" className="uc01-admin-button uc01-admin-button--danger uc01-admin-button--compact" onClick={() => setRemoving(g)}>Remove access</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <GiveAccess accessToken={accessToken} features={features} onDone={done} />
        </>
      )}

      {removing && (
        <RemoveAccessDialog
          grant={removing}
          what={grantFeatureLabel(removing.featureKey, features)}
          accessToken={accessToken}
          onClose={() => { setRemoving(null); void refresh(); }}
          onDone={done}
        />
      )}
    </section>
  );
}
