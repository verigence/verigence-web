import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { isoToIstInput } from '../../announcements/announcementLogic';
import {
  getUploadPauses, setUploadPause, type UploadPauseCommand, type UploadPauseRows,
} from '../../../services/audit-core/uploadPause';
import { istTime } from '../../uc03-p2/uploadPause/uploadPause';
import {
  allProjectsRow, pauseAllCommand, projectPauses, RESUME_ALL_COMMAND, UPLOAD_PAUSE_MESSAGE_MAX,
} from './uploadPauseAdmin';

export const UPLOAD_PAUSE_ADMIN_KEY = ['admin', 'upload-pause'] as const;

/**
 * Pause or resume document uploads for all Projects (product owner,
 * 2026-10-31): while bookings that hold other customers' files are corrected,
 * PCs see a notice and cannot upload; they still open bookings, read
 * everything and work their tasks. Audit Core enforces it and logs each change.
 */
export default function UploadPauseControl({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient();
  const rows = useQuery({
    queryKey: UPLOAD_PAUSE_ADMIN_KEY,
    queryFn: () => getUploadPauses(accessToken),
    refetchInterval: 60_000,
    retry: false,
  });
  const all = allProjectsRow(rows.data?.items);
  const active = Boolean(all?.active);
  const others = projectPauses(rows.data?.items);
  const [message, setMessage] = useState('');
  const [until, setUntil] = useState('');
  const [confirming, setConfirming] = useState<UploadPauseCommand>();
  const [problem, setProblem] = useState<string>();
  const save = useMutation({
    mutationFn: (command: UploadPauseCommand) => setUploadPause(command, accessToken),
    onSuccess: (data: UploadPauseRows) => {
      queryClient.setQueryData(UPLOAD_PAUSE_ADMIN_KEY, data);
      setConfirming(undefined);
      setProblem(undefined);
    },
    onError: (cause) => setProblem(cause instanceof Error ? cause.message : 'The change could not be saved.'),
  });

  const askToPause = () => {
    const next = pauseAllCommand({ message, until });
    if (next.error !== undefined) { setProblem(next.error); return; }
    setProblem(undefined);
    setConfirming(next.command);
  };
  const editCurrent = () => {
    setMessage(all?.message ?? '');
    setUntil(isoToIstInput(all?.untilUtc));
  };
  const backAt = all?.untilUtc ? istTime(all.untilUtc) : null;

  return (
    <SectionCard className="sh-pause">
      <div className="p2w-card__title">
        <h3>Document uploads</h3>
        <p className="p2w-muted">
          Pause uploads for every Project while bookings are corrected. People can still open bookings, read everything
          and work their tasks; uploads already received finish processing.
        </p>
      </div>
      {rows.isError ? (
        <div className="p2w-alert p2w-alert--error" role="alert">
          The upload switch could not be read. {rows.error instanceof Error ? rows.error.message : ''}
        </div>
      ) : null}
      <div className={`sh-banner sh-banner--${active ? 'warn' : 'ok'}`} role="status">
        <div className="sh-banner__head">
          <strong>
            <span className={`sh-dot sh-dot--${active ? 'warn' : 'ok'}`} aria-hidden="true" />
            {rows.isLoading ? 'Reading…' : active ? 'Uploads are paused for all Projects' : 'Uploads are open'}
          </strong>
          {active ? <span>{backAt ? `until ${backAt}` : 'until resumed'}</span> : null}
        </div>
        {active && all?.message ? <span className="sh-pause__message">{all.message}</span> : null}
        {all ? (
          <span className="sh-note">
            Last changed {istTime(all.setAtUtc) ?? '—'}{all.setByActorId ? ` by ${all.setByActorId}` : ''}.
          </span>
        ) : null}
      </div>
      {others.length ? (
        <p className="sh-note">
          Also paused on its own for {others.length === 1 ? 'one Project' : `${others.length} Projects`}:{' '}
          {others.map((row) => row.tenantId).join(', ')}.
        </p>
      ) : null}

      <div className="sh-pause__form">
        <label>
          <span>Message shown to PCs (optional)</span>
          <input value={message} maxLength={UPLOAD_PAUSE_MESSAGE_MAX} disabled={save.isPending}
            placeholder="We are correcting bookings. Please upload later."
            onChange={(event) => setMessage(event.target.value)} />
        </label>
        <label>
          <span>Uploads back at (IST, optional)</span>
          <input type="datetime-local" value={until} disabled={save.isPending}
            onChange={(event) => setUntil(event.target.value)} />
        </label>
      </div>
      {confirming ? (
        <div className="p2w-alert p2w-alert--paused sh-pause__confirm" role="alertdialog" aria-label="Pause uploads">
          <span>Pause document uploads for every Project now? PCs see a notice and cannot upload until you resume.</span>
          <div className="sh-pause__actions">
            <button type="button" className="p2w-button p2w-button--danger" disabled={save.isPending}
              onClick={() => save.mutate(confirming)}>{save.isPending ? 'Pausing…' : 'Yes, pause uploads'}</button>
            <button type="button" className="p2w-button p2w-button--ghost" disabled={save.isPending}
              onClick={() => setConfirming(undefined)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="sh-pause__actions">
          <button type="button" className="p2w-button p2w-button--primary" disabled={save.isPending || rows.isLoading}
            onClick={askToPause}>{active ? 'Update the pause' : 'Pause uploads'}</button>
          {active ? (
            <>
              <button type="button" className="p2w-button p2w-button--secondary" disabled={save.isPending}
                onClick={() => save.mutate(RESUME_ALL_COMMAND)}>{save.isPending ? 'Resuming…' : 'Resume uploads'}</button>
              <button type="button" className="p2w-button p2w-button--ghost" disabled={save.isPending}
                onClick={editCurrent}>Edit current message</button>
            </>
          ) : null}
        </div>
      )}
      {problem ? <div className="p2w-alert p2w-alert--error" role="alert">{problem}</div> : null}
    </SectionCard>
  );
}
