import type {
  AccessRequest,
  CreateAccessRequestInput,
  OperationalRoleKey,
} from '../../features/onboarding/types';
import {
  demoApproveAccessRequest,
  demoCreateAccessRequest,
  demoListPendingAccessRequests,
  demoRejectAccessRequest,
} from '../demo/onboardingDemo';

// Audit Core does not expose onboarding/approval endpoints yet.
// Keep this fallback local to onboarding only; the rest of the Web app uses Audit Core directly.
export function createAccessRequest(input: CreateAccessRequestInput): Promise<AccessRequest> {
  return demoCreateAccessRequest(input);
}

export function listPendingAccessRequests(): Promise<AccessRequest[]> {
  return demoListPendingAccessRequests();
}

export function approveAccessRequest(
  requestId: string,
  roleKey: OperationalRoleKey,
): Promise<AccessRequest> {
  return demoApproveAccessRequest(requestId, roleKey);
}

export function rejectAccessRequest(requestId: string, reason: string): Promise<AccessRequest> {
  return demoRejectAccessRequest(requestId, reason);
}
