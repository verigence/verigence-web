import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { awaitPrimaryUc03WorkQueue } from '../../services/audit-core/uc03';
import { getPcBookingReviewSnapshot } from '../../services/audit-core/uc03PcDirectReview';
import { useProjectContextStore } from '../../store/projectContextStore';
import { useSessionStore } from '../../store/sessionStore';

const STORAGE_KEY = 'uc03-pc-review-readiness-watch-v1';
const CHANGE_EVENT = 'uc03-pc-review-readiness-watch-change';
export const REVIEW_READY_EVENT = 'uc03-pc-review-ready';
const RECHECK_MS = 120_000;
const SCHEDULER_TICK_MS = 10_000;

interface ReviewWatchEntry {
  tenantId: string;
  journeyId: string;
  label: string;
  lastCheckedAt: number;
  ready: boolean;
}

function readEntries(): ReviewWatchEntry[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ReviewWatchEntry => (
      item
      && typeof item.tenantId === 'string'
      && typeof item.journeyId === 'string'
      && typeof item.label === 'string'
      && typeof item.lastCheckedAt === 'number'
      && typeof item.ready === 'boolean'
    ));
  } catch {
    return [];
  }
}

function writeEntries(entries: ReviewWatchEntry[]) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function watchReviewReadiness(tenantId: string, journeyId: string, label: string) {
  const entries = readEntries();
  const existing = entries.find((entry) => entry.tenantId === tenantId && entry.journeyId === journeyId);
  if (existing) {
    existing.label = label;
    existing.lastCheckedAt = Date.now();
    existing.ready = false;
  } else {
    entries.push({ tenantId, journeyId, label, lastCheckedAt: Date.now(), ready: false });
  }
  writeEntries(entries);
}

export function clearReviewReadinessWatch(tenantId: string, journeyId: string) {
  writeEntries(readEntries().filter((entry) => !(entry.tenantId === tenantId && entry.journeyId === journeyId)));
}

export default function ReviewReadinessWatcher() {
  const navigate = useNavigate();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [entries, setEntries] = useState<ReviewWatchEntry[]>(() => readEntries());

  useEffect(() => {
    const sync = () => setEntries(readEntries());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const checkDue = useCallback(async () => {
    if (!project?.tenantId || project.operatingRole !== 'PC' || !accessToken) return;
    if (document.visibilityState !== 'visible') return;

    // Never let periodic review readiness traffic compete with the user's first
    // useful landing request. If a primary Work Queue request is active, share its
    // priority barrier and begin review checks only after it settles.
    await awaitPrimaryUc03WorkQueue(project.tenantId);
    if (document.visibilityState !== 'visible') return;

    const now = Date.now();
    const current = readEntries();
    const due = current.filter((entry) => (
      entry.tenantId === project.tenantId
      && !entry.ready
      && now - entry.lastCheckedAt >= RECHECK_MS
    ));
    if (due.length === 0) return;

    const dueKeys = new Set(due.map((entry) => `${entry.tenantId}:${entry.journeyId}`));
    writeEntries(current.map((entry) => (
      dueKeys.has(`${entry.tenantId}:${entry.journeyId}`)
        ? { ...entry, lastCheckedAt: now }
        : entry
    )));

    for (const entry of due) {
      const snapshot = await getPcBookingReviewSnapshot(
        entry.tenantId,
        entry.journeyId,
        accessToken,
        true,
      ).catch(() => null);
      if (!snapshot?.allReady) continue;

      const latest = readEntries();
      writeEntries(latest.map((item) => (
        item.tenantId === entry.tenantId && item.journeyId === entry.journeyId
          ? { ...item, ready: true }
          : item
      )));
      window.dispatchEvent(new CustomEvent(REVIEW_READY_EVENT, {
        detail: { tenantId: entry.tenantId, journeyId: entry.journeyId },
      }));
    }
  }, [accessToken, project?.operatingRole, project?.tenantId]);

  useEffect(() => {
    const interval = window.setInterval(() => { void checkDue(); }, SCHEDULER_TICK_MS);
    const onVisibility = () => { if (document.visibilityState === 'visible') void checkDue(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [checkDue]);

  const ready = useMemo(
    () => entries.filter((entry) => entry.tenantId === project?.tenantId && entry.ready),
    [entries, project?.tenantId],
  );
  if (project?.operatingRole !== 'PC' || ready.length === 0) return null;

  const first = ready[0];
  return (
    <button
      type="button"
      className="user-menu-button"
      aria-label={`${ready.length} Booking review${ready.length === 1 ? '' : 's'} ready`}
      title={ready.length === 1 ? `${first.label} is ready for review` : `${ready.length} Bookings are ready for review`}
      onClick={() => navigate(`/bookings/${first.journeyId}/review`)}
      style={{ position: 'fixed', top: '76px', right: '24px', zIndex: 80, boxShadow: '0 10px 30px rgba(15,23,42,.18)' }}
    >
      🔔 {ready.length} Review ready
    </button>
  );
}
