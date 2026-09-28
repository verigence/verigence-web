import { xhrPut } from '../../features/uc03-p2/workspace/p2Uploader';
import { auditCoreRawRequest, auditCoreRequest } from './client';

/**
 * Budget for the heavier Audit Core reads (Booking & Delivery / Journey 360
 * list, Bookings summary, Task Queue, Duplicate bookings, and a Journey's
 * documents, stage, overview and Journey 360 read model). Audit Core gives
 * each SQL statement 10 seconds of its own (statement_timeout) on top of the
 * pool wait, Security permission check and serialisation. The default 10 s
 * client budget therefore gave up before Audit Core did on a slow Railway
 * database (WEB-AC-TIMEOUT with nothing shown): the browser aborted, the
 * statement kept running server-side, and every retry / page change added
 * one more running copy. Waiting a little longer than the server's own
 * budget lets a slow-but-working read succeed and, when it does fail, lets
 * Audit Core's own error (with its reference) reach the screen.
 */
const LIST_READ_TIMEOUT_MS = 20_000;

export type P2JourneyListItem = {
  journey_id: string;
  journey_reference?: string | null;
  booking_confirm_date?: string | null;
  delivered_at?: string | null;
  planned_delivery_at?: string | null;
  created_at_utc?: string;
  /** False for an existing (Phase 1) journey Phase 2 has not processed yet. */
  phase2?: boolean;
  /** Delivered, cancelled, duplicate or closed without delivery. */
  closed?: boolean;
  cancelled?: boolean;
  booking_status?: string | null;
  booking_completed_at?: string | null;
  delivery_completed_at?: string | null;
  /** The Team Lead reviewed the completed delivery. */
  delivery_reviewed_at?: string | null;
  booking_submitted_at?: string | null;
  delivery_submitted_at?: string | null;
  pc_open_tasks?: number;
  tl_open_tasks?: number;
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
  /** Actual net minus standard net across the deal; null until every
   * priced line has an actual. Absent from an older Audit Core. */
  price_variance?: string | null;
  /** The PC who started the journey, as their app named them. */
  pc_name?: string | null;
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
  /** Why a conditional document is needed, e.g. "The deal claims a corporate discount." */
  reason?: string | null;
  /** COVERED: another document of the same group met it (PAN or Aadhaar). */
  status: 'RECEIVED' | 'COVERED' | 'MISSING';
  /** A conditional document; `requirement` is REQUIRED once evidence triggered it. */
  conditional?: boolean;
  /** Documents where any one meets the requirement share a group. */
  group?: string | null;
  groupLabel?: string | null;
  readyCount: number;
  documentIds: string[];
};

export type P2DocumentsResponse = {
  journeyId: string;
  batches: P2DocumentBatch[];
  documents?: P2DocumentLineage[];
  checklist?: P2ChecklistItem[];
  conditions?: string[];
  counts?: P2UploadCounts;
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
  journey_reference?: string | null;
  queue_tab?: 'DOCUMENTS' | 'MANUAL_VERIFICATION' | 'OTHER';
  comment_count?: number;
  verified_at_utc?: string | null;
  completion_result?: Record<string, unknown>;
};

export type P2TaskEvent = {
  task_event_id: number;
  event_type: string;
  actor_id?: string | null;
  actor_role_code?: string | null;
  comment?: string | null;
  details?: Record<string, unknown>;
  created_at_utc: string;
};

export type P2TaskDetail = P2Task & { events: P2TaskEvent[] };

export type P2TaskTab = 'ALL' | 'DOCUMENTS' | 'MANUAL_VERIFICATION';

