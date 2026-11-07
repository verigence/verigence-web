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

function rememberLog(step: string, detail: Record<string, unknown> = {}): void {
  sharedRememberLog(step, { platform: Capacitor.getPlatform(), ...detail });
}

/**
 * On the Android/iOS app the credential in the platform secure storage is what says "this phone is
 * remembered". The localStorage hint is only a Web optimisation (the Web credential is an HttpOnly
 * cookie JavaScript cannot see, so Web needs a hint to know whether a resume call is worthwhile).
 */
export function isNativeRememberPlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/** A native call that never answers must not hold sign-in or resume forever. */
const SECURE_STORAGE_TIMEOUT_MS = 8_000;

type SecureStoragePlugin = typeof import('@aparajita/capacitor-secure-storage')['SecureStorage'];

/**
 * Runs one operation against the native secure storage.
 *
 * ROOT CAUSE of "Keep me signed in" never working in the Android app (found 2026-11-07): this used to
 * be `async function secureStorage() { ...; return SecureStorage; }`. A Capacitor plugin is a Proxy
 * that answers EVERY property, `then` included, with a native-method wrapper, so returning it from an
 * async function (or resolving any promise with it) makes the promise treat it as a thenable and call
 * `SecureStorage.then(resolve, reject)`. That native method does not exist, the wrapper rejects on its
 * own and never calls resolve/reject, so the awaited promise never settled. On the phone every read,
 * store and clear of the credential therefore hung: after a successful /auth/remember the app never
 * stored the credential and never set the remembered flag, so it never called /auth/resume; sign-out
 * never reached /auth/logout either. Web never got that far (no native storage), which is why Web
 * worked. The plugin is now used only inside this function and never handed out of an async scope.
 */
async function withSecureStorage<T>(name: string, operation: (storage: SecureStoragePlugin) => Promise<T>): Promise<T> {
  // Never invoke the plugin's Web implementation: its own documentation intentionally uses
  // unencrypted localStorage there. Web's secret is instead held only by the HttpOnly cookie.
  if (!Capacitor.isNativePlatform()) throw new Error('secure storage is native-only');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`secure storage ${name} timed out`)), SECURE_STORAGE_TIMEOUT_MS);
  });
  try {
    const plugin = await import('@aparajita/capacitor-secure-storage');
    // `plugin` is the module namespace (no `then`), and the Proxy itself is only dereferenced here.
    return await Promise.race([operation(plugin.SecureStorage), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function readNativeRememberCredential(): Promise<string | undefined> {
  if (!Capacitor.isNativePlatform()) return undefined;
  try {
    const value = await withSecureStorage('read', async (storage) => {
      const raw = await storage.getItem(NATIVE_REMEMBER_CREDENTIAL_KEY);
      return typeof raw === 'string' ? raw : undefined;
    });
    const trimmed = value?.trim() || undefined;
    rememberLog('read.result', { found: Boolean(trimmed) });
    return trimmed;
  } catch (error) {
    rememberLog('read.threw', { error: String(error), name: (error as { name?: string })?.name });
    return undefined;
  }
}

/** True only when the credential was written AND reads back unchanged. */
export async function storeNativeRememberCredential(value: string): Promise<boolean> {
  if (!value.trim() || !Capacitor.isNativePlatform()) {
    rememberLog('store.skip', { hasValue: Boolean(value.trim()), native: Capacitor.isNativePlatform() });
    return false;
  }
  try {
    const verified = await withSecureStorage('store', async (storage) => {
      await storage.setItem(NATIVE_REMEMBER_CREDENTIAL_KEY, value);
      // A Keystore write that silently no-ops would otherwise look like success here and fail only
      // on the next opening of the app.
      const readBack = await storage.getItem(NATIVE_REMEMBER_CREDENTIAL_KEY);
      return typeof readBack === 'string' && readBack.trim() === value.trim();
    });
    rememberLog('store.result', { verifiedReadBack: verified });
    return verified;
  } catch (error) {
    rememberLog('store.threw', { error: String(error), name: (error as { name?: string })?.name });
    return false;
  }
}

export async function clearNativeRememberCredential(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await withSecureStorage('clear', (storage) => storage.removeItem(NATIVE_REMEMBER_CREDENTIAL_KEY));
    rememberLog('clear.done');
  } catch (error) {
    // Local sign-out must never be blocked by secure-storage cleanup failure.
    rememberLog('clear.threw', { error: String(error) });
  }
}
