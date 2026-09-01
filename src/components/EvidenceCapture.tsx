import { useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';

import { runtimeConfig } from '../services/runtime';
import { uploadEvidence } from '../services/audit-core/operations';
import { useSessionStore } from '../store/sessionStore';
import { captureEvidencePhoto } from '../services/device/camera';
import VerigenceButton from './VerigenceButton';

export default function EvidenceCapture({ journeyId, onUploaded }: { journeyId: string; onUploaded?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const accessToken = useSessionStore((s) => s.accessToken);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const processFile = async (file: File) => {
    setBusy(true);
    setMessage('');
    try {
      await uploadEvidence(runtimeConfig.tenantId, journeyId, file, 'JOURNEY_EVIDENCE', undefined, undefined, accessToken);
      setMessage('Evidence uploaded successfully.');
      onUploaded?.();
    } catch {
      setMessage("We couldn't upload this file. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    if (busy) return;
    setMessage('');
    let objectUrl: string | undefined;
    try {
      const photo = await captureEvidencePhoto();
      if (!photo.webPath) {
        setMessage("We couldn't use this photo. Please try again.");
        return;
      }
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      // Create an object URL to read the blob as a File, then revoke immediately
      // after construction to prevent the ~16 MB buffer from leaking.
      objectUrl = URL.createObjectURL(blob);
      const extension = photo.format || 'jpeg';
      const file = new File([blob], `evidence-${Date.now()}.${extension}`, {
        type: blob.type || `image/${extension === 'jpg' ? 'jpeg' : extension}`,
      });
      URL.revokeObjectURL(objectUrl);
      objectUrl = undefined;
      await processFile(file);
    } catch {
      setMessage("We couldn't capture this photo. Please try again.");
    } finally {
      // Safety net: revoke if an error was thrown after URL creation
      if (objectUrl !== undefined) {
        URL.revokeObjectURL(objectUrl);
      }
    }
  };

  return (
    <div className="evidence-capture">
      <input ref={inputRef} className="visually-hidden" type="file" accept="image/*,.pdf" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void processFile(file);
      }} />
      <div>
        <strong>Add Evidence</strong>
        <span>Add a booking docket, receipt, cover note, screenshot, invoice, registration document or delivery evidence.</span>
      </div>
      <div className="evidence-capture__actions">
        <VerigenceButton disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? 'Uploading\u2026' : 'Choose File'}</VerigenceButton>
        {Capacitor.isNativePlatform() && <VerigenceButton fill="outline" disabled={busy} onClick={takePhoto}>Take Photo</VerigenceButton>}
      </div>
      {message && <small className="evidence-capture__message">{message}</small>}
    </div>
  );
}
