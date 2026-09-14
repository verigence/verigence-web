import { useEffect, useState, type PropsWithChildren } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { verigenceLockup } from '../assets/verigenceLockup';
import {
  resetOperationalContext,
  restoreOperationalContextHint,
} from '../features/uc03/projectContext';
import { getVerigenceDeviceContext } from '../services/device/identity';
import {
  resumeHuman,
  SecurityLoginError,
} from '../services/security/auth';
import {
  acceptResumedRememberSession,
  clearRejectedRememberedSession,
  rememberedCredentialForResume,
} from '../services/security/rememberSessionLifecycle';
import { hasRememberSessionHint } from '../services/security/rememberSession';
import { useSessionStore } from '../store/sessionStore';

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
      const device = getVerigenceDeviceContext();
      const nativeCredential = await rememberedCredentialForResume(device);

      // A native hint without its Keystore credential cannot resume. Clear the stale hint locally
      // without creating a failing Security request.
      if (device.deviceType === 'MOBILE' && !nativeCredential) {
        await clearRejectedRememberedSession(device);
        if (!cancelled) setReady(true);
        return;
      }

      try {
        const resumed = await resumeHuman(device, nativeCredential);
        if (cancelled) return;

        resetOperationalContext(queryClient);
        useSessionStore.getState().signInAuthenticated(
          '',
          resumed.accessToken,
          resumed.isSuperAdmin ? 'SUPER_ADMIN' : 'PC',
          resumed.expiresAtUtc,
          resumed.sessionId,
          resumed.deviceId,
        );
        // The email is not an authorization input and is intentionally absent from the remember
        // credential. Preserve a neutral display label until profile/user context supplies one.
        useSessionStore.setState({ displayName: 'User' });

        if (!resumed.isSuperAdmin) {
          restoreOperationalContextHint(resumed.accessToken, queryClient);
        }
        await acceptResumedRememberSession(resumed, device);
      } catch (error) {
        if (cancelled) return;
        // Definitive auth/session rejection invalidates local persistence. Transient network/5xx
        // failures retain the remember credential so a later cold start can try again.
        if (error instanceof SecurityLoginError && [401, 403].includes(error.status)) {
          await clearRejectedRememberedSession(device);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
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
