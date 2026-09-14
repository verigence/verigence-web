import {
  DocumentScanner,
  GoogleDocumentScannerModuleInstallState,
  type GoogleDocumentScannerModuleInstallProgressEvent,
} from '@capacitor-mlkit/document-scanner';
import { Script, TextRecognition } from '@capacitor-mlkit/text-recognition';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';

export interface ScannerPreparationProgress {
  state: GoogleDocumentScannerModuleInstallState;
  progress?: number;
}

export function mobileDocumentScannerEligible(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function ensureGoogleDocumentScanner(
  onProgress?: (event: ScannerPreparationProgress) => void,
): Promise<void> {
  if (!mobileDocumentScannerEligible()) throw new Error('Document scanning is available only in the Android app.');
  const availability = await DocumentScanner.isGoogleDocumentScannerModuleAvailable();
  if (availability.available) return;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer: number | undefined;
    let listener: PluginListenerHandle | undefined;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      void listener?.remove();
      if (error) reject(error);
      else resolve();
    };

    void (async () => {
      try {
        listener = await DocumentScanner.addListener(
          'googleDocumentScannerModuleInstallProgress',
          (event: GoogleDocumentScannerModuleInstallProgressEvent) => {
            onProgress?.(event);
            if (event.state === GoogleDocumentScannerModuleInstallState.COMPLETED) finish();
            if (
              event.state === GoogleDocumentScannerModuleInstallState.FAILED
              || event.state === GoogleDocumentScannerModuleInstallState.CANCELED
            ) finish(new Error('Google document scanner setup could not be completed.'));
          },
        );

        timer = window.setTimeout(() => finish(new Error('Google document scanner setup timed out.')), 90_000);
        try {
          await DocumentScanner.installGoogleDocumentScannerModule();
          // Some devices complete between the availability check and listener
          // delivery. Re-check once the install request itself was accepted.
          const installed = await DocumentScanner.isGoogleDocumentScannerModuleAvailable();
          if (installed.available) finish();
        } catch (cause) {
          const installed = await DocumentScanner.isGoogleDocumentScannerModuleAvailable().catch(() => ({ available: false }));
          if (installed.available) finish();
          else finish(cause instanceof Error ? cause : new Error('Google document scanner setup failed.'));
        }
      } catch (cause) {
        finish(cause instanceof Error ? cause : new Error('Google document scanner setup failed.'));
      }
    })();
  });
}

export async function scanDocumentPageUris(pageLimit = 20): Promise<string[]> {
  if (!mobileDocumentScannerEligible()) throw new Error('Document scanning is available only in the Android app.');
  const result = await DocumentScanner.scanDocument({
    galleryImportAllowed: false,
    pageLimit,
    resultFormats: 'JPEG',
    scannerMode: 'FULL',
  });
  return result.scannedImages ?? [];
}

export async function recognizeContinuationText(path: string): Promise<string> {
  if (!path) return '';
  try {
    const result = await TextRecognition.processImage({ path, script: Script.Latin });
    return result.text || '';
  } catch {
    // OCR is advisory only. A handwritten or otherwise valid page must never
    // fail capture because continuation OCR could not read it.
    return '';
  }
}

export function scannerErrorWasCancellation(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause ?? '');
  return /cancel/i.test(message);
}
