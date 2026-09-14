import { Capacitor } from '@capacitor/core';

const REMEMBER_HINT_KEY = 'verigence.auth.remember-enabled.v1';
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

async function secureStorage() {
  // Never invoke the plugin's Web implementation: its own documentation intentionally uses
  // unencrypted localStorage there. Web's secret is instead held only by the HttpOnly cookie.
  if (!Capacitor.isNativePlatform()) return undefined;
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
  return SecureStorage;
}

export async function readNativeRememberCredential(): Promise<string | undefined> {
  try {
    const storage = await secureStorage();
    if (!storage) return undefined;
    const value = await storage.getItem(NATIVE_REMEMBER_CREDENTIAL_KEY);
    return value?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function storeNativeRememberCredential(value: string): Promise<boolean> {
  if (!value.trim() || !Capacitor.isNativePlatform()) return false;
  try {
    const storage = await secureStorage();
    if (!storage) return false;
    await storage.setItem(NATIVE_REMEMBER_CREDENTIAL_KEY, value);
    return true;
  } catch {
    return false;
  }
}

export async function clearNativeRememberCredential(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const storage = await secureStorage();
    await storage?.removeItem(NATIVE_REMEMBER_CREDENTIAL_KEY);
  } catch {
    // Local sign-out must never be blocked by secure-storage cleanup failure.
  }
}

export async function clearRememberSessionLocalState(): Promise<void> {
  setRememberSessionHint(false);
  await clearNativeRememberCredential();
}
