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
  /** Pages or uploads whose processing failed for good, and pages waiting for a retry. */
  failed_pages?: number;
  retrying_pages?: number;
  booking_status?: string | null;
  booking_completed_at?: string | null;
  delivery_completed_at?: string | null;
  /** The Team Lead reviewed the completed delivery. */
  delivery_reviewed_at?: string | null;
  booking_submitted_at?: string | null;
  delivery_submitted_at?: string | null;
  pc_open_tasks?: number;
  tl_open_tasks?: number;
  /** What a Phase 2 journey holds, from the stage engine's gate records; null until they are evaluated. */
  kyc_status?: 'PASS' | 'WAITING' | 'FAIL' | null;
  vehicle_proof_status?: 'PASS' | 'WAITING' | 'FAIL' | null;
  docs_required?: number | null;
  docs_received?: number | null;
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
  /** The outlet's own id (code), for the TL's columns. */
  outlet_code?: string | null;
  /** When the journey opened for the PC: the first document uploaded. */
  opened_at?: string | null;
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

/** One page's health (decision 2026-10-01): a classified page holds values
 * within eight hours or names the one action a person can take. */
export type P2PageHealthState =
  | 'READ' | 'WAITING' | 'STUCK' | 'NOT_READ' | 'NOTHING_READ' | 'REJECTED' | 'FAILED'
  | 'UNCLASSIFIED' | 'OTHERS' | 'SUPERSEDED' | 'HIDDEN';
export type P2PageHealthAction = 'READ_AGAIN' | 'UPLOAD_AGAIN' | 'RETRY' | 'SET_TYPE' | 'RESTORE';
export type P2PageHealth = {
  state: P2PageHealthState;
  action: P2PageHealthAction | null;
  since?: string | null;
  ageSeconds: number;
};
export type P2DocumentHealthSummary = Record<
  'read' | 'waiting' | 'stuck' | 'notRead' | 'nothingRead' | 'rejected' | 'failed'
  | 'unclassified' | 'others' | 'superseded' | 'defects', number>;
export type P2DocumentDefect = {
  queueId: string; batchId: string; filename: string; pageNumbers: number[];
  templateKey?: string | null; state: P2PageHealthState; since?: string | null;
};

export type P2DocumentPage = {
  queueId: string;
  health?: P2PageHealth | null;
  unitKind?: 'PAGE' | 'GROUP';
  pageNumbers?: number[];
  mergedIntoQueueId?: string | null;
  groupSource?: 'SYSTEM' | 'PC' | null;
  templateKey?: string | null;
  displayName?: string | null;
  requirement?: string | null;
  /** The PC set this page's type (or kept it as Others). */
  typeSetByPc?: boolean;
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
  /** Set when this upload was refused as the same file as an earlier one. */
  duplicateOf?: { batchId: string; filename: string; uploadedAtUtc: string } | null;
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
  documentHealth?: { summary: P2DocumentHealthSummary; defects: P2DocumentDefect[] };
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
  /** Why Audit Core wants this value looked at (LOW_CONFIDENCE,
   * DATE_BEFORE_FLOOR, DATE_UNREADABLE); empty when it stands as read.
   * Absent from an older Audit Core, in which case the confidence decides. */
  reviewReasons?: string[];
  /** A correction the PC proposed that the Team Lead has not decided yet.
   * While it is open the field is neither edited nor confirmed again. */
  pendingCorrection?: { taskId: string; proposedValue: unknown; proposedAtUtc: string | null } | null;
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

/** Ask Document Intelligence to read a page it already holds once more
 * (never a re-upload). 409 when the page is already read. */
export function rereadP2Page(tenantId: string, journeyId: string, queueId: string, accessToken?: string) {
  return auditCoreRequest<{ queueId: string; status: string }>(
    path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/pages/${encodeURIComponent(queueId)}:reread`),
    { method: 'POST', accessToken },
  );
}

/** Copy a page's values from Document Intelligence again, with no new reading. */
export function resyncP2Page(tenantId: string, journeyId: string, queueId: string, accessToken?: string) {
  return auditCoreRequest<{ queueId: string; status: string }>(
    path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/pages/${encodeURIComponent(queueId)}:resync`),
    { method: 'POST', accessToken },
  );
}

