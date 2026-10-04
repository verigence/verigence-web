import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { AnnouncementCard } from '../features/announcements/AnnouncementCard';
import { announcementKeys } from '../features/announcements/announcementHooks';
import {
  BODY_MAX,
  DEFAULT_MAINTENANCE_BODY,
  DEFAULT_MAINTENANCE_TITLE,
  TITLE_MAX,
  announcementStatus,
  buildMessageInput,
  formatBackAt,
  formatWhenIst,
  istInputToIso,
  parseQuietHours,
  validateMessage,
  type MessageForm,
} from '../features/announcements/announcementLogic';
import Modal from '../features/hr/payroll/Modal';
import { addablePeople } from '../features/rollout/featureFlags';
import {
  createAnnouncement,
  getAnnouncementSettings,
  listAnnouncements,
  patchAnnouncement,
  saveAnnouncementSettings,
  type AdminAnnouncement,
} from '../services/security/announcements';
import { listGlobalUsers } from '../services/security/onboardingAdmin';
import { useSessionStore } from '../store/sessionStore';
import '../styles/announcements.css';
import '../styles/feature-rollout.css';

const messageOf = (error: unknown) => (error instanceof Error && error.message ? error.message : 'The change could not be saved. Please try again.');
const emptyForm: MessageForm = { kind: 'WELCOME', title: '', body: '', audience: 'EVERYONE', people: [], from: '', until: '' };
const KIND_LABEL = { WELCOME: 'Greeting', NOTICE: 'Notice', MAINTENANCE: 'Maintenance' } as const;

