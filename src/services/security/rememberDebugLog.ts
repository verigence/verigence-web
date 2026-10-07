// Optional on-device diagnostic log for the "Keep me signed in" flow, off by default and never shown on
// screen. When SuperAdmin switches device diagnostics on, entries are kept here (localStorage survives the
// app being killed and reopened, the cold-start moment worth seeing) and sent to the server once signed in.

const STORAGE_KEY = 'verigence.debug.remember-log.v1';
/** Set by the diagnostics setting from the server; absent means off, so nothing is captured by default. */
const ENABLED_KEY = 'verigence.diagnostics.enabled';

function isDiagnosticsEnabled(): boolean {
  try {
    return window.localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDiagnosticsEnabled(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(ENABLED_KEY, '1');
    else window.localStorage.removeItem(ENABLED_KEY);
  } catch {
    // Storage can be unavailable; diagnostics then simply stay off.
  }
}
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
  if (!isDiagnosticsEnabled()) return;
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

