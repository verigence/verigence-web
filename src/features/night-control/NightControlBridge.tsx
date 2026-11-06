import { useEffect, useState } from 'react';

import { NIGHT_MODE_MESSAGE } from '../../services/nightMode';
import { FILE_DOWNLOAD, useNightControl } from './nightControl';
import { NIGHT_MODE_EVENT, ensureDownloadGuard, setFileDownloadBlocked } from './downloadGuard';
import '../../styles/night-control.css';

const SHOW_FOR_MS = 4_000;

/**
 * Mounted once in App: keeps the download guard in step with Security's answer for the signed-in person
 * and shows the small "Night Mode On" notification when a download is stopped.
 */
export default function NightControlBridge() {
  const night = useNightControl();
  const blocked = night.isBlocked(FILE_DOWNLOAD);
  const [shownAt, setShownAt] = useState<number | null>(null);

  useEffect(() => {
    ensureDownloadGuard();
  }, []);

  useEffect(() => {
    setFileDownloadBlocked(blocked);
  }, [blocked]);

  useEffect(() => {
    const onNight = () => setShownAt(Date.now());
    window.addEventListener(NIGHT_MODE_EVENT, onNight);
    return () => window.removeEventListener(NIGHT_MODE_EVENT, onNight);
  }, []);

  useEffect(() => {
    if (shownAt === null) return undefined;
    const timer = window.setTimeout(() => setShownAt(null), SHOW_FOR_MS);
    return () => window.clearTimeout(timer);
  }, [shownAt]);

  if (shownAt === null) return null;
  return (
    <div className="night-toast" role="status" aria-live="polite">
      <MoonIcon />
      <div className="night-toast__text">
        <strong>{night.message || NIGHT_MODE_MESSAGE}</strong>
        <span>Downloads are closed now. Ask SuperAdmin if you need access.</span>
      </div>
      <button type="button" className="night-toast__close" aria-label="Close" onClick={() => setShownAt(null)}>×</button>
    </div>
  );
}

export function MoonIcon({ size = 20 }: { size?: number }) {
  return (
    <svg className="night-icon" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M13.5 5.41A15.08 15.08 0 0 0 25.1 23.61a11.11 11.11 0 0 1-7.98 3.39h-.42A11.09 11.09 0 0 1 13.5 5.41M14.98 3a1 1 0 0 0-.17.02A13.1 13.1 0 0 0 16.63 29h.49a13.07 13.07 0 0 0 10.7-5.56 1.01 1.01 0 0 0-.78-1.56A13.08 13.08 0 0 1 15.89 4.38 1.01 1.01 0 0 0 14.98 3Z" />
    </svg>
  );
}
