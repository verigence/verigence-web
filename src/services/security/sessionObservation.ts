import type { VerigenceDeviceContext } from '../device/identity';
import { securityEndpoint, securityFetch } from './auth';

export type GeoObservationStatus = 'PENDING' | 'AVAILABLE' | 'DENIED' | 'UNAVAILABLE' | 'TIMEOUT';

export interface GeoObservation {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  capturedAt: string;
  source: 'BROWSER' | 'NATIVE';
}

export interface SessionObservationResponse {
  observationMode: 'OBSERVE';
  previousSessionSuperseded: boolean;
  previousSessionDifferentDevice: boolean;
  activeDeviceCount: number;
  deviceLimit: number;
  deviceLimitExceeded: boolean;
  geoRecorded: boolean;
}

export async function observeHumanSession(
  accessToken: string,
  device: VerigenceDeviceContext,
  geoStatus: GeoObservationStatus = 'PENDING',
  geo?: GeoObservation,
): Promise<SessionObservationResponse> {
  const { response } = await securityFetch(
    securityEndpoint('/security/v1/auth/session-observation'),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deviceType: device.deviceType,
        platform: device.platform,
        deviceName: device.deviceName,
        deviceModel: device.deviceModel,
        osVersion: device.osVersion,
        browserName: device.browserName,
        browserVersion: device.browserVersion,
        appVersion: device.appVersion,
        geoStatus,
        geo,
      }),
      cache: 'no-store',
      keepalive: true,
    },
  );

  if (!response.ok) {
    throw new Error(`Security observation failed with HTTP ${response.status}`);
  }
  return response.json() as Promise<SessionObservationResponse>;
}
