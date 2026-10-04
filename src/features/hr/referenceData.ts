import { useQuery } from '@tanstack/react-query';

import { getDegrees, getDesignations, getStates } from '../../services/hr/employees';
import { useSessionStore } from '../../store/sessionStore';
import { hrKeys } from './hrQueries';

const reference = { retry: false, staleTime: 60 * 60_000, refetchOnWindowFocus: false } as const;

export function useDegrees() {
  const token = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: hrKeys.degrees, queryFn: () => getDegrees(token!), enabled: Boolean(token), ...reference });
}

export function useStates() {
  const token = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: hrKeys.states, queryFn: () => getStates(token!), enabled: Boolean(token), ...reference });
}

export function useDesignations() {
  const token = useSessionStore((s) => s.accessToken);
  return useQuery({ queryKey: hrKeys.designations, queryFn: () => getDesignations(token!), enabled: Boolean(token), ...reference });
}
