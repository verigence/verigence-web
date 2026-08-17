import type {
  AccessRequest,
  AccessRequestListResponse,
  CreateAccessRequestInput,
  OperationalRoleKey,
} from '../../features/onboarding/types';
import {
  demoApproveAccessRequest,
  demoCreateAccessRequest,
  demoListPendingAccessRequests,
  demoRejectAccessRequest,
} from '../demo/onboardingDemo';
import { isDemoMode } from '../runtime';
import { auditCoreRequest } from './client';

export function createAccessRequest(input: CreateAccessRequestInput): Promise<AccessRequest> {
  if (isDemoMode()) return demoCreateAccessRequest(input);
  return auditCoreRequest<AccessRequest>('/v1/onboarding/access-requests', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listPendingAccessRequests(): Promise<AccessRequest[]> {
  if (isDemoMode()) return demoListPendingAccessRequests();
  const response = await auditCoreRequest<AccessRequestListResponse>(
    '/v1/onboarding/access-requests?status=PENDING',
  );
  return response.items;
}

export function approveAccessRequest(
  requestId: string,
  roleKey: OperationalRoleKey,
): Promise<AccessRequest> {
  if (isDemoMode()) return demoApproveAccessRequest(requestId, roleKey);
  return auditCoreRequest<AccessRequest>(
    `/v1/onboarding/access-requests/${encodeURIComponent(requestId)}/approve`,
    {
      method: 'POST',
      body: JSON.stringify({ roleKey }),
    },
  );
}

export function rejectAccessRequest(requestId: string, reason: string): Promise<AccessRequest> {
  if (isDemoMode()) return demoRejectAccessRequest(requestId, reason);
  return auditCoreRequest<AccessRequest>(
    `/v1/onboarding/access-requests/${encodeURIComponent(requestId)}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
  );
}
