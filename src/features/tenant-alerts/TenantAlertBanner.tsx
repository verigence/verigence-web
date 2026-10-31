import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  alertMessage,
  dismissedStorageKey,
  getTenantAlerts,
  readDismissed,
  unseenAlerts,
  writeDismissed,
} from '../../services/audit-core/tenantAlerts';
import { useProjectContextStore } from '../../store/projectContextStore';
import { useSessionStore } from '../../store/sessionStore';
import '../../styles/tenant-alerts.css';

// Every 30 seconds while the screen is open; react-query does not poll a hidden tab.
const POLL_MS = 30_000;
const SHOWN = 3;

/**
 * Project-wide alerts on every signed-in screen (product owner 2026-10-31):
 * "This alert should be seen by all team on their respective screens, if they
 * are active." Shown to every role of the selected Project, newest first,
 * until the person closes them.
 */
export default function TenantAlertBanner() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const email = useSessionStore((s) => s.email);
  const storageKey = tenantId ? dismissedStorageKey(tenantId, email) : '';
  const [dismissed, setDismissed] = useState<{ key: string; ids: Set<string> }>(() => ({
    key: storageKey,
    ids: storageKey ? readDismissed(storageKey) : new Set(),
  }));
  // A different Project or person: their own dismissals.
  const dismissedIds = dismissed.key === storageKey ? dismissed.ids : readDismissed(storageKey);

  const alerts = useQuery({
    queryKey: ['tenant-alerts', tenantId],
    queryFn: () => getTenantAlerts(tenantId!, accessToken),
    enabled: Boolean(tenantId && accessToken),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: POLL_MS / 2,
    retry: false,
  });
  const visible = useMemo(() => unseenAlerts(alerts.data?.items, dismissedIds), [alerts.data, dismissedIds]);

  if (!tenantId || visible.length === 0) return null;

  const dismiss = (ids: string[]) => {
    const next = new Set(dismissedIds);
    ids.forEach((id) => next.add(id));
    writeDismissed(storageKey, next);
    setDismissed({ key: storageKey, ids: next });
  };
  const more = visible.length - SHOWN;

  return (
    <section className="tenant-alerts" aria-label="Project alerts" aria-live="polite">
      {visible.slice(0, SHOWN).map((alert) => {
        const kept = alert.outcome && alert.outcome !== 'DELETED';
        return (
          <article key={alert.alertId} className={`tenant-alert${kept ? ' tenant-alert--kept' : ''}`} role="alert">
            <span className="tenant-alert__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>
            </span>
            <div className="tenant-alert__copy">
              <strong className="tenant-alert__title">{alert.title || 'Same file being uploaded'}</strong>
              <p className="tenant-alert__body">{alertMessage(alert)}</p>
            </div>
            <button type="button" className="tenant-alert__close" aria-label="Dismiss alert" onClick={() => dismiss([alert.alertId])}>×</button>
          </article>
        );
      })}
      {more > 0 && (
        <button type="button" className="tenant-alerts__more" onClick={() => dismiss(visible.map((a) => a.alertId))}>
          {more} more alert{more === 1 ? '' : 's'} · Dismiss all
        </button>
      )}
    </section>
  );
}
