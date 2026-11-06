import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getMyNightControl, type MyNightControl, type MyNightFeature, type NightFeatureKey } from '../../services/security/nightControl';
import { NIGHT_MODE_MESSAGE } from '../../services/nightMode';
import { useSessionStore } from '../../store/sessionStore';

export const JOURNEY_360: NightFeatureKey = 'JOURNEY_360';
export const FILE_DOWNLOAD: NightFeatureKey = 'FILE_DOWNLOAD';

export const nightControlKeys = {
  mine: ['security', 'night-control', 'me'] as const,
  admin: ['security', 'night-control', 'admin'] as const,
};

const FIVE_MINUTES = 5 * 60_000;
const MIN_REFETCH = 15_000;
/** Read again a little after a start or end time, so the screen changes within seconds of it. */
const AFTER_BOUNDARY = 5_000;
const IST_OFFSET_MINUTES = 330;

/** A feature's row, or undefined when Security does not know the feature (never blocked). */
export function nightFeature(data: MyNightControl | undefined, key: NightFeatureKey): MyNightFeature | undefined {
  return data?.features?.find((f) => f.featureKey === key);
}

/** Whether the feature is blocked for this person now. No data (loading, failed, unknown feature) is not blocked. */
export function isNightBlocked(data: MyNightControl | undefined, key: NightFeatureKey): boolean {
  return nightFeature(data, key)?.blocked === true;
}

/** "20:00" to minutes after midnight; undefined when it is not HH:MM. */
export function parseHhMm(value: string | undefined | null): number | undefined {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value?.trim() ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
}

/** Minutes after midnight India time for an instant (IST has no daylight saving). */
export function istMinuteOfDay(now: Date): number {
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (utcMinutes + IST_OFFSET_MINUTES) % 1440;
}

/**
 * Milliseconds from `now` to the nearest start or end time of an enabled feature, India time. Undefined
 * when there is none. Used only to ask Security again on time; Security still decides.
 */
export function msUntilNextBoundary(features: Array<Pick<MyNightFeature, 'enabled' | 'startsAt' | 'endsAt'>>, now: Date): number | undefined {
  const minuteNow = istMinuteOfDay(now);
  const intoMinute = now.getUTCSeconds() * 1000 + now.getUTCMilliseconds();
  let best: number | undefined;
  for (const f of features) {
    if (!f.enabled) continue;
    for (const boundary of [parseHhMm(f.startsAt), parseHhMm(f.endsAt)]) {
      if (boundary === undefined) continue;
      let minutes = (boundary - minuteNow + 1440) % 1440;
      if (minutes === 0 && intoMinute > 0) minutes = 1440;
      const ms = minutes * 60_000 - intoMinute;
      if (best === undefined || ms < best) best = ms;
    }
  }
  return best;
}

/** Every 5 minutes, or sooner when a start or end time comes first. */
export function nightRefetchInterval(data: MyNightControl | undefined, now: Date = new Date()): number {
  const next = data?.features ? msUntilNextBoundary(data.features, now) : undefined;
  if (next === undefined) return FIVE_MINUTES;
  return Math.max(MIN_REFETCH, Math.min(FIVE_MINUTES, next + AFTER_BOUNDARY));
}

export interface NightControlState {
  data: MyNightControl | undefined;
  status: 'loading' | 'ready' | 'error';
  message: string;
  isBlocked: (key: NightFeatureKey) => boolean;
}

/**
 * The signed-in person's night state, read every 5 minutes, on window focus and right after a start or
 * end time. A failure leaves nothing blocked: Security and the services still refuse on their own.
 */
export function useNightControl(): NightControlState {
  const accessToken = useSessionStore((state) => state.accessToken);
  const query = useQuery({
    queryKey: nightControlKeys.mine,
    queryFn: () => getMyNightControl(accessToken!),
    enabled: Boolean(accessToken),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => nightRefetchInterval(q.state.data),
    refetchIntervalInBackground: false,
  });
  const data = query.isError ? undefined : query.data;
  const isBlocked = useCallback((key: NightFeatureKey) => isNightBlocked(data, key), [data]);
  return {
    data,
    status: query.isSuccess ? 'ready' : query.isError || !accessToken ? 'error' : 'loading',
    message: data?.message || NIGHT_MODE_MESSAGE,
    isBlocked,
  };
}
