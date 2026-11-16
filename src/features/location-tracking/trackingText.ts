import type { TrackerStatus } from '../../services/device/backgroundLocation';
import type { BeginResult } from './attendanceTracking';

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

function clock(ms: number): string {
  const d = new Date(ms + IST_OFFSET_MS);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** The words of the tracking panel on My attendance. */
export function trackingPanelText(
  status: TrackerStatus, problem: BeginResult | null, now: number,
): { title: string; detail: string } {
  if (status.active) {
    const parts = ['Your location is recorded every 20 minutes until you check out (at the latest 19:30), even when the app is closed.'];
    if (status.lastReadingMs) parts.push(`Last reading ${clock(status.lastReadingMs)}.`);
    if (status.pending) {
      parts.push(`${status.pending} reading${status.pending === 1 ? '' : 's'} kept on the phone, sent when there is a network.`);
    }
    return { title: 'Recording your work location', detail: parts.join(' ') };
  }
  if (problem && !problem.started) {
    const why: Record<string, string> = {
      NO_PROJECT: 'You are not assigned to a Project, so there is nothing to record the location against.',
      WINDOW_OVER: 'Recording runs only until 19:30.',
      NO_LOCATION_PERMISSION: 'Location permission is off for Verigence. Turn it on in the phone settings, then try again.',
      NOT_ANDROID: 'Recording needs the Verigence Android app.',
      FAILED: 'It could not be started. Check the network and try again.',
    };
    return { title: 'Location is not being recorded', detail: why[problem.reason] ?? why.FAILED };
  }
  if (status.locationPermission === false) {
    return { title: 'Location is not being recorded', detail: 'Location permission is off for Verigence. Turn it on in the phone settings.' };
  }
  const late = new Date(now + IST_OFFSET_MS).getUTCHours() * 60 + new Date(now + IST_OFFSET_MS).getUTCMinutes() >= 19 * 60 + 30;
  return {
    title: 'Location is not being recorded',
    detail: late ? 'Recording runs only until 19:30.' : 'You are checked in, but recording has stopped on this phone.',
  };
}
