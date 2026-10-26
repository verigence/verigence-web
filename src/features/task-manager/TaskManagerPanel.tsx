import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  getTmContext, getTmTasks, type TaskManagerMode, type TmStatusFilter, type TmView,
} from '../../services/audit-core/taskManager';
import RaiseTmTaskDialog from './RaiseTmTaskDialog';
import TmSchedules from './TmSchedules';
import TmTaskItem from './TmTaskItem';
import { roleLabel } from './tmFormat';
import '../../styles/task-manager.css';

type Tab = TmView | 'recurring';

function errorText(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : 'The tasks could not be loaded.';
}

/**
 * The Task Manager of one Project: my tasks, what waits for my review, what I
 * raised, everything (PM, Executive, Superadmin) and the recurring tasks.
 * The same panel serves Project users and Superadmin (mode "admin").
 */
export default function TaskManagerPanel({ mode, tenantId, accessToken }: {
  mode: TaskManagerMode; tenantId: string; accessToken?: string;
}) {
  const [tab, setTab] = useState<Tab>(mode === 'admin' ? 'all' : 'mine');
  const [status, setStatus] = useState<TmStatusFilter>('open');
  const [expanded, setExpanded] = useState<string>();
  const [raising, setRaising] = useState(false);
  const [notice, setNotice] = useState<string>();

  const context = useQuery({
    queryKey: ['tm-context', mode, tenantId],
    queryFn: () => getTmContext(mode, tenantId, accessToken),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 60_000,
  });
  const view: TmView = tab === 'recurring' ? 'mine' : tab;
  const tasks = useQuery({
    queryKey: ['tm-tasks', mode, tenantId, view, status],
    queryFn: () => getTmTasks(mode, tenantId, view, status, accessToken),
    enabled: Boolean(tenantId && accessToken && tab !== 'recurring'),
    staleTime: 5_000,
    refetchInterval: 60_000,
  });
  const ctx = context.data;
  const counts = tasks.data?.counts;
  const canRaise = Boolean(ctx?.canAssignTo.length);
  const tabs: Array<{ key: Tab; label: string; count?: number; show: boolean }> = [
    { key: 'mine', label: 'My tasks', count: counts?.MINE, show: mode === 'project' },
    { key: 'review', label: 'To review', count: counts?.REVIEW, show: true },
    { key: 'raised', label: 'Raised by me', count: counts?.RAISED, show: canRaise },
    { key: 'all', label: 'All tasks', count: counts?.ALL, show: Boolean(ctx?.canSeeAll) },
    { key: 'recurring', label: 'Recurring', show: Boolean(ctx?.canSeeSchedules) },
  ];
  const items = tasks.data?.items ?? [];
  const overdue = items.filter((t) => t.overdue || t.missed || t.incomplete).length;

  return (
    <div className="tm-panel">
      <div className="tm-panel__bar">
        <div className="p2w-segment p2w-tabs-main" role="tablist" aria-label="Task Manager view">
          {tabs.filter((t) => t.show).map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
              className={tab === t.key ? 'is-active' : ''} onClick={() => { setTab(t.key); setExpanded(undefined); }}>
              {t.label}{typeof t.count === 'number' ? <b>{t.count}</b> : null}
            </button>
          ))}
        </div>
        {canRaise && ctx ? (
          <button type="button" className="p2w-button p2w-button--primary" onClick={() => setRaising(true)}>New task</button>
        ) : null}
      </div>
      {ctx?.role ? <p className="p2w-muted">You are working as {roleLabel(ctx.role)}.{!canRaise ? ' Your role receives tasks but does not assign them.' : ''}</p> : null}
      {context.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{errorText(context.error)}</div> : null}
      {notice ? (
        <div className="p2w-alert p2w-alert--success" role="status">
          {notice}<button type="button" className="p2w-link" onClick={() => setNotice(undefined)} aria-label="Dismiss">×</button>
        </div>
      ) : null}

      {tab === 'recurring' && ctx ? (
        <TmSchedules mode={mode} tenantId={tenantId} accessToken={accessToken} context={ctx} onNotice={setNotice} />
      ) : (
        <>
          <div className="p2w-listbar">
            <div className="p2w-segment" role="tablist" aria-label="Task status">
              {(['open', 'done'] as const).map((s) => (
                <button key={s} type="button" role="tab" aria-selected={status === s} className={status === s ? 'is-active' : ''}
                  onClick={() => setStatus(s)}>{s === 'open' ? 'Open' : 'Closed recently'}</button>
              ))}
            </div>
            <span className="p2w-muted">{tasks.isFetching ? 'Refreshing…' : `${items.length} task${items.length === 1 ? '' : 's'}`}</span>
          </div>
          {status === 'open' && overdue ? (
            <div className="p2w-alert p2w-alert--error" role="status">{overdue} task{overdue === 1 ? ' is' : 's are'} overdue, missed or incomplete.</div>
          ) : null}
          {tasks.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{errorText(tasks.error)}</div> : null}
          <ul className="p2w-tasks">
            {items.map((task) => (
              <TmTaskItem key={task.taskId} task={task} mode={mode} tenantId={tenantId} accessToken={accessToken} context={ctx}
                open={expanded === task.taskId} onToggle={() => setExpanded(expanded === task.taskId ? undefined : task.taskId)}
                onDone={setNotice} />
            ))}
          </ul>
          {!tasks.isLoading && !items.length && !tasks.isError ? (
            <div className="p2w-empty p2w-empty--success">{status === 'open' ? 'Nothing open here.' : 'Nothing closed in the last 14 days.'}</div>
          ) : null}
          {tasks.isLoading ? <div className="p2w-skeleton">Loading tasks…</div> : null}
        </>
      )}

      {raising && ctx ? (
        <RaiseTmTaskDialog mode={mode} tenantId={tenantId} accessToken={accessToken} context={ctx}
          onClose={() => setRaising(false)} onRaised={(m) => { setRaising(false); setNotice(m); setTab('raised'); }} />
      ) : null}
    </div>
  );
}
