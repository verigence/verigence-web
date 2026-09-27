import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { getP2Events } from '../../../services/audit-core/uc03P2';

/**
 * Incremental Journey activity feed.
 *
 * - starts from the newest event (never replays history on each visit)
 * - polls quickly while work is in flight, slowly otherwise
 * - backs off on errors and, if the feed stays unavailable, refreshes the
 *   screen data directly so the PC never watches a frozen status
 */
export function useP2EventFeed({
  tenantId,
  journeyId,
  accessToken,
  active,
  queryKeys,
}: {
  tenantId?: string;
  journeyId: string;
  accessToken?: string;
  active: boolean;
  queryKeys: unknown[][];
}): { lastEventAt?: string; degraded: boolean } {
  const queryClient = useQueryClient();
  const cursor = useRef<number | null>(null);
  const failures = useRef(0);
  const [lastEventAt, setLastEventAt] = useState<string>();
  const [degraded, setDegraded] = useState(false);
  const keysRef = useRef(queryKeys);
  keysRef.current = queryKeys;

  useEffect(() => {
    if (!tenantId || !journeyId || !accessToken) return undefined;
    let cancelled = false;
    let timer: number | undefined;

    const refresh = () => keysRef.current.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey }));

    const tick = async () => {
      try {
        if (cursor.current === null) {
          const head = await getP2Events(tenantId, journeyId, 0, accessToken, { latest: true, limit: 1 });
          cursor.current = Number(head.cursor ?? head.events[0]?.event_id ?? 0);
        } else {
          const response = await getP2Events(tenantId, journeyId, cursor.current, accessToken);
          if (response.events.length) {
            cursor.current = Math.max(cursor.current, ...response.events.map((event) => Number(event.event_id)));
            setLastEventAt(response.events[response.events.length - 1]?.created_at_utc);
            refresh();
          }
        }
        failures.current = 0;
        setDegraded(false);
      } catch {
        failures.current += 1;
        if (failures.current >= 3) {
          setDegraded(true);
          refresh();
        }
      }
      if (cancelled) return;
      const base = active ? 1_500 : 10_000;
      const delay = Math.min(15_000, base * 2 ** Math.min(failures.current, 3));
      timer = window.setTimeout(() => void tick(), delay);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [accessToken, active, journeyId, queryClient, tenantId]);

  return { lastEventAt, degraded };
}
