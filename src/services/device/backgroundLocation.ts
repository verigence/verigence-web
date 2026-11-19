import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * The phone's location tracking from check-in to check-out (product owner,
 * 2026-11-16: "though app may be in background or may be killed.. some way to
 * collect the data"). Android only: a foreground service in the app
 * (native/android/LocationTrackerService.java) that reads the location every
 * 20 minutes from 10:00 IST until check-out (the hours come from Audit Core), keeps each reading on the phone when
 * there is no network and sends it later. Elsewhere every call is a no-op.
 */
export type TrackerStatus = {
  available: boolean;
  active: boolean;
  trackingUntilMs?: number;
  /** Readings kept on the phone, not sent yet. */
  pending?: number;
  lastReadingMs?: number;
  lastSentMs?: number;
  locationPermission?: boolean;
  /** "Allow all the time": needed to resume after the phone restarts. */
  backgroundPermission?: boolean;
  /** Left running when the phone saves battery. */
  unrestrictedBattery?: boolean;
};

export type TrackerStart = {
  baseUrl: string;
  path: string;
  key: string;
  trackingUntilMs: number;
  intervalMinutes: number;
  windowFromMinute: number;
  windowToMinute: number;
};

interface LocationTrackerPlugin {
  start(options: TrackerStart): Promise<TrackerStatus>;
  stop(): Promise<TrackerStatus>;
  status(): Promise<TrackerStatus>;
  flush(): Promise<TrackerStatus>;
  requestBackgroundLocation(): Promise<TrackerStatus>;
  requestUnrestrictedBattery(): Promise<TrackerStatus>;
}

const PLUGIN = 'VerigenceLocationTracker';
const tracker = registerPlugin<LocationTrackerPlugin>(PLUGIN);
const UNAVAILABLE: TrackerStatus = { available: false, active: false };

/** True in the Android app built with the tracking service (an older app build lacks it). */
export function trackerAvailable(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable(PLUGIN);
}

async function call(run: () => Promise<TrackerStatus>): Promise<TrackerStatus> {
  if (!trackerAvailable()) return UNAVAILABLE;
  try {
    return { ...(await run()), available: true };
  } catch {
    return UNAVAILABLE;
  }
}

export const trackerStatus = () => call(() => tracker.status());
export const stopTracker = () => call(() => tracker.stop());
export const flushTracker = () => call(() => tracker.flush());
export const requestBackgroundLocation = () => call(() => tracker.requestBackgroundLocation());
export const requestUnrestrictedBattery = () => call(() => tracker.requestUnrestrictedBattery());

/** Start (or restart with a new key). Rejects when the phone refuses, so the caller can say why. */
export async function startTracker(options: TrackerStart): Promise<TrackerStatus> {
  if (!trackerAvailable()) return UNAVAILABLE;
  return { ...(await tracker.start(options)), available: true };
}