/** Make a superseded copy of a single-slot document the active one again. */
export function restoreP2DocumentCopy(tenantId: string, journeyId: string, evidenceId: string, accessToken?: string) {
  return auditCoreRequest<{ evidenceId: string; documentId: string; status: string; supersededEvidenceId: string | null }>(
    path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/documents/${encodeURIComponent(evidenceId)}:restore`),
    { method: 'POST', accessToken },
  );
}

/** `name` is the name a page kept as Others is shown under (required for Others). */
export function setP2PageType(
  tenantId: string, journeyId: string, queueId: string, templateKey: string, accessToken?: string, name?: string,
) {
  return auditCoreRequest(
    path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/pages/${encodeURIComponent(queueId)}:set-type`),
    { method: 'POST', accessToken, body: JSON.stringify(name ? { templateKey, name } : { templateKey }) },
  );
}

/** Delete a booking a failed document upload left stuck: it closes as
 * cancelled, documents and history kept, and the Team Lead is told. */
export function cancelP2Journey(tenantId: string, journeyId: string, reason: string | undefined, accessToken?: string) {
  return auditCoreRequest<{ journeyId: string; status: string }>(
    path(tenantId, `/journeys/${encodeURIComponent(journeyId)}:cancel`),
    { method: 'POST', accessToken, body: JSON.stringify({ reason: reason || undefined }) },
  );
}

