import { Capacitor } from '@capacitor/core';

import { rememberLog as sharedRememberLog } from './rememberDebugLog';

const REMEMBER_HINT_KEY = 'verigence.auth.remember-enabled.v1';
const REMEMBER_IDENTITY_HINT_KEY = 'verigence.auth.remember-identity.v1';
const NATIVE_REMEMBER_CREDENTIAL_KEY = 'verigence.auth.remember-credential.v1';

/**
 * Non-secret startup hint. Web uses this only to decide whether a single /auth/resume call is
 * worthwhile; the actual Web credential stays in an HttpOnly cookie and is never JS-readable.
 */
export function hasRememberSessionHint(): boolean {
  try {
    return window.localStorage.getItem(REMEMBER_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setRememberSessionHint(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(REMEMBER_HINT_KEY, '1');
    else window.localStorage.removeItem(REMEMBER_HINT_KEY);
  } catch {
    // A privacy mode can disable localStorage. In that case we simply do not cold-start resume.
  }
}

export function rememberedIdentityHint(): string {
  try {
    return window.localStorage.getItem(REMEMBER_IDENTITY_HINT_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function setRememberedIdentityHint(identifier?: string): void {
  try {
    const value = identifier?.trim();
    if (value) window.localStorage.setItem(REMEMBER_IDENTITY_HINT_KEY, value);
    else window.localStorage.removeItem(REMEMBER_IDENTITY_HINT_KEY);
  } catch {
    // This is display-only metadata and never participates in authorization.
  }
}

// TEMPORARY DIAGNOSTIC (remember-me investigation, 2026-09-18): logs every native
// secure-storage read/write outcome, on-device (see RememberMeDebugOverlay), so a real failed
// "Keep me signed in" attempt shows exactly where it broke without needing adb/logcat.
// Remove once the root cause is confirmed and fixed.
function rememberLog(step: string, detail: Record<string, unknown> = {}): void {
  sharedRememberLog(step, { platform: Capacitor.getPlatform(), ...detail });
}

async function secureStorage() {
  // Never invoke the plugin's Web implementation: its own documentation intentionally uses
  // unencrypted localStorage there. Web's secret is instead held only by the HttpOnly cookie.
  if (!Capacitor.isNativePlatform()) {
    rememberLog('secureStorage.skip-non-native');
    return undefined;
  }
  try {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    return SecureStorage;
  } catch (error) {
    rememberLog('secureStorage.plugin-import-failed', { error: String(error) });
    throw error;
  }
}

export async function readNativeRememberCredential(): Promise<string | undefined> {
  try {
    const storage = await secureStorage();
    if (!storage) {
      rememberLog('read.no-storage');
      return undefined;
    }
    const value = await storage.getItem(NATIVE_REMEMBER_CREDENTIAL_KEY);
    const trimmed = value?.trim() || undefined;
    rememberLog('read.result', { found: Boolean(trimmed) });
    return trimmed;
  } catch (error) {
    rememberLog('read.threw', { error: String(error), name: (error as { name?: string })?.name });
    return undefined;
  }
}

export async function storeNativeRememberCredential(value: string): Promise<boolean> {
  if (!value.trim() || !Capacitor.isNativePlatform()) {
    rememberLog('store.skip', { hasValue: Boolean(value.trim()), native: Capacitor.isNativePlatform() });
    return false;
  }
  try {
    const storage = await secureStorage();
    if (!storage) {
      rememberLog('store.no-storage');
      return false;
    }
    await storage.setItem(NATIVE_REMEMBER_CREDENTIAL_KEY, value);
    // Diagnostic-only read-back: a plugin that resolves setItem() without actually
    // persisting (e.g. a Keystore write that silently no-ops) would otherwise look like
    // success here and only fail much later, on the next cold start's resume attempt.
    // This does not change the return value, only what gets logged.
    const verify = await storage.getItem(NATIVE_REMEMBER_CREDENTIAL_KEY).catch(() => undefined);
    rememberLog('store.result', { verifiedReadBack: verify?.trim() === value.trim() });
    return true;
  } catch (error) {
    rememberLog('store.threw', { error: String(error), name: (error as { name?: string })?.name });
    return false;
  }
}

export async function clearNativeRememberCredential(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const storage = await secureStorage();
    await storage?.removeItem(NATIVE_REMEMBER_CREDENTIAL_KEY);
    rememberLog('clear.done');
  } catch (error) {
    // Local sign-out must never be blocked by secure-storage cleanup failure.
    rememberLog('clear.threw', { error: String(error) });
  }
}

export async function clearRememberSessionLocalState(): Promise<void> {
  setRememberSessionHint(false);
  setRememberedIdentityHint();
  await clearNativeRememberCredential();
}
