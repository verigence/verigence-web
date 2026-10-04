import { useRef, useState } from 'react';

import { hrErrorMessage } from '../../services/hr/client';
import { preparePhoto } from './photo';

interface Props {
  label: string;
  busy?: boolean;
  onPick: (photo: { blob: Blob; name: string }) => Promise<void> | void;
}

/** Chooses a profile photo from the device. (Attendance photos are a separate, camera-only flow.) */
export default function PhotoPicker({ label, busy = false, onPick }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setWorking(true);
    try {
      await onPick(await preparePhoto(file));
    } catch (problem) {
      setError(hrErrorMessage(problem));
    } finally {
      setWorking(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="hr-photo-picker">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hr-visually-hidden"
        aria-label={label}
        onChange={(event) => void handle(event.target.files?.[0])}
      />
      <button
        type="button"
        className="uc01-admin-button uc01-admin-button--compact"
        disabled={busy || working}
        onClick={() => input.current?.click()}
      >
        {busy || working ? 'Uploading…' : label}
      </button>
      {error && <span className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</span>}
    </div>
  );
}
