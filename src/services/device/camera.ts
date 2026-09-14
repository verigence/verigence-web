import { Camera, CameraResultType, CameraSource, type Photo } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

/**
 * Basic-camera fallback for handsets where Google ML Kit Document Scanner is
 * unavailable. The scanner remains the primary path. Keep fallback captures
 * bounded so low-cost devices do not produce oversized 12/48 MP evidence.
 */
export async function captureEvidencePhoto(): Promise<Photo> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Native camera capture is available only in Capacitor builds.');
  }

  return Camera.getPhoto({
    source: CameraSource.Camera,
    resultType: CameraResultType.Uri,
    quality: 85,
    width: 2400,
    height: 2400,
    correctOrientation: true,
    saveToGallery: false,
  });
}
