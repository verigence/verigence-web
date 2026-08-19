import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export interface VerigenceLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  source: 'browser' | 'native';
}

export async function getCurrentLocation(): Promise<VerigenceLocation> {
  if (Capacitor.isNativePlatform()) {
    const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      source: 'native',
    };
  }

  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported by this browser.');
  }

  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true });
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    source: 'browser',
  };
}
