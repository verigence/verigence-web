import { useQueries, useQuery } from '@tanstack/react-query';

import { getMyDay, type MyDay } from '../../services/audit-core/duties';
import { listMyOperationalProjects } from '../../services/audit-core/uc03';
import type { DutyProjectDay } from './dutiesFormat';

export const dutiesKeys = {
  myDay: (tenantId: string) => ['duties', 'my-day', tenantId] as const,
  team: (mode: string, tenantId: string, from: string, to: string) => ['duties', 'team', mode, tenantId, from, to] as const,
  definitions: (mode: string, tenantId: string) => ['duties', 'definitions', mode, tenantId] as const,
};

/**
 * Today's duty list of the signed-in person in every Project where they are a PC (product owner
 * 2026-11-18: "they should be able to see the list project wise"). A Project that has duties off, or
 * whose list cannot be read, simply has no entry: attendance never waits on it.
 */
export function useMyDuties(accessToken?: string): { days: DutyProjectDay[]; loading: boolean; refetch: () => Promise<DutyProjectDay[]> } {
  // The same list (and cache entry) the Dealership chooser reads.
  const projects = useQuery({
    queryKey: ['uc03-projects'],
    queryFn: () => listMyOperationalProjects(accessToken),
    enabled: Boolean(accessToken),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const mine = (projects.data ?? []).filter((p) => String(p.operatingRole ?? '').toUpperCase() === 'PC');
  const results = useQueries({
    queries: mine.map((p) => ({
      queryKey: dutiesKeys.myDay(p.tenantId),
      queryFn: () => getMyDay(p.tenantId, accessToken),
      enabled: Boolean(accessToken),
      retry: false,
      staleTime: 30_000,
    })),
  });
  const days: DutyProjectDay[] = [];
  mine.forEach((p, index) => {
    const day = results[index]?.data;
    if (day) days.push({ tenantId: p.tenantId, projectName: p.projectName, day });
  });
  const refetch = async (): Promise<DutyProjectDay[]> => {
    const fresh = await Promise.all(results.map((r) => r.refetch().then((x) => x.data as MyDay | undefined).catch(() => undefined)));
    const out: DutyProjectDay[] = [];
    mine.forEach((p, index) => {
      const day = fresh[index];
      if (day) out.push({ tenantId: p.tenantId, projectName: p.projectName, day });
    });
    return out;
  };
  return { days, loading: projects.isLoading || results.some((r) => r.isLoading), refetch };
}
