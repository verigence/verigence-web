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
  employee_ids: string[];
  /** Only for GENERAL: wording for this one send. The saved template is not changed. */
  subject?: string;
  body?: string;
}

export interface SendMessageResult {
  employeeId: string;
  name: string | null;
  status: MessageResultStatus;
  code: string | null;
  message: string | null;
}

export interface MessageLogEntry {
  logId: number;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  channel: MessageChannel | string;
  template: MessageTemplateCode | string;
  status: MessageResultStatus | string;
  reason: string | null;
  sentBy: string;
  sentAt: string;
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

export const listMessageLog = (token: string, params: { employeeId?: string; limit?: number } = {}) => {
  const query = new URLSearchParams();
  if (params.employeeId) query.set('employee_id', params.employeeId);
  query.set('limit', String(params.limit ?? 50));
  return hrRequest<{ items: MessageLogEntry[] }>(`${base}/log?${query.toString()}`, { accessToken: token });
};
