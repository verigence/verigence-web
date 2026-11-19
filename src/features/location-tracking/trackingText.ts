import type { TrackerStatus } from '../../services/device/backgroundLocation';
import type { BeginResult } from './attendanceTracking';

/**
 * The one thing the location card on My attendance asks of the person, or null when there is
 * nothing to ask (product owner, 19 Nov 2026: "lets not put such strong wordings and time
 * limits.. PC can work late at times.. dont put all this verbage.. just ask them to allow all
 * time"). One short, polite line and one button; no hours, no explanation of how recording works,
 * and nothing at all when the phone is set up or when there is nothing the person can do.
 */
export type TrackingAsk =
  | { kind: 'ALLOW_ALWAYS'; text: string }
  | { kind: 'KEEP_RUNNING'; text: string }
  | { kind: 'TURN_ON'; text: string }
  | { kind: 'PHONE_SETTINGS'; text: string };

export function trackingAsk(status: TrackerStatus, problem: BeginResult | null): TrackingAsk | null {
  if (status.active) {
    if (status.backgroundPermission === false) {
      return { kind: 'ALLOW_ALWAYS', text: 'Please set location for Verigence to Allow all the time.' };
    }
    // Asked only once the first is done: one request at a time.
    if (status.unrestrictedBattery === false) {
      return { kind: 'KEEP_RUNNING', text: 'Please keep Verigence running in the background.' };
    }
    return null;
  }
  const noPermission: TrackingAsk = { kind: 'PHONE_SETTINGS', text: 'Please turn on location for Verigence in the phone settings.' };
  if (problem && !problem.started) {
    if (problem.reason === 'NO_LOCATION_PERMISSION') return noPermission;
    if (problem.reason === 'FAILED') return { kind: 'TURN_ON', text: 'Location could not be turned on. Please check the network and try again.' };
    // No Project, not the Android app, or the day is over: nothing the person can do.
    return null;
  }
  if (status.locationPermission === false) return noPermission;
  // Recording runs until check-out, however late (product owner, 19 Nov 2026): no hour is checked here.
  return { kind: 'TURN_ON', text: 'Location is off on this phone.' };
}
