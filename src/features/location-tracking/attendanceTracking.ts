import type { AttendanceToday } from '../../services/hr/attendance';
import { auditCoreBaseUrl } from '../../services/audit-core/client';
import { minuteOfDay, startLocationTracking, stopLocationTracking } from '../../services/audit-core/locationTracking';
import {
  startTracker,
  stopTracker,
  trackerAvailable,
  trackerStatus,
  type TrackerStatus,
} from '../../services/device/backgroundLocation';

/**
 * The phone's location tracking follows myHR attendance (product owner,
 * 2026-11-16): it starts at check-in and stops at check-out, within 10:00-19:30
 * IST, for everyone who marks attendance on the Android app.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const WINDOW_END_MINUTE = 19 * 60 + 30;

export type TrackingDecision = 'START' | 'STOP' | 'NONE';

function istDate(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function istMinute(ms: number): number {
  const d = new Date(ms + IST_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** What to do with the phone's tracking, given today's attendance and the tracker's state. */
export function trackingDecision(
  today: Pick<AttendanceToday, 'workDate' | 'day'> | null | undefined, status: TrackerStatus, now: number,
): TrackingDecision {
  if (!status.available || !today) return 'NONE';
  const checkedIn = Boolean(today.day?.checkIn);
  const checkedOut = Boolean(today.day?.checkOut);
  if (checkedOut) return status.active ? 'STOP' : 'NONE';
  const tracked = checkedIn && today.workDate === istDate(now) && istMinute(now) < WINDOW_END_MINUTE;
  if (tracked && !status.active) return 'START';
  return 'NONE';
}

export type BeginResult =
  | { started: true; status: TrackerStatus; projectName?: string | null }
  | { started: false; reason: 'NOT_ANDROID' | 'NO_PROJECT' | 'WINDOW_OVER' | 'NO_LOCATION_PERMISSION' | 'FAILED' };

let inFlight: Promise<BeginResult> | null = null;
// A day the server said "no" for (no Project, after 19:30): not asked again on every resume.
let refusedFor: string | null = null;

/** Check-in: ask Audit Core for today's key and start the phone's service with it. */
export function beginTracking(accessToken: string, tenantId?: string, now = Date.now()): Promise<BeginResult> {
  if (!trackerAvailable()) return Promise.resolve({ started: false, reason: 'NOT_ANDROID' });
  if (refusedFor === istDate(now)) return Promise.resolve({ started: false, reason: 'NO_PROJECT' });
  if (inFlight) return inFlight;
  inFlight = (async (): Promise<BeginResult> => {
    try {
      const start = await startLocationTracking(accessToken, tenantId);
      if (!start.tracking || !start.key || !start.path || !start.trackingUntilUtc) {
        refusedFor = istDate(now);
        return { started: false, reason: start.reason === 'WINDOW_OVER' ? 'WINDOW_OVER' : 'NO_PROJECT' };
      }
      const status = await startTracker({
        baseUrl: auditCoreBaseUrl(),
        path: start.path,
        key: start.key,
        trackingUntilMs: Date.parse(start.trackingUntilUtc),
        intervalMinutes: start.intervalMinutes,
        windowFromMinute: minuteOfDay(start.window.from),
        windowToMinute: minuteOfDay(start.window.to),
      });
      return { started: true, status, projectName: start.projectName };
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      return { started: false, reason: code === 'NO_LOCATION_PERMISSION' ? 'NO_LOCATION_PERMISSION' : 'FAILED' };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Check-out: stop the phone's service (what it read so far still goes out) and the key. */
export async function endTracking(accessToken: string): Promise<void> {
  if (!trackerAvailable()) return;
  await stopTracker();
  try {
    await stopLocationTracking(accessToken);
  } catch {
    // The key lapses at 19:30 anyway; the phone has already stopped reading.
  }
}

/** Bring the phone's tracking in line with today's attendance. */
export async function syncTracking(
  accessToken: string, today: AttendanceToday | null | undefined, tenantId?: string, now = Date.now(),
): Promise<TrackerStatus> {
  const status = await trackerStatus();
  const decision = trackingDecision(today, status, now);
  if (decision === 'START') {
    const begun = await beginTracking(accessToken, tenantId, now);
    return begun.started ? begun.status : status;
  }
  if (decision === 'STOP') {
    await endTracking(accessToken);
    return trackerStatus();
  }
  return status;
}

/** For tests. */
export function resetTrackingMemory(): void {
  inFlight = null;
  refusedFor = null;
}
