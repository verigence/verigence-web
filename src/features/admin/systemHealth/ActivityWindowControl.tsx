import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { istTime } from '../../uc03-p2/uploadPause/uploadPause';
import {
  getActivitySettingsAdmin, setActivityWindow, type ActivitySettingsAdmin,
} from '../../../services/audit-core/activitySettings';
import { changeText, minutesText, WINDOW_CHOICES, windowCommand } from './activityWindowAdmin';

export const ACTIVITY_WINDOW_ADMIN_KEY = ['admin', 'activity-settings'] as const;

/**
 * The reading window of "time on Verigence" (product owner 2026-11-09): a minute is active when a
 * click, tap or key was in it or in this many minutes before it; scrolling alone never counts.
 * 3 minutes by default, 1 to 10, for every Project or one Project; every change is kept with
 * who and when. The app reads it on start, every 3 hours and with every send.
 */
export default function ActivityWindowControl({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ACTIVITY_WINDOW_ADMIN_KEY,
    queryFn: () => getActivitySettingsAdmin(accessToken),
    retry: false,
  });
  const data = settings.data;
  const [scope, setScope] = useState('*');
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string>();
  const save = useMutation({
    mutationFn: (command: { tenantId: string | null; readingWindowMinutes: number | null }) => setActivityWindow(command, accessToken),
    onSuccess: (next: ActivitySettingsAdmin) => {
      queryClient.setQueryData(ACTIVITY_WINDOW_ADMIN_KEY, next);
      setValue('');
      setProblem(undefined);
    },
    onError: (cause) => setProblem(cause instanceof Error ? cause.message : 'The change could not be saved.'),
  });
  const current = scope === '*' ? data?.allProjects.minutes
    : data?.projects.find((p) => p.tenantId === scope)?.minutes ?? null;
  const submit = () => {
    const next = windowCommand(scope, value || String(current ?? data?.defaultMinutes ?? 3));
    if (next.error !== undefined) { setProblem(next.error); return; }
    save.mutate(next.command);
  };

  return (
    <SectionCard className="sh-pause">
      <div className="p2w-card__title">
        <h3>Time on Verigence: reading window</h3>
        <p className="p2w-muted">
          A minute counts as active when there was a click, tap or key in it or in this many minutes before it (reading
          after a click). Scrolling alone is never counted. 3 minutes by default.
        </p>
      </div>
      {settings.isError ? (
        <div className="p2w-alert p2w-alert--error" role="alert">
          The setting could not be read. {settings.error instanceof Error ? settings.error.message : ''}
        </div>
      ) : null}
      {data ? (
        <div className="sh-banner sh-banner--ok" role="status">
          <div className="sh-banner__head">
            <strong>All Projects: {minutesText(data.allProjects.minutes)}{data.allProjects.isDefault ? ' (default)' : ''}</strong>
            {data.projects.length ? (
              <span>{data.projects.map((p) => `${p.projectName ?? p.tenantId}: ${minutesText(p.minutes)}`).join(' · ')}</span>
            ) : null}
          </div>
          {data.allProjects.setAtUtc ? (
            <span className="sh-note">
              Last changed {istTime(data.allProjects.setAtUtc) ?? '—'}{data.allProjects.setByActorId ? ` by ${data.allProjects.setByActorId}` : ''}.
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="sh-pause__form">
        <label>
          <span>For</span>
          <select value={scope} disabled={save.isPending} onChange={(event) => { setScope(event.target.value); setValue(''); }}>
            <option value="*">All Projects</option>
            {(data?.projectChoices ?? []).map((p) => (
              <option key={p.tenantId} value={p.tenantId}>{p.projectName ?? p.tenantId}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Reading window</span>
          <select value={value || String(current ?? (scope === '*' ? data?.defaultMinutes ?? 3 : 'inherit'))}
            disabled={save.isPending} onChange={(event) => setValue(event.target.value)}>
            {scope !== '*' ? <option value="inherit">Same as all Projects</option> : null}
            {WINDOW_CHOICES.map((m) => <option key={m} value={m}>{minutesText(m)}</option>)}
          </select>
        </label>
      </div>
      <div className="sh-pause__actions">
        <button type="button" className="p2w-button p2w-button--primary" disabled={save.isPending || settings.isLoading}
          onClick={submit}>{save.isPending ? 'Saving…' : 'Save'}</button>
      </div>
      {problem ? <div className="p2w-alert p2w-alert--error" role="alert">{problem}</div> : null}
      {data?.changes.length ? (
        <details>
          <summary>Changes ({data.changes.length})</summary>
          <ul className="p2dr-notes">
            {data.changes.map((c) => (
              <li key={`${c.changedAtUtc}-${c.tenantId ?? '*'}`}>
                {istTime(c.changedAtUtc) ?? c.changedAtUtc} · {c.changedByActorId} · {changeText(c)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </SectionCard>
  );
}
