import type {
  AccessRequest,
  AccessRequestListResponse,
  CreateAccessRequestInput,
  OperationalRoleKey,
} from '../../features/onboarding/types';
import { auditCoreRequest } from './client';

export function createAccessRequest(input: CreateAccessRequestInput): Promise<AccessRequest> {
  return auditCoreRequest<AccessRequest>('/v1/onboarding/access-requests', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listPendingAccessRequests(): Promise<AccessRequest[]> {
  const response = await auditCoreRequest<AccessRequestListResponse>(
    '/v1/onboarding/access-requests?status=PENDING',
  );
  return response.items;
}

export function approveAccessRequest(
  requestId: string,
  roleKey: OperationalRoleKey,
): Promise<AccessRequest> {
  return auditCoreRequest<AccessRequest>(
    `/v1/onboarding/access-requests/${encodeURIComponent(requestId)}/approve`,
    {
      method: 'POST',
      body: JSON.stringify({ roleKey }),
    },
  );
}

export function rejectAccessRequest(requestId: string, reason: string): Promise<AccessRequest> {
  return auditCoreRequest<AccessRequest>(
    `/v1/onboarding/access-requests/${encodeURIComponent(requestId)}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
  );
}
