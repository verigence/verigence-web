import { getVerigenceDeviceContext } from '../device/identity';
import { getMyDiagnostics, sendDiagnostics } from './clientDiagnostics';
import {
  clearRememberLog,
  getRememberLogSnapshot,
  setDiagnosticsEnabled,
} from './rememberDebugLog';

let attemptedFor: string | null = null;

/**
 * Once per app start, after sign-in: learn whether device diagnostics are on, and when they are send what
 * the phone kept. One attempt, no retries, and any failure is ignored so the app is never disturbed.
 * Switching it on or off reaches a phone the next time the app opens.
 */
export async function syncDeviceDiagnostics(accessToken: string): Promise<void> {
  if (attemptedFor === accessToken) return;
  attemptedFor = accessToken;
  try {
    const { enabled } = await getMyDiagnostics(accessToken);
    setDiagnosticsEnabled(enabled);
    if (!enabled) {
      clearRememberLog();
      return;
    }
    const entries = getRememberLogSnapshot().slice(-100).map((entry) => ({
      time: String(entry.time).slice(0, 40),
      step: String(entry.step).slice(0, 120),
      detail: entry.detail ?? {},
    }));
    if (entries.length === 0) return;
    const device = getVerigenceDeviceContext();
    const result = await sendDiagnostics(accessToken, {
      deviceId: device.deviceId,
      platform: device.platform.slice(0, 20),
      appVersion: device.appVersion?.slice(0, 30),
      entries,
    });
    if (result.accepted) clearRememberLog();
  } catch {
    // Diagnostics must never get in the way; the next app start tries again.
  }
}
