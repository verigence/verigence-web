import { Capacitor } from '@capacitor/core';

// On-device diagnostic log for the "Keep me signed in" flow, never shown on screen.
//
// 2026-11-07: in the Android app the remember/resume steps are now always kept, in a small ring
// buffer in localStorage (it survives the app being killed and reopened, the cold-start moment worth
// seeing). They hold no secrets, only step names, outcomes and HTTP status codes. They leave the phone
// ONLY when SuperAdmin has switched device diagnostics on (the server switch, read after sign-in by
// syncDeviceDiagnostics); with the switch off they simply stay on the phone, bounded. In a Web
// browser nothing is kept unless the switch is on, as before.

const STORAGE_KEY = 'verigence.debug.remember-log.v1';
/** Set by the diagnostics setting from the server; absent means off. */
const ENABLED_KEY = 'verigence.diagnostics.enabled';

export function isDiagnosticsEnabled(): boolean {
  try {
    return window.localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

function captures(): boolean {
  return isDiagnosticsEnabled() || Capacitor.isNativePlatform();
}

export function setDiagnosticsEnabled(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(ENABLED_KEY, '1');
    else window.localStorage.removeItem(ENABLED_KEY);
  } catch {
    // Storage can be unavailable; diagnostics then simply stay off.
  }
}
/** Matches what one upload to /me/client-diagnostics/logs may carry. */
const MAX_ENTRIES = 100;

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
  if (!captures()) return;
  if (isDiagnosticsEnabled()) {
    try {
      console.warn('[remember-me]', step, detail);
    } catch {
      // Logging must never throw.
    }
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

