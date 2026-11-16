import { useCallback, useEffect, useState } from 'react';

import type { AttendanceToday } from '../../services/hr/attendance';
import {
  requestBackgroundLocation,
  requestUnrestrictedBattery,
  trackerAvailable,
  trackerStatus,
  type TrackerStatus,
} from '../../services/device/backgroundLocation';
import { useProjectContextStore } from '../../store/projectContextStore';
import { useSessionStore } from '../../store/sessionStore';
import { beginTracking, type BeginResult } from './attendanceTracking';
import { trackingPanelText } from './trackingText';

const REFRESH_MS = 30_000;

/**
 * On My attendance in the Android app: whether the phone is recording the
 * location (check-in to check-out, 2026-11-16) and the two phone settings that
 * keep it running. Nothing outside the Android app or when not checked in.
 */
export default function TrackingPanel({ today }: { today: AttendanceToday }) {
  if (!trackerAvailable()) return null;
  const checkedIn = Boolean(today.day?.checkIn);
  const checkedOut = Boolean(today.day?.checkOut);
  if (!checkedIn || checkedOut) return null;
  return <Panel />;
}

function Panel() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const [status, setStatus] = useState<TrackerStatus | null>(null);
  const [problem, setProblem] = useState<BeginResult | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => setStatus(await trackerStatus()), []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  if (!status) return null;
  const text = trackingPanelText(status, problem, Date.now());

  const startNow = async () => {
    if (!accessToken) return;
    setBusy(true);
    const result = await beginTracking(accessToken, tenantId);
    setProblem(result.started ? null : result);
    setBusy(false);
    await refresh();
  };

  return (
    <div className={`uc01-admin-message ${status.active ? 'uc01-admin-message--info' : 'uc01-admin-message--error'}`}
      role="status">
      <strong>{text.title}</strong>
      <p>{text.detail}</p>
      {!status.active && (
        <button type="button" className="uc01-admin-button" disabled={busy} onClick={() => void startNow()}>
          Start recording
        </button>
      )}
      {status.active && status.backgroundPermission === false && (
        <p>
          Set location for Verigence to <strong>Allow all the time</strong>, so recording carries on after the phone
          restarts.{' '}
          <button type="button" className="uc01-admin-button" onClick={async () => setStatus(await requestBackgroundLocation())}>
            Allow all the time
          </button>
        </p>
      )}
      {status.active && status.unrestrictedBattery === false && (
        <p>
          Some phones stop apps to save battery.{' '}
          <button type="button" className="uc01-admin-button" onClick={async () => setStatus(await requestUnrestrictedBattery())}>
            Keep Verigence running
          </button>
        </p>
      )}
    </div>
  );
}
