import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import {
  getActivitySettingsAdmin, setEngagementSettings, type ActivitySettingsAdmin, type EngagementSettingKey,
} from '../../../services/audit-core/activitySettings';
import { ACTIVITY_WINDOW_ADMIN_KEY } from './ActivityWindowControl';
import { engagementCommand } from './activityWindowAdmin';

const FIELDS: Array<{ key: EngagementSettingKey; label: string; unit: string }> = [
  { key: 'outputWindowMinutes', label: 'Output window', unit: 'minutes' },
  { key: 'hopScreenChanges', label: 'Clicking around after', unit: 'screen changes in 20 minutes' },
];

/**
 * The employee engagement report's two numbers (product owner 2026-11-16): an active minute is
 * productive when output follows within the output window (20 minutes by default), and a
 * 20-minute block with no output and more than N screen changes (10 by default) is clicking
 * around. For every Project or one Project; every change is kept with who and when. Reports read
 * them on every request, so a change applies to the days already recorded too.
 */
export default function EngagementSettingsControl({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ACTIVITY_WINDOW_ADMIN_KEY,
    queryFn: () => getActivitySettingsAdmin(accessToken),
    retry: false,
  });
  const data = settings.data;
  const [scope, setScope] = useState('*');
  const [values, setValues] = useState<Partial<Record<EngagementSettingKey, string>>>({});
  const [problem, setProblem] = useState<string>();
  const save = useMutation({
    mutationFn: (command: Parameters<typeof setEngagementSettings>[0]) => setEngagementSettings(command, accessToken),
    onSuccess: (next: ActivitySettingsAdmin) => {
      queryClient.setQueryData(ACTIVITY_WINDOW_ADMIN_KEY, next);
      setValues({});
      setProblem(undefined);
    },
    onError: (cause) => setProblem(cause instanceof Error ? cause.message : 'The change could not be saved.'),
  });
  if (!data?.engagement) {
    return settings.isError || (data && !data.engagement) ? null : <SectionCard><div className="p2w-skeleton">Loading…</div></SectionCard>;
  }
  const spec = data.engagement;
  const project = scope === '*' ? undefined : data.projects.find((p) => p.tenantId === scope);
  const current = (key: EngagementSettingKey): string => {
    if (scope === '*') return String(spec[key].allProjects);
    const own = project?.[key];
    return own === null || own === undefined ? '' : String(own);
  };
  const submit = () => {
    const command: Record<string, unknown> = { tenantId: scope === '*' ? null : scope };
    for (const f of FIELDS) {
      if (values[f.key] === undefined) continue;
      const next = engagementCommand(scope, f.key, values[f.key] ?? '', spec[f.key]);
      if (next.error !== undefined) { setProblem(next.error); return; }
      Object.assign(command, next.command);
    }
    if (Object.keys(command).length === 1) { setProblem('Change a number first.'); return; }
    save.mutate(command as Parameters<typeof setEngagementSettings>[0]);
  };

  return (
    <SectionCard className="sh-pause">
      <div className="p2w-card__title">
        <h3>Employee engagement: productive time and clicking around</h3>
        <p className="p2w-muted">
          An active minute is productive when something is saved within the output window after it ({spec.outputWindowMinutes.default}{' '}
          minutes by default). A 20-minute block with nothing saved and more screen changes than the number below is shown as clicking
          around ({spec.hopScreenChanges.default} by default). Only Executive and SuperAdmin see these figures; the employee is not told.
        </p>
      </div>
      <div className="sh-banner sh-banner--ok" role="status">
        <div className="sh-banner__head">
          <strong>
            All Projects: output window {spec.outputWindowMinutes.allProjects} minutes · clicking around after{' '}
            {spec.hopScreenChanges.allProjects} screen changes
          </strong>
          {data.projects.some((p) => p.outputWindowMinutes != null || p.hopScreenChanges != null) ? (
            <span>
              {data.projects.filter((p) => p.outputWindowMinutes != null || p.hopScreenChanges != null).map((p) => (
                `${p.projectName ?? p.tenantId}: ${p.outputWindowMinutes ?? spec.outputWindowMinutes.allProjects} min, ${p.hopScreenChanges ?? spec.hopScreenChanges.allProjects} changes`
              )).join(' · ')}
            </span>
          ) : null}
        </div>
      </div>
      <div className="sh-pause__form">
        <label>
          <span>For</span>
          <select value={scope} disabled={save.isPending} onChange={(event) => { setScope(event.target.value); setValues({}); }}>
            <option value="*">All Projects</option>
            {(data.projectChoices ?? []).map((p) => (
              <option key={p.tenantId} value={p.tenantId}>{p.projectName ?? p.tenantId}</option>
            ))}
          </select>
        </label>
        {FIELDS.map((f) => (
          <label key={f.key}>
            <span>{f.label} ({spec[f.key].min}–{spec[f.key].max} {f.unit})</span>
            <input
              type="number"
              inputMode="numeric"
              min={spec[f.key].min}
              max={spec[f.key].max}
              placeholder={scope === '*' ? undefined : `Same as all Projects (${spec[f.key].allProjects})`}
              value={values[f.key] ?? current(f.key)}
              disabled={save.isPending}
              onChange={(event) => setValues((v) => ({ ...v, [f.key]: event.target.value }))}
            />
          </label>
        ))}
      </div>
      <div className="sh-pause__actions">
        <button type="button" className="p2w-button p2w-button--primary" disabled={save.isPending} onClick={submit}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      {problem ? <div className="p2w-alert p2w-alert--error" role="alert">{problem}</div> : null}
    </SectionCard>
  );
}
