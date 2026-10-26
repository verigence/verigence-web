import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

import { postActivity } from '../../services/audit-core/taskManager';
import { useProjectContextStore } from '../../store/projectContextStore';
import { useSessionStore } from '../../store/sessionStore';
import { classify, parseTally, record, totals, type StoredTally } from './activityTally';

const TICK_MS = 15_000;
const FLUSH_MS = 15 * 60_000;
const MIN_FLUSH_GAP_MS = 60_000;
const INTERACTION_WRITE_GAP_MS = 5_000;

function clientKind(): 'WEB' | 'ANDROID' | 'IOS' {
  const platform = Capacitor.getPlatform();
  return platform === 'android' ? 'ANDROID' : platform === 'ios' ? 'IOS' : 'WEB';
}

/**
 * Counts time on Verigence for the selected Project in the browser and sends
 * the day's totals about every 15 minutes and when the page is hidden or
 * closed: one small upsert, never more than the counts. Renders nothing.
 */
export default function ActivityTracker() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const operatingRole = useProjectContextStore((s) => s.selectedProject?.operatingRole);
  const accessToken = useSessionStore((s) => s.accessToken);
  const email = useSessionStore((s) => s.email);
  const displayName = useSessionStore((s) => s.displayName);

  useEffect(() => {
    if (!tenantId || !accessToken || !operatingRole) return undefined;
    const key = `verigence.activity.v1:${tenantId}:${email || 'me'}`;
    const kind = clientKind();
    const read = (): StoredTally => {
      try {
        return parseTally(window.localStorage.getItem(key));
      } catch {
        return parseTally(null);
      }
    };
    const write = (tally: StoredTally) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(tally));
      } catch {
        // Storage full or blocked: the minute is simply not counted.
      }
    };
    const visible = () => document.visibilityState === 'visible';

    let lastInteractionWrite = 0;
    const onInteraction = () => {
      const now = Date.now();
      if (now - lastInteractionWrite < INTERACTION_WRITE_GAP_MS) return;
      lastInteractionWrite = now;
      const tally = read();
      write(record({ ...tally, lastInteractionAt: Math.max(tally.lastInteractionAt, now) }, now, 'A'));
    };
    const tick = () => {
      const now = Date.now();
      const tally = read();
      write(record(tally, now, classify(now, visible(), tally.lastInteractionAt)));
    };
    let lastFlush = 0;
    const flush = (force = false) => {
      const now = Date.now();
      if (!force && now - lastFlush < MIN_FLUSH_GAP_MS) return;
      lastFlush = now;
      for (const day of read().days) {
        if (!Object.keys(day.minutes).length) continue;
        void postActivity(tenantId, {
          date: day.date,
          clientKind: kind,
          displayName: displayName || undefined,
          ...totals(day),
          firstActiveAt: day.firstActiveAt ?? null,
          lastActiveAt: day.lastActiveAt ?? null,
        }, accessToken).catch(() => undefined);
      }
    };
    const onVisibility = () => {
      tick();
      if (!visible()) flush();
    };
    const onPageHide = () => {
      tick();
      flush(true);
    };

    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];
    for (const name of events) window.addEventListener(name, onInteraction, { passive: true, capture: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    tick();
    const ticker = window.setInterval(tick, TICK_MS);
    const flusher = window.setInterval(() => flush(true), FLUSH_MS);
    return () => {
      for (const name of events) window.removeEventListener(name, onInteraction, { capture: true });
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.clearInterval(ticker);
      window.clearInterval(flusher);
      flush(true);
    };
  }, [tenantId, accessToken, operatingRole, email, displayName]);

  return null;
}