export type P2TasksResponse = {
  items: P2Task[];
  counts?: Record<P2TaskTab, number>;
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

export async function createP2Journey(
  tenantId: string,
  command: { outletId: string; customerName: string; createdByName?: string },
  idempotencyKey: string,
  accessToken?: string,
): Promise<{ journeyId: string }> {
  return auditCoreRequest(path(tenantId, '/journeys'), {
    method: 'POST',
    accessToken,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(command),
  });
}

export function getP2Journeys(
  tenantId: string,
  accessToken?: string,
  search = '',
  state: 'open' | 'closed' | 'all' = 'all',
  limit = 100,
): Promise<P2JourneyListResponse> {
  const params = new URLSearchParams();
  if (search.trim()) params.set('q', search.trim());
  params.set('limit', String(limit));
  if (state !== 'all') params.set('state', state);
  return auditCoreRequest<P2JourneyListResponse>(
    `${path(tenantId, '/journeys')}?${params.toString()}`,
    { accessToken, timeoutMs: LIST_READ_TIMEOUT_MS },
  );
}

export function getP2Stage(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<P2StageResponse> {
  return auditCoreRequest<P2StageResponse>(
    path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/stage`),
    { accessToken, cache: 'no-store', timeoutMs: LIST_READ_TIMEOUT_MS },
  );
}

export function getP2Overview(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<P2Overview> {
  return auditCoreRequest<P2Overview>(
    path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/overview`),
    { accessToken, timeoutMs: LIST_READ_TIMEOUT_MS },
  );
}

export function getP2Documents(
  tenantId: string,
  journeyId: string,
  accessToken?: string,
): Promise<P2DocumentsResponse> {
  return auditCoreRequest<P2DocumentsResponse>(
    path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/documents`),
    { accessToken, timeoutMs: LIST_READ_TIMEOUT_MS },
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
  options: { view?: 'open' | 'done' | 'all'; role?: string; includeLegacy?: boolean; tab?: P2TaskTab } = {},
): Promise<P2TasksResponse> {
  const params = new URLSearchParams();
  if (journeyId) params.set('journey_id', journeyId);
  if (options.view) params.set('view', options.view);
  if (options.role) params.set('role', options.role);
  if (options.includeLegacy !== undefined) params.set('includeLegacy', String(options.includeLegacy));
  if (options.tab && options.tab !== 'ALL') params.set('tab', options.tab);
  const query = params.toString();
  return auditCoreRequest<P2TasksResponse>(
    `${path(tenantId, '/tasks')}${query ? `?${query}` : ''}`,
    { accessToken, timeoutMs: LIST_READ_TIMEOUT_MS },
  );
}

export function getP2Task(tenantId: string, taskId: string, accessToken?: string): Promise<P2TaskDetail> {
  return auditCoreRequest<P2TaskDetail>(path(tenantId, `/tasks/${encodeURIComponent(taskId)}`), {
    accessToken, cache: 'no-store',
  });
}

export async function submitP2TaskAction(
  tenantId: string,
  taskId: string,
  action: string,
  accessToken?: string,
  comment?: string,
  details: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return auditCoreRequest(
    path(tenantId, `/tasks/${encodeURIComponent(taskId)}/actions`),
    {
      method: 'POST',
      accessToken,
      body: JSON.stringify({ action, comment: comment || null, details }),
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

// ── Journey 360 ─────────────────────────────────────────────────────────────
export type Money = string | null;

export type P2DealSource = { document: string; documentType: string; amount: Money; documentId?: string | null };

export type P2DealRow = {
  key: string;
  label: string;
  standard: Money;
  booking: Money;
  billed: Money;
  ledger: Money;
  quote?: Money;
  effective: Money;
  effectiveSource?: string | null;
  variance: Money;
  bookingVsBilled?: Money;
  flags: string[];
  sources: P2DealSource[];
};

export type P2DealCategory = {
  code: string;
  label: string;
  components: P2DealRow[];
  totals: Record<'standard' | 'booking' | 'billed' | 'ledger' | 'effective', Money>;
};

export type P2DiscountRow = Omit<P2DealRow, 'standard' | 'quote' | 'effectiveSource' | 'bookingVsBilled'> & {
  entitled: Money;
  scheme?: {
    code?: string | null; name?: string | null; category?: string | null; version?: number | null;
    validFrom?: string | null; validTo?: string | null; combinability?: string | null;
  } | null;
  eligibility?: string | null;
  evidenceStatus?: string | null;
  proof?: { documentType: string; document: string; onFile: boolean } | null;
};

export type P2DealSummary = {
  /** "current" = billed where invoiced, else the booking offer. */
  gross: Record<'standard' | 'booking' | 'current' | 'billed' | 'ledger', Money>;
  discounts: Record<'standard' | 'booking' | 'current' | 'billed', Money>;
  net: Record<'standard' | 'booking' | 'current', Money>;
  /** Compared only where both sides have a value. */
  variance: { bookingVsStandard: Money; currentVsStandard: Money; billedVsBooking: Money };
  invoicedComponents: number;
  components: number;
  paid: { receipts: string; loan: string; total: string };
  payable: Money;
  balanceDue: Money;
};

export type P2Deal = {
  sku: {
    skuCode?: string | null; model?: string | null; variant?: string | null; colour?: string | null;
    resolution?: string | null; method?: string | null; priceList?: string | null;
    priceListVersion?: number | null; priceListEffectiveFrom?: string | null;
  };
  categories: P2DealCategory[];
  discounts: P2DiscountRow[];
  declared: Array<{ key: string; label: string; booking: Money; billed: Money; ledger: Money; quote: Money; sources: P2DealSource[] }>;
  summary: P2DealSummary;
  flagged: number;
};

export type P2ControlItem = {
  code: string;
  label: string;
  category: string;
  severity?: string | null;
  executor?: string;
  status: string;
  reason: string;
  evaluatedAtUtc?: string | null;
  leftValue?: unknown;
  rightValue?: unknown;
};

export type P2ControlStats = Record<'total' | 'pass' | 'fail' | 'waiting' | 'notApplicable' | 'retry' | 'error', number>;

export type P2Journey360 = {
  journey: {
    journeyId: string; reference?: string | null; customerName: string; customerType?: string | null;
    mobileLast4?: string | null; dealerName: string; outletName: string; city?: string | null;
    vehicle?: string | null; skuCode?: string | null; vehicleResolution?: string | null; vin?: string | null;
    registrationNumber?: string | null; financier?: string | null; insurer?: string | null;
    createdAtUtc: string; deliveredAtUtc?: string | null;
  };
  stage: P2BookingStage & { delivery?: { passed: boolean; requiredCount?: number; receivedCount?: number; missing?: Array<{ key: string; label: string }> } };
  money: P2DealSummary & { flagged: number; minimumBookingAmount?: Money; bookingReceiptTotal?: Money };
  numbers: { documents: number; vehiclePhotos: number; openTasks: number; overdueTasks: number; openFindings: number };
  controls: Record<'BOOKING' | 'DELIVERY', P2ControlStats>;
  sections: string[];
};

export type P2Record = Record<string, unknown>;

export type P2Addons = {
  insurance: { records: P2Record[]; charges?: P2DealCategory | null; discount?: P2DiscountRow | null };
  accessories: { records: P2Record[]; charges?: P2DealCategory | null; discount?: P2DiscountRow | null };
  protection: { records: P2Record[]; charges?: P2DealCategory | null; discounts: P2DiscountRow[] };
  finance: { records: P2Record[] };
  exchange: { records: P2Record[]; discount?: P2DiscountRow | null };
  scrappage: { discounts: P2DiscountRow[] };
};

export type P2DocumentFieldView = {
  key: string; label: string; value: unknown; machineValue: unknown; corrected: boolean;
  confidence: number | null; reviewed: boolean; needsReview: boolean; keyField: boolean;
};

export type P2Documents360 = {
  documents: Array<{
    documentId: string; evidenceId: string; queueId?: string | null; documentType?: string | null;
    templateKey: string; label: string; stage: string; pages: number[]; linkedAtUtc?: string | null;
    fields: P2DocumentFieldView[]; fieldCount: number; needsReview: number; corrected: number;
  }>;
};

export type P2Payments360 = {
  items: Array<{
    paymentId: string; amount: Money; receiptNumber?: string | null; receiptDate?: string | null;
    mode?: string | null; stage?: string | null; bank?: string | null; reference?: string | null;
    documentId?: string | null; document?: string | null; counted: boolean; notCountedReason?: string | null;
    bankMatch?: string | null;
  }>;
  receiptsTotal: string; loanDisbursed: string; paidTotal: string; byStage: Record<string, string>;
};

export type P2DuplicatePair = {
  findingId: string;
  role: 'THIS_IS_DUPLICATE' | 'THIS_HOLDS_BOOKING';
  severity: string; status: string; raisedAtUtc: string;
  matchBasis?: string | null; matchBasisLabel?: string | null; matchConfidencePercent?: number | null; matchConfidenceLabel?: string | null;
  originalityBasis?: string | null;
  otherJourney: { journey_id: string; journey_reference?: string | null; customer_name?: string | null;
    outlet_name?: string | null; vehicle?: string | null; created_at_utc?: string | null };
};

export type P2Compliance360 = {
  stages: Record<'BOOKING' | 'DELIVERY', P2ControlItem[]>;
  statistics: Record<'BOOKING' | 'DELIVERY', P2ControlStats>;
};

export type P2ComplianceReport = {
  generatedAtUtc: string;
  header: Record<string, string | null>;
  summary: { totalFindings: number; openFindings: number; resolvedFindings: number; highOrCriticalOpen: number };
  sections: Array<{
    key: string; label: string;
    lineItems: Array<{ label: string; detail?: string | null; standardAmount?: number | null; actualAmount?: number | null }>;
    flags: Array<{ findingId: string; findingTypeCode: string; title: string; severity: string; findingClass?: string | null; status: string; createdAtUtc: string; isNew: boolean }>;
  }>;
  resolvedHistory: Array<{ findingId: string; findingTypeCode: string; title: string; severity: string; createdAtUtc: string; resolvedAtUtc?: string | null; resolutionReason?: string | null }>;
  verdict: { code: 'COMPLIANT' | 'INCOMPLETE' | 'NON_COMPLIANT'; label: string; failedControls: number; incompleteControls: number; openTasks: number; duplicatePairs: number; highOrCriticalFindings: number };
  stage: { code: string; gates: Record<string, P2BookingGate>; delivery?: P2Journey360['stage']['delivery'] };
  controls: Partial<Record<'BOOKING' | 'DELIVERY', P2ControlItem[]>>;
  controlStatistics: Record<'BOOKING' | 'DELIVERY', P2ControlStats>;
  deal: { summary: P2DealSummary; sku: P2Deal['sku']; flaggedLines: Array<{ label: string; category: string; standard: Money; booking: Money; billed: Money; ledger: Money; variance: Money; flags: string[] }> };
  duplicates: P2DuplicatePair[];
  openTasks: Array<{ task_id: string; title: string; task_type: string; priority?: string | null; assigned_role_code?: string | null; task_status: string; due_at_utc?: string | null }>;
};

export type P2SectionMap = {
  deal: P2Deal;
  addons: P2Addons;
  documents: P2Documents360;
  payments: P2Payments360;
  vehicle: { product: P2Record | null; units: P2Record[]; photoCount: number };
  registration: { records: P2Record[]; charges?: P2DealCategory | null };
  delivery: { readiness?: P2Journey360['stage']['delivery']; records: P2Record[] };
  compliance: P2Compliance360;
  activity: { events: Array<{ event_id: number; event_type: string; subject_type?: string | null; subject_id?: string | null; details?: Record<string, unknown> | null; created_at_utc: string }> };
  duplicates: { pairs: P2DuplicatePair[] };
  'compliance-report': P2ComplianceReport;
  timeline: P2Timeline;
};

export function getP2Journey360(tenantId: string, journeyId: string, accessToken?: string): Promise<P2Journey360> {
  return auditCoreRequest<P2Journey360>(path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/360`), { accessToken, timeoutMs: LIST_READ_TIMEOUT_MS });
}

