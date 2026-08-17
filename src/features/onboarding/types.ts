export type AccessRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type OperationalRoleKey = 'PC' | 'TL' | 'PM' | 'CRM';

export interface CreateAccessRequestInput {
  fullName: string;
  workEmail: string;
  verigenceKey: string;
  mobileNumber?: string;
}

export interface AccessRequest {
  requestId: string;
  fullName: string;
  workEmail: string;
  verigenceKey: string;
  mobileNumber?: string | null;
  status: AccessRequestStatus;
  submittedAt: string;
  assignedRole?: OperationalRoleKey | null;
  decisionReason?: string | null;
  decidedAt?: string | null;
  decidedBy?: string | null;
}

export interface AccessRequestListResponse {
  items: AccessRequest[];
}
