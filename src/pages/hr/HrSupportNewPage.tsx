import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import { hrErrorMessage } from '../../services/hr/client';
import { fileProblem, MAX_SUMMARY_LENGTH, MAX_TEXT_LENGTH, raiseTicket } from '../../services/hr/tickets';
import { useSessionStore } from '../../store/sessionStore';
import Field from '../../features/hr/Field';
import { useHrAccess } from '../../features/hr/hrQueries';
import FilePicker from '../../features/hr/support/FilePicker';
import { supportKeys } from '../../features/hr/support/supportQueries';
import '../../styles/hr-support.css';

/** Raise a ticket: the name comes from the employee record; the person gives a summary, the issue and any files. */
export default function HrSupportNewPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useHrAccess();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [summary, setSummary] = useState('');
  const [issue, setIssue] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const send = useMutation({
    mutationFn: () => raiseTicket(accessToken!, { summary, issue, page: from, files }),
    onSuccess: async (ticket) => {
      await queryClient.invalidateQueries({ queryKey: supportKeys.all });
      navigate(`/hr/support/${ticket.ticketId}`, { replace: true });
    },
  });

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!access.isEmployee) {
    return (
      <section className="uc01-admin-page hr-page" aria-label="Raise a ticket">
        <PageHeader eyebrow="HR · Feedback & Support" title="Raise a ticket" />
        <div className="uc01-admin-state">
          <strong>Your login is not linked to an employee record.</strong>
          <span>Tickets are raised by employees. Ask HR to link your login to your employee record.</span>
        </div>
      </section>
    );
  }

  const ready = summary.trim().length > 0 && issue.trim().length > 0 && !fileProblem(files);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (ready && !send.isPending) send.mutate();
  };

  return (
    <section className="uc01-admin-page hr-page" aria-label="Raise a ticket">
      <PageHeader
        eyebrow="HR · Feedback & Support"
        title="Raise a ticket"
        description="Tell us what did not work or what you need. Your name and email go with it, and you can follow the replies under Feedback & Support."
        actions={<Link className="uc01-admin-button" to="/hr/support">All tickets</Link>}
      />
      <form className="hrs-form" onSubmit={submit}>
        <Field label="Raised by" htmlFor="support-by">
          <input id="support-by" value="You, from your employee record" disabled readOnly />
        </Field>
        <Field label="Summary" htmlFor="support-summary" required hint={`${summary.length} of ${MAX_SUMMARY_LENGTH}.`}>
          <input id="support-summary" value={summary} maxLength={MAX_SUMMARY_LENGTH} disabled={send.isPending} onChange={(e) => setSummary(e.target.value)} />
        </Field>
        <Field label="Issue or feedback" htmlFor="support-issue" required hint={`${issue.length} of ${MAX_TEXT_LENGTH}. What you were trying to do, what happened and what you expected.`}>
          <textarea id="support-issue" rows={7} value={issue} maxLength={MAX_TEXT_LENGTH} disabled={send.isPending} onChange={(e) => setIssue(e.target.value)} />
        </Field>
        <Field label="Files (optional)" htmlFor="support-files">
          <FilePicker files={files} onChange={setFiles} disabled={send.isPending} />
        </Field>
        {from && <p className="hr-muted">Page captured automatically: <code>{from}</code></p>}
        {send.isError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{hrErrorMessage(send.error)}</div>}
        <div className="hr-actions hr-actions--form">
          <button type="submit" className="uc01-admin-button uc01-admin-button--primary" disabled={!ready || send.isPending}>{send.isPending ? 'Sending…' : 'Send ticket'}</button>
          <Link className="uc01-admin-button" to="/hr/support">Cancel</Link>
        </div>
      </form>
    </section>
  );
}