export function getP2Journey360Section<K extends keyof P2SectionMap>(
  tenantId: string, journeyId: string, section: K, accessToken?: string,
): Promise<P2SectionMap[K]> {
  return auditCoreRequest<P2SectionMap[K]>(
    path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/360/${section}`), { accessToken, timeoutMs: LIST_READ_TIMEOUT_MS },
  );
}

// ── Vehicle photos (no DI, no classification) ───────────────────────────────
export type P2VehiclePhoto = {
  photoId: string; filename: string; contentType: string; sizeBytes: number; viewCode?: string | null;
  uploadedByActorId: string; uploadedAtUtc?: string | null; url?: string | null;
};

export type P2VehiclePhotoList = { photos: P2VehiclePhoto[]; limit: number; maxBytes: number; views: string[] };

export function getP2VehiclePhotos(tenantId: string, journeyId: string, accessToken?: string): Promise<P2VehiclePhotoList> {
  return auditCoreRequest<P2VehiclePhotoList>(
    path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/vehicle-photos`), { accessToken, cache: 'no-store' },
  );
}

export function p2PhotoTransport(tenantId: string, journeyId: string, accessToken?: string) {
  const base = path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/vehicle-photos`);
  return {
    intents: async (files: Array<{ clientUploadId: string; filename: string; contentType: string; sizeBytes: number; viewCode?: string | null }>) =>
      (await auditCoreRequest<{ uploads: Array<{ clientUploadId: string; uploadUrl?: string; uploadHeaders?: Record<string, string>; photoId?: string; alreadyStored: boolean }> }>(
        `${base}:upload-intents`, { method: 'POST', accessToken, body: JSON.stringify({ files }) },
      )).uploads,
    put: xhrPut,
    finalize: (file: { clientUploadId: string; filename: string; contentType: string; viewCode?: string | null }) =>
      auditCoreRequest<P2VehiclePhoto>(`${base}:finalize`, { method: 'POST', accessToken, body: JSON.stringify(file) }),
    remove: (photoId: string) =>
      auditCoreRequest<void>(`${base}/${encodeURIComponent(photoId)}`, { method: 'DELETE', accessToken }),
  };
}

// ── Duplicate bookings (tenant-wide, existing Audit Core report) ────────────
export type DuplicateBookingSide = {
  journeyId: string; journeyReference?: string | null; customerName?: string | null; dealerName?: string | null;
  outletName?: string | null; productLabel?: string | null; bookingReference?: string | null; bookingConfirmDate?: string | null;
};

export type DuplicateBookingPair = {
  findingId: string; status: string; severity: string; raisedAtUtc: string; matchBasis?: string | null;
  matchBasisLabel?: string | null; matchConfidencePercent?: number | null; matchConfidenceLabel?: string | null;
  duplicate: DuplicateBookingSide; holder: DuplicateBookingSide;
};

export function getDuplicateBookings(tenantId: string, accessToken?: string, includeClosed = false) {
  return auditCoreRequest<{ generatedAtUtc: string; pairs: DuplicateBookingPair[] }>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/uc03/duplicate-bookings?includeClosed=${includeClosed ? 'true' : 'false'}`,
    { accessToken, timeoutMs: LIST_READ_TIMEOUT_MS },
  );
}

