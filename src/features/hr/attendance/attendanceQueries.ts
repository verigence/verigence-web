import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { fetchAttendancePhoto, type AttendanceEvent } from '../../../services/hr/attendance';
import { useSessionStore } from '../../../store/sessionStore';

export const attendanceKeys = {
  all: ['hr', 'attendance'] as const,
  today: ['hr', 'attendance', 'today'] as const,
  mine: (month: string) => ['hr', 'attendance', 'me', month] as const,
  team: (month: string) => ['hr', 'attendance', 'team', month] as const,
  employee: (id: string, month: string) => ['hr', 'attendance', 'employee', id, month] as const,
  photo: (attendanceId: string, event: AttendanceEvent) => ['hr', 'attendance', 'photo', attendanceId, event] as const,
};

/** The stamped photo as a blob (it needs the caller's token, so it cannot be a plain image link). */
export function useAttendancePhoto(attendanceId: string, event: AttendanceEvent, enabled: boolean) {
  const accessToken = useSessionStore((state) => state.accessToken);
  return useQuery({
    queryKey: attendanceKeys.photo(attendanceId, event),
    queryFn: () => fetchAttendancePhoto(accessToken!, attendanceId, event),
    enabled: Boolean(accessToken) && enabled,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** An object URL for a blob, released when the blob changes or the component goes away. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return undefined;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}
