import { getVerigenceDeviceContext, type VerigenceDeviceContext } from '../device/identity';
import {
  logoutHuman,
  rememberHuman,
  resumeHuman,
  SecurityLoginError,
  type HumanResumeResponse,
} from './auth';
import {
  clearNativeRememberCredential,
  hasRememberSessionHint,
  isNativeRememberPlatform,
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
  // MOBILE: the credential itself is the source of truth, whatever the localStorage hint says.
  if (device.deviceType !== 'MOBILE') return undefined;
  const credential = await readNativeRememberCredential();
  rememberLog('resume-credential.mobile', { found: Boolean(credential), hint: hasRememberSessionHint() });
  return credential;
}

/**
 * Synchronous "is a resume worth trying" check for the first render. On the app it is always yes
 * (the native credential can only be read asynchronously, and reading it costs no network); on Web
 * it is the non-secret hint that sits next to the HttpOnly cookie.
 */
export function mayHaveRememberedSession(): boolean {
  return isNativeRememberPlatform() || hasRememberSessionHint();
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

/** What one remembered-session exchange came to. */
export type RememberedResume =
  /** A fresh short access token. `kept` is false when the rotated credential could not be stored. */
  | { kind: 'resumed'; device: VerigenceDeviceContext; resumed: HumanResumeResponse; kept: boolean }
  /** Nothing to resume with: Web without the hint, or a phone without a stored credential. No network call. */
  | { kind: 'none'; device: VerigenceDeviceContext }
  /** Security said the credential is no good (401: invalid, expired, revoked, superseded); local state is cleared. */
  | { kind: 'rejected'; device: VerigenceDeviceContext; error: unknown }
  /**
   * Security refused this person for now (403 paused/inactive, 426 app update required) without
   * judging the credential, which Security keeps as well; it is kept so the next opening can try again.
   */
  | { kind: 'refused'; device: VerigenceDeviceContext; error: unknown }
  /** Network or server trouble; the credential is kept so a later attempt can succeed. */
  | { kind: 'transient'; device: VerigenceDeviceContext; error: unknown };

/** 401 is Security's answer about the credential itself; 403/426 are about the person or the app. */
const CREDENTIAL_REJECTED_STATUS = 401;
const REFUSED_STATUSES = new Set([403, 426]);

let resumeInFlight: Promise<RememberedResume> | undefined;

async function exchangeRememberedSession(): Promise<RememberedResume> {
  const device = getVerigenceDeviceContext();
  let nativeCredential: string | undefined;
  if (device.deviceType === 'MOBILE') {
    nativeCredential = await rememberedCredentialForResume(device);
    if (!nativeCredential) {
      // Nothing is stored, so there is nothing to revoke: drop a stale hint, make no network call.
      if (hasRememberSessionHint()) setRememberSessionHint(false);
      rememberLog('resume.none', { deviceType: device.deviceType });
      return { kind: 'none', device };
    }
  } else if (!hasRememberSessionHint()) {
    return { kind: 'none', device };
  }
  rememberLog('resume.start', { deviceType: device.deviceType });
  let resumed: HumanResumeResponse;
  try {
    resumed = await resumeHuman(device, nativeCredential);
  } catch (error) {
    if (error instanceof SecurityLoginError && error.status === CREDENTIAL_REJECTED_STATUS) {
      rememberLog('resume.rejected', { deviceType: device.deviceType, ...errorDetail(error) });
      await clearRejectedRememberedSession(device);
      return { kind: 'rejected', device, error };
    }
    if (error instanceof SecurityLoginError && REFUSED_STATUSES.has(error.status)) {
      rememberLog('resume.refused', { deviceType: device.deviceType, ...errorDetail(error) });
      return { kind: 'refused', device, error };
    }
    rememberLog('resume.transient', { deviceType: device.deviceType, ...errorDetail(error) });
    return { kind: 'transient', device, error };
  }
  // The rotated credential is stored before anyone else can start another exchange, so the next
  // resume always presents the newest one.
  const kept = await acceptResumedRememberSession(resumed, device);
  rememberLog('resume.ok', { deviceType: device.deviceType, kept });
  return { kind: 'resumed', device, resumed, kept };
}

/**
 * Exchange the remembered credential for a new short access token: on a cold start, and also while
 * the app is open, when the short token has run out (the phone was in the background, the screen
 * was off). Only one exchange runs at a time, because the credential rotates on every use and a
 * second, parallel submission would present a credential the first one has just replaced.
 */
export function resumeRememberedSession(): Promise<RememberedResume> {
  if (!resumeInFlight) {
    resumeInFlight = exchangeRememberedSession().finally(() => {
      resumeInFlight = undefined;
    });
  }
  return resumeInFlight;
}
