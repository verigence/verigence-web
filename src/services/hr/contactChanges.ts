import { hrRequest } from './client';

const base = '/hr/v1';

export type ContactField = 'EMAIL' | 'MOBILE';
export type ContactChangeState = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface ContactChange {
  changeId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  field: ContactField;
  oldValue: string | null;
  newValue: string;
  status: ContactChangeState;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /** LOGIN_UPDATED, LOGIN_NOT_UPDATED or NO_LOGIN once approved. */
  loginOutcome: string | null;
}

/** The employee asks HR to change their email or mobile. Nothing changes until HR approves. */
export const requestContactChange = (token: string, field: ContactField, newValue: string) =>
  hrRequest<ContactChange>(`${base}/me/employee/contact-change`, {
    accessToken: token,
    method: 'POST',
    body: { field, new_value: newValue },
  });

export const listMyContactChanges = (token: string) =>
  hrRequest<{ items: ContactChange[] }>(`${base}/me/employee/contact-changes`, { accessToken: token });

export const cancelMyContactChange = (token: string, changeId: string) =>
  hrRequest<ContactChange>(`${base}/me/employee/contact-changes/${changeId}/cancel`, {
    accessToken: token,
    method: 'POST',
    body: {},
  });

export const listContactChanges = (token: string, status?: ContactChangeState) =>
  hrRequest<{ items: ContactChange[] }>(`${base}/employee-contact-changes${status ? `?status=${status}` : ''}`, {
    accessToken: token,
  });

export const decideContactChange = (token: string, changeId: string, action: 'approve' | 'reject', note?: string) =>
  hrRequest<ContactChange>(`${base}/employee-contact-changes/${changeId}/${action}`, {
    accessToken: token,
    method: 'POST',
    body: { note: note ?? null },
    timeoutMs: 60_000,
  });
