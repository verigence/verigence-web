import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { addablePeople, featureKeys } from '../features/rollout/featureFlags';
import {
  FEATURE_KEYS,
  getFeatureSettings,
  setFeatureEveryone,
  setFeatureForUser,
  type FeatureKey,
  type FeatureSetting,
} from '../services/security/features';
import { listGlobalUsers } from '../services/security/onboardingAdmin';
import { useSessionStore } from '../store/sessionStore';
import '../styles/feature-rollout.css';

const TITLES: Record<FeatureKey, { title: string; blurb: string }> = {
  AUDIT: { title: 'Audit', blurb: 'The Audit menu: bookings and deliveries, task queue, duplicate bookings, daily operations.' },
  ANALYTICS: { title: 'Analytics', blurb: 'The Analytics menu and its reports.' },
};

const messageOf = (error: unknown) => (error instanceof Error && error.message ? error.message : 'The change could not be saved. Please try again.');

function FeatureCard({
  setting,
  users,
  busy,
  onEveryone,
  onPerson,
}: {
  setting: FeatureSetting;
  users: Array<{ userId: string; displayName: string; status: string }>;
  busy: boolean;
  onEveryone: (enabled: boolean) => void;
  onPerson: (userId: string, enabled: boolean | null) => void;
}) {
  const { title, blurb } = TITLES[setting.featureKey];
  const [pick, setPick] = useState('');
  const addable = addablePeople(users, setting.people);
  const idBase = `rollout-${setting.featureKey}`;

  return (
    <SectionCard title={title} description={blurb}>
      <div className="rollout-switch">
        <span id={`${idBase}-label`}>
          <strong>Show to everyone</strong>
          <small>{setting.everyone ? `${title} is on for everyone, except people switched off below.` : `${title} is off unless a person is switched on below.`}</small>
        </span>
        <button type="button" role="switch" className="rollout-toggle" aria-checked={setting.everyone} aria-labelledby={`${idBase}-label`} disabled={busy} onClick={() => onEveryone(!setting.everyone)} />
      </div>

      <h3 className="rollout-heading">People with their own setting</h3>
      {setting.people.length === 0 ? (
        <p className="hr-muted">Nobody has their own setting.</p>
      ) : (
        <ul className="rollout-people">
          {setting.people.map((p) => (
            <li key={p.userId}>
              <span className="rollout-person"><strong>{p.displayName}</strong><small>{p.email ?? 'No email'}</small></span>
              <span className="rollout-controls">
                <span className="rollout-segment" role="group" aria-label={`${title} for ${p.displayName}`}>
                  <button type="button" aria-pressed={p.enabled} disabled={busy} onClick={() => onPerson(p.userId, true)}>On</button>
                  <button type="button" aria-pressed={!p.enabled} disabled={busy} onClick={() => onPerson(p.userId, false)}>Off</button>
                </span>
                <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={busy} onClick={() => onPerson(p.userId, null)}>Use default</button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="rollout-add">
        <label>
          <span>Add a person</span>
          <select value={pick} disabled={busy || addable.length === 0} onChange={(e) => setPick(e.target.value)}>
            <option value="">{addable.length === 0 ? 'No one left to add' : 'Choose a person…'}</option>
            {addable.map((u) => <option key={u.userId} value={u.userId}>{u.displayName}</option>)}
          </select>
        </label>
        <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={busy || !pick} onClick={() => { onPerson(pick, true); setPick(''); }}>
          Switch on for this person
        </button>
      </div>
    </SectionCard>
  );
}

/** SuperAdmin: switch Audit and Analytics on, a few people at a time, then for everyone. */
export default function AdminFeatureRolloutPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const settings = useQuery({
    queryKey: featureKeys.admin,
    queryFn: () => getFeatureSettings(accessToken!),
    enabled: Boolean(accessToken),
    retry: false,
  });
  const users = useQuery({
    queryKey: ['security', 'platform-users', 'all'],
    queryFn: () => listGlobalUsers(accessToken!),
    enabled: Boolean(accessToken),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: featureKeys.admin });
    await queryClient.invalidateQueries({ queryKey: featureKeys.mine });
  };
  const change = useMutation({
    mutationFn: (run: { text: string; send: () => Promise<unknown> }) => run.send(),
    onSuccess: async (_data, run) => { setNotice({ ok: true, text: run.text }); await refresh(); },
    onError: async (error) => { setNotice({ ok: false, text: messageOf(error) }); await refresh(); },
  });

  const ordered = FEATURE_KEYS.map((key) => settings.data?.find((s) => s.featureKey === key)).filter((s): s is FeatureSetting => Boolean(s));

  return (
    <section className="uc01-admin-page hr-page" aria-label="Feature rollout">
      <PageHeader
        eyebrow="Administration"
        title="Feature rollout"
        description="Audit and Analytics are hidden until you switch them on. Switch them on for a few people first, then for everyone. SuperAdmin always sees everything. A person's own setting wins over the setting for everyone."
      />
      {notice && <div className={`uc01-admin-message uc01-admin-message--${notice.ok ? 'success' : 'error'}`} role={notice.ok ? 'status' : 'alert'}>{notice.text}</div>}
      {settings.isLoading && <div className="uc01-admin-state">Loading…</div>}
      {settings.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>The settings could not be loaded.</strong>
          <span>{messageOf(settings.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => settings.refetch()}>Try again</button>
        </div>
      )}
      {users.isError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">The list of people could not be loaded, so nobody can be added now.</div>}
      <div className="rollout-grid">
        {ordered.map((setting) => (
          <FeatureCard
            key={setting.featureKey}
            setting={setting}
            users={users.data ?? []}
            busy={change.isPending}
            onEveryone={(enabled) => change.mutate({
              text: `${TITLES[setting.featureKey].title} is now ${enabled ? 'on' : 'off'} for everyone.`,
              send: () => setFeatureEveryone(accessToken!, setting.featureKey, enabled),
            })}
            onPerson={(userId, enabled) => {
              const name = users.data?.find((u) => u.userId === userId)?.displayName ?? setting.people.find((p) => p.userId === userId)?.displayName ?? 'The person';
              change.mutate({
                text: enabled === null ? `${name} now follows the setting for everyone.` : `${TITLES[setting.featureKey].title} is now ${enabled ? 'on' : 'off'} for ${name}.`,
                send: () => setFeatureForUser(accessToken!, setting.featureKey, userId, enabled),
              });
            }}
          />
        ))}
      </div>
    </section>
  );
}
