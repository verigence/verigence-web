import { auditCoreRawRequest, auditCoreRequest } from './client';



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
