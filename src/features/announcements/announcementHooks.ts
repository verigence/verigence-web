import { useQuery } from '@tanstack/react-query';

import { getMaintenance, getMyAnnouncement } from '../../services/security/announcements';
import { useSessionStore } from '../../store/sessionStore';

export const announcementKeys = {
  maintenance: ['security', 'maintenance'] as const,
  mine: (who: string) => ['security', 'announcement', 'me', who] as const,
  admin: ['security', 'announcements', 'admin'] as const,
  settings: ['security', 'announcements', 'settings'] as const,
};

const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

/**
 * The public maintenance notice. Checked every 5 minutes while the tab is visible and when the window
 * regains focus (at most once a minute). A failed check is treated as "no maintenance": unknown means open.
 */
export function useMaintenance() {
  const query = useQuery({
    queryKey: announcementKeys.maintenance,
    queryFn: getMaintenance,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: () => (visible() ? 5 * 60_000 : false),
  });
  return {
    maintenance: query.isError ? null : (query.data ?? null),
    check: () => query.refetch(),
    checking: query.isFetching,
  };
}

/** The one message for this person: asked for at app start and every 30 minutes, never on focus. */
export function useMyAnnouncement(enabled: boolean) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const who = useSessionStore((state) => state.email);
  const query = useQuery({
    queryKey: announcementKeys.mine(who),
    queryFn: () => getMyAnnouncement(accessToken!),
    enabled: enabled && Boolean(accessToken),
    retry: false,
    staleTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: () => (visible() ? 30 * 60_000 : false),
  });
  return query.isError ? null : (query.data ?? null);
}
