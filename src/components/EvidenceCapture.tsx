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
    const photo = await captureEvidencePhoto();
    setMessage(photo.webPath ? 'Photo captured.' : 'Photo captured.');
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
        <VerigenceButton disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? 'Uploading…' : 'Choose File'}</VerigenceButton>
        {Capacitor.isNativePlatform() && <VerigenceButton fill="outline" onClick={takePhoto}>Take Photo</VerigenceButton>}
      </div>
      {message && <small className="evidence-capture__message">{message}</small>}
    </div>
  );
}
