import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export interface FreshAttendanceLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
  source: 'browser' | 'native';
}

const LOCATION_TIMEOUT_MS = 12_000;

/**
 * Capture fresh location evidence only for an explicit attendance action.
 *
 * This is deliberately separate from Verigence's shared device/location helper so
 * Attendance can require zero cache age and a bounded timeout without changing any
 * existing Booking, Delivery, Review or other business-flow behaviour.
 */
export async function getFreshAttendanceLocation(): Promise<FreshAttendanceLocation> {
  if (Capacitor.isNativePlatform()) {
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: LOCATION_TIMEOUT_MS,
    });
    if (!Number.isFinite(position.coords.accuracy)) {
      throw new Error('Location accuracy is unavailable. Please retry location capture.');
    }
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyMeters: position.coords.accuracy,
      capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
      source: 'native',
    };
  }

  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported by this browser.');
  }

  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: LOCATION_TIMEOUT_MS,
    });
  });
  if (!Number.isFinite(position.coords.accuracy)) {
    throw new Error('Location accuracy is unavailable. Please retry location capture.');
  }

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: position.coords.accuracy,
    capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
    source: 'browser',
  };
}
