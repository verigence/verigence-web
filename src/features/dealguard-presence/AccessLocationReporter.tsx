import { useEffect } from 'react';

import { postAccessLocation } from '../../services/audit-core/accessLocations';
import { useProjectContextStore } from '../../store/projectContextStore';
import { useSessionStore } from '../../store/sessionStore';
import { readLocation } from './DealGuardPresence';

const WATCHED = new Set(['PC', 'TL', 'PM']);
// Until the end of 22 Nov 2026 (IST). Audit Core stops recording then too.
const WATCH_UNTIL_MS = Date.parse('2026-11-23T00:00:00+05:30');
const noted = new Set<string>();

/**
 * Notes where a PC, TL or PM opens Verigence from: once per sign-in and once per resume, for the
 * Project they are in (product owner 2026-11-06; read by SuperAdmin and Executive only). Silent and
 * fail-open: nothing is shown, and a failure never gets in the way of work.
 */
export default function AccessLocationReporter() {
  const accessEpoch = useSessionStore((s) => s.accessEpoch);
  const accessKind = useSessionStore((s) => s.accessKind);
  const accessToken = useSessionStore((s) => s.accessToken);
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const operatingRole = String(useProjectContextStore((s) => s.selectedProject?.operatingRole) ?? '').toUpperCase();

  useEffect(() => {
    if (!accessEpoch || !accessToken || !tenantId || !WATCHED.has(operatingRole)) return;
    if (Date.now() >= WATCH_UNTIL_MS) return;
    const key = `${accessEpoch}:${tenantId}`;
    if (noted.has(key)) return;
    noted.add(key);
    void (async () => {
      try {
        const reading = await readLocation();
        await postAccessLocation(tenantId, {
          kind: accessKind,
          outcome: reading.outcome,
          latitude: reading.latitude ?? undefined,
          longitude: reading.longitude ?? undefined,
          accuracyM: reading.accuracyM ?? undefined,
          capturedAt: reading.capturedAt,
          source: reading.source,
          deviceType: reading.deviceType,
        }, useSessionStore.getState().accessToken ?? accessToken);
      } catch {
        // Observation only.
      }
    })();
  }, [accessEpoch, accessKind, accessToken, operatingRole, tenantId]);

  return null;
}
