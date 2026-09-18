// TEMPORARY DIAGNOSTIC (remember-me investigation, 2026-09-18): a shared, on-device log buffer
// for the "Keep me signed in" flow. adb/logcat is impractical to get from a real Android tester,
// so this persists to localStorage (survives the app being fully killed and reopened, which is
// exactly the cold-start moment we need to observe) and is rendered by RememberMeDebugOverlay so
// the outcome can be read straight off the phone screen and copied from there.
// Remove this module, its overlay, and every call site once the root cause is confirmed and fixed.

const STORAGE_KEY = 'verigence.debug.remember-log.v1';
const MAX_ENTRIES = 60;

export interface RememberLogEntry {
  time: string;
  step: string;
  detail: Record<string, unknown>;
}

type Listener = (entries: RememberLogEntry[]) => void;

const listeners = new Set<Listener>();

function readEntries(): RememberLogEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: RememberLogEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // A privacy mode or full storage must never break the flow being diagnosed.
  }
}

export function rememberLog(step: string, detail: Record<string, unknown> = {}): void {
  try {
    console.warn('[remember-me]', step, detail);
  } catch {
    // Logging must never throw.
  }
  const entries = readEntries();
  entries.push({ time: new Date().toISOString(), step, detail });
  while (entries.length > MAX_ENTRIES) entries.shift();
  writeEntries(entries);
  for (const listener of listeners) listener(entries);
}

export function getRememberLogSnapshot(): RememberLogEntry[] {
  return readEntries();
}

export function clearRememberLog(): void {
  writeEntries([]);
  for (const listener of listeners) listener([]);
}

export function subscribeRememberLog(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
