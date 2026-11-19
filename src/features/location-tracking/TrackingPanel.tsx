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
import { trackingAsk } from './trackingText';

const REFRESH_MS = 30_000;

/**
 * On My attendance in the Android app, between check-in and check-out: the one phone setting the
 * person is asked for, in one line (product owner, 19 Nov 2026: no strong wording, no hours, "just
 * ask them to allow all time"). Nothing when the phone is set up, outside the Android app or when
 * not checked in.
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
  const ask = trackingAsk(status, problem);

  const startNow = async () => {
    if (!accessToken) return;
    setBusy(true);
    const result = await beginTracking(accessToken, tenantId);
    setProblem(result.started ? null : result);
    setBusy(false);
    await refresh();
  };

  if (!ask) return null;
  return (
    <div className="uc01-admin-message uc01-admin-message--info hr-att-location-ask" role="status">
      <span>{ask.text}</span>
      {ask.kind === 'ALLOW_ALWAYS' && (
        <button type="button" className="uc01-admin-button" onClick={async () => setStatus(await requestBackgroundLocation())}>
          Allow all the time
        </button>
      )}
      {ask.kind === 'KEEP_RUNNING' && (
        <button type="button" className="uc01-admin-button" onClick={async () => setStatus(await requestUnrestrictedBattery())}>
          Keep running
        </button>
      )}
      {ask.kind === 'TURN_ON' && (
        <button type="button" className="uc01-admin-button" disabled={busy} onClick={() => void startNow()}>
          Turn on
        </button>
      )}
    </div>
  );
}
