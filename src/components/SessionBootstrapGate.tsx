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

function rememberedResumeAttempt(): Promise<ResumeAttempt> {
  if (coldStartResumeAttempt) return coldStartResumeAttempt;
  coldStartResumeAttempt = (async () => {
    const device = getVerigenceDeviceContext();
    const nativeCredential = await rememberedCredentialForResume(device);
    if (device.deviceType === 'MOBILE' && !nativeCredential) {
      return { device, missingNativeCredential: true };
    }
    try {
      return {
        device,
        resumed: await resumeHuman(device, nativeCredential),
      };
    } catch (error) {
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
        await clearRejectedRememberedSession(attempt.device);
        if (!cancelled) setReady(true);
        return;
      }

      if (attempt.resumed) {
        const resumed = attempt.resumed;
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
        await clearRejectedRememberedSession(attempt.device);
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
