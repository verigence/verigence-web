import { auditCoreRawRequest, auditCoreRequest } from './client';

export interface FeedbackSubmission {
  tenantId: string;
  accessToken: string;
  feedbackText: string;
  submittedByDisplayName?: string;
  pagePath?: string;
  screenshot?: File;
}

export interface FeedbackSubmittedResponse {
  feedbackId: string;
  createdAtUtc: string;
}

export interface AdminFeedbackItem {
  feedbackId: string;
  tenantId: string;
  projectName: string;
  submittedByUserId: string;
  submittedByDisplayName?: string | null;
  submittedByRole: string;
  feedbackText: string;
  pagePath?: string | null;
  hasScreenshot: boolean;
  screenshotFileName?: string | null;
  screenshotContentType?: string | null;
  screenshotSizeBytes?: number | null;
  createdAtUtc: string;
}

export interface AdminFeedbackPage {
  items: AdminFeedbackItem[];
  offset: number;
  limit: number;
  total: number;
}

export async function submitFeedback(input: FeedbackSubmission): Promise<FeedbackSubmittedResponse> {
  const body = new FormData();
  body.set('feedbackText', input.feedbackText);
  if (input.submittedByDisplayName) body.set('submittedByDisplayName', input.submittedByDisplayName);
  if (input.pagePath) body.set('pagePath', input.pagePath);
  if (input.screenshot) body.set('screenshot', input.screenshot);

  return auditCoreRequest<FeedbackSubmittedResponse>(
    `/v1/tenants/${encodeURIComponent(input.tenantId)}/feedback`,
    {
      method: 'POST',
      body,
      accessToken: input.accessToken,
    },
  );
}

export async function listAdminFeedback(
  accessToken: string,
  offset = 0,
  limit = 50,
): Promise<AdminFeedbackPage> {
  return auditCoreRequest<AdminFeedbackPage>(
    `/v1/admin/feedback?offset=${offset}&limit=${limit}`,
    { accessToken },
  );
}

export async function loadFeedbackScreenshot(
  accessToken: string,
  feedbackId: string,
): Promise<Blob> {
  const response = await auditCoreRawRequest(
    `/v1/admin/feedback/${encodeURIComponent(feedbackId)}/screenshot`,
    { accessToken },
  );
  return response.blob();
}
