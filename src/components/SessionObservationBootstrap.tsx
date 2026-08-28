import { useEffect, useState } from 'react';
import { IonToast } from '@ionic/react';

import { getVerigenceDeviceContext } from '../services/device/identity';
import { getCurrentLocation } from '../services/device/location';
import {
  observeHumanSession,
  type GeoObservationStatus,
} from '../services/security/sessionObservation';
import { useSessionStore } from '../store/sessionStore';

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
    if (!signedIn || !securitySessionId) return undefined;

    let cancelled = false;
    let locationTimer: number | undefined;
    const device = getVerigenceDeviceContext();

    const currentToken = () => useSessionStore.getState().accessToken;

    const observeLocation = async () => {
      if (cancelled) return;
      let status: GeoObservationStatus = 'UNAVAILABLE';
      try {
        const location = await getCurrentLocation();
        if (cancelled) return;
        status = 'AVAILABLE';
        const token = currentToken();
        if (!token) return;
        await observeHumanSession(token, device, status, {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracyMeters: location.accuracy ?? undefined,
          capturedAt: new Date().toISOString(),
          source: location.source === 'native' ? 'NATIVE' : 'BROWSER',
        });
      } catch (error) {
        if (cancelled) return;
        status = locationFailureStatus(error);
        const token = currentToken();
        if (!token) return;
        // Observation mode: record the failure state if possible, but never surface it as an
        // application/login failure and never block operational navigation.
        void observeHumanSession(token, device, status).catch(() => undefined);
      }
    };

    const registerSession = async () => {
      const token = currentToken();
      if (!token || cancelled) return;
      try {
        const result = await observeHumanSession(token, device, 'PENDING');
        if (!cancelled && result.previousSessionDifferentDevice) {
          setNotice(
            "You're already signed in on another device. Your previous session will end automatically soon.",
          );
        }
      } catch {
        // Observation is explicitly fail-open in this release. A later geo call is idempotent and
        // gets another chance to create the observation session.
      }

      // Location is intentionally later than the session registration so the first Work Queue
      // request keeps network/CPU priority. The GPS request and its Security write are not awaited
      // by login, project context, or dashboard rendering.
      if (!cancelled) {
        locationTimer = window.setTimeout(() => void observeLocation(), 5000);
      }
    };

    const registrationTimer = window.setTimeout(() => void registerSession(), 0);
    return () => {
      cancelled = true;
      window.clearTimeout(registrationTimer);
      if (locationTimer !== undefined) window.clearTimeout(locationTimer);
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
