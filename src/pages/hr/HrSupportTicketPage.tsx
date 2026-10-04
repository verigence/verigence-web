import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import SectionCard from '../../components/SectionCard';
import { hrErrorMessage } from '../../services/hr/client';
import {
  fetchTicketFile,
  fileProblem,
  MAX_TEXT_LENGTH,
  replyToTicket,
  sizeLabel,
  ticketStatusLabels,
  updateTicket,
  type TicketFile,
  type TicketStatus,
} from '../../services/hr/tickets';
import { useSessionStore } from '../../store/sessionStore';
import Field from '../../features/hr/Field';
import { formatDateTime } from '../../features/hr/hrLabels';
import FilePicker from '../../features/hr/support/FilePicker';
import { supportKeys, useTicket } from '../../features/hr/support/supportQueries';
import TicketStatusChip from '../../features/hr/support/TicketStatus';
import '../../styles/hr-support.css';

/** One ticket and its conversation. Either side can add to it; SuperAdmin also sets the status and a note. */
export default function HrSupportTicketPage() {
  const { ticketId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const ticket = useTicket(ticketId);
  const statusBox = useRef<HTMLSelectElement>(null);

  const [reply, setReply] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<TicketStatus>('OPEN');
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const seeded = useRef('');

  const data = ticket.data;
  useEffect(() => {
    if (!data || seeded.current === `${data.ticketId}:${data.updatedAt}`) return;
    seeded.current = `${data.ticketId}:${data.updatedAt}`;
    setStatus(data.status);
    setNote(data.adminNote ?? '');
  }, [data]);
  useEffect(() => {
    if (data?.isSupport && searchParams.get('update') === '1') statusBox.current?.focus();
  }, [data?.isSupport, searchParams]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: supportKeys.all });

  const send = useMutation({
    mutationFn: () => replyToTicket(accessToken!, ticketId, reply, files),
    onSuccess: async () => {
      setReply('');
      setFiles([]);
      setNotice('Your message was sent.');
      await refresh();
    },
  });
  const save = useMutation({
    mutationFn: () => updateTicket(accessToken!, ticketId, { status, adminNote: note }),
    onSuccess: async () => {
      setNotice('The ticket was updated.');
      await refresh();
    },
  });

  const download = async (file: TicketFile) => {
    setDownloadError('');
    try {
      const blob = await fetchTicketFile(accessToken!, ticketId, file.fileId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) {
      setDownloadError(hrErrorMessage(error));
    }
  };

  if (ticket.isLoading) return <div className="uc01-admin-state">Loading…</div>;
  if (ticket.isError || !data) {
    return (
      <section className="uc01-admin-page hr-page" aria-label="Ticket">
        <PageHeader eyebrow="HR · Feedback & Support" title="Ticket" actions={<Link className="uc01-admin-button" to="/hr/support">All tickets</Link>} />
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>This ticket could not be opened.</strong>
          <span>{ticket.isError ? hrErrorMessage(ticket.error) : 'It was not found.'}</span>
        </div>
      </section>
    );
  }

  const submitReply = (event: FormEvent) => {
    event.preventDefault();
    if (reply.trim() && !fileProblem(files) && !send.isPending) send.mutate();
  };

  return (
    <section className="uc01-admin-page hr-page" aria-label="Ticket">
      <PageHeader
        eyebrow="HR · Feedback & Support"
        title={`Ticket #${data.ticketNo}`}
        description={data.summary}
        actions={<Link className="uc01-admin-button" to="/hr/support">All tickets</Link>}
      />
      <p className="hrs-meta">
        <TicketStatusChip status={data.status} />
        <span>Raised by <strong>{data.employeeName}</strong> ({data.employeeCode}) · {data.employeeEmail}</span>
        <span>{formatDateTime(data.createdAt)}</span>
        {data.page && <span>From <code>{data.page}</code></span>}
      </p>

      {notice && <div className="uc01-admin-message uc01-admin-message--success" role="status">{notice}</div>}
      {downloadError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{downloadError}</div>}

      {data.isSupport && (
        <SectionCard title="Status and note" description="The note is shown to the person who raised the ticket.">
          <div className="hrs-form">
            <Field label="Status" htmlFor="ticket-status">
              <select id="ticket-status" ref={statusBox} value={status} disabled={save.isPending} onChange={(e) => setStatus(e.target.value as TicketStatus)}>
                {(Object.keys(ticketStatusLabels) as TicketStatus[]).map((s) => <option key={s} value={s}>{ticketStatusLabels[s]}</option>)}
              </select>
            </Field>
            <Field label="Admin note" htmlFor="ticket-note">
              <textarea id="ticket-note" rows={3} maxLength={2000} value={note} disabled={save.isPending} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {save.isError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{hrErrorMessage(save.error)}</div>}
            <div className="hr-actions hr-actions--form">
              <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={save.isPending} onClick={() => { setNotice(''); save.mutate(); }}>{save.isPending ? 'Saving…' : 'Update ticket'}</button>
            </div>
          </div>
        </SectionCard>
      )}
      {!data.isSupport && data.adminNote && (
        <div className="uc01-admin-message uc01-admin-message--success" role="status"><strong>Note from support:</strong> {data.adminNote}</div>
      )}

      <SectionCard title="Conversation">
        <ul className="hrs-thread" aria-label="Conversation">
          {data.messages.map((m) => (
            <li key={m.messageId} className={`hrs-msg${m.authorKind === 'SUPPORT' ? ' hrs-msg--support' : ''}`}>
              <header>
                <strong>{m.authorKind === 'SUPPORT' && m.authorName !== 'Support' ? `${m.authorName} · Support` : m.authorName}</strong>
                <small>{formatDateTime(m.createdAt)}</small>
              </header>
              <p>{m.body}</p>
              {m.files.length > 0 && (
                <div className="hrs-msg__files">
                  {m.files.map((f) => (
                    <button key={f.fileId} type="button" className="uc01-admin-button uc01-admin-button--compact" onClick={() => void download(f)}>
                      {f.fileName} ({sizeLabel(f.sizeBytes)})
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title={data.status === 'CLOSED' ? 'Reply (this reopens the ticket)' : 'Reply'}>
        <form className="hrs-form" onSubmit={submitReply}>
          <Field label="Message" htmlFor="ticket-reply" hint={`${reply.length} of ${MAX_TEXT_LENGTH}.`}>
            <textarea id="ticket-reply" rows={4} maxLength={MAX_TEXT_LENGTH} value={reply} disabled={send.isPending} onChange={(e) => setReply(e.target.value)} />
          </Field>
          <Field label="Files (optional)" htmlFor="ticket-files">
            <FilePicker files={files} onChange={setFiles} disabled={send.isPending} />
          </Field>
          {send.isError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{hrErrorMessage(send.error)}</div>}
          <div className="hr-actions hr-actions--form">
            <button type="submit" className="uc01-admin-button uc01-admin-button--primary" disabled={!reply.trim() || Boolean(fileProblem(files)) || send.isPending}>{send.isPending ? 'Sending…' : 'Send reply'}</button>
          </div>
        </form>
      </SectionCard>
    </section>
  );
}
