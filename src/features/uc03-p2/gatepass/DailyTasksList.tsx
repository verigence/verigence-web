import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { gatePassErrorText, getDailyTasks, resolveDailyTask, type DailyTask } from '../../../services/audit-core/uc03GatePass';

type Props = { tenantId: string; accessToken: string; onChanged: () => void };

function TaskRow({ task, tenantId, accessToken, onChanged }: { task: DailyTask; tenantId: string; accessToken: string; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const resolve = useMutation({
    mutationFn: () => resolveDailyTask(tenantId, task.dailyTaskId, note.trim(), accessToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['daily-tasks', tenantId] });
      onChanged();
    },
  });
  return (
    <li className="p2gp-task">
      <div>
        <strong>{task.title}</strong> <span className="p2gp-chip">{task.priority}</span>
        <div className="p2w-muted">{task.outletName} · {task.businessDate}</div>
        <p>{task.description}</p>
        {task.status === 'DONE' ? <p className="p2w-muted">Done{task.resolutionNote ? `: ${task.resolutionNote}` : ''}</p> : null}
      </div>
      {task.status === 'OPEN' ? (
        <div className="p2gp-resolve">
          <input type="text" maxLength={500} placeholder="What was done" value={note} onChange={(event) => setNote(event.target.value)} aria-label="Note" />
          <button type="button" className="p2w-button p2w-button--confirm" disabled={resolve.isPending || !note.trim()} onClick={() => resolve.mutate()}>
            {resolve.isPending ? 'Saving…' : 'Mark done'}
          </button>
          {resolve.isError ? <span className="p2gp-bad">{gatePassErrorText(resolve.error, 'Could not save.')}</span> : null}
        </div>
      ) : null}
    </li>
  );
}

/** Team Lead, PM and Executive: tasks raised from the daily gate pass. */
export default function DailyTasksList({ tenantId, accessToken, onChanged }: Props) {
  const [status, setStatus] = useState<'OPEN' | 'DONE'>('OPEN');
  const query = useQuery({
    queryKey: ['daily-tasks', tenantId, status],
    queryFn: () => getDailyTasks(tenantId, status, accessToken),
    staleTime: 30_000,
  });
  const items = query.data?.items ?? [];
  return (
    <SectionCard>
      <div className="p2w-card__title"><h3>Daily Tasks</h3></div>
      <div className="p2w-segment" role="group" aria-label="Task status">
        <button type="button" aria-pressed={status === 'OPEN'} onClick={() => setStatus('OPEN')}>Open</button>
        <button type="button" aria-pressed={status === 'DONE'} onClick={() => setStatus('DONE')}>Done</button>
      </div>
      {query.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{gatePassErrorText(query.error, 'Daily tasks could not be loaded.')}</div> : null}
      {query.isLoading ? <p className="p2w-muted">Loading…</p> : null}
      {!query.isLoading && !query.isError && !items.length ? <p className="p2w-muted">{status === 'OPEN' ? 'No open daily tasks.' : 'No completed daily tasks.'}</p> : null}
      <ul className="p2gp-tasks">
        {items.map((task) => <TaskRow key={task.dailyTaskId} task={task} tenantId={tenantId} accessToken={accessToken} onChanged={onChanged} />)}
      </ul>
    </SectionCard>
  );
}
