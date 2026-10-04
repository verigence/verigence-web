import { hrRequest } from './client';

/** Permissions this screen cares about. The HR service checks every request again. */
export const MESSAGE_PERMISSION = {
  send: 'hr.employee.manage',
  editTemplates: 'hr.settings.manage',
} as const;

/** The HR service accepts at most this many employee ids in one send request (BATCH_LIMIT). */
export const MESSAGE_BATCH_LIMIT = 5;

export type MessageChannel = 'EMAIL' | 'WHATSAPP';
export type MessageTemplateCode = 'GENERAL' | 'WELCOME';
export type MessageResultStatus = 'SENT' | 'SKIPPED' | 'FAILED';

export interface MessageTemplate {
  code: MessageTemplateCode;
  name: string;
  subject: string;
  body: string;
  placeholders: string[];
  customised: boolean;
  updatedAt: string | null;
}

export interface MessageTemplateList {
  items: MessageTemplate[];
  channels: Record<MessageChannel, boolean>;
  mailConfigured: boolean;
}

export interface SendMessageInput {
  channel: MessageChannel;
  template: MessageTemplateCode;
  /** Verigence user ids (the Users group), at most MESSAGE_BATCH_LIMIT per request. */
  user_ids: string[];
  /** Only for GENERAL: wording for this one send. The saved template is not changed. */
  subject?: string;
  body?: string;
}

export interface SendMessageResult {
  userId: string;
  name: string | null;
  status: MessageResultStatus;
  code: string | null;
  message: string | null;
}

export interface MessageLogEntry {
  logId: number;
  userId: string | null;
  employeeId: string | null;
  name: string | null;
  channel: MessageChannel | string;
  template: MessageTemplateCode | string;
  status: MessageResultStatus | string;
  reason: string | null;
  sentBy: string;
  sentAt: string;
}

/** One person of the Verigence Users group. Employees are tagged, not required. */
export interface MessageRecipient {
  userId: string;
  displayName: string | null;
  email: string | null;
  status: string;
  isEmployee: boolean;
  employeeId: string | null;
}

export interface SendTestInput {
  channel: MessageChannel;
  template: MessageTemplateCode;
  to: string;
  /** Only for GENERAL: the same one-off wording as a real send. */
  subject?: string;
  body?: string;
}

export interface SendTestResult {
  status: 'SENT' | 'FAILED';
  code: string | null;
  message: string | null;
}

const base = '/hr/v1/messages';

export const listMessageTemplates = (token: string) =>
  hrRequest<MessageTemplateList>(`${base}/templates`, { accessToken: token });

export const updateMessageTemplate = (
  token: string,
  code: MessageTemplateCode,
  input: { subject: string; body: string },
) =>
  hrRequest<MessageTemplate>(`${base}/templates/${code}`, {
    accessToken: token,
    method: 'PUT',
    body: input as unknown as Record<string, unknown>,
  });

/** One request, one attempt. The caller sends at most MESSAGE_BATCH_LIMIT ids and never retries. */
export const sendMessages = (token: string, input: SendMessageInput) =>
  hrRequest<{ results: SendMessageResult[] }>(`${base}/send`, {
    accessToken: token,
    method: 'POST',
    body: input as unknown as Record<string, unknown>,
  });

export const listMessageLog = (token: string, params: { userId?: string; limit?: number } = {}) => {
  const query = new URLSearchParams();
  if (params.userId) query.set('user_id', params.userId);
  query.set('limit', String(params.limit ?? 50));
  return hrRequest<{ items: MessageLogEntry[] }>(`${base}/log?${query.toString()}`, { accessToken: token });
};

export const listMessageRecipients = (token: string, params: { q?: string; limit?: number; offset?: number }) => {
  const query = new URLSearchParams();
  if (params.q?.trim()) query.set('q', params.q.trim());
  query.set('limit', String(params.limit ?? 100));
  query.set('offset', String(params.offset ?? 0));
  return hrRequest<{ items: MessageRecipient[] }>(`${base}/recipients?${query.toString()}`, { accessToken: token });
};

/** One test email to an address HR types. Uses a fake password, changes no login, is not logged. */
export const sendMessageTest = (token: string, input: SendTestInput) =>
  hrRequest<SendTestResult>(`${base}/test`, {
    accessToken: token,
    method: 'POST',
    body: input as unknown as Record<string, unknown>,
  });
