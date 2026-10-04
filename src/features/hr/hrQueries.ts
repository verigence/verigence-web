import { useQuery } from '@tanstack/react-query';

import { getHrMe, HR_PERMISSION, type HrMe } from '../../services/hr/employees';
import { useSessionStore } from '../../store/sessionStore';

export const hrKeys = {
  me: ['hr', 'me'] as const,
  employees: ['hr', 'employees'] as const,
  employee: (id: string) => ['hr', 'employee', id] as const,
  myEmployee: ['hr', 'my-employee'] as const,
  photo: (scope: string) => ['hr', 'photo', scope] as const,
  audit: (id: string) => ['hr', 'audit', id] as const,
  degrees: ['hr', 'degrees'] as const,
  states: ['hr', 'states'] as const,
  designations: ['hr', 'designations'] as const,
};

export interface HrAccess {
  loading: boolean;
  /** False when HR cannot be reached or the caller has no HR role and no employee record. */
  available: boolean;
  me: HrMe | null;
  can: (permission: string) => boolean;
  canReadEmployees: boolean;
  canManageEmployees: boolean;
  canRevealSensitive: boolean;
  canReadAudit: boolean;
  isEmployee: boolean;
}

/**
 * One call decides what HR navigation a person sees. It is made once per sign-in (kept for ten
 * minutes), never retried, and a failure simply hides HR; it never blocks the rest of the app.
 * The HR service checks every request again, so this is only a convenience.
 */
export function useHrAccess(): HrAccess {
  const accessToken = useSessionStore((state) => state.accessToken);
  const query = useQuery({
    queryKey: hrKeys.me,
    queryFn: () => getHrMe(accessToken!),
    enabled: Boolean(accessToken),
    retry: false,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
  const me = query.data ?? null;
  const can = (permission: string) => Boolean(me?.permissions.includes(permission));
  return {
    loading: query.isLoading,
    available: Boolean(me && (me.permissions.length > 0 || me.employeeId)),
    me,
    can,
    canReadEmployees: can(HR_PERMISSION.employeeRead),
    canManageEmployees: can(HR_PERMISSION.employeeManage),
    canRevealSensitive: can(HR_PERMISSION.sensitiveRead),
    canReadAudit: can(HR_PERMISSION.auditRead),
    isEmployee: Boolean(me?.employeeId),
  };
}
