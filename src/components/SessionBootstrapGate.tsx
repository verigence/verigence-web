import { useEffect, useState, type PropsWithChildren } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { verigenceLockup } from '../assets/verigenceLockup';
import {
  resetOperationalContext,
  restoreOperationalContextHint,
} from '../features/uc03/projectContext';
import {
  getVerigenceDeviceContext,
  type VerigenceDeviceContext,
} from '../services/device/identity';
import {
  resumeHuman,
  SecurityLoginError,
  type HumanResumeResponse,
} from '../services/security/auth';
import {
  acceptResumedRememberSession,
  clearRejectedRememberedSession,
  rememberedCredentialForResume,
} from '../services/security/rememberSessionLifecycle';
import {
  hasRememberSessionHint,
  rememberedIdentityHint,
} from '../services/security/rememberSession';
import { rememberLog } from '../services/security/rememberDebugLog';
import { useSessionStore } from '../store/sessionStore';

interface ResumeAttempt {
  device: VerigenceDeviceContext;
  resumed?: HumanResumeResponse;
  error?: unknown;
  missingNativeCredential?: boolean;
}

// React StrictMode deliberately remounts effects in development. A rotating credential must never
// be submitted twice, so all mounts in this JS application lifetime share exactly one cold-start
// exchange. A real app/browser reload creates a new module instance and therefore a new attempt.
let coldStartResumeAttempt: Promise<ResumeAttempt> | undefined;

// TEMPORARY DIAGNOSTIC (remember-me investigation, 2026-09-18): remove once the root
// cause of a real failed "Keep me signed in" attempt is confirmed and fixed.
function rememberLogError(step: string, error: unknown): void {
  if (error instanceof SecurityLoginError) {
    rememberLog(step, {
      status: error.status,
      code: error.code,
      message: error.message,
      correlationId: error.correlationId,
    });
    return;
  }
  rememberLog(step, { error: String(error) });
}

function rememberedResumeAttempt(): Promise<ResumeAttempt> {
  if (coldStartResumeAttempt) return coldStartResumeAttempt;
  coldStartResumeAttempt = (async () => {
    const device = getVerigenceDeviceContext();
    const nativeCredential = await rememberedCredentialForResume(device);
    rememberLog('bootstrap.cold-start', { deviceType: device.deviceType, hasNativeCredential: Boolean(nativeCredential) });
    if (device.deviceType === 'MOBILE' && !nativeCredential) {
      rememberLog('bootstrap.missing-native-credential');
      return { device, missingNativeCredential: true };
    }
    try {
      const resumed = await resumeHuman(device, nativeCredential);
      rememberLog('bootstrap.resume-ok', { deviceType: device.deviceType });
      return { device, resumed };
    } catch (error) {
      rememberLogError('bootstrap.resume-threw', error);
      return { device, error };
    }
  })();
  return coldStartResumeAttempt;
}

/**
 * Cold-start-only remembered-session bootstrap.
 *
 * Users who did not opt in pay no network cost: the non-secret local hint makes the gate ready on
 * its first render. Remembered users perform exactly one /auth/resume call. Normal in-app renewal
 * remains owned by SessionRenewalGate and is unchanged.
 */
export default function SessionBootstrapGate({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(
    () => useSessionStore.getState().signedIn || !hasRememberSessionHint(),
  );

  useEffect(() => {
    if (ready || useSessionStore.getState().signedIn || !hasRememberSessionHint()) {
      setReady(true);
      return undefined;
    }

    let cancelled = false;

    const resume = async () => {
      const attempt = await rememberedResumeAttempt();
      if (cancelled) return;

      if (attempt.missingNativeCredential) {
        rememberLog('bootstrap.reject.missing-native-credential', { deviceType: attempt.device.deviceType });
        await clearRejectedRememberedSession(attempt.device);
        if (!cancelled) setReady(true);
        return;
      }

      if (attempt.resumed) {
        const resumed = attempt.resumed;
        rememberLog('bootstrap.accept', { deviceType: attempt.device.deviceType, isSuperAdmin: resumed.isSuperAdmin });
        resetOperationalContext(queryClient);
        useSessionStore.getState().signInAuthenticated(
          rememberedIdentityHint(),
          resumed.accessToken,
          resumed.isSuperAdmin ? 'SUPER_ADMIN' : 'PC',
          resumed.expiresAtUtc,
          resumed.sessionId,
          resumed.deviceId,
        );
        if (!rememberedIdentityHint()) {
          useSessionStore.setState({ displayName: 'User' });
        }
        if (!resumed.isSuperAdmin) {
          restoreOperationalContextHint(resumed.accessToken, queryClient);
        }
        await acceptResumedRememberSession(resumed, attempt.device);
      } else if (
        attempt.error instanceof SecurityLoginError
        && [401, 403].includes(attempt.error.status)
      ) {
        // Definitive auth/session rejection invalidates persistence. Transient network/5xx failures
        // retain the credential so a later cold start can try again.
        rememberLog('bootstrap.reject.definitive', {
          deviceType: attempt.device.deviceType,
          status: attempt.error.status,
          code: attempt.error.code,
        });
        await clearRejectedRememberedSession(attempt.device);
      } else if (attempt.error) {
        rememberLog('bootstrap.transient-error-kept-credential', { deviceType: attempt.device.deviceType });
      }

      if (!cancelled) setReady(true);
    };

    void resume();
    return () => {
      cancelled = true;
    };
  }, [queryClient, ready]);

  if (!ready) {
    return (
      <div className="app-loading" aria-live="polite">
        <img src={verigenceLockup} alt="Verigence" />
        <span>Restoring your session…</span>
      </div>
    );
  }

  return children;
}
