import { hrRequest } from './client';

/** A read-only copy of the project assignments in Audit Core, refreshed daily (hr.employee.read). */

export interface AssignmentProject {
  projectCode: string;
  projectName: string;
}

export interface WorkAssignment {
  projectCode: string;
  projectName: string;
  role: string;
  dealerName: string | null;
  outletName: string | null;
  outletHasLocation: boolean;
  since: string | null;
}

export interface AssignedEmployee {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  hasLogin: boolean;
  assignments: WorkAssignment[];
}

export interface WorkAssignments {
  syncedAt: string | null;
  syncStatus: string;
  projects: AssignmentProject[];
  employees: AssignedEmployee[];
}

export const getWorkAssignments = (token: string, params: { projectCode?: string; employeeId?: string } = {}) => {
  const query = new URLSearchParams();
  if (params.projectCode) query.set('projectCode', params.projectCode);
  if (params.employeeId) query.set('employeeId', params.employeeId);
  const text = query.toString();
  return hrRequest<WorkAssignments>(`/hr/v1/work-assignments${text ? `?${text}` : ''}`, { accessToken: token });
};
