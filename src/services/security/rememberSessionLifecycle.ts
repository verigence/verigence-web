import type { VerigenceDeviceContext } from '../device/identity';
import {
  logoutHuman,
  rememberHuman,
  type HumanResumeResponse,
} from './auth';
import {
  clearNativeRememberCredential,
  hasRememberSessionHint,
  readNativeRememberCredential,
  setRememberSessionHint,
  storeNativeRememberCredential,
} from './rememberSession';

export async function enableRememberedSession(
  accessToken: string,
  device: VerigenceDeviceContext,
): Promise<boolean> {
  try {
    const remembered = await rememberHuman(accessToken, device);
    if (device.deviceType === 'MOBILE') {
      const credential = remembered.rememberToken?.trim();
      if (!credential || !(await storeNativeRememberCredential(credential))) {
        setRememberSessionHint(false);
        await clearNativeRememberCredential();
        if (credential) void logoutHuman(device, credential).catch(() => undefined);
        return false;
      }
    }
    setRememberSessionHint(true);
    return true;
  } catch {
    setRememberSessionHint(false);
    await clearNativeRememberCredential();
    return false;
  }
}

export async function disableRememberedSession(
  device: VerigenceDeviceContext,
): Promise<void> {
  const hadHint = hasRememberSessionHint();
  const nativeCredential = device.deviceType === 'MOBILE'
    ? await readNativeRememberCredential()
    : undefined;

  // Local removal is authoritative for immediate UX. Server revocation/cookie cleanup is
  // best-effort so Sign out and normal login never wait on Security availability.
  setRememberSessionHint(false);
  await clearNativeRememberCredential();

  if (hadHint || nativeCredential) {
    void logoutHuman(device, nativeCredential).catch(() => undefined);
  }
}

export async function rememberedCredentialForResume(
  device: VerigenceDeviceContext,
): Promise<string | undefined> {
  if (!hasRememberSessionHint()) return undefined;
  if (device.deviceType !== 'MOBILE') return undefined;
  return readNativeRememberCredential();
}

export async function acceptResumedRememberSession(
  resumed: HumanResumeResponse,
  device: VerigenceDeviceContext,
): Promise<boolean> {
  if (!resumed.remembered) return false;
  if (device.deviceType === 'MOBILE') {
    const rotated = resumed.rememberToken?.trim();
    if (!rotated || !(await storeNativeRememberCredential(rotated))) {
      setRememberSessionHint(false);
      await clearNativeRememberCredential();
      if (rotated) void logoutHuman(device, rotated).catch(() => undefined);
      return false;
    }
  }
  setRememberSessionHint(true);
  return true;
}

export async function clearRejectedRememberedSession(
  device: VerigenceDeviceContext,
): Promise<void> {
  const nativeCredential = device.deviceType === 'MOBILE'
    ? await readNativeRememberCredential()
    : undefined;
  setRememberSessionHint(false);
  await clearNativeRememberCredential();
  // For Web this call clears the HttpOnly cookie. For Mobile it also revokes a credential if the
  // server can still identify it. Failures are intentionally ignored after a definitive rejection.
  void logoutHuman(device, nativeCredential).catch(() => undefined);
}
