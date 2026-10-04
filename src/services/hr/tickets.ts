import { hrRawRequest, hrRequest } from './client';

/** Feedback & Support: tickets raised by employees and answered by SuperAdmin (hr.support.manage). */

export const MAX_TICKET_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TICKET_FILES = 5;
export const MAX_SUMMARY_LENGTH = 150;
export const MAX_TEXT_LENGTH = 4000;

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'CLOSED';

export const ticketStatusLabels: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  CLOSED: 'Closed',
};

export interface Ticket {
  ticketId: string;
  ticketNo: number;
  summary: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeeEmail: string;
  page: string | null;
  status: TicketStatus;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  messageCount: number;
}

export interface TicketList {
  total: number;
  open: number;
  items: Ticket[];
}

export interface TicketFile {
  fileId: string;
  fileName: string;
  sizeBytes: number;
}

export interface TicketMessage {
  messageId: string;
  authorKind: 'EMPLOYEE' | 'SUPPORT';
  authorName: string;
  body: string;
  createdAt: string;
  files: TicketFile[];
}

export interface TicketDetail extends Ticket {
  isSupport: boolean;
  messages: TicketMessage[];
}

const base = '/hr/v1';

export const listAllTickets = (token: string) =>
  hrRequest<TicketList>(`${base}/tickets?limit=100`, { accessToken: token });

export async function listMyTickets(token: string): Promise<TicketList> {
  const { items } = await hrRequest<{ items: Ticket[] }>(`${base}/me/tickets`, { accessToken: token });
  return { total: items.length, open: items.filter((t) => t.status !== 'CLOSED').length, items };
}

export const getTicket = (token: string, ticketId: string) =>
  hrRequest<TicketDetail>(`${base}/tickets/${encodeURIComponent(ticketId)}`, { accessToken: token });

export interface RaiseTicketInput {
  summary: string;
  issue: string;
  page?: string;
  files: File[];
}

export function raiseTicket(token: string, input: RaiseTicketInput) {
  const form = new FormData();
  form.append('summary', input.summary.trim());
  form.append('issue', input.issue.trim());
  if (input.page) form.append('page', input.page);
  input.files.forEach((file) => form.append('files', file, file.name));
  return hrRequest<{ ticketId: string; ticketNo: number }>(`${base}/me/tickets`, {
    accessToken: token,
    method: 'POST',
    body: form,
    timeoutMs: 120_000,
  });
}

export function replyToTicket(token: string, ticketId: string, body: string, files: File[]) {
  const form = new FormData();
  form.append('body', body.trim());
  files.forEach((file) => form.append('files', file, file.name));
  return hrRequest<{ messageId: string; status: TicketStatus }>(`${base}/tickets/${encodeURIComponent(ticketId)}/messages`, {
    accessToken: token,
    method: 'POST',
    body: form,
    timeoutMs: 120_000,
  });
}

export const updateTicket = (token: string, ticketId: string, body: { status: TicketStatus; adminNote: string }) =>
  hrRequest<{ ticketId: string; status: TicketStatus; adminNote: string | null }>(`${base}/tickets/${encodeURIComponent(ticketId)}`, {
    accessToken: token,
    method: 'PATCH',
    body,
  });

/** Files need the caller's token, so they are fetched as blobs and saved from the page. */
export async function fetchTicketFile(token: string, ticketId: string, fileId: string): Promise<Blob> {
  const response = await hrRawRequest(
    `${base}/tickets/${encodeURIComponent(ticketId)}/files/${encodeURIComponent(fileId)}`,
    { accessToken: token, timeoutMs: 120_000 },
  );
  return response.blob();
}

/** The first problem with a chosen set of files, or null when they are fine to send. */
export function fileProblem(files: File[]): string | null {
  if (files.length > MAX_TICKET_FILES) return `Attach at most ${MAX_TICKET_FILES} files.`;
  const big = files.find((f) => f.size > MAX_TICKET_FILE_BYTES);
  if (big) return `${big.name} is larger than 10 MB.`;
  const empty = files.find((f) => f.size === 0);
  if (empty) return `${empty.name} is empty.`;
  return null;
}

export function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
