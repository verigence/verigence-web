import { useQuery } from '@tanstack/react-query';

import { getMyFeatures, type FeaturePerson, type FeatureKey, type MyFeatures } from '../../services/security/features';
import { useSessionStore } from '../../store/sessionStore';

export const featureKeys = {
  mine: ['security', 'features', 'me'] as const,
  admin: ['security', 'features', 'admin'] as const,
};

/**
 * Which switchable features are on for the signed-in person. `features` is undefined while loading
 * and when the request failed, which hides the gated groups rather than flashing them.
 */
export function useMyFeatures(): { features: MyFeatures['features'] | undefined } {
  const accessToken = useSessionStore((state) => state.accessToken);
  const query = useQuery({
    queryKey: featureKeys.mine,
    queryFn: () => getMyFeatures(accessToken!),
    enabled: Boolean(accessToken),
    retry: false,
    staleTime: 3 * 60_000,
  });
  return { features: query.isSuccess ? query.data.features : undefined };
}

/** Nav group key to the feature that has to be on for it to show. The old "workspace" group is retired. */
const GATED: Record<string, FeatureKey> = { phase2: 'AUDIT', insights: 'ANALYTICS' };
const RETIRED = new Set(['workspace']);

/** The groups to draw: no retired group, and Audit / Analytics only when their feature is on (unknown means off). */
export function visibleNavGroups<T extends { key: string }>(groups: T[], features: MyFeatures['features'] | undefined): T[] {
  return groups.filter((group) => {
    if (RETIRED.has(group.key)) return false;
    const gate = GATED[group.key];
    return !gate || features?.[gate] === true;
  });
}

/** Active people who do not yet have their own setting for a feature, A to Z. */
export function addablePeople<U extends { userId: string; displayName: string; status: string }>(users: U[], listed: FeaturePerson[]): U[] {
  const taken = new Set(listed.map((p) => p.userId));
  return users
    .filter((u) => u.status.toUpperCase() === 'ACTIVE' && !taken.has(u.userId))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
