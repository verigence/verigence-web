import { xhrPut } from '../../features/uc03-p2/workspace/p2Uploader';
import { auditCoreRawRequest, auditCoreRequest } from './client';

export type P2JourneyListItem = {
  journey_id: string;
  customer_name: string;
  mobile_last4?: string | null;
  dealer_name: string;
  outlet_name: string;
  vehicle?: string | null;
  current_stage: string;
  booking_completion_state: string;
  delivery_completion_state: string;
  booking_receipt_total: string;
  booking_minimum_amount?: string | null;
  manual_verification_pending_count: number;
  documents: number;
  total_tasks: number;
  open_tasks: number;
  overdue_tasks: number;
  open_findings: number;
  updated_at_utc: string;
};

export type P2JourneyListResponse = { items: P2JourneyListItem[] };

export type P2BookingGate = {
  passed: boolean;
  label?: string;
  kind?: string;
  action?: string;
  documentCount?: number;
  receiptTotal?: string;
  minimumAmount?: string;
  shortfall?: string;
  receiptCount?: number;
  pendingCount?: number;
  documents?: string[] | Record<string, number>;
};

export type P2BookingStage = {
  stage: string;
  bookingCompletionState: string;
  minimumBookingAmount: string;
  bookingReceiptTotal: string;
  manualVerificationPending: number;
  gates: Record<string, P2BookingGate>;
};

export type P2StageResponse = {
  journeyId: string;
  booking: P2BookingStage;
  delivery: {
    completionState: string;
    configuration: string;
    gates: Array<Record<string, unknown>>;
  };
};

export type P2Overview = {
  journey: {
    journey_id: string;
    customer_name: string;
    dealer_name: string;
    outlet_name: string;
    vehicle?: string | null;
    created_at_utc: string;
    updated_at_utc: string;
  };
  stage: P2BookingStage & {
    deliveryCompletionState: string;
    deliveryConfiguration: string;
  };
  documents: {
    total_active: number;
    superseded: number;
    booking_docs: number;
    delivery_docs: number;
  };
  uploads: {
    batches: number;
    pages: number;
    failed_batches: number;
  };
  payments: {
    booking_total: string;
    delivery_total: string;
    booking_receipts: number;
    delivery_receipts: number;
  };
  tasks: {
    total: number;
    open: number;
    completed: number;
    overdue: number;
  };
  findings: {
    open: number;
    resolved: number;
  };
  statistics: {
    booking: {
      documentsRequired: number;
      documentsReceived: number;
      pages: number;
      pagesProcessed: number;
      paymentReceipts: number;
      paymentReceived: string;
      minimumPayment: string;
      manualVerificationPending: number;
      controls: P2ControlStatistics;
      tasksOpen: number;
      tasksCompleted: number;
    };
    delivery: {
      documentsRequired: number;
      documentsReceived: number;
      pages: number;
      pagesProcessed: number;
      invoices: number;
      paymentReceipts: number;
      financeRecords: number;
      insuranceRecords: number;
      vehicleRecords: number;
      registrationRecords: number;
      controls: P2ControlStatistics;
      tasksOpen: number;
      tasksCompleted: number;
    };
    journey: {
      uploads: number;
      reuploads: number | null;
      supersededDocuments: number;
      extractionFailures: number;
      retries: number;
      correctedFields: number;
      openFindings: number;
      totalTasks: number;
      slaBreaches: number;
      controls: P2ControlStatistics;
    };
  };
};

export type P2ControlStatistics = {
  tracked: number;
  passed: number;
  failed: number;
  waiting: number;
  retryPending: number;
  errors: number;
};

