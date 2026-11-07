import { useEffect, useState, type PropsWithChildren } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { verigenceLockup } from '../assets/verigenceLockup';
import {
  resetOperationalContext,
  restoreOperationalContextHint,
} from '../features/uc03/projectContext';
import {
  mayHaveRememberedSession,
  resumeRememberedSession,
  type RememberedResume,
} from '../services/security/rememberSessionLifecycle';
import { rememberedIdentityHint } from '../services/security/rememberSession';
import { rememberLog } from '../services/security/rememberDebugLog';
import { useSessionStore } from '../store/sessionStore';

// React StrictMode deliberately remounts effects in development. A rotating credential must never
// be submitted twice, so all mounts in this JS application lifetime share exactly one cold-start
// exchange. A real app/browser reload creates a new module instance and therefore a new attempt.
let coldStartResumeAttempt: Promise<RememberedResume> | undefined;

/**
 * Remembered-session bootstrap on a cold start.
 *
 * On Web, users who did not opt in pay no network cost: the non-secret local hint makes the gate
 * ready on its first render. In the Android app the stored native credential decides (2026-11-07):
 * the gate always looks for it, which costs one local secure-storage read and no network call when
 * there is none. Remembered users perform exactly one /auth/resume call here. While the app stays
 * open, SessionRenewalGate resumes the same way when the short token runs out.
 */
export default function SessionBootstrapGate({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(
    () => useSessionStore.getState().signedIn || !mayHaveRememberedSession(),
  );

  useEffect(() => {
    if (ready || useSessionStore.getState().signedIn || !mayHaveRememberedSession()) {
      setReady(true);
      return undefined;
    }

    let cancelled = false;

    const resume = async () => {
      coldStartResumeAttempt ??= resumeRememberedSession();
      const attempt = await coldStartResumeAttempt;
      if (cancelled) return;

      if (attempt.kind === 'resumed') {
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
        // A cold start with a remembered session is an opening of the app, not a fresh sign-in.
        useSessionStore.setState({ accessKind: 'RESUME' });
        if (!rememberedIdentityHint()) {
          useSessionStore.setState({ displayName: 'User' });
        }
        if (!resumed.isSuperAdmin) {
          restoreOperationalContextHint(resumed.accessToken, queryClient);
        }
      } else {
        // 'rejected' already cleared the credential; 'none' had nothing; 'refused' and 'transient' keep
        // it so the next opening of the app can try again.
        rememberLog(`bootstrap.${attempt.kind}`, { deviceType: attempt.device.deviceType });
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