export async function createP2Journey(
  tenantId: string,
  command: { outletId: string; customerName?: string; createdByName?: string },
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

/** What the customer opted for on a line: taken or not, read from the
 * invoice once the deal has one, else from the booking form. */
export type P2DealOpted = { taken: boolean; source: 'invoice' | 'booking' | 'insurance' | 'tl' | null };

/** The Management Referral (MR) discount as the Team Lead set it. */
export type P2ManagementReferral = {
  opted: boolean; amount: string | null; reason: string | null;
  setBy: string | null; setByRole: string | null; setAt: string | null;
  /** The open "Enable MR" task, when a Team Lead has raised one. */
  task?: { taskId: string; status: string; proposedAmount?: string | null; reason?: string | null } | null;
};

/** A Team Lead raises the MR task on a journey; completing it enables MR. */
export function raiseP2ManagementReferralTask(
  tenantId: string, journeyId: string, command: { amount: string; reason: string }, accessToken?: string,
) {
  return auditCoreRequest<{ taskId: string; status: string }>(path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/tasks`), {
    method: 'POST', accessToken,
    body: JSON.stringify({
      taskType: 'TL_MANAGEMENT_REFERRAL', category: 'PROCESS_CONFIRMATION',
      title: 'Enable Management Referral (MR)',
      description: `Enable the Management Referral discount of ₹${command.amount} on this journey. ${command.reason}`,
      severity: 'MEDIUM', priority: 'HIGH', assignedRoleCode: 'TL',
      allowedActions: ['COMPLETE_ACTION', 'ADD_COMMENT'],
      reference: { kind: 'MANAGEMENT_REFERRAL', proposedAmount: command.amount, reason: command.reason },
    }),
  });
}

/** The kinds of task a Team Lead or PMO raises by hand on a journey
 * (decision 2026-09-30). The System task enables Management Referral. */
export type P2RaisedTaskKind = 'DOCUMENT_UPLOAD' | 'MANUAL_VERIFICATION' | 'DATA_VIOLATION' | 'SYSTEM_MR';

export const P2_RAISED_TASK_KINDS: Array<{ kind: P2RaisedTaskKind; label: string; hint: string }> = [
  { kind: 'DOCUMENT_UPLOAD', label: 'Document Upload', hint: 'The PC uploads a document that is missing or wrong.' },
  { kind: 'MANUAL_VERIFICATION', label: 'Manual Verification', hint: 'The PC checks a value by hand and confirms it.' },
  { kind: 'DATA_VIOLATION', label: 'Data Violation', hint: 'The PC corrects data that breaks a rule.' },
  { kind: 'SYSTEM_MR', label: 'System Task · Enable MR', hint: 'A Team Lead enables the Management Referral discount on the journey.' },
];

const RAISED_TASK_TYPE: Record<Exclude<P2RaisedTaskKind, 'SYSTEM_MR'>, { taskType: string; title: string }> = {
  DOCUMENT_UPLOAD: { taskType: 'TL_DOCUMENT_UPLOAD', title: 'Upload a document' },
  MANUAL_VERIFICATION: { taskType: 'TL_MANUAL_VERIFICATION', title: 'Verify manually' },
  DATA_VIOLATION: { taskType: 'TL_DATA_VIOLATION', title: 'Correct a data violation' },
};

export type P2Assignee = { actorId: string; displayName?: string | null; roleCode: string; journeyPc: boolean };

/** The people a task on this journey can go to (active assignments in that role on its outlet). */
export function getP2JourneyAssignees(tenantId: string, journeyId: string, accessToken?: string, role = 'PC') {
  return auditCoreRequest<{ items: P2Assignee[] }>(
    `${path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/assignees`)}?role=${encodeURIComponent(role)}`,
    { accessToken, cache: 'no-store' },
  );
}

/** Raise a task by hand on a journey. The server takes the tab, the owner
 * and the actions from the task template; a PC cannot call this. */
export function raiseP2Task(
  tenantId: string, journeyId: string,
  command: { kind: P2RaisedTaskKind; description: string; assignedActorId?: string; priority?: 'NORMAL' | 'HIGH'; amount?: string; reason?: string },
  accessToken?: string,
) {
  if (command.kind === 'SYSTEM_MR') {
    return raiseP2ManagementReferralTask(tenantId, journeyId, { amount: command.amount ?? '', reason: command.reason ?? command.description }, accessToken);
  }
  const { taskType, title } = RAISED_TASK_TYPE[command.kind];
  return auditCoreRequest<{ taskId: string; status: string }>(path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/tasks`), {
    method: 'POST', accessToken,
    body: JSON.stringify({
      taskType, category: 'HUMAN', title, description: command.description,
      severity: command.priority === 'HIGH' ? 'HIGH' : 'MEDIUM', priority: command.priority ?? 'NORMAL',
      assignedRoleCode: 'PC', assignedActorId: command.assignedActorId ?? null,
      allowedActions: [], reference: { kind: command.kind },
    }),
  });
}

export function setP2ManagementReferral(
  tenantId: string, journeyId: string,
  command: { opted: boolean; amount?: string; reason: string }, accessToken?: string,
) {
  return auditCoreRequest<P2ManagementReferral>(path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/management-referral`), {
    method: 'PUT', accessToken, body: JSON.stringify(command),
  });
}

export type P2DealRow = {
  key: string;
  label: string;
  /** Present on the discounts, accessories and extended warranty only. */
  opted?: P2DealOpted | null;
  /** Insurance the customer arranged (Self): shown, kept out of every total. */
  excluded?: boolean;
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
  excluded?: boolean;
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
  /** On the MANAGEMENT_REFERRAL line only. */
  management?: P2ManagementReferral;
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
  /** Inhouse (through the dealership, premium in the deal) or Self (the
   * customer arranged it, premium out). Inhouse until the PC says otherwise. */
  insurance?: P2DealInsurance;
  /** The invoices consolidated into the sheet: retail, tax, accessory, warranty... */
  invoices?: Array<{ documentId: string; documentType: string; label: string; number?: unknown; date?: unknown; total: Money }>;
  declared: Array<{ key: string; label: string; booking: Money; billed: Money; ledger: Money; quote: Money; sources: P2DealSource[] }>;
  summary: P2DealSummary;
  flagged: number;
};

export type P2DealInsurance = {
  source: 'INHOUSE' | 'SELF';
  decidedBy: 'PC' | 'DEFAULT';
  decidedAt?: string | null;
  invoiceOnFile: boolean;
  vehicleInvoiced: boolean;
};

export function setP2InsuranceSource(
  tenantId: string, journeyId: string,
  command: { source: P2DealInsurance['source']; reason?: string }, accessToken?: string,
) {
  return auditCoreRequest<P2DealInsurance>(path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/insurance-source`), {
    method: 'PUT', accessToken, body: JSON.stringify(command),
  });
}

/** One master line in the SKU standard (decision 2026-09-30). */
export type P2StandardBenefit = {
  key: string; label: string; amount: string | null; percentage: string | null;
  scheme: { code: string; name: string; category: string; version: number; validFrom: string | null; validTo: string | null; combinability: string | null };
  scope: 'MODEL' | 'VARIANT'; section: string | null; schemeType: string | null; oldVehicleModel: string | null;
  description: string | null; contributions: Record<string, string> | null;
};

export type P2JourneyStandard = {
  journeyId: string;
  on: string | null;
  skuCode?: string | null;
  model?: string | null;
  variant?: string | null;
  available: boolean;
  reason?: string;
  basis?: 'INDIVIDUAL' | 'CORPORATE';
  sku?: { productSkuId: string; skuCode: string; model: string; variant: string; trim: string | null; fuel: string | null;
    transmission: string | null; drive: string | null; seater: string | null; category: string | null };
  priceList?: {
    priceListVersionId: string; priceList: string | null; version: number | null; effectiveFrom: string | null; effectiveTo: string | null;
    components: Array<{ key: string; label: string; commercialKey: string | null; amount: string | null; priceSince: string | null }>;
    onRoad: { individual: string | null; corporate: string | null; basis: string; amount: string | null };
  };
  consumerScheme?: { benefits: P2StandardBenefit[]; total: string | null } | null;
  exchangeScheme?: { scenario: string; benefits: P2StandardBenefit[]; applicable: P2StandardBenefit[]; applicableMax: string | null } | null;
  corporate?: {
    byCategory: Record<string, P2StandardBenefit>; range: { min: string | null; max: string | null } | null;
    corporate: { lookedUp: string; found: boolean; code?: string; name?: string; type?: string | null; privilegeCategory?: string } | null;
    exact: P2StandardBenefit | null;
  } | null;
  grid?: {
    version: number; effectiveFrom: string | null; effectiveTo: string | null; modelAsWritten: string; inScope: boolean;
    bookingProtectionDays: number | null; agreedBuffer: string | null; insuranceOdPercentMax: string | null;
    outOfTerritory: string | null; parameters: Array<{ parameter: string; note: string }>;
  } | null;
  summary?: { onRoad: string | null; consumerBenefits: string | null; exchangeBenefit: string | null; corporateBenefit: string | null;
    standardNet: string | null; standardNetForQuantity: string | null };
  unknown?: string[];
};

export function getP2JourneyStandard(tenantId: string, journeyId: string, accessToken?: string) {
  return auditCoreRequest<P2JourneyStandard>(path(tenantId, `/journeys/${encodeURIComponent(journeyId)}/standard`), { accessToken });
}

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

/** The Customer tab: one row per fact in display order, with the document
 * the KYC-reviewed value came from when it did. */
/** What was taken with the car, with the invoice items bought. */
export type P2TakenAddon = { taken: boolean; amount: string | null;
  /** Where the amount comes from: the invoice or cover note, an add-on record, or only the booking form. */
  amountSource?: 'billed' | 'record' | 'booking' | null;
  provider?: string | null;
  items: Array<{ name: string; amount: string | null; quantity?: unknown; itemCode?: string | null; documentId: string }>;
  /** What the cover note, warranty invoice or add-on record says. */
  details: Record<string, unknown>;
  /** The documents that prove it was taken. */
  documentIds?: string[] };

export type P2InvoiceLine = { description?: string | null; category?: string | null; itemCode?: string | null; hsnSac?: string | null;
  quantity?: unknown; unitRate?: string | null; grossAmount?: string | null; discountAmount?: string | null; taxableAmount?: string | null;
  taxRate?: unknown; taxAmount?: string | null; netAmount?: string | null };

export type P2Invoice360 = { documentId: string; documentType: string; label: string; linkedAtUtc?: string | null;
  header: Record<string, unknown>; totals: Record<string, string | null>; particulars?: unknown; lineItems: P2InvoiceLine[] };

export type P2Vehicle360 = {
  product: P2Record | null;
  units: P2Record[];
  photoCount: number;
  addons: { accessories: P2TakenAddon; warranty: P2TakenAddon; insurance: P2TakenAddon };
  booking: { bookingReference?: string | null; bookingDate?: string | null; salesConsultant?: string | null;
    dealerBranch?: string | null; dealType?: string | null; dealSource?: string | null; leadSource?: string | null;
    expectedDelivery?: string | null };
  delivery: P2Record | null;
  /** Registration, financier, insurer on file and when the journey started. */
  journey?: { startedAtUtc?: string | null; registrationNumber?: string | null; financier?: string | null; insurer?: string | null };
};

export type P2TradeIn360 = {
  exchange: { applicable: boolean | null; value: string | null };
  tradeIn: P2Record | null;
  certificates: P2Record[];
  valuations: P2Record[];
};

export type P2Customer360 = {
  fields: Array<{ key: string; label: string; value: unknown; source?: string | null }>;
  identityStatus: 'DOCUMENT_VERIFIED' | 'VERIFIED' | 'CONFLICT' | 'PENDING';
  kycDocuments: string[];
};

export type P2Addons = {
  /** The same answer the Vehicle tab gives: taken or not, and for how much. */
  taken?: { accessories: P2TakenAddon; warranty: P2TakenAddon; insurance: P2TakenAddon };
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
    documentId: string; evidenceId: string | null; queueId?: string | null; documentType?: string | null;
    templateKey: string; label: string; stage: string; pages: number[]; linkedAtUtc?: string | null;
    fields: P2DocumentFieldView[]; fieldCount: number; needsReview: number; corrected: number;
  }>;
};

/** How a receipt meets the bank statement. */
export type P2BankMatch = {
  status: 'MATCHED' | 'UNMATCHED' | 'AMBIGUOUS' | 'NOT_APPLICABLE' | 'NO_STATEMENT';
  method?: 'REFERENCE' | 'UTR' | 'AMOUNT_DATE' | null;
  documentId?: string | null; date?: string | null; reference?: string | null;
  /** True when the reconciliation had already recorded this match. */
  recorded: boolean;
};

/** One bank statement entry as the statement prints it. */
export type P2BankLine = {
  documentId: string; bank?: string | null; accountHolder?: string | null; accountNumber?: string | null;
  date?: string | null; description?: string | null; reference?: string | null; counterparty?: string | null;
  credit: Money; debit: Money; balance: Money;
  matchedPaymentId?: string | null; matchedReceipt?: string | null; matchMethod?: string | null;
};

export type P2PaymentItem = {
  paymentId: string; amount: Money; receiptNumber?: string | null; receiptDate?: string | null;
  mode?: string | null; stage?: string | null; bank?: string | null; reference?: string | null;
  documentId?: string | null; document?: string | null; counted: boolean; notCountedReason?: string | null;
  /** The earlier receipt this one repeats (same number, amount and date). */
  duplicateOf?: string | null;
  bankMatch?: string | null;
  bankStatement?: P2BankMatch | null;
};

export type P2Payments360 = {
  items: P2PaymentItem[];
  receiptsTotal: string; loanDisbursed: string; paidTotal: string; byStage: Record<string, string>;
  duplicates?: number;
  bankStatement?: {
    lines: P2BankLine[]; creditsTotal: string; matchedTotal: string;
    matched: number; unmatchedCredits: number; receiptsWithoutCredit: number;
  };
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
  /** Draft until the Team Lead reviews the completed delivery. */
  review?: { status: 'DRAFT' | 'REVIEWED'; reviewedAtUtc: string | null; reviewerRole: string | null; label: string };
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
  vehicle: P2Vehicle360;
  invoices: { documents: P2Invoice360[]; count: number };
  tradein: P2TradeIn360;
  customer: P2Customer360;
  registration: { records: P2Record[]; charges?: P2DealCategory | null };
  compliance: P2Compliance360;
  duplicates: { pairs: P2DuplicatePair[] };
  'compliance-report': P2ComplianceReport;
  audit: P2AuditTrail;
};

export type P2AuditTrail = {
  pc?: string | null;
  milestones: Array<{ key: string; label: string; atUtc: string; who?: string | null; hoursSincePrevious: number | null }>;
  pending: Array<{ key: string; label: string }>;
  /** How long each stage took and the time each role spent. */
  stages?: P2Timeline['stages'];
  roles?: P2Timeline['roles'];
  tasks: {
    summary: { opened: number; closed: number; open: number; avgHoursToClose: number | null };
    items: Array<{
      taskId: string; title: string; category: string; taskType: string; role: string; raisedBy?: string | null;
      severity: string; status: string; openedAtUtc: string; closedAtUtc?: string | null; hoursOpen: number | null;
    }>;
  };
  events: Array<{
    atUtc: string; kind: 'journey' | 'document' | 'review' | 'stage' | 'check' | 'task' | 'other';
    type: string; subject?: string | null; who?: string | null; details?: Record<string, unknown> | null;
  }>;
  /** How each stage completed: the gates the stage engine evaluated and
   * every rule that ran for it. Absent from an older Audit Core. */
  completion?: Record<'booking' | 'delivery', P2StageCompletion>;
};

export type P2StageCompletion = {
  completedAtUtc?: string | null;
  status?: string | null;
  gates: Array<{ key: string; label: string; kind: string; status: 'WAITING' | 'PASS' | 'FAIL'; evaluatedAtUtc?: string | null; details: Record<string, unknown> }>;
  controls: Array<{ code: string; label: string; executor: string; status: string; reason?: string | null; evaluatedAtUtc?: string | null;
    evaluations: number; leftValue?: unknown; rightValue?: unknown }>;
  counts: { fired: number; passed: number; failed: number; waiting: number };
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
  /** No booking date on the booking form (nor entered by hand): the deal is
   * not priced until the PC enters it; a Medium task asks. */
  bookingDateMissing?: boolean;
  invoiceDate?: string | null;
  appliedDate: string | null;
  basis: 'BOOKING_DATE' | 'INVOICE_DATE';
  reason?: string | null;
  setByActorId?: string | null;
  setAtUtc?: string | null;
  appliedPriceList: P2PriceListRef | null;
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
  command: { basis: P2Pricing['basis']; reason?: string }, accessToken?: string,
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
  return auditCoreRequest<{
    journeyId: string; factVersion: number; checks: string[];
    pagesReread?: number; documentHealth?: P2DocumentHealthSummary;
  }>(
    path(tenantId, `/journeys/${encodeURIComponent(journeyId)}:recheck`), { method: 'POST', accessToken },
  );
}

// ── Bookings summary, submission, timeline ──────────────────────────────────
export type P2BookingsSummary = {
  open: { bookings: number; deliveries: number };
  /** All-time closed stages and open tasks across the journeys in scope
   * (added 2026-09-28; absent from an older Audit Core). */
  closed?: { bookings: number; deliveries: number };
  /** Open tasks of the open journeys as the rows count them: all roles, the PC's and the
   * Team Lead's (`pc` and `tl` absent from an older Audit Core). */
  tasks?: { open: number; pc?: number; tl?: number };
  /** The open journeys and what they lack, with no Booking or Delivery split. */
  journeys?: { open: number; kycMissing: number; documentsPending: number };
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
