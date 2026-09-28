import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { submitP2Documents, type P2Submission, type P2UploadCounts } from '../../../services/audit-core/uc03P2';
import { formatDateTime } from './p2Format';

function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * What a PC or TL watches while documents are processed -- uploaded,
 * identified, read, not read, duplicates -- and the Submit button, which
 * unlocks once every document is identified or 4 minutes after the upload
 * started, whichever is earlier (the server enforces the same rule).
 */
export default function P2UploadStatus({ tenantId, journeyId, accessToken, counts, submission, onSubmitted, onRefresh }: {
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  counts?: P2UploadCounts;
  submission?: P2Submission;
  onSubmitted: (message: string, tone: 'success' | 'error') => void;
  onRefresh: () => void;
}) {
  // Count down locally from the moment the server answered.
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setReceivedAt(Date.now()); }, [submission?.secondsRemaining, submission?.canSubmit]);
  const remaining = submission ? Math.max(0, submission.secondsRemaining - (now - receivedAt) / 1000) : 0;
  const waiting = Boolean(submission && !submission.canSubmit && submission.windowStartedAtUtc);
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [waiting]);
  useEffect(() => {
    if (waiting && remaining <= 0) onRefresh();  // the server confirms the unlock
  }, [waiting, remaining <= 0]);  // eslint-disable-line react-hooks/exhaustive-deps

  const submit = useMutation({
    mutationFn: () => submitP2Documents(tenantId, journeyId, accessToken),
    onSuccess: (result) => {
      onSubmitted(`${result.stage === 'DELIVERY' ? 'Delivery' : 'Booking'} documents submitted. The checks are running now.`, 'success');
      onRefresh();
    },
    onError: (cause) => onSubmitted(cause instanceof Error && cause.message ? cause.message : 'The documents could not be submitted.', 'error'),
  });

  if (!counts || !submission) return null;
  const stageLabel = submission.stage === 'DELIVERY' ? 'Delivery' : 'Booking';
  const enabled = submission.canSubmit || (waiting && remaining <= 0);
  return (
    <section className="p2w-statusbar" aria-label="Upload status">
      <div><span>Uploaded</span><strong>{counts.documents + counts.uploading}</strong></div>
      <div><span>Identified</span><strong>{counts.classified}</strong></div>
      <div className={counts.extracted ? 'is-good' : ''}><span>Read</span><strong>{counts.extracted}</strong></div>
      <div className={counts.notExtracted ? 'is-warn' : ''}><span>Not read</span><strong>{counts.notExtracted}</strong></div>
      <div><span>Supporting</span><strong>{counts.supporting}</strong></div>
      <div className={counts.duplicates ? 'is-warn' : ''}><span>Duplicates</span><strong>{counts.duplicates}</strong></div>
      <div className="p2w-submit">
        <span className="p2w-submit__timer" role="status">
          {submission.submittedAtUtc && !submission.windowStartedAtUtc
            ? `Submitted ${formatDateTime(submission.submittedAtUtc)}`
            : enabled ? submission.reason
              : `${counts.notClassified + counts.uploading} still being identified · Submit in ${clock(remaining)}`}
        </span>
        <button type="button" className="p2w-button p2w-button--primary" disabled={!enabled || submit.isPending}
          onClick={() => submit.mutate()} title={enabled ? undefined : submission.reason}>
          {submit.isPending ? 'Submitting…' : `Submit ${stageLabel.toLowerCase()} documents`}
        </button>
      </div>
    </section>
  );
}
