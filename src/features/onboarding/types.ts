export type AccessRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface CreateAccessRequestInput {
  fullName: string;
  workEmail: string;
  tenantCode: string;
  employeeId?: string;
  mobileNumber?: string;
}

export interface AccessRequest {
  requestId: string;
  fullName: string;
  workEmail: string;
  tenantCode: string;
  employeeId?: string | null;
  mobileNumber?: string | null;
  status: AccessRequestStatus;
  submittedAt: string;
}