// ── Deal actions: pricing date, model catalogue by date, recheck ────────────
export type P2PriceListRef = {
  priceListVersionId: string; priceList?: string | null; version?: number | null;
  effectiveFrom?: string | null; effectiveTo?: string | null;
} | null;

export type P2Pricing = {
  bookingDate?: string | null;
  invoiceDate?: string | null;
  appliedDate: string;
  basis: 'BOOKING_DATE' | 'INVOICE_DATE' | 'CUSTOM';
  reason?: string | null;
  setByActorId?: string | null;
  setAtUtc?: string | null;
  appliedPriceList: P2PriceListRef;
  appliedSchemeCount: number;
  options: Array<{ basis: 'BOOKING_DATE' | 'INVOICE_DATE'; date: string; priceList: P2PriceListRef; schemeVersions: string[]; differsFromApplied: boolean }>;
  sku: { productSkuId?: string | null; skuCode?: string | null; model?: string | null; variant?: string | null; colour?: string | null; selectionStatus?: string | null };
  modelChange: 'CONFIRM_SKU' | 'PROPOSE_CORRECTION';
  repriced?: boolean;
  repriceNote?: string | null;
};

export type P2CatalogSku = {
  productSkuId: string; skuCode: string; modelName: string; variantName: string | null; colourName: string | null;
  fuel: string | null; transmission: string | null; drive: string | null; seater: string | null; trim: string | null;
  exShowroomPrice: string | null; totalPrice: string | null;
};

