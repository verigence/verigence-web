import type { TenantAlert } from '../../services/audit-core/tenantAlerts';

/**
 * A 5-second beep on the screen of the PC who uploaded the same file again
 * (product owner, 2026-10-31: "add a small 5 sec sound beep on the system of
 * the PC or mobile of the PC who does that"). Everyone else sees the alert
 * silently. Each alert beeps once per person and device.
 */

const BEEP_SECONDS = 5;

/** The alerts that should beep for this person: same-file alerts whose new
 * file they entered, not beeped before. */
export function alertsToBeep(
  alerts: readonly TenantAlert[] | undefined, subject: string | undefined, beeped: ReadonlySet<string>,
): TenantAlert[] {
  if (!alerts || !subject) return [];
  return alerts.filter((a) => a.kind === 'SAME_FILE_UPLOADED'
    && a.payload?.newJourney?.pcActorId === subject && !beeped.has(a.alertId));
}

export function beepedStorageKey(tenantId: string, subject: string): string {
  return `verigence:tenant-alerts:beeped:${tenantId}:${subject}`;
}

export function readBeeped(key: string): Set<string> {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function writeBeeped(key: string, ids: ReadonlySet<string>): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify([...ids].slice(-200)));
  } catch {
    /* storage unavailable: it may beep again on the next visit, nothing worse */
  }
}

type AudioCtor = typeof AudioContext;
let shared: AudioContext | null = null;

function context(): AudioContext | null {
  if (shared) return shared;
  const Ctor: AudioCtor | undefined = (globalThis as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor })
    .AudioContext ?? (globalThis as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    shared = new Ctor();
  } catch {
    return null;
  }
  return shared;
}

/** Browsers start sound only after the person has touched the page: the first
 * tap or key press unlocks it, so the beep can play later on its own. */
export function unlockAudioOnFirstGesture(): () => void {
  const unlock = () => {
    const ctx = context();
    void ctx?.resume().catch(() => undefined);
    remove();
  };
  const remove = () => {
    globalThis.removeEventListener?.('pointerdown', unlock);
    globalThis.removeEventListener?.('keydown', unlock);
  };
  globalThis.addEventListener?.('pointerdown', unlock, { once: true });
  globalThis.addEventListener?.('keydown', unlock, { once: true });
  return remove;
}

/** Beep for five seconds: short 880 Hz pulses, and vibrate where the phone can. */
export function playAlertBeep(seconds: number = BEEP_SECONDS): void {
  try {
    globalThis.navigator?.vibrate?.(Array.from({ length: seconds * 2 }, (_, i) => (i % 2 === 0 ? 300 : 200)));
  } catch {
    /* no vibration */
  }
  const ctx = context();
  if (!ctx) return;
  void ctx.resume().catch(() => undefined);
  const start = ctx.currentTime + 0.05;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = 880;
  osc.connect(gain);
  // 0.3 s on, 0.2 s off, for the whole period; soft attack/release so it does not click.
  for (let t = 0; t < seconds; t += 0.5) {
    gain.gain.setValueAtTime(0, start + t);
    gain.gain.linearRampToValueAtTime(0.15, start + t + 0.02);
    gain.gain.setValueAtTime(0.15, start + t + 0.28);
    gain.gain.linearRampToValueAtTime(0, start + t + 0.3);
  }
  osc.start(start);
  osc.stop(start + seconds);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}