export type P2DocumentPage = {
  queueId: string;
  unitKind?: 'PAGE' | 'GROUP';
  pageNumbers?: number[];
  mergedIntoQueueId?: string | null;
  groupSource?: 'SYSTEM' | 'PC' | null;
  templateKey?: string | null;
  displayName?: string | null;
  requirement?: string | null;
  status_reason?: string | null;
  page_number: number;
  client_upload_id: string;
  diDocumentId?: string;
  classified_document_type?: string | null;
  business_stage?: string | null;
  queue_status: string;
  attempt_count: number;
  extracted_field_count: number;
  last_error?: string | null;
  created_at_utc: string;
  updated_at_utc: string;
};

export type P2DocumentBatch = {
  batchId: string;
  original_filename: string;
  content_type?: string | null;
  size_bytes: number;
  sha256?: string | null;
  page_count: number;
  batch_status: string;
  grouping_status?: string;
  created_at_utc: string;
  updated_at_utc: string;
  pages: P2DocumentPage[];
  documents?: Array<P2DocumentPage & { memberPages: P2DocumentPage[] }>;
};

export type P2DocumentLineage = {
  evidenceId: string;
  documentId: string;
  document_type_key?: string | null;
  process_area?: string | null;
  association_status: 'ACTIVE' | 'SUPERSEDED' | 'VOIDED' | 'UNLINKED';
  supersedesEvidenceId?: string | null;
  processing_status_cache?: string | null;
  verification_status_cache?: string | null;
  confirmation_status_cache?: string | null;
  linked_at_utc: string;
  original_filename?: string | null;
  templateKey?: string;
  displayName?: string;
  requirement?: string;
};

export type P2ChecklistItem = {
  templateKey: string;
  displayName: string;
  stage: 'BOOKING' | 'DELIVERY';
  requirement: 'REQUIRED' | 'OPTIONAL' | 'CONDITIONAL' | 'SUPPORTING';
  status: 'RECEIVED' | 'MISSING';
  readyCount: number;
  documentIds: string[];
};

export type P2DocumentsResponse = {
  journeyId: string;
  batches: P2DocumentBatch[];
  documents?: P2DocumentLineage[];
  checklist?: P2ChecklistItem[];
  conditions?: string[];
};

export type P2TemplateField = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  isKey: boolean;
  reviewThreshold: number;
};

export type P2Template = {
  key: string;
  displayName: string;
  stage: string;
  requirement: string;
  condition?: string | null;
  pageShape: string;
  maxPages: number;
  diTypes: string[];
  reviewThreshold: number;
  keyFields: string[];
  fields: P2TemplateField[];
};

export type P2TemplatesResponse = {
  version: number;
  templates: P2Template[];
  stages: Array<{ code: string; states: string[]; gates: Array<{ key: string; kind: string; label: string; action: string }> }>;
};


export type P2DocumentReviewField = {
  canonicalFieldId: string;
  fieldKey: string;
  sourceFactVersion: number;
  extractedValue: unknown;
  modifiedValue: unknown;
  effectiveValue: unknown;
  confidenceScore: number | null;
  isModified: boolean;
  reviewedByActorId?: string | null;
  reviewedAtUtc?: string | null;
  pageNo: number | null;
  evidenceRegion: Record<string, unknown> | null;
};

export type P2DocumentReview = {
  journeyId: string;
  documentId: string;
  documentTypeKey: string | null;
  stage: 'BOOKING' | 'DELIVERY';
  originalFilename: string;
  processingStatus: string | null;
  confirmationStatus: string | null;
  contentAvailable: boolean;
  diReadError: string | null;
  fields: P2DocumentReviewField[];
  correctionHistory: Array<{
    fieldKey: string;
    canonicalFieldId?: string | null;
    sourceFactVersion: number;
    extractedValue: unknown;
    effectiveValue: unknown;
    reviewedByActorId?: string | null;
    reviewedAtUtc?: string | null;
  }>;
  relatedTasks: Array<{
    taskId: string;
    taskType: string;
    title: string;
    status: string;
    sourceType: string;
    sourceCode?: string | null;
    createdAtUtc: string;
  }>;
  relatedRules: string[];
};

export type P2FieldCorrectionResult = {
  documentId: string;
  fieldKey: string;
  applied: boolean;
  taskId: string | null;
};

