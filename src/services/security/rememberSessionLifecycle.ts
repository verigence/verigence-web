import type { VerigenceDeviceContext } from '../device/identity';
import {
  logoutHuman,
  rememberHuman,
  SecurityLoginError,
  type HumanResumeResponse,
} from './auth';
import {
  clearNativeRememberCredential,
  hasRememberSessionHint,
  readNativeRememberCredential,
  setRememberedIdentityHint,
  setRememberSessionHint,
  storeNativeRememberCredential,
} from './rememberSession';
import { rememberLog } from './rememberDebugLog';

function errorDetail(error: unknown): Record<string, unknown> {
  if (error instanceof SecurityLoginError) {
    return { status: error.status, code: error.code, message: error.message, correlationId: error.correlationId };
  }
  return { error: String(error) };
}

export async function enableRememberedSession(
  accessToken: string,
  device: VerigenceDeviceContext,
  identifier: string,
): Promise<boolean> {
  rememberLog('enable.start', { deviceType: device.deviceType });
  try {
    const remembered = await rememberHuman(accessToken, device);
    rememberLog('enable.remember-call-ok', {
      deviceType: device.deviceType,
      hasRememberToken: Boolean(remembered.rememberToken),
    });
    if (device.deviceType === 'MOBILE') {
      const credential = remembered.rememberToken?.trim();
      if (!credential) {
        rememberLog('enable.mobile-no-token-in-response');
      }
      if (!credential || !(await storeNativeRememberCredential(credential))) {
        rememberLog('enable.mobile-store-failed');
        setRememberSessionHint(false);
        setRememberedIdentityHint();
        await clearNativeRememberCredential();
        if (credential) void logoutHuman(device, credential).catch(() => undefined);
        return false;
      }
    }
    setRememberedIdentityHint(identifier);
    setRememberSessionHint(true);
    rememberLog('enable.success', { deviceType: device.deviceType });
    return true;
  } catch (error) {
    rememberLog('enable.threw', { deviceType: device.deviceType, ...errorDetail(error) });
    setRememberSessionHint(false);
    setRememberedIdentityHint();
    await clearNativeRememberCredential();
    return false;
  }
}

export async function disableRememberedSession(
  device: VerigenceDeviceContext,
): Promise<void> {
  const hadHint = hasRememberSessionHint();
  // Clear the startup hint synchronously so explicit sign-out / unchecked login cannot race a new
  // application render. Native secret cleanup and server revocation stay best-effort/off-path.
  setRememberSessionHint(false);
  setRememberedIdentityHint();

  const nativeCredential = device.deviceType === 'MOBILE'
    ? await readNativeRememberCredential()
    : undefined;
  await clearNativeRememberCredential();

  rememberLog('disable', { deviceType: device.deviceType, hadHint, hadNativeCredential: Boolean(nativeCredential) });
  if (hadHint || nativeCredential) {
    void logoutHuman(device, nativeCredential).catch((error) => rememberLog('disable.logout-threw', errorDetail(error)));
  }
}

export async function rememberedCredentialForResume(
  device: VerigenceDeviceContext,
): Promise<string | undefined> {
  if (!hasRememberSessionHint()) {
    rememberLog('resume-credential.no-hint', { deviceType: device.deviceType });
    return undefined;
  }
  if (device.deviceType !== 'MOBILE') return undefined;
  const credential = await readNativeRememberCredential();
  rememberLog('resume-credential.mobile', { found: Boolean(credential) });
  return credential;
}

export async function acceptResumedRememberSession(
  resumed: HumanResumeResponse,
  device: VerigenceDeviceContext,
): Promise<boolean> {
  if (!resumed.remembered) {
    rememberLog('accept-resume.not-remembered', { deviceType: device.deviceType });
    return false;
  }
  if (device.deviceType === 'MOBILE') {
    const rotated = resumed.rememberToken?.trim();
    if (!rotated) rememberLog('accept-resume.mobile-no-rotated-token');
    if (!rotated || !(await storeNativeRememberCredential(rotated))) {
      rememberLog('accept-resume.mobile-store-failed');
      setRememberSessionHint(false);
      setRememberedIdentityHint();
      await clearNativeRememberCredential();
      if (rotated) void logoutHuman(device, rotated).catch(() => undefined);
      return false;
    }
  }
  setRememberSessionHint(true);
  rememberLog('accept-resume.success', { deviceType: device.deviceType });
  return true;
}

export async function clearRejectedRememberedSession(
  device: VerigenceDeviceContext,
): Promise<void> {
  const nativeCredential = device.deviceType === 'MOBILE'
    ? await readNativeRememberCredential()
    : undefined;
  setRememberSessionHint(false);
  setRememberedIdentityHint();
  await clearNativeRememberCredential();
  rememberLog('clear-rejected', { deviceType: device.deviceType });
  // For Web this call clears the HttpOnly cookie. For Mobile it also revokes a credential if the
  // server can still identify it. Failures are intentionally ignored after a definitive rejection.
  void logoutHuman(device, nativeCredential).catch((error) => rememberLog('clear-rejected.logout-threw', errorDetail(error)));
}
