import type {
  AccessRequest,
  CreateAccessRequestInput,
  OperationalRoleKey,
} from '../../features/onboarding/types';

const STORAGE_KEY = 'verigence-demo-access-requests';

function readRequests(): AccessRequest[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(parsed)) return parsed as AccessRequest[];
  } catch {
    // Demo data can safely reset if local storage has been manually corrupted.
  }
  return [];
}

function writeRequests(items: AccessRequest[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function seedIfEmpty(): AccessRequest[] {
  const current = readRequests();
  if (current.length > 0) return current;
  const seeded: AccessRequest[] = [
    {
      requestId: 'AR-DEMO-1001',
      fullName: 'Riya Malhotra',
      workEmail: 'riya.malhotra@example.test',
      tenantCode: 'TENANT-DEMO',
      employeeId: 'EMP-3104',
      mobileNumber: '+91 98000 01001',
      status: 'PENDING',
      submittedAt: '2026-08-17T07:05:00Z',
    },
    {
      requestId: 'AR-DEMO-1002',
      fullName: 'Nikhil Arora',
      workEmail: 'nikhil.arora@example.test',
      tenantCode: 'TENANT-DEMO',
      employeeId: 'EMP-3112',
      mobileNumber: '+91 98000 01002',
      status: 'PENDING',
      submittedAt: '2026-08-17T07:42:00Z',
    },
  ];
  writeRequests(seeded);
  return seeded;
}

export async function demoCreateAccessRequest(input: CreateAccessRequestInput): Promise<AccessRequest> {
  const items = seedIfEmpty();
  const duplicate = items.find(
    (item) =>
      item.workEmail.toLowerCase() === input.workEmail.toLowerCase() &&
      item.tenantCode.toLowerCase() === input.tenantCode.toLowerCase() &&
      item.status === 'PENDING',
  );
  if (duplicate) return duplicate;
  const request: AccessRequest = {
    requestId: `AR-DEMO-${Date.now().toString().slice(-6)}`,
    ...input,
    status: 'PENDING',
    submittedAt: new Date().toISOString(),
  };
  writeRequests([request, ...items]);
  return request;
}

export async function demoListPendingAccessRequests(): Promise<AccessRequest[]> {
  return seedIfEmpty().filter((item) => item.status === 'PENDING');
}

export async function demoApproveAccessRequest(
  requestId: string,
  roleKey: OperationalRoleKey,
): Promise<AccessRequest> {
  const items = seedIfEmpty();
  const index = items.findIndex((item) => item.requestId === requestId);
  if (index < 0) throw new Error('Access request not found');
  const updated: AccessRequest = {
    ...items[index],
    status: 'APPROVED',
    assignedRole: roleKey,
    decidedAt: new Date().toISOString(),
    decidedBy: 'demo-admin',
  };
  items[index] = updated;
  writeRequests(items);
  return updated;
}

export async function demoRejectAccessRequest(
  requestId: string,
  reason: string,
): Promise<AccessRequest> {
  const items = seedIfEmpty();
  const index = items.findIndex((item) => item.requestId === requestId);
  if (index < 0) throw new Error('Access request not found');
  const updated: AccessRequest = {
    ...items[index],
    status: 'REJECTED',
    decisionReason: reason,
    decidedAt: new Date().toISOString(),
    decidedBy: 'demo-admin',
  };
  items[index] = updated;
  writeRequests(items);
  return updated;
}