export type P2Task = {
  source_system: 'P2' | 'LEGACY';
  legacy_queue_url?: string | null;
  priority_rank?: number | null;
  task_id: string;
  journey_id: string;
  root_task_id?: string | null;
  parent_task_id?: string | null;
  round_number: number;
  task_type: string;
  category: string;
  origin_kind: 'SYSTEM' | 'HUMAN';
  source_type: string;
  source_code?: string | null;
  title: string;
  description: string;
  reference: Record<string, unknown>;
  severity: string;
  priority?: string | null;
  assigned_role_code: string;
  assigned_actor_id?: string | null;
  raised_by_actor_id?: string | null;
  raised_by_role_code?: string | null;
  allowed_actions: string[];
  completion_protocol: string;
  task_status: string;
  due_at_utc?: string | null;
  created_at_utc: string;
  updated_at_utc: string;
  customer_name?: string | null;
  dealer_name?: string | null;
  outlet_name?: string | null;
  vehicle?: string | null;
};

export type P2TasksResponse = {
  items: P2Task[];
  sources?: { p2: number; legacy: number };
};

function path(tenantId: string, suffix: string) {
  return `/p2/v1/tenants/${encodeURIComponent(tenantId)}${suffix}`;
}

function contentTypeForFile(file: File): string {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function stableClientUploadId(journeyId: string, file: File, index: number): string {
  const seed = [journeyId, file.name, file.size, file.lastModified, index].join('|');
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `web-p2-${(hash >>> 0).toString(36)}-${file.size.toString(36)}`;
}


export function getP2Templates(tenantId: string, accessToken?: string): Promise<P2TemplatesResponse> {
  return auditCoreRequest<P2TemplatesResponse>(path(tenantId, '/templates'), { accessToken });
}

export function p2UploadTransport(tenantId: string, journeyId: string, accessToken?: string) {
  const journey = `/journeys/${encodeURIComponent(journeyId)}`;
  return {
    init: async (files: Array<{ filename: string; contentType: string; sizeBytes: number; clientUploadId: string }>) =>
      (await auditCoreRequest<UploadInitResult>(path(tenantId, `${journey}/uploads:init`), {
        method: 'POST', accessToken, body: JSON.stringify({ files }),
      })).uploads,
    put: xhrPut,
    finalize: async (batchId: string) => {
      await auditCoreRequest(path(tenantId, `${journey}/uploads/${encodeURIComponent(batchId)}:finalize`), {
        method: 'POST', accessToken,
      });
    },
  };
}

export function confirmP2Field(
  tenantId: string,
  journeyId: string,
  documentId: string,
  field: { fieldKey: string; canonicalFieldId: string; sourceFactVersion: number },
  accessToken?: string,
): Promise<{ confirmed: boolean }> {
  return auditCoreRequest(
    path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/documents/${encodeURIComponent(documentId)}/fields/${encodeURIComponent(field.fieldKey)}:confirm`),
    {
      method: 'POST', accessToken, cache: 'no-store',
      body: JSON.stringify({ canonicalFieldId: field.canonicalFieldId, sourceFactVersion: field.sourceFactVersion }),
    },
  );
}

export function retryP2Page(tenantId: string, journeyId: string, queueId: string, accessToken?: string) {
  return auditCoreRequest(
    path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/pages/${encodeURIComponent(queueId)}:retry`),
    { method: 'POST', accessToken },
  );
}

