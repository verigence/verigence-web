import type { LocationProblem } from './attendanceFormat';

/** Attendance photos come from a live camera stream only: no file input anywhere (DESIGN section 17). */
export function cameraSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function startCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 960 } },
    audio: false,
  });
}

export function stopCamera(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

const MAX_SIDE = 1280;

/** Draws the current video frame to a JPEG. The server stamps and re-encodes it. */
export async function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new Error('The camera is not ready yet.');
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The photo could not be taken. Try again.');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('The photo could not be taken. Try again.');
  return blob;
}

export interface GeoFix {
  latitude: number;
  longitude: number;
  accuracyM: number;
  /** Device clock, ms since epoch, when the position was measured. */
  measuredAt: number;
}

export class LocationError extends Error {
  readonly problem: LocationProblem;

  constructor(problem: LocationProblem) {
    super(problem);
    this.name = 'LocationError';
    this.problem = problem;
  }
}

/** One high-accuracy fix, never from the cache. */
export function locate(): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new LocationError('UNSUPPORTED'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy,
          measuredAt: position.timestamp || Date.now(),
        }),
      (error) => reject(new LocationError(error.code === 1 ? 'DENIED' : error.code === 3 ? 'TIMEOUT' : 'UNAVAILABLE')),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}

/** Seconds since the fix, as the server's `position_age_s`. Never negative. */
export function fixAgeSeconds(fix: GeoFix, now: number = Date.now()): number {
  return Math.max(0, Math.round(((now - fix.measuredAt) / 1000) * 10) / 10);
}
