import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getAttendanceToday } from '../../services/hr/attendance';
import { trackerAvailable } from '../../services/device/backgroundLocation';
import { useProjectContextStore } from '../../store/projectContextStore';
import { useSessionStore } from '../../store/sessionStore';
import { attendanceKeys } from '../hr/attendance/attendanceQueries';
import { useHrAccess } from '../hr/hrQueries';
import { syncTracking } from './attendanceTracking';

/**
 * Keeps the phone's location tracking in step with today's attendance whenever
 * the Android app is opened or brought back (product owner, 2026-11-16): checked
 * in and not out -> tracking runs; checked out -> it stops. Renders nothing, and
 * does nothing outside the Android app.
 */
export default function AttendanceTrackingSync() {
  return trackerAvailable() ? <Sync /> : null;
}

function Sync() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const access = useHrAccess();
  const queryClient = useQueryClient();
  const today = useQuery({
    queryKey: attendanceKeys.today,
    queryFn: () => getAttendanceToday(accessToken!),
    enabled: Boolean(accessToken) && access.isEmployee,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!accessToken || !today.data) return;
    void syncTracking(accessToken, today.data, tenantId);
  }, [accessToken, today.data, tenantId]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void queryClient.invalidateQueries({ queryKey: attendanceKeys.today });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [queryClient]);

  return null;
}