export function setP2PageType(
  tenantId: string, journeyId: string, queueId: string, templateKey: string, accessToken?: string,
) {
  return auditCoreRequest(
    path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/pages/${encodeURIComponent(queueId)}:set-type`),
    { method: 'POST', accessToken, body: JSON.stringify({ templateKey }) },
  );
}

export function getP2Journeys(
  tenantId: string,
  accessToken?: string,
  search = '',
): Promise<P2JourneyListResponse> {
  const params = new URLSearchParams();
  if (search.trim()) params.set('q', search.trim());
  params.set('limit', '100');
  return auditCoreRequest<P2JourneyListResponse>(
    `${path(tenantId, '/journeys')}?${params.toString()}`,
    { accessToken },
  );
}

export function getP2Stage(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<P2StageResponse> {
  return auditCoreRequest<P2StageResponse>(
    path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/stage`),
    { accessToken, cache: 'no-store' },
  );
}

export function getP2Overview(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<P2Overview> {
  return auditCoreRequest<P2Overview>(
    path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/overview`),
    { accessToken },
  );
}

export function getP2Documents(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<P2DocumentsResponse> {
  return auditCoreRequest<P2DocumentsResponse>(
    path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/documents`),
    { accessToken },
  );
}

type UploadInitResult = {
  journeyId: string;
  uploads: Array<{
    batchId: string;
    clientUploadId?: string | null;
    filename: string;
    status: string;
    alreadyAccepted: boolean;
    uploadUrl: string | null;
    uploadHeaders: Record<string, string>;
    expiresInSeconds: number;
  }>;
};

export async function uploadP2Files(
  tenantId: string,
  journeyId: string,
  files: File[],
  accessToken?: string,
): Promise<void> {
  const descriptors = files.map((file, index) => ({
    file,
    clientUploadId: stableClientUploadId(journeyId, file, index),
  }));
  const sourceByClientId = new Map(
    descriptors.map(({ file, clientUploadId }) => [clientUploadId, file] as const),
  );

  const prepared = await auditCoreRequest<UploadInitResult>(
    path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/uploads:init`),
    {
      method: 'POST',
      accessToken,
      body: JSON.stringify({
        files: descriptors.map(({ file, clientUploadId }) => ({
          filename: file.name,
          contentType: contentTypeForFile(file),
          sizeBytes: file.size,
          clientUploadId,
        })),
      }),
    },
  );

  for (const item of prepared.uploads) {
    if (item.alreadyAccepted) continue;
    if (!item.uploadUrl || !item.clientUploadId) {
      throw new Error(`Prepared upload is incomplete for ${item.filename}.`);
    }
    const source = sourceByClientId.get(item.clientUploadId);
    if (!source) {
      throw new Error(`Prepared upload source missing for ${item.filename}.`);
    }
    const uploadResponse = await fetch(item.uploadUrl, {
      method: 'PUT',
      headers: item.uploadHeaders,
      body: source,
    });
    if (!uploadResponse.ok) {
      throw new Error(`Upload failed for ${item.filename} (HTTP ${uploadResponse.status}).`);
    }
    await auditCoreRequest(
      path(
        tenantId,
        `/journeys/${encodeURIComponent(journeyId)}/uploads/${encodeURIComponent(item.batchId)}:finalize`,
      ),
      { method: 'POST', accessToken },
    );
  }
}


export function getP2DocumentReview(
  tenantId: string,
  journeyId: string,
  documentId: string,
  accessToken?: string,
): Promise<P2DocumentReview> {
  return auditCoreRequest<P2DocumentReview>(
    path(
      tenantId,
      `/journeys/${encodeURIComponent(journeyId)}/documents/${encodeURIComponent(documentId)}`,
    ),
    { accessToken, cache: 'no-store' },
  );
}

export async function getP2DocumentContent(
  tenantId: string,
  journeyId: string,
  documentId: string,
  accessToken?: string,
): Promise<{ blob: Blob; contentType: string }> {
  const response = await auditCoreRawRequest(
    path(
      tenantId,
      `/journeys/${encodeURIComponent(journeyId)}/documents/${encodeURIComponent(documentId)}/content`,
    ),
    { accessToken, cache: 'no-store' },
  );
  return {
    blob: await response.blob(),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
  };
}

export function correctP2DocumentField(
  tenantId: string,
  journeyId: string,
  documentId: string,
  command: {
    canonicalFieldId: string;
    fieldKey: string;
    sourceFactVersion: number;
    newValue: unknown;
    remarks?: string;
  },
  accessToken?: string,
): Promise<P2FieldCorrectionResult> {
  return auditCoreRequest<P2FieldCorrectionResult>(
    path(
      tenantId,
      `/journeys/${encodeURIComponent(journeyId)}/documents/${encodeURIComponent(documentId)}/fields/${encodeURIComponent(command.fieldKey)}`,
    ),
    {
      method: 'PATCH',
      accessToken,
      body: JSON.stringify(command),
      cache: 'no-store',
    },
  );
}


export async function replaceP2Document(
  tenantId: string,
  journeyId: string,
  documentId: string,
  file: File,
  accessToken?: string,
): Promise<void> {
  const clientUploadId = stableClientUploadId(journeyId, file, 0) + '-replace';
  const prepared = await auditCoreRequest<{
    batchId: string;
    clientUploadId: string;
    uploadUrl: string;
    uploadHeaders: Record<string, string>;
  }>(
    path(
      tenantId,
      `/journeys/${encodeURIComponent(journeyId)}/documents/${encodeURIComponent(documentId)}/replace`,
    ),
    {
      method: 'POST',
      accessToken,
      body: JSON.stringify({
        filename: file.name,
        contentType: contentTypeForFile(file),
        sizeBytes: file.size,
        clientUploadId,
      }),
    },
  );
  const uploadResponse = await fetch(prepared.uploadUrl, {
    method: 'PUT',
    headers: prepared.uploadHeaders,
    body: file,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Replacement upload failed (HTTP ${uploadResponse.status}).`);
  }
  await auditCoreRequest(
    path(
      tenantId,
      `/journeys/${encodeURIComponent(journeyId)}/uploads/${encodeURIComponent(prepared.batchId)}:finalize`,
    ),
    { method: 'POST', accessToken },
  );
}