/** SuperAdmin: pause the apps with a friendly page, greet people, and send the occasional notice. */
export default function AdminAnnouncementsPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState<MessageForm>(emptyForm);
  const [pick, setPick] = useState('');
  const [mTitle, setMTitle] = useState(DEFAULT_MAINTENANCE_TITLE);
  const [mBody, setMBody] = useState(DEFAULT_MAINTENANCE_BODY);
  const [mBack, setMBack] = useState('');
  const [confirm, setConfirm] = useState<'start' | 'end' | null>(null);
  const [quiet, setQuiet] = useState<string | null>(null);

  const list = useQuery({ queryKey: announcementKeys.admin, queryFn: () => listAnnouncements(accessToken!), enabled: Boolean(accessToken), retry: false });
  const settings = useQuery({ queryKey: announcementKeys.settings, queryFn: () => getAnnouncementSettings(accessToken!), enabled: Boolean(accessToken), retry: false });
  const users = useQuery({ queryKey: ['security', 'platform-users', 'all'], queryFn: () => listGlobalUsers(accessToken!), enabled: Boolean(accessToken) });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: announcementKeys.admin });
    await queryClient.invalidateQueries({ queryKey: announcementKeys.maintenance });
  };
  const change = useMutation({
    mutationFn: (run: { text: string; send: () => Promise<unknown>; after?: () => void }) => run.send(),
    onSuccess: async (_d, run) => { setNotice({ ok: true, text: run.text }); run.after?.(); await refresh(); },
    onError: async (error) => { setNotice({ ok: false, text: messageOf(error) }); await refresh(); },
  });
  const busy = change.isPending;

  const items = list.data ?? [];
  const now = new Date();
  const running = items.find((a) => a.kind === 'MAINTENANCE' && announcementStatus(a, now) === 'Showing');
  const history = items.filter((a) => a.kind !== 'MAINTENANCE' || a !== running).slice().sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const addable = addablePeople(users.data ?? [], form.people.map((id) => ({ userId: id, displayName: '', email: null, enabled: true })));
  const nameOf = (id: string) => users.data?.find((u) => u.userId === id)?.displayName ?? id;
  const problem = validateMessage(form);

  const startMaintenance = () => {
    setConfirm(null);
    const backAt = istInputToIso(mBack);
    change.mutate({
      text: 'Maintenance is now ON. Everyone except SuperAdmin sees the "we\'ll be back" page.',
      send: () => createAnnouncement(accessToken!, { kind: 'MAINTENANCE', title: mTitle.trim(), body: mBody.trim(), audience: 'EVERYONE', ...(backAt ? { backAt } : {}) }),
    });
  };
  const endMaintenance = () => {
    setConfirm(null);
    if (!running) return;
    change.mutate({ text: 'Maintenance is over. The app is open again.', send: () => patchAnnouncement(accessToken!, running.announcementId, { active: false }) });
  };
  const sendMessage = () => {
    if (problem) { setNotice({ ok: false, text: problem }); return; }
    change.mutate({ text: 'The message is saved. It will be shown to each person once.', send: () => createAnnouncement(accessToken!, buildMessageInput(form)), after: () => setForm(emptyForm) });
  };
  const stop = (a: AdminAnnouncement) =>
    change.mutate({ text: `"${a.title}" is stopped.`, send: () => patchAnnouncement(accessToken!, a.announcementId, { active: false }) });
  const quietValue = quiet ?? (settings.data ? String(settings.data.quietHours) : '');
  const quietParsed = parseQuietHours(quietValue);

  const set = (patch: Partial<MessageForm>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <section className="uc01-admin-page hr-page" aria-label="Announcements">
      <PageHeader
        eyebrow="Administration"
        title="Announcements"
        description="Pause the apps with a friendly page, greet people, and send the occasional notice. Each message is shown to a person only once."
      />
      {notice && <div className={`uc01-admin-message uc01-admin-message--${notice.ok ? 'success' : 'error'}`} role={notice.ok ? 'status' : 'alert'}>{notice.text}</div>}
      {list.isError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">The history could not be loaded. {messageOf(list.error)}</div>}

      <SectionCard title="Maintenance" description="While it is on, everyone except SuperAdmin sees a calm &quot;we'll be back&quot; page after signing in.">
        <div className={`announce-status announce-status--${running ? 'on' : 'off'}`}>
          <strong>{running ? 'ON' : 'OFF'}</strong>
          <span>{running ? `${running.title}${formatBackAt(running.backAt) ? ` · expected back around ${formatBackAt(running.backAt)}` : ''}` : 'The apps are open.'}</span>
        </div>
        {running ? (
          <>
            <p className="announce-admin-text">{running.body}</p>
            <button type="button" className="uc01-admin-button uc01-admin-button--danger-primary" disabled={busy} onClick={() => setConfirm('end')}>End maintenance</button>
          </>
        ) : (
          <div className="hr-form">
            <div className="hr-form-grid">
              <label className="hr-field"><span className="hr-pay-label">Title</span><input value={mTitle} maxLength={TITLE_MAX} onChange={(e) => setMTitle(e.target.value)} /></label>
              <label className="hr-field"><span className="hr-pay-label">Expected back (IST, optional)</span><input type="datetime-local" value={mBack} onChange={(e) => setMBack(e.target.value)} /></label>
              <label className="hr-field hr-field--wide"><span className="hr-pay-label">Message</span><textarea rows={3} maxLength={BODY_MAX} value={mBody} onChange={(e) => setMBody(e.target.value)} /></label>
            </div>
            <div className="hr-actions">
              <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={busy || !mTitle.trim() || !mBody.trim()} onClick={() => setConfirm('start')}>Start maintenance</button>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="New message" description="A greeting or a notice, shown once to each person, in a popup.">
        <div className="hr-form">
          <div className="hr-form-grid">
            <label className="hr-field"><span className="hr-pay-label">Kind</span>
              <select value={form.kind} onChange={(e) => set({ kind: e.target.value as MessageForm['kind'] })}><option value="WELCOME">Greeting</option><option value="NOTICE">Notice</option></select>
            </label>
            <label className="hr-field"><span className="hr-pay-label">Title</span><input value={form.title} maxLength={TITLE_MAX} onChange={(e) => set({ title: e.target.value })} /></label>
            <label className="hr-field hr-field--wide"><span className="hr-pay-label">Message <small className="hr-muted">{form.body.length}/{BODY_MAX}</small></span>
              <textarea rows={4} maxLength={BODY_MAX} value={form.body} onChange={(e) => set({ body: e.target.value })} />
            </label>
            <label className="hr-field"><span className="hr-pay-label">Show to</span>
              <select value={form.audience} onChange={(e) => set({ audience: e.target.value as MessageForm['audience'] })}><option value="EVERYONE">Everyone</option><option value="PEOPLE">Chosen people</option></select>
            </label>
            <span className="hr-field" />
            <label className="hr-field"><span className="hr-pay-label">Show from (IST, optional)</span><input type="datetime-local" value={form.from} onChange={(e) => set({ from: e.target.value })} /></label>
            <label className="hr-field"><span className="hr-pay-label">Until (IST, optional)</span><input type="datetime-local" value={form.until} onChange={(e) => set({ until: e.target.value })} /></label>
          </div>

          {form.audience === 'PEOPLE' && (
            <div>
              {form.people.length > 0 && (
                <ul className="rollout-people">
                  {form.people.map((id) => (
                    <li key={id}><span className="rollout-person"><strong>{nameOf(id)}</strong></span>
                      <button type="button" className="uc01-admin-button uc01-admin-button--compact" onClick={() => set({ people: form.people.filter((p) => p !== id) })}>Remove</button></li>
                  ))}
                </ul>
              )}
              <div className="rollout-add">
                <label><span>Add a person</span>
                  <select value={pick} disabled={addable.length === 0} onChange={(e) => setPick(e.target.value)}>
                    <option value="">{addable.length === 0 ? 'No one left to add' : 'Choose a person…'}</option>
                    {addable.map((u) => <option key={u.userId} value={u.userId}>{u.displayName}</option>)}
                  </select>
                </label>
                <button type="button" className="uc01-admin-button" disabled={!pick} onClick={() => { set({ people: [...form.people, pick] }); setPick(''); }}>Add</button>
              </div>
            </div>
          )}

          <div>
            <h3 className="rollout-heading">Preview</h3>
            <div className="announce-preview"><AnnouncementCard kind={form.kind} title={form.title} body={form.body || 'Your message appears here.'} titleId="announce-preview-title" /></div>
          </div>
          <div className="hr-actions">
            <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={busy} onClick={sendMessage}>Send</button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Wait between messages" description="Each message is shown to a person only once. This is the minimum wait before they can be shown another one (0 = no wait).">
        <div className="rollout-add">
          <label><span>Hours (0 to 720)</span>
            <input inputMode="numeric" value={quietValue} disabled={settings.isLoading || settings.isError} onChange={(e) => setQuiet(e.target.value)} aria-invalid={quietParsed === null && quietValue !== ''} />
          </label>
          <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={busy || quietParsed === null}
            onClick={() => change.mutate({ text: 'The wait between messages is saved.', send: () => saveAnnouncementSettings(accessToken!, quietParsed!), after: () => setQuiet(null) })}>Save</button>
        </div>
        {settings.isError && <p className="hr-muted">The current setting could not be loaded.</p>}
        {quietParsed === null && quietValue !== '' && <p className="hr-field__error" role="alert">Enter a whole number from 0 to 720.</p>}
      </SectionCard>

      <SectionCard title="History">
        {list.isLoading && <p className="hr-muted">Loading…</p>}
        {list.isSuccess && history.length === 0 && <p className="hr-muted">Nothing has been sent yet.</p>}
        {history.length > 0 && (
          <ul className="rollout-people">
            {history.map((a) => {
              const status = announcementStatus(a, now);
              return (
                <li key={a.announcementId}>
                  <span className="rollout-person">
                    <strong>{a.title}</strong>
                    <small>{KIND_LABEL[a.kind]} · {a.audience === 'EVERYONE' ? 'Everyone' : `${a.chosenPeople} chosen ${a.chosenPeople === 1 ? 'person' : 'people'}`} · seen by {a.seenBy} · from {formatWhenIst(a.startsAt)}{a.endsAt ? ` until ${formatWhenIst(a.endsAt)}` : ''}</small>
                  </span>
                  <span className="rollout-controls">
                    <span className={`announce-pill announce-pill--${status.toLowerCase()}`}>{status}</span>
                    {a.active && (status === 'Showing' || status === 'Scheduled') && <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={busy} onClick={() => stop(a)}>Stop</button>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {confirm === 'start' && (
        <Modal eyebrow="Maintenance" title="Start maintenance?" titleId="maint-start" onClose={() => setConfirm(null)}>
          <p>Everyone except SuperAdmin will see the &quot;we&apos;ll be back&quot; page as soon as you confirm.</p>
          <div className="uc01-admin-dialog__actions">
            <button type="button" className="uc01-admin-button" onClick={() => setConfirm(null)}>Cancel</button>
            <button type="button" className="uc01-admin-button uc01-admin-button--danger-primary" onClick={startMaintenance}>Start maintenance</button>
          </div>
        </Modal>
      )}
      {confirm === 'end' && (
        <Modal eyebrow="Maintenance" title="End maintenance?" titleId="maint-end" onClose={() => setConfirm(null)}>
          <p>The app opens again for everyone.</p>
          <div className="uc01-admin-dialog__actions">
            <button type="button" className="uc01-admin-button" onClick={() => setConfirm(null)}>Cancel</button>
            <button type="button" className="uc01-admin-button uc01-admin-button--primary" onClick={endMaintenance}>End maintenance</button>
          </div>
        </Modal>
      )}
    </section>
  );
}
