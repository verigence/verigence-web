import { useEffect, useState } from 'react';
import { IonToast } from '@ionic/react';

import { getVerigenceDeviceContext } from '../services/device/identity';
import { getCurrentLocation } from '../services/device/location';
import {
  observeHumanSession,
  type GeoObservationStatus,
} from '../services/security/sessionObservation';
import { useSessionStore } from '../store/sessionStore';

const observedSecuritySessions = new Set<string>();
const observationInFlight = new Map<string, Promise<Awaited<ReturnType<typeof observeHumanSession>> | undefined>>();

function locationFailureStatus(error: unknown): GeoObservationStatus {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;
  if (code === 1 || code === 'PERMISSION_DENIED') return 'DENIED';
  if (code === 3 || code === 'TIMEOUT') return 'TIMEOUT';
  return 'UNAVAILABLE';
}

export default function SessionObservationBootstrap() {
  const signedIn = useSessionStore((state) => state.signedIn);
  const securitySessionId = useSessionStore((state) => state.securitySessionId);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!signedIn || !securitySessionId || observedSecuritySessions.has(securitySessionId)) {
      return undefined;
    }

    let cancelled = false;
    const device = getVerigenceDeviceContext();

    const observeOnce = async () => {
      const existing = observationInFlight.get(securitySessionId);
      if (existing) return existing;

      const request = (async () => {
        let status: GeoObservationStatus = 'UNAVAILABLE';
        let geo: Parameters<typeof observeHumanSession>[3];

        try {
          const location = await getCurrentLocation();
          status = 'AVAILABLE';
          geo = {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracyMeters: location.accuracy ?? undefined,
            capturedAt: new Date().toISOString(),
            source: location.source === 'native' ? 'NATIVE' : 'BROWSER',
          };
        } catch (error) {
          status = locationFailureStatus(error);
        }

        const token = useSessionStore.getState().accessToken;
        if (!token) return undefined;

        try {
          const result = await observeHumanSession(token, device, status, geo);
          observedSecuritySessions.add(securitySessionId);
          return result;
        } catch {
          // Observation is deliberately fail-open. Do not block the user or create a retry loop.
          return undefined;
        } finally {
          observationInFlight.delete(securitySessionId);
        }
      })();

      observationInFlight.set(securitySessionId, request);
      return request;
    };

    // Keep authentication and the primary Work Queue request on the critical path.
    // Security observation runs once, shortly after sign-in, with the final location
    // result (AVAILABLE / DENIED / UNAVAILABLE / TIMEOUT) instead of first sending
    // PENDING and then writing a second observation.
    const timer = window.setTimeout(() => {
      void observeOnce().then((result) => {
        if (!cancelled && result?.previousSessionDifferentDevice) {
          setNotice(
            "You're already signed in on another device. Your previous session will end automatically soon.",
          );
        }
      });
    }, 5000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [securitySessionId, signedIn]);

  return (
    <IonToast
      isOpen={Boolean(notice)}
      message={notice}
      duration={7000}
      position="top"
      onDidDismiss={() => setNotice('')}
    />
  );
}
