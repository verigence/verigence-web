import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

import { getActivitySettings, postActivity } from '../../services/audit-core/taskManager';
import { useProjectContextStore } from '../../store/projectContextStore';
import { useSessionStore } from '../../store/sessionStore';
import {
  activitySource, classify, isTap, parseTally, readingWindow, record, recordVisit, screenOf, totals, type StoredTally,
} from './activityTally';
import type { ActivitySource } from '../../services/audit-core/taskManager';

const TICK_MS = 15_000;
// Every minute (2026-10-28): near real time, and an abruptly closed browser loses at most a minute.
const FLUSH_MS = 60_000;
const MIN_FLUSH_GAP_MS = 60_000;
const SCROLL_WRITE_GAP_MS = 5_000;
// The reading window is read on start and every 3 hours, and comes back with every send.
const SETTINGS_REFRESH_MS = 3 * 60 * 60_000;

function clientKind(): ActivitySource {
  return activitySource(Capacitor.getPlatform(), navigator.userAgent,
    (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile);
}

/**
 * Counts time on Verigence for the selected Project and sends the day's totals every minute
 * and when the page is hidden or closed: one small upsert, never more than the counts.
 * Renders nothing.
 *
 * What counts as work (product owner 2026-11-09): a click (mouse or pen button down), a key,
 * or a tap. A tap is a touch that comes up within 10 px and 1 second of where it went down
 * (pointerup); a touch that starts a scroll is cancelled by the browser (pointercancel) or
 * moves further, and never counts. 'click' events are not used: a phone browser does not send
 * one for a tap on text or empty space, so taps on a page being read would be missed.
 * Scroll and mouse wheel are recorded only as scrolling (S) and never make a minute active.
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
    const windowKey = `verigence.activity.window:${tenantId}`;
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

    // The reading window: the last one read (shared with the other tabs), until Audit Core answers.
    let windowMinutes = (() => {
      try {
        return readingWindow(window.localStorage.getItem(windowKey));
      } catch {
        return readingWindow(null);
      }
    })();
    const applyWindow = (value: unknown) => {
      if (value === undefined || value === null) return;
      windowMinutes = readingWindow(value);
      try {
        window.localStorage.setItem(windowKey, String(windowMinutes));
      } catch {
        // Kept in memory only.
      }
    };
    const loadWindow = () => {
      void getActivitySettings(tenantId, accessToken)
        .then((settings) => applyWindow(settings.readingWindowMinutes))
        .catch(() => undefined); // keep the last value, or 3
    };

    let lastClickMinute = -1;
    const onWork = () => {
      const now = Date.now();
      const minute = Math.floor(now / 60_000);
      const tally = read();
      if (minute === lastClickMinute && tally.lastClickAt > now - 5_000) return;
      lastClickMinute = minute;
      write(record({ ...tally, lastClickAt: Math.max(tally.lastClickAt, now) }, now, 'K'));
    };
    let lastScrollWrite = 0;
    let lastScrollMinute = -1;
    const onScroll = () => {
      const now = Date.now();
      const minute = Math.floor(now / 60_000);
      if (minute === lastScrollMinute && now - lastScrollWrite < SCROLL_WRITE_GAP_MS) return;
      lastScrollMinute = minute;
      lastScrollWrite = now;
      const tally = read();
      const next = { ...tally, lastScrollAt: Math.max(tally.lastScrollAt, now) };
      write(record(next, now, classify(now, visible(), next.lastClickAt, next.lastScrollAt, windowMinutes)));
    };
    // A touch is a tap only when it comes up near where it went down (not a scroll).
    const touches = new Map<number, { x: number; y: number; at: number }>();
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY, at: Date.now() });
        return;
      }
      onWork();
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      const start = touches.get(event.pointerId);
      touches.delete(event.pointerId);
      if (start && isTap(start, { x: event.clientX, y: event.clientY, at: Date.now() })) onWork();
    };
    const onPointerCancel = (event: PointerEvent) => {
      touches.delete(event.pointerId);
    };
    const tick = () => {
      const now = Date.now();
      const tally = read();
      write(record(tally, now, classify(now, visible(), tally.lastClickAt, tally.lastScrollAt, windowMinutes)));
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
        }, accessToken).then((answer) => applyWindow(answer?.readingWindowMinutes)).catch(() => undefined);
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

    const options = { passive: true, capture: true } as const;
    window.addEventListener('pointerdown', onPointerDown, options);
    window.addEventListener('pointerup', onPointerUp, options);
    window.addEventListener('pointercancel', onPointerCancel, options);
    window.addEventListener('keydown', onWork, options);
    window.addEventListener('wheel', onScroll, options);
    window.addEventListener('scroll', onScroll, options);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    loadWindow();
    tick();
    const ticker = window.setInterval(tick, TICK_MS);
    const flusher = window.setInterval(() => flush(true), FLUSH_MS);
    const settingsTimer = window.setInterval(loadWindow, SETTINGS_REFRESH_MS);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('pointerup', onPointerUp, { capture: true });
      window.removeEventListener('pointercancel', onPointerCancel, { capture: true });
      window.removeEventListener('keydown', onWork, { capture: true });
      window.removeEventListener('wheel', onScroll, { capture: true });
      window.removeEventListener('scroll', onScroll, { capture: true });
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.clearInterval(ticker);
      window.clearInterval(flusher);
      window.clearInterval(settingsTimer);
      flush(true);
    };
  }, [tenantId, accessToken, operatingRole, email, displayName]);

  // Each screen or journey tab opened (2026-10-28).
  const location = useLocation();
  useEffect(() => {
    if (!tenantId || !accessToken || !operatingRole) return;
    const key = `verigence.activity.v1:${tenantId}:${email || 'me'}`;
    const { screen, journeyId } = screenOf(location.pathname, location.search);
    try {
      window.localStorage.setItem(key, JSON.stringify(recordVisit(parseTally(window.localStorage.getItem(key)), Date.now(), screen, journeyId)));
    } catch {
      // Storage full or blocked: the visit is simply not recorded.
    }
  }, [location.pathname, location.search, tenantId, accessToken, operatingRole, email]);

  return null;
}
