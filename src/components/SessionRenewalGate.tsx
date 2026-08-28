import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { resetOperationalContext } from '../features/uc03/projectContext';
import { refreshHuman, SecurityLoginError } from '../services/security/auth';
import { useSessionStore } from '../store/sessionStore';
import SessionObservationBootstrap from './SessionObservationBootstrap';

const RENEW_BEFORE_EXPIRY_MS = 2 * 60 * 1000;
const RETRY_DELAY_MS = 30 * 1000;
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

    const terminateSession = () => {
      resetOperationalContext(queryClient);
      useSessionStore.getState().signOut();
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
        terminateSession();
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
        if (error instanceof SecurityLoginError && [401, 403].includes(error.status)) {
          terminateSession();
          return;
        }
        const currentExpiry = parseExpiry(useSessionStore.getState().accessTokenExpiresAtUtc);
        if (!currentExpiry || currentExpiry <= Date.now() + RETRY_DELAY_MS) {
          terminateSession();
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