export function getP2Pricing(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<P2Pricing>(path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/pricing`), { accessToken, cache: 'no-store' });
}

export function setP2Pricing(
  tenantId: string, journeyId: string,
  command: { basis: P2Pricing['basis']; onDate?: string; reason?: string }, accessToken?: string,
) {
  return auditCoreRequest<P2Pricing>(path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/pricing`), {
    method: 'PUT', accessToken, body: JSON.stringify(command),
  });
}

export function getP2PricingCatalog(tenantId: string, journeyId: string, onDate?: string, accessToken?: string) {
  const query = onDate ? `?onDate=${encodeURIComponent(onDate)}` : '';
  return auditCoreRequest<{ onDate: string; priceList: P2PriceListRef; skus: P2CatalogSku[] }>(
    `${path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/pricing/catalog`)}${query}`, { accessToken, cache: 'no-store' },
  );
}

export function recheckP2Journey(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<{ journeyId: string; factVersion: number; checks: string[] }>(
    path(tenantId, `/journeys/${encodeURIComponent(journeyId)}:recheck`), { method: 'POST', accessToken },
  );
}

// ── Bookings summary, submission, timeline ──────────────────────────────────
export type P2BookingsSummary = {
  open: { bookings: number; deliveries: number };
  /** All-time closed stages and open tasks across the journeys in scope
   * (added 2026-09-28; absent from an older Audit Core). */
  closed?: { bookings: number; deliveries: number };
  tasks?: { open: number };
  week: { bookingsStarted: number; bookingsCompleted: number; deliveriesCompleted: number };
  month: { bookingsStarted: number; bookingsCompleted: number; deliveriesCompleted: number; avgBookingHours: number | null; avgDeliveryHours: number | null };
};

export function getP2BookingsSummary(tenantId: string, accessToken?: string) {
  return auditCoreRequest<P2BookingsSummary>(path(tenantId, '/journeys:summary'), { accessToken, timeoutMs: LIST_READ_TIMEOUT_MS });
}

export type P2UploadCounts = {
  documents: number; pages: number; uploading: number; classified: number; extracted: number;
  supporting: number; notExtracted: number; notClassified: number; duplicates: number;
};

export type P2Timeline = {
  stages: Record<'BOOKING' | 'DELIVERY', {
    status?: string | null; startedAtUtc?: string | null; submittedAtUtc?: string | null; completedAtUtc?: string | null;
    cancelled: boolean; hoursToSubmit?: number | null; hoursToComplete?: number | null; bookingConfirmDate?: string | null;
  }>;
  roles: Array<{ role: string; tasks: number; open: number; avgHoursToClose: number | null; totalHours: number }>;
  workflowEvents: Array<{ stage_code: string; event_type: string; source_kind: string; actor_role_snapshot?: string | null; occurred_at_utc: string }>;
};
