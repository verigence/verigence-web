import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { HrHttpError, HrNetworkError } from '../../services/hr/client';
import { getHrMe, HR_PERMISSION, type HrMe } from '../../services/hr/employees';
import { useProjectContextStore } from '../../store/projectContextStore';
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
  departments: ['hr', 'departments'] as const,
};

export interface HrAccess {
  loading: boolean;
  /** False when HR cannot be reached or the caller has no HR role and no employee record. */
  available: boolean;
  me: HrMe | null;
  can: (permission: string) => boolean;
  canReadEmployees: boolean;
  canManageEmployees: boolean;
  /** The CEO: approves or rejects a change of an employee's status. */
  canApproveStatus: boolean;
  /** The CEO and SuperAdmin: a status change they ask for, dated today or earlier, takes effect at once. */
  canChangeStatusAtOnce: boolean;
  canRevealSensitive: boolean;
  canReadAudit: boolean;
  isEmployee: boolean;
}

/** Waits between tries of the HR check: a refusal or a dropped connection gets two more tries. */
export const HR_ME_RETRY_DELAY_MS = 5_000;
const HR_ME_RETRIES = 2;

/**
 * Whether the HR check is tried again. 13 Nov 2026: HR refused a token issued seconds earlier
 * (its clock ran behind Security's), the single try failed and My HR, with attendance, stayed
 * hidden. A refusal (401) or a connection problem is tried twice more, five seconds apart; any
 * other answer (403, 404, 5xx) is final.
 */
export function shouldRetryHrMe(failureCount: number, error: unknown): boolean {
  if (failureCount >= HR_ME_RETRIES) return false;
  if (error instanceof HrNetworkError) return true;
  return error instanceof HrHttpError && error.status === 401;
}

/**
 * One call decides what HR navigation a person sees. It is made once per sign-in (kept for ten
 * minutes); a refusal or a dropped connection is tried again (shouldRetryHrMe), and a check that
 * still failed is made again when the sign-in is renewed. A failure hides HR; it never blocks the
 * rest of the app. The HR service checks every request again, so this is only a convenience.
 */
export function useHrAccess(): HrAccess {
  const accessToken = useSessionStore((state) => state.accessToken);
  const query = useQuery({
    queryKey: hrKeys.me,
    queryFn: () => getHrMe(accessToken!),
    enabled: Boolean(accessToken),
    retry: shouldRetryHrMe,
    retryDelay: HR_ME_RETRY_DELAY_MS,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
  const { isError, refetch } = query;
  // A check that failed is made again with the renewed sign-in rather than waiting ten minutes.
  useEffect(() => {
    if (accessToken && isError) void refetch();
  }, [accessToken]);
  const me = query.data ?? null;
  const can = (permission: string) => Boolean(me?.permissions.includes(permission));
  return {
    loading: query.isLoading,
    available: Boolean(me && (me.permissions.length > 0 || me.employeeId)),
    me,
    can,
    canReadEmployees: can(HR_PERMISSION.employeeRead),
    canManageEmployees: can(HR_PERMISSION.employeeManage),
    canApproveStatus: can(HR_PERMISSION.employeeStatusApprove),
    canChangeStatusAtOnce: can(HR_PERMISSION.employeeStatusDirect),
    canRevealSensitive: can(HR_PERMISSION.sensitiveRead),
    canReadAudit: can(HR_PERMISSION.auditRead),
    isEmployee: Boolean(me?.employeeId),
  };
}

const LEAD_ROLES = new Set(['TL', 'PM', 'EXECUTIVE']);

/**
 * Whether the person is a Team Lead, Project Manager or Executive on any of their Projects. They get
 * the team attendance overview for the projects they lead; the HR service checks it again.
 */
export function useLeadsAProject(): boolean {
  const projects = useProjectContextStore((state) => state.projects);
  return projects.some((project) => LEAD_ROLES.has(String(project.operatingRole ?? '').toUpperCase()));
}