export async function deleteP2Document(
  tenantId: string,
  journeyId: string,
  documentId: string,
  accessToken?: string,
): Promise<void> {
  await auditCoreRequest(
    path(
      tenantId,
      `/journeys/${encodeURIComponent(journeyId)}/documents/${encodeURIComponent(documentId)}`,
    ),
    { method: 'DELETE', accessToken },
  );
}


export function getP2Tasks(
  tenantId: string,
  accessToken?: string,
  journeyId?: string,
): Promise<P2TasksResponse> {
  const params = new URLSearchParams();
  if (journeyId) params.set('journey_id', journeyId);
  const query = params.toString();
  return auditCoreRequest<P2TasksResponse>(
    `${path(tenantId, '/tasks')}${query ? `?${query}` : ''}`,
    { accessToken },
  );
}

export async function submitP2TaskAction(
  tenantId: string,
  taskId: string,
  action: string,
  accessToken?: string,
  comment?: string,
): Promise<Record<string, unknown>> {
  return auditCoreRequest(
    path(tenantId, `/tasks/${encodeURIComponent(taskId)}/actions`),
    {
      method: 'POST',
      accessToken,
      body: JSON.stringify({ action, comment: comment || null, details: {} }),
    },
  );
}

export type P2Event = {
  event_id: number;
  event_type: string;
  subject_type?: string | null;
  subject_id?: string | null;
  details: Record<string, unknown>;
  created_at_utc: string;
  occurred_at_utc?: string;
};

export async function getP2Events(
  tenantId: string,
  journeyId: string,
  after: number,
  accessToken?: string,
  options: { latest?: boolean; limit?: number } = {},
): Promise<{ events: P2Event[]; cursor?: number }> {
  const params = new URLSearchParams({ after: String(Math.max(0, after)), limit: String(options.limit ?? 100) });
  if (options.latest) params.set('latest', 'true');
  return auditCoreRequest(
    path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/events?${params.toString()}`),
    { accessToken, timeoutMs: 5_000 },
  );
}
