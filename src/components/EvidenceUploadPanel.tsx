import { useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';

import VerigenceButton from './VerigenceButton';
import { captureEvidencePhoto } from '../services/device/camera';

export default function EvidenceUploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<string>('No evidence selected');
  const isNative = Capacitor.isNativePlatform();

  const chooseFile = () => inputRef.current?.click();

  const takePhoto = async () => {
    const photo = await captureEvidencePhoto();
    setSelection(photo.webPath ?? `Captured ${photo.format.toUpperCase()} photo`);
  };

  return (
    <article className="upload-panel">
      <div className="upload-panel__icon" aria-hidden="true">↥</div>
      <div className="upload-panel__copy">
        <h2>Booking / journey evidence</h2>
        <p>
          Keep the original document or image intact. Verigence will pass evidence to Audit Core for
          downstream processing and review.
        </p>
        <span className="upload-panel__selection">{selection}</span>
      </div>

      <div className="upload-panel__actions">
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="image/*,.pdf"
          onChange={(event) => {
            const file = event.target.files?.[0];
            setSelection(file?.name ?? 'No evidence selected');
          }}
        />
        <VerigenceButton onClick={chooseFile}>Choose file</VerigenceButton>
        {isNative && (
          <VerigenceButton fill="outline" onClick={takePhoto}>
            Take photo
          </VerigenceButton>
        )}
      </div>
    </article>
  );
}
