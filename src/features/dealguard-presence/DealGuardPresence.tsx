import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';

import '../../styles/dealguard-presence.css';
import { getCurrentLocation } from '../../services/device/location';
import {
  formatDistance,
  postLocationCheck,
  type LocationCheckCommand,
} from '../../services/audit-core/locationChecks';
import { useProjectContextStore } from '../../store/projectContextStore';
import { useSessionStore } from '../../store/sessionStore';
import { activitySource } from '../task-manager/activityTally';
import {
  awayMessage,
  currentPlan,
  lateEveningOf,
  nextWake,
  parsePlan,
  shouldShowLateNotice,
  slotIsDue,
  type HourPlan,
} from './presenceSchedule';

// A device that never answers (a permission prompt left open) is logged as unavailable.
const LOCATION_TIMEOUT_MS = 30_000;
const LATE_NOTICE_KEY = 'vg.dealguard.lateNotice';
const PLAN_KEY_PREFIX = 'vg.dealguard.locationPlan';
// setTimeout cannot wait longer than this; the next wake is re-worked out then.
const MAX_TIMER_MS = 30 * 60_000;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function deviceType(): LocationCheckCommand['deviceType'] {
  return activitySource(Capacitor.getPlatform(), navigator.userAgent,
    (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile);
}

/** Read the device's location (native app or browser) and say what happened, ready to send. */
async function readLocation(): Promise<LocationCheckCommand> {
  const source: LocationCheckCommand['source'] = Capacitor.isNativePlatform() ? 'NATIVE' : 'BROWSER';
  const base = { source, deviceType: deviceType(), capturedAt: new Date().toISOString() };
  let timer: number | undefined;
  try {
    const location = await Promise.race([
      getCurrentLocation(),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('Timed out waiting for the location.')), LOCATION_TIMEOUT_MS);
      }),
    ]);
    return {
      ...base,
      outcome: 'LOCATED',
      source: location.source === 'native' ? 'NATIVE' : 'BROWSER',
      latitude: location.latitude,
      longitude: location.longitude,
      accuracyM: location.accuracy,
      capturedAt: new Date().toISOString(),
    };
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error ?? '');
    // Browser: GeolocationPositionError.PERMISSION_DENIED is 1. Native: the plugin says "denied" / "permission".
    const denied = code === 1 || /denied|permission/i.test(message);
    return { ...base, outcome: denied ? 'DENIED' : 'UNAVAILABLE', detail: message.slice(0, 300) || undefined };
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

/**
 * The PC's presence on DealGuard (product owner, 2026-11-05). Mounted only on
 * the DealGuard (operational) screens, never on My HR, and active only for a
 * person whose operating role in the selected Project is PC.
 *
 * - At 1-3 random moments each clock hour between 10:00 and 19:30 IST, while
 *   the screen is visible, the device's location is sent to Audit Core, which
 *   decides whether the PC is at an assigned outlet. When it says AWAY a
 *   friendly note is shown; nothing is asked and work carries on.
 * - After 21:00 IST a gentle "It's getting late" note, once an evening on this device.
 */
export default function DealGuardPresence() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const operatingRole = useProjectContextStore((s) => s.selectedProject?.operatingRole);
  const accessToken = useSessionStore((s) => s.accessToken);
  const email = useSessionStore((s) => s.email);
  const [awayNote, setAwayNote] = useState<string>();
  const [lateNote, setLateNote] = useState(false);
  // Storage refused (private mode): the plan and the late note live for this page only.
  const memoryPlan = useRef<HourPlan | null>(null);
  const memoryLateEvening = useRef<string | null>(null);
  const isPc = operatingRole === 'PC' && Boolean(tenantId && accessToken);

  // ---- random location checks
  useEffect(() => {
    if (!isPc || !tenantId) return undefined;
    const planKey = `${PLAN_KEY_PREFIX}:${tenantId}:${email || 'me'}`;
    const loadPlan = (now: number): HourPlan => {
      const plan = currentPlan(parsePlan(readStorage(planKey)) ?? memoryPlan.current, now);
      memoryPlan.current = plan;
      writeStorage(planKey, JSON.stringify(plan));
      return plan;
    };
    let timer: number | undefined;
    let cancelled = false;

    const check = async () => {
      const command = await readLocation();
      if (cancelled) return;
      try {
        const result = await postLocationCheck(tenantId, command, accessToken);
        if (!cancelled && result.recorded && result.status === 'AWAY') {
          setAwayNote(awayMessage(formatDistance(result.distanceM), result.outletName));
        }
      } catch {
        // A check that could not be sent is simply missed; the PC is never interrupted for it.
      }
    };

    const schedule = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      if (cancelled || document.visibilityState !== 'visible') return;
      const now = Date.now();
      const plan = loadPlan(now);
      const wake = nextWake(plan, now);
      timer = window.setTimeout(() => fire(wake), Math.min(Math.max(wake - now, 0), MAX_TIMER_MS));
    };

    const fire = (slot: number) => {
      const now = Date.now();
      // Another tab may have taken this moment: the plan in storage says so.
      const plan = loadPlan(now);
      if (document.visibilityState === 'visible' && slotIsDue(plan, slot, now)) {
        const taken = { ...plan, done: [...plan.done, slot] };
        memoryPlan.current = taken;
        writeStorage(planKey, JSON.stringify(taken));
        void check();
      }
      schedule();
    };

    const onVisibility = () => schedule();
    document.addEventListener('visibilitychange', onVisibility);
    schedule();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isPc, tenantId, accessToken, email]);

  // ---- late-evening note
  useEffect(() => {
    if (!isPc) return undefined;
    const look = () => {
      const now = Date.now();
      const shown = readStorage(LATE_NOTICE_KEY) ?? memoryLateEvening.current;
      if (shouldShowLateNotice(now, shown)) {
        const evening = lateEveningOf(now);
        memoryLateEvening.current = evening;
        if (evening) writeStorage(LATE_NOTICE_KEY, evening);
        setLateNote(true);
      }
    };
    look();
    const interval = window.setInterval(look, 60_000);
    return () => window.clearInterval(interval);
  }, [isPc]);

  const closeAway = useCallback(() => setAwayNote(undefined), []);
  const closeLate = useCallback(() => setLateNote(false), []);

  useEffect(() => {
    if (!awayNote && !lateNote) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (lateNote) closeLate();
      else closeAway();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [awayNote, lateNote, closeAway, closeLate]);

  if (!isPc) return null;
  if (lateNote) {
    return (
      <div className="dgp-backdrop" role="presentation">
        <section className="dgp-dialog" role="dialog" aria-modal="true" aria-labelledby="dgp-late-title">
          <h2 id="dgp-late-title">It&apos;s getting late</h2>
          <p>It&apos;s past 9 pm. Try to finish your work within your working hours — using Verigence late in the evening isn&apos;t recommended.</p>
          <div className="dgp-dialog__actions">
            <button type="button" className="dgp-dialog__ok" autoFocus onClick={closeLate}>OK, continue</button>
          </div>
        </section>
      </div>
    );
  }
  if (awayNote) {
    return (
      <div className="dgp-backdrop" role="presentation">
        <section className="dgp-dialog" role="dialog" aria-modal="true" aria-labelledby="dgp-away-title">
          <h2 id="dgp-away-title">A quick note</h2>
          <p>{awayNote}</p>
          <div className="dgp-dialog__actions">
            <button type="button" className="dgp-dialog__ok" autoFocus onClick={closeAway}>OK</button>
          </div>
        </section>
      </div>
    );
  }
  return null;
}
