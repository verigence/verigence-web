import type {
  AccessRequest,
  CreateAccessRequestInput,
} from '../../features/onboarding/types';
import { auditCoreRequest } from './client';

export function createAccessRequest(input: CreateAccessRequestInput): Promise<AccessRequest> {
  return auditCoreRequest<AccessRequest>('/v1/onboarding/access-requests', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
