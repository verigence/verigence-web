import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import {
  badgeLabel,
  getNotifications,
  itemLink,
  markNotificationsSeen,
  messageLinks,
  sourceLabel,
  timeAgo,
} from '../../services/audit-core/notifications';
import { useProjectContextStore } from '../../store/projectContextStore';
import { useSessionStore } from '../../store/sessionStore';
import '../../styles/notification-bell.css';

// Once a minute while the screen is open (react-query does not poll a hidden tab).
const POLL_MS = 60_000;

/**
 * The notification bell in the top bar (product owner 2026-11-16): the person's messages and what
 * they uploaded that left no record -- a file never read, a bulk or Google Drive file not uploaded
 * or set aside (failed pages and the rest raise tasks, so they are not here) -- in one panel (the
 * Carbon header notification panel pattern). The number is unread messages plus those uploads. Opening the panel
 * marks the messages read on the server; the ones that were new stay marked while it is open.
 *
 * Product owner 2026-11-18: "it doesnt tell which customer/journey is the reported issue.. can you
 * provide it clickable so that it can directly open up that task or journey 360" -- a message about
 * one's pages comes per booking, named by its customer; clicking it opens the booking's document
 * tasks, and "Open tasks" / "Journey 360" are under it.
 */
export default function NotificationBell() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const root = useRef<HTMLDivElement>(null);

  const query = useQuery({
    queryKey: ['notifications', tenantId],
    queryFn: () => getNotifications(tenantId!, accessToken),
    enabled: Boolean(tenantId && accessToken),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: POLL_MS / 2,
    retry: false,
  });
  const seen = useMutation({
    mutationFn: () => markNotificationsSeen(tenantId!, accessToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', tenantId] }),
  });

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const onClick = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  if (!tenantId) return null;
  const data = query.data;
  const badge = badgeLabel(data?.badgeCount);
  const status = data?.status;

  const toggle = () => {
    if (open) { setOpen(false); return; }
    setNewIds(new Set((data?.messages ?? []).filter((m) => m.unread).map((m) => m.alertId)));
    setOpen(true);
    if (data?.unreadCount) seen.mutate();
    else void query.refetch();
  };

  return (
    <div className="vg-notify" ref={root}>
      <button type="button" className={`vg-notify__button${open ? ' is-open' : ''}`} onClick={toggle}
        aria-haspopup="dialog" aria-expanded={open}
        aria-label={badge ? `Notifications, ${badge} need attention` : 'Notifications'}>
        <svg viewBox="0 0 32 32" width="20" height="20" aria-hidden="true" fill="currentColor">
          <path d="M28.7 20.3 26 17.6V13a10 10 0 0 0-9-9.9V1h-2v2.1A10 10 0 0 0 6 13v4.6l-2.7 2.7A1 1 0 0 0 3 21v3a1 1 0 0 0 1 1h7v.8a5.1 5.1 0 0 0 4.5 5.2 5 5 0 0 0 5.5-5v-1h7a1 1 0 0 0 1-1v-3a1 1 0 0 0-.3-.7ZM19 26a3 3 0 0 1-6 0v-1h6Zm8-3H5v-1.6l2.7-2.7A1 1 0 0 0 8 18v-5a8 8 0 0 1 16 0v5a1 1 0 0 0 .3.7l2.7 2.7Z" />
        </svg>
        {badge ? <span className="vg-notify__badge">{badge}</span> : null}
      </button>

      {open ? (
        <section className="vg-notify__panel" role="dialog" aria-label="Notifications">
          <header className="vg-notify__head">
            <h2>Notifications</h2>
            <button type="button" className="vg-notify__close" aria-label="Close notifications" onClick={() => setOpen(false)}>×</button>
          </header>

          {query.isError ? <p className="vg-notify__empty">Notifications could not be loaded. Try again shortly.</p> : null}
          {query.isLoading ? <p className="vg-notify__empty">Loading…</p> : null}

          {status ? (
            <div className="vg-notify__section">
              <h3>Not uploaded</h3>
              <dl className="vg-notify__tiles vg-notify__tiles--three">
                <div className={status.upload ? 'is-danger' : ''}><dt>Uploads</dt><dd>{status.upload}</dd></div>
                <div className={status.bulk ? 'is-danger' : ''}><dt>Bulk uploads</dt><dd>{status.bulk}</dd></div>
                <div className={status.drive ? 'is-danger' : ''}><dt>Google Drive</dt><dd>{status.drive}</dd></div>
              </dl>
              {status.items.length ? (
                <ul className="vg-notify__list">
                  {status.items.map((item) => (
                    <li key={`${item.source}:${item.itemId}`}>
                      <Link to={itemLink(item)} onClick={() => setOpen(false)}>
                        <strong>{item.name}</strong>
                        <span>{item.reason}</span>
                        <small>{sourceLabel(item.source)}{item.reference ? ` · ${item.reference}` : ''} · {timeAgo(item.atUtc)}</small>
                      </Link>
                    </li>
                  ))}
                  {status.more ? <li className="vg-notify__more">and {status.more} more</li> : null}
                </ul>
              ) : <p className="vg-notify__empty">Everything you uploaded in the last 14 days reached Verigence.</p>}
            </div>
          ) : null}

          {data ? (
            <div className="vg-notify__section">
              <h3>Messages</h3>
              {data.messages.length ? (
                <ul className="vg-notify__list">
                  {data.messages.map((message) => {
                    const fresh = newIds.has(message.alertId);
                    const body = (
                      <>
                        <strong>{fresh ? <span className="vg-notify__dot" aria-label="New" /> : null}{message.title}</strong>
                        {message.body ? <span>{message.body}</span> : null}
                        <small>{timeAgo(message.publishedAtUtc)}{message.journeyReference ? ` · ${message.journeyReference}` : ''}</small>
                      </>
                    );
                    // Each message names its booking and opens it (product owner 2026-11-18).
                    const links = messageLinks(message);
                    return (
                      <li key={message.alertId} className={fresh ? 'is-new' : ''}>
                        {links
                          ? <Link to={links.primary} onClick={() => setOpen(false)}>{body}</Link>
                          : <div>{body}</div>}
                        {links ? (
                          <p className="vg-notify__actions">
                            {links.actions.map((action) => (
                              <Link key={action.label} to={action.to} onClick={() => setOpen(false)}>{action.label}</Link>
                            ))}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="vg-notify__empty">No messages in the last 7 days.</p>}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
