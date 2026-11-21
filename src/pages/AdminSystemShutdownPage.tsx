import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import DialogShell from '../features/hr/attendance/DialogShell';
import { formatWhenIst } from '../features/announcements/announcementLogic';
import { actionLabel, clockLabel, headline, isHhMm, systemShutdownKeys, untilLabel } from '../features/system-shutdown/systemShutdown';
import {
  getSystemShutdown,
  setSystemShutdownHours,
  shutDownNow,
  startNow,
  type SystemShutdownOverview,
} from '../services/security/systemShutdown';
import { useSessionStore } from '../store/sessionStore';
import '../styles/feature-rollout.css';
import '../styles/night-control.css';
import '../styles/system-shutdown.css';

type Notice = { ok: boolean; text: string } | null;
type Asking = 'shut' | 'start' | null;

const messageOf = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** The daily hours: two India times and Save. */
function DailyHours({ state, busy, onSave }: {
  state: SystemShutdownOverview;
  busy: boolean;
  onSave: (fromIst: string, toIst: string) => void;
}) {
  const [from, setFrom] = useState(state.hoursFromIst ?? '00:30');
  const [to, setTo] = useState(state.hoursToIst ?? '08:00');
  useEffect(() => {
    setFrom(state.hoursFromIst ?? '00:30');
    setTo(state.hoursToIst ?? '08:00');
  }, [state.hoursFromIst, state.hoursToIst]);

  const dirty = from !== (state.hoursFromIst ?? '') || to !== (state.hoursToIst ?? '');
  const valid = isHhMm(from) && isHhMm(to) && from !== to;

  return (
    <SectionCard title="Daily hours" description="Every day between these two times Verigence is shut by itself. Times are India time.">
      <div className="system-shutdown__hours">
        <label htmlFor="system-shutdown-from">Shuts at
          <input id="system-shutdown-from" type="time" value={from} disabled={busy} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label htmlFor="system-shutdown-to">Starts at
          <input id="system-shutdown-to" type="time" value={to} disabled={busy} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={busy || !dirty || !valid}
          onClick={() => onSave(from, to)}>Save hours</button>
      </div>
      {!valid && <small className="hr-muted">The two times must be different.</small>}
    </SectionCard>
  );
}

