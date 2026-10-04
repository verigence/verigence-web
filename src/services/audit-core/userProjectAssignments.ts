import { auditCoreRequest } from './client';

/** Where a person is, or has been, tagged across projects (SuperAdmin only, read-only). */

export interface UserProjectAssignment {
  tenantId: string;
  projectCode: string | null;
  projectName: string;
  roleCode: string;
  dealerName: string | null;
  outletName: string | null;
  since: string;
  until: string | null;
  current: boolean;
}

export const getUserProjectAssignments = (userId: string, accessToken?: string) =>
  auditCoreRequest<{ userId: string; assignments: UserProjectAssignment[] }>(
    `/v1/admin/users/${encodeURIComponent(userId)}/project-assignments`,
    { accessToken },
  );
