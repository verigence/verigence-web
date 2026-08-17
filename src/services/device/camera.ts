import { Camera, CameraResultType, CameraSource, type Photo } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export async function captureEvidencePhoto(): Promise<Photo> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Native camera capture is available only in Capacitor builds.');
  }

  return Camera.getPhoto({
    source: CameraSource.Camera,
    resultType: CameraResultType.Uri,
    quality: 85,
    correctOrientation: true,
  });
}