/** Super Admin and Executive: whether Verigence is shut, its daily hours, Shut down now and Start now. */
export default function AdminSystemShutdownPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<Notice>(null);
  const [asking, setAsking] = useState<Asking>(null);

  const overview = useQuery({
    queryKey: systemShutdownKeys.admin,
    queryFn: () => getSystemShutdown(accessToken!),
    enabled: Boolean(accessToken),
    retry: false,
    refetchInterval: 60_000,
  });
  const state = overview.data;

  const applied = (text: string) => (next: SystemShutdownOverview) => {
    queryClient.setQueryData(systemShutdownKeys.admin, next);
    setNotice({ ok: true, text });
    setAsking(null);
  };
  const failed = (error: unknown) => {
    setNotice({ ok: false, text: messageOf(error, 'The change could not be saved. Please try again.') });
    setAsking(null);
    void queryClient.invalidateQueries({ queryKey: systemShutdownKeys.admin });
  };

  const shut = useMutation({
    mutationFn: () => shutDownNow(accessToken!),
    onSuccess: (next) => applied(`Verigence is shut until ${untilLabel(next.restUntilUtc)}.`)(next),
    onError: failed,
  });
  const start = useMutation({
    mutationFn: () => startNow(accessToken!),
    onSuccess: applied('Verigence is running.'),
    onError: failed,
  });
  const hours = useMutation({
    mutationFn: (run: { from: string; to: string }) => setSystemShutdownHours(accessToken!, run.from, run.to),
    onSuccess: (next, run) => applied(`Daily hours are now ${clockLabel(run.from)} to ${clockLabel(run.to)}.`)(next),
    onError: failed,
  });
  const busy = shut.isPending || start.isPending || hours.isPending;

  const top = state ? headline(state) : null;
  const listed = state?.people.filter((p) => p.mayStart) ?? [];
  const notListed = state?.people.filter((p) => !p.mayStart) ?? [];

  return (
    <section className="uc01-admin-page hr-page system-shutdown" aria-label="System shutdown">
      <PageHeader
        eyebrow="Administration"
        title="System shutdown"
        description="While Verigence is shut nobody can sign in except the people listed below, every service rests, and the database stops by itself. Only a Super Admin or an Executive can shut it down or start it."
      />

      {notice && <div className={`uc01-admin-message uc01-admin-message--${notice.ok ? 'success' : 'error'}`} role={notice.ok ? 'status' : 'alert'}>{notice.text}</div>}
      {overview.isLoading && <div className="uc01-admin-state">Loading…</div>}
      {overview.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>System shutdown could not be loaded.</strong>
          <span>{messageOf(overview.error, 'Please try again.')}</span>
          <button type="button" className="uc01-admin-button" onClick={() => overview.refetch()}>Try again</button>
        </div>
      )}

      {state && top && (
        <>
          <SectionCard title="Right now">
            <div className={`system-shutdown__now system-shutdown__now--${top.shut ? 'shut' : 'running'}`}>
              <div>
                <span className={`uc01-admin-status ${top.shut ? 'uc01-admin-status--pending' : 'uc01-admin-status--active'}`}>{top.shut ? 'Shut' : 'Running'}</span>
                <strong>{top.title}</strong>
                <p>{top.detail}</p>
              </div>
              <div className="system-shutdown__actions">
                {top.shut
                  ? <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={busy} onClick={() => setAsking('start')}>Start now</button>
                  : <button type="button" className="uc01-admin-button uc01-admin-button--danger" disabled={busy} onClick={() => setAsking('shut')}>Shut down now</button>}
              </div>
            </div>
            {!state.gate && (
              <div className="uc01-admin-message uc01-admin-message--info" role="note">
                No list of people who may start Verigence is configured, so nobody is refused at sign-in while it is shut. The services still rest.
              </div>
            )}
          </SectionCard>

          <DailyHours state={state} busy={busy} onSave={(from, to) => hours.mutate({ from, to })} />

          <SectionCard title="Who can start it"
            description="While Verigence is shut only these people can sign in, and only they can start it. The list is a setting of the Security service; it is changed there, not on this screen.">
            <div className="uc01-admin-table-wrap">
              <table className="uc01-admin-table">
                <thead>
                  <tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Can sign in while shut</th></tr>
                </thead>
                <tbody>
                  {state.people.length === 0 && <tr><td colSpan={3} className="uc01-admin-empty">No active Super Admin or Executive.</td></tr>}
                  {[...listed, ...notListed].map((p) => (
                    <tr key={p.userId}>
                      <td data-label="Person"><strong>{p.name}</strong></td>
                      <td data-label="Role">{p.role}</td>
                      <td data-label="Can sign in while shut">
                        <span className={`uc01-admin-status ${p.mayStart ? 'uc01-admin-status--active' : ''}`}>{p.mayStart ? 'Yes' : 'Not on the list'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {notListed.length > 0 && (
              <small className="hr-muted">
                {notListed.length === 1 ? `${notListed[0].name} is` : `${notListed.length} people are`} a Super Admin or Executive but not on the list yet, and cannot sign in while Verigence is shut until added.
              </small>
            )}
          </SectionCard>

          <SectionCard title="Last change">
            {state.lastChange
              ? <p className="system-shutdown__last">{actionLabel(state.lastChange.action)}, by {state.lastChange.by || 'unknown'} on {formatWhenIst(state.lastChange.atUtc)}.</p>
              : <p className="system-shutdown__last hr-muted">Nothing has been changed from this screen yet.</p>}
          </SectionCard>
        </>
      )}

      {asking === 'shut' && state && (
        <DialogShell title="Shut down Verigence now?" eyebrow="System shutdown" locked={shut.isPending} onClose={() => setAsking(null)}>
          <ul className="system-shutdown__what">
            <li>Everyone except the people who can start it is signed out within 15 minutes and cannot sign in.</li>
            <li>Work already in hand (documents being read, a Drive run) is finished first. Then the services rest and the database stops by itself.</li>
            <li>Scheduled runs still run at their own times, as they do at night.</li>
            <li>It starts again by itself at {clockLabel(state.hoursToIst ?? '08:00')}, or when a Super Admin or Executive presses Start now.</li>
          </ul>
          <div className="uc01-admin-dialog__actions">
            <button type="button" className="uc01-admin-button" disabled={shut.isPending} onClick={() => setAsking(null)}>Cancel</button>
            <button type="button" className="uc01-admin-button uc01-admin-button--danger" disabled={shut.isPending} onClick={() => shut.mutate()}>
              {shut.isPending ? 'Shutting down…' : 'Shut down now'}
            </button>
          </div>
        </DialogShell>
      )}

      {asking === 'start' && state && (
        <DialogShell title="Start Verigence now?" eyebrow="System shutdown" locked={start.isPending} onClose={() => setAsking(null)}>
          <ul className="system-shutdown__what">
            <li>Everyone can sign in again at once, and the services start working within a minute.</li>
            <li>The next daily shutdown ({clockLabel(state.hoursFromIst)} to {clockLabel(state.hoursToIst)}) happens as usual.</li>
          </ul>
          <div className="uc01-admin-dialog__actions">
            <button type="button" className="uc01-admin-button" disabled={start.isPending} onClick={() => setAsking(null)}>Cancel</button>
            <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={start.isPending} onClick={() => start.mutate()}>
              {start.isPending ? 'Starting…' : 'Start now'}
            </button>
          </div>
        </DialogShell>
      )}
    </section>
  );
}
