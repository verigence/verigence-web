import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { resetOperationalContext } from '../features/uc03/projectContext';
import { refreshHuman, SecurityLoginError } from '../services/security/auth';
import { resumeRememberedSession } from '../services/security/rememberSessionLifecycle';
import { rememberLog } from '../services/security/rememberDebugLog';
import { useSessionStore } from '../store/sessionStore';
import SessionObservationBootstrap from './SessionObservationBootstrap';

const RENEW_BEFORE_EXPIRY_MS = 2 * 60 * 1000;
const RETRY_DELAY_MS = 30 * 1000;
/** Network trouble while resuming a remembered session: try a few times before giving up. */
const RESUME_ATTEMPTS = 3;
let renewalInFlight: Promise<void> | undefined;

function parseExpiry(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function SessionRenewalGate() {
  const queryClient = useQueryClient();
  const signedIn = useSessionStore((state) => state.signedIn);
  const accessToken = useSessionStore((state) => state.accessToken);
  const expiresAtUtc = useSessionStore((state) => state.accessTokenExpiresAtUtc);

  useEffect(() => {
    if (!signedIn || !accessToken || !expiresAtUtc) return undefined;

    let cancelled = false;
    let timer: number | undefined;

    // Every ending here is automatic, so it never forgets "Keep me signed in": only the person's own
    // Sign out does, or Security rejecting the credential at /auth/resume (2026-11-07).
    const terminateSession = () => {
      resetOperationalContext(queryClient);
      useSessionStore.getState().signOut('SESSION_ENDED');
    };

    // "Keep me signed in" (2026-11-06): the short access token lasts 15 minutes, and a phone in the
    // background lets it run out. The remembered credential is exchanged here, in place, and the
    // person carries on where they were. Whether there is one to exchange is decided by
    // resumeRememberedSession itself (the stored credential in the app, the hint on Web), which makes
    // no network call when there is none (2026-11-07: this used to check only the localStorage hint).
    let resumeFailures = 0;
    const resumeOrEnd = async () => {
      if (cancelled) return;
      const outcome = await resumeRememberedSession();
      rememberLog(`renewal.${outcome.kind}`, { deviceType: outcome.device.deviceType });
      if (cancelled) return;
      if (outcome.kind === 'resumed') {
        resumeFailures = 0;
        const { resumed } = outcome;
        useSessionStore.getState().applyResumedSession(resumed.accessToken, resumed.expiresAtUtc, resumed.sessionId, resumed.deviceId);
        return;
      }
      if (outcome.kind === 'transient' && ++resumeFailures < RESUME_ATTEMPTS) {
        schedule(RETRY_DELAY_MS);
        return;
      }
      // Rejected (already cleared), nothing to resume with, refused for now, or persistent network
      // trouble: the in-app session ends; a kept credential lets the next opening of the app resume.
      terminateSession();
    };

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => void maybeRenew(), Math.max(0, delayMs));
    };

    const maybeRenew = async () => {
      if (cancelled) return;
      const session = useSessionStore.getState();
      if (!session.signedIn || !session.accessToken) return;

      const expiry = parseExpiry(session.accessTokenExpiresAtUtc);
      if (!expiry || expiry <= Date.now()) {
        // A remembered session is deliberately longer-lived than the normal API token. Expiry of
        // that short token must not revoke the remembered credential: it is exchanged for a new one.
        await resumeOrEnd();
        return;
      }

      const remainingMs = expiry - Date.now();
      if (remainingMs > RENEW_BEFORE_EXPIRY_MS) {
        schedule(remainingMs - RENEW_BEFORE_EXPIRY_MS);
        return;
      }

      if (!renewalInFlight) {
        const currentToken = session.accessToken;
        renewalInFlight = refreshHuman(currentToken)
          .then((refreshed) => {
            const current = useSessionStore.getState();
            if (current.signedIn && current.accessToken === currentToken) {
              current.setAccessToken(refreshed.accessToken, refreshed.expiresAtUtc);
            }
          })
          .finally(() => {
            renewalInFlight = undefined;
          });
      }

      try {
        await renewalInFlight;
      } catch (error) {
        if (error instanceof SecurityLoginError && [401, 403, 426].includes(error.status)) {
          // A refused renewal is about the short access session, not the remembered credential.
          // /auth/resume is where Security decides about the credential: it rejects (and revokes) a
          // superseded, revoked or expired one, and the app then clears it; otherwise the person
          // carries on, or the in-app session ends with the credential kept.
          await resumeOrEnd();
          return;
        }
        const currentExpiry = parseExpiry(useSessionStore.getState().accessTokenExpiresAtUtc);
        if (!currentExpiry || currentExpiry <= Date.now() + RETRY_DELAY_MS) {
          // Transient Security/network failure should not destroy an otherwise valid remembered
          // session merely because this short token could not be renewed in time.
          await resumeOrEnd();
          return;
        }
        schedule(RETRY_DELAY_MS);
      }
    };

    const expiry = parseExpiry(expiresAtUtc);
    if (!expiry) {
      terminateSession();
      return undefined;
    }
    schedule(expiry - Date.now() - RENEW_BEFORE_EXPIRY_MS);

    const onForeground = () => {
      if (document.visibilityState === 'visible') void maybeRenew();
    };
    window.addEventListener('focus', onForeground);
    document.addEventListener('visibilitychange', onForeground);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('focus', onForeground);
      document.removeEventListener('visibilitychange', onForeground);
    };
  }, [accessToken, expiresAtUtc, queryClient, signedIn]);

  return <SessionObservationBootstrap />;
}
