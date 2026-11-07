import { describe, expect, it, vi } from 'vitest';

// Emulate the Capacitor Android runtime the way the real WebView presents it: an `androidBridge`
// global (Capacitor core then reports platform 'android'), the native plugin headers, and a
// `nativePromise` that answers SecureStorage calls from an in-memory Keystore. The REAL
// @capacitor/core and @aparajita/capacitor-secure-storage modules are used, so the plugin Proxy
// behaves exactly as on a phone.
const native = vi.hoisted(() => {
  const keystore = new Map<string, string>();
  const calls: string[] = [];
  const g = globalThis as Record<string, unknown>;
  g.androidBridge = { postMessage: () => undefined };
  g.Capacitor = {
    PluginHeaders: [{
      name: 'SecureStorage',
      methods: ['internalGetItem', 'internalSetItem', 'internalRemoveItem', 'internalClearItemsWithPrefix', 'internalGetPrefixedKeys', 'setSynchronizeKeychain']
        .map((name) => ({ name, rtype: 'promise' })),
    }],
    nativePromise: async (plugin: string, method: string, options: { prefixedKey: string; data?: string }) => {
      calls.push(`${plugin}.${method}`);
      if (method === 'internalSetItem') { keystore.set(options.prefixedKey, options.data ?? ''); return undefined; }
      if (method === 'internalGetItem') return { data: keystore.get(options.prefixedKey) ?? null };
      if (method === 'internalRemoveItem') return { success: keystore.delete(options.prefixedKey) };
      throw new Error(`unexpected native call ${plugin}.${method}`);
    },
  };
  return { keystore, calls };
});

import { Capacitor } from '@capacitor/core';

import {
  clearNativeRememberCredential,
  readNativeRememberCredential,
  storeNativeRememberCredential,
} from '../rememberSession';

function settlesWithin<T>(promise: Promise<T>, ms = 2_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('never settled')), ms)),
  ]);
}

describe('the remembered credential in the Android secure storage', () => {
  it('runs on the emulated Android platform', () => {
    expect(Capacitor.getPlatform()).toBe('android');
    expect(Capacitor.isNativePlatform()).toBe(true);
  });

  it('is stored, read back and cleared, and every call settles (it used to hang forever)', async () => {
    // Before 2026-11-07 the plugin Proxy was returned from an async function; the promise then
    // called the non-existent native method `then` and never settled, so none of these returned.
    expect(await settlesWithin(storeNativeRememberCredential('credential-1'))).toBe(true);
    expect(native.calls).not.toContain('SecureStorage.then');
    expect([...native.keystore.values()]).toEqual(['credential-1']);
    expect(await settlesWithin(readNativeRememberCredential())).toBe('credential-1');
    await settlesWithin(clearNativeRememberCredential());
    expect(await settlesWithin(readNativeRememberCredential())).toBeUndefined();
  });

  it('documents the trap: a plugin Proxy is a thenable', async () => {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    expect(typeof (SecureStorage as unknown as { then?: unknown }).then).toBe('function');
  });
});
