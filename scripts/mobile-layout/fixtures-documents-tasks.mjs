// Mock API responses for the mobile layout harness: documents-tasks screens. Same tuple shape as fixtures.mjs.
// Shapes follow src/services/audit-core/uc03P2.ts (P2DocumentsResponse, P2DocumentReview, P2TasksResponse,
// P2VehiclePhotoList, P2UploadedFile), taskManager.ts (TmTaskList, TmContext) and uc03MissingDocuments.ts.
// eslint-disable-next-line no-unused-vars
import { TENANT, today, iso, outlets } from './fixtures-base.mjs';

const J1 = 'journey-mobile-1';
const J2 = 'journey-mobile-2';
const J3 = 'journey-mobile-3';
const J4 = 'journey-mobile-4';
export const REVIEW_DOCUMENT_ID = 'doc-booking-form-1';

const P = `/p2/v1/tenants/[^/]+`;
const hoursFrom = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
const dayOffset = (n) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const dayLabel = (date) => new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })
  .format(new Date(`${date}T12:00:00Z`));

// ── Journey documents (P2DocumentsResponse) ─────────────────────────────────
const F1 = 'Booking_Docket_Bibhutibhushan_Pradhan_Scan_2026-11-07.pdf';
const F2 = 'Delivery_File_Bibhutibhushan_Pradhan_Tax_Invoice_Form21_GatePass_2026-11-07.pdf';
const F3 = 'Insurance_Policy_RSA_Invoice_Bibhutibhushan_Pradhan_WhatsApp_Scan_2026-11-07.pdf';
const FOREIGN = 'Tapan_Kumar_Patra_Aadhaar_and_PAN_Card_Copy_from_Gallery_IMG_20261107_114218.pdf';

const health = (state, action = null, ageSeconds = 600) => ({ state, action, since: iso(today, '10:20:00'), ageSeconds });

function page(batch, n, o) {
  return {
    queueId: `q-${batch}-${n}`,
    health: o.health ?? health('READ'),
    unitKind: 'PAGE',
    pageNumbers: [n],
    mergedIntoQueueId: null,
    groupSource: null,
    templateKey: o.templateKey ?? null,
    displayName: o.displayName ?? null,
    requirement: o.requirement ?? null,
    typeSetByPc: false,
    status_reason: o.reason ?? null,
    page_number: n,
    client_upload_id: `web-p2-mobile-${batch}-${n}`,
    diDocumentId: o.documentId,
    classified_document_type: o.templateKey ?? null,
    business_stage: o.stage ?? null,
    queue_status: o.status ?? 'READY',
    attempt_count: o.attempts ?? 1,
    extracted_field_count: o.fields ?? (o.status === 'READY' || !o.status ? 14 : 0),
    last_error: o.lastError ?? null,
    created_at_utc: iso(today, '10:12:00'),
    updated_at_utc: iso(today, '10:31:00'),
  };
}

function documentsResponse(journeyId) {
  const b1 = [
    page(1, 1, { templateKey: 'booking_form', displayName: 'Booking form', requirement: 'REQUIRED', stage: 'BOOKING', documentId: REVIEW_DOCUMENT_ID, fields: 23 }),
    page(1, 2, { templateKey: 'pan_card', displayName: 'PAN Card', requirement: 'REQUIRED', stage: 'BOOKING', documentId: 'doc-pan-1', fields: 4 }),
    page(1, 3, { templateKey: 'dealer_receipt', displayName: 'Dealer receipt', requirement: 'REQUIRED', stage: 'BOOKING', documentId: 'doc-receipt-1',
      status: 'NEEDS_REVIEW', health: health('NOT_READ', 'READ_AGAIN', 7200), fields: 0,
      reason: 'Classified as a dealer receipt but the amount, receipt number and date could not be read.' }),
    page(1, 4, { templateKey: 'cost_sheet', displayName: 'Cost sheet', requirement: 'REQUIRED', stage: 'BOOKING', documentId: 'doc-cost-sheet-1', fields: 31 }),
    page(1, 5, { templateKey: 'upi_screenshot', displayName: 'UPI payment screenshot', requirement: 'SUPPORTING', stage: 'BOOKING', documentId: 'doc-upi-1',
      status: 'NEEDS_REVIEW', health: health('NOTHING_READ', 'READ_AGAIN', 5400), fields: 0,
      reason: 'Read with nothing found: the screenshot is cropped above the transaction reference.' }),
    page(1, 6, { status: 'SUPPORTING', stage: 'BOOKING', documentId: 'doc-unclassified-1', health: health('UNCLASSIFIED', 'SET_TYPE', 4000), fields: 0,
      reason: 'Document Intelligence could not tell what this page is (handwritten note on letterhead).' }),
  ];
  const b2 = [
    page(2, 1, { templateKey: 'tax_invoice', displayName: 'Tax invoice', requirement: 'REQUIRED', stage: 'DELIVERY', documentId: 'doc-invoice-1', fields: 42 }),
    page(2, 2, { templateKey: 'form_21', displayName: 'Form 21 (sale certificate)', requirement: 'REQUIRED', stage: 'DELIVERY', documentId: 'doc-form21-1',
      status: 'EXTRACTING', health: health('WAITING', null, 240), fields: 0 }),
    page(2, 3, { templateKey: 'gate_pass', displayName: 'Vehicle gate pass', requirement: 'REQUIRED', stage: 'DELIVERY', status: 'CLASSIFYING',
      health: health('WAITING', null, 180), fields: 0 }),
    page(2, 4, { status: 'FAILED', stage: 'DELIVERY', health: health('FAILED', 'RETRY', 9000), attempts: 5, fields: 0,
      lastError: 'DI_TIMEOUT', reason: 'Document Intelligence did not answer after 5 attempts (15, 30, 60 and 120 minutes apart).' }),
    page(2, 5, { status: 'QUEUED', stage: 'DELIVERY', health: health('WAITING', null, 60), fields: 0 }),
  ];
  const b3 = [
    page(3, 1, { templateKey: 'insurance_policy', displayName: 'Insurance policy', requirement: 'REQUIRED', stage: 'DELIVERY', documentId: 'doc-policy-1', fields: 19 }),
    page(3, 2, { templateKey: 'rsa_invoice', displayName: 'RSA invoice', requirement: 'REQUIRED', stage: 'DELIVERY', status: 'RETRY_WAIT',
      health: health('WAITING', null, 1500), attempts: 2, fields: 0, reason: 'The document service was busy; retrying automatically.' }),
    page(3, 3, { status: 'FAILED', stage: 'DELIVERY', health: health('REJECTED', 'READ_AS_IS', 3000), fields: 0, lastError: 'DI_QUALITY_BLURRED',
      reason: 'Refused by the scan-quality check: blurred (sharpness 31 of 100) and faded at the right edge.' }),
  ];
  const batch = (id, filename, pages, status, sizeKb, time) => ({
    batchId: `batch-${id}`, original_filename: filename, content_type: 'application/pdf', size_bytes: sizeKb * 1024,
    sha256: `9f2c${id}e1a7b0c44d9e8f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7${id}`, page_count: pages.length,
    batch_status: status, grouping_status: 'DONE', created_at_utc: iso(today, time), updated_at_utc: iso(today, '10:31:00'),
    duplicateOf: null, pages,
  });
  const lineage = [
    { evidenceId: 'ev-1', documentId: REVIEW_DOCUMENT_ID, document_type_key: 'booking_form', process_area: 'BOOKING', association_status: 'ACTIVE',
      linked_at_utc: iso(today, '10:16:00'), original_filename: F1, templateKey: 'booking_form', displayName: 'Booking form', requirement: 'REQUIRED' },
    { evidenceId: 'ev-corp', documentId: 'doc-corporate-id-1', document_type_key: 'corporate_id', process_area: 'BOOKING', association_status: 'ACTIVE',
      linked_at_utc: iso(dayOffset(3), '16:40:00'), original_filename: 'Employee_ID_Card_Odisha_Power_Transmission_Corporation_Ltd.jpg',
      templateKey: 'corporate_id', displayName: 'Corporate ID', requirement: 'REQUIRED' },
  ];
  const item = (templateKey, displayName, stage, requirement, status, extra = {}) => ({
    templateKey, displayName, stage, requirement, status, readyCount: status === 'RECEIVED' ? 1 : 0, documentIds: [], group: null, groupLabel: null, ...extra,
  });
  const checklist = [
    item('booking_form', 'Booking form', 'BOOKING', 'REQUIRED', 'RECEIVED', { documentIds: [REVIEW_DOCUMENT_ID] }),
    item('pan_card', 'PAN Card', 'BOOKING', 'REQUIRED', 'RECEIVED', { group: 'KYC', groupLabel: 'PAN Card or Aadhaar', documentIds: ['doc-pan-1'] }),
    item('aadhaar', 'Aadhaar', 'BOOKING', 'REQUIRED', 'COVERED', { group: 'KYC', groupLabel: 'PAN Card or Aadhaar' }),
    item('dealer_receipt', 'Dealer receipt (booking amount)', 'BOOKING', 'REQUIRED', 'RECEIVED', { documentIds: ['doc-receipt-1'] }),
    item('cost_sheet', 'Cost sheet', 'BOOKING', 'REQUIRED', 'RECEIVED', { documentIds: ['doc-cost-sheet-1'] }),
    item('corporate_id', 'Corporate ID', 'BOOKING', 'REQUIRED', 'RECEIVED', { conditional: true,
      reason: 'The deal claims a corporate discount (Odisha Power Transmission Corporation Ltd).', documentIds: ['doc-corporate-id-1'] }),
    item('finance_sanction_letter', 'Finance sanction letter', 'BOOKING', 'REQUIRED', 'MISSING', { conditional: true,
      reason: 'The booking form names HDFC Bank Ltd as the financier.' }),
    item('exchange_evaluation', 'Exchange vehicle evaluation sheet', 'BOOKING', 'OPTIONAL', 'MISSING'),
    item('tax_invoice', 'Tax invoice', 'DELIVERY', 'REQUIRED', 'RECEIVED', { documentIds: ['doc-invoice-1'] }),
    item('form_21', 'Form 21 (sale certificate)', 'DELIVERY', 'REQUIRED', 'RECEIVED', { documentIds: ['doc-form21-1'], readyCount: 0 }),
    item('gate_pass', 'Vehicle gate pass', 'DELIVERY', 'REQUIRED', 'MISSING'),
    item('insurance_policy', 'Insurance policy', 'DELIVERY', 'REQUIRED', 'RECEIVED', { documentIds: ['doc-policy-1'] }),
    item('rsa_invoice', 'RSA invoice', 'DELIVERY', 'REQUIRED', 'MISSING', { conditional: true,
      reason: 'The tax invoice bills Roadside Assistance (3 years) ₹2,950.' }),
    item('ew_invoice', 'Extended warranty invoice', 'DELIVERY', 'REQUIRED', 'MISSING', { conditional: true,
      reason: 'The tax invoice bills Extended Warranty (4th and 5th year, 1,00,000 km) ₹14,160.' }),
    item('delivery_checklist', 'Signed delivery checklist', 'DELIVERY', 'OPTIONAL', 'MISSING'),
  ];
  return {
    journeyId,
    batches: [batch(1, F1, b1, 'COMPLETED', 4812, '10:12:00'), batch(2, F2, b2, 'PROCESSING', 7340, '10:24:00'),
      batch(3, F3, b3, 'PARTIAL_FAILURE', 2210, '10:27:00')],
    documents: lineage,
    checklist,
    conditions: ['CORPORATE_DISCOUNT_CLAIMED', 'FINANCED_HDFC_BANK', 'RSA_BILLED', 'EXTENDED_WARRANTY_BILLED'],
    counts: { documents: 12, pages: 14, uploading: 0, classified: 10, extracted: 7, supporting: 1, notExtracted: 3, notClassified: 3, duplicates: 1 },
    documentHealth: {
      summary: { read: 6, waiting: 4, stuck: 0, notRead: 1, nothingRead: 1, rejected: 1, failed: 1, unclassified: 1, others: 0, superseded: 0, defects: 5 },
      defects: [
        { queueId: 'q-1-3', batchId: 'batch-1', filename: F1, pageNumbers: [3], templateKey: 'dealer_receipt', state: 'NOT_READ', since: iso(today, '10:20:00') },
        { queueId: 'q-1-5', batchId: 'batch-1', filename: F1, pageNumbers: [5], templateKey: 'upi_screenshot', state: 'NOTHING_READ', since: iso(today, '10:20:00') },
        { queueId: 'q-1-6', batchId: 'batch-1', filename: F1, pageNumbers: [6], templateKey: null, state: 'UNCLASSIFIED', since: iso(today, '10:20:00') },
        { queueId: 'q-2-4', batchId: 'batch-2', filename: F2, pageNumbers: [4], templateKey: null, state: 'FAILED', since: iso(today, '10:20:00') },
        { queueId: 'q-3-3', batchId: 'batch-3', filename: F3, pageNumbers: [3], templateKey: null, state: 'REJECTED', since: iso(today, '10:20:00') },
      ],
    },
    files: [
      { batchId: 'batch-1', fileName: F1, uploadedAtUtc: iso(today, '10:12:00'), identity: { status: 'BELONGS', personName: 'BIBHUTIBHUSHAN PRADHAN', maskedPan: 'AXXXX4521K', reason: null } },
      { batchId: 'batch-2', fileName: F2, uploadedAtUtc: iso(today, '10:24:00'), identity: { status: 'BELONGS', personName: 'BIBHUTIBHUSHAN PRADHAN', maskedPan: null, reason: null } },
      { batchId: 'batch-3', fileName: F3, uploadedAtUtc: iso(today, '10:27:00'), identity: { status: 'UNKNOWN', personName: null, maskedPan: null, reason: null } },
      { batchId: 'batch-4', fileName: FOREIGN, uploadedAtUtc: iso(today, '10:29:00'),
        identity: { status: 'FOREIGN', personName: 'TAPAN KUMAR PATRA', maskedPan: 'BQXXX7731M', reason: 'The PAN and Aadhaar name another person than the booking form.' },
        movedTo: { journeyId: J4, reference: 'ADI-TAM-261107-014' } },
    ],
    customerName: 'Bibhutibhushan Pradhan',
  };
}

// ── One document in the editor (P2DocumentReview) ──────────────────────────
function field(fieldKey, value, confidence, o = {}) {
  return {
    canonicalFieldId: `cf-${fieldKey}`, fieldKey, sourceFactVersion: o.version ?? 1,
    extractedValue: o.extracted ?? value, modifiedValue: o.modified ?? null, effectiveValue: value,
    confidenceScore: confidence, isModified: Boolean(o.modified), reviewedByActorId: o.reviewedBy ?? null,
    reviewedAtUtc: o.reviewedAt ?? null, pageNo: 1,
    evidenceRegion: { x: 0.08, y: 0.1 + (o.row ?? 0) * 0.05, width: 0.42, height: 0.035 },
    reviewReasons: o.reasons ?? (confidence !== null && confidence < 90 ? ['LOW_CONFIDENCE'] : []),
    pendingCorrection: o.pending ?? null,
  };
}

function documentReview(journeyId, documentId) {
  return {
    journeyId, documentId, documentTypeKey: 'booking_form', stage: 'BOOKING', originalFilename: F1,
    processingStatus: 'PROCESSED', confirmationStatus: 'PENDING_REVIEW',
    // The harness answers every call as JSON, so a page image cannot be served: no preview.
    contentAvailable: false, diReadError: null,
    fields: [
      field('customer_name', 'BIBHUTIBHUSHAN PRADHAN', 98.6, { row: 0 }),
      field('booking_date', '1907-11-02', 93.1, { row: 1, reasons: ['DATE_BEFORE_FLOOR'] }),
      field('booking_amount', '21000', 62.4, { row: 2 }),
      field('model_variant', 'XUV 3XO AX5 L 1.2 TGDi 6AT Galvanic Grey Dual Tone', 71.8, { row: 3 }),
      field('financier_name', 'HDFC Bank Ltd, Bhubaneswar Saheed Nagar Branch', 84.0, { row: 4,
        pending: { taskId: 'task-tl-correction-1', proposedValue: 'HDFC Bank Ltd', proposedAtUtc: iso(today, '10:40:00') } }),
      field('mobile_number', '98610XXXXX', 96.2, { row: 5 }),
      field('customer_address', 'Plot No. 1123/2456, Lane 4, Near Sai Mandir, Patrapada, Bhubaneswar, Khordha, Odisha 751019', 88.7,
        { row: 6, modified: 'Plot No. 1123/2456, Lane 4, Patrapada, Bhubaneswar 751019', extracted: 'Plot No. 1123/2456 Lane 4 Near Sai Mandir Patrapada Bhubaneswar',
          reviewedBy: 'Subhashree Panda (PC)', reviewedAt: iso(today, '10:36:00') }),
      field('pan_number', 'AXXXX4521K', 99.1, { row: 7, reviewedBy: 'Subhashree Panda (PC)', reviewedAt: iso(today, '10:35:00') }),
      field('exchange_vehicle', null, null, { row: 8 }),
      field('corporate_scheme', 'Odisha Power Transmission Corporation Ltd employee', 91.3, { row: 9 }),
      field('dealer_outlet', 'Aditya Hyundai, Patia Satellite Showroom', 97.4, { row: 10 }),
      field('sales_consultant', 'Prasanta Kumar Mohapatra', 95.0, { row: 11 }),
    ],
    correctionHistory: [
      { fieldKey: 'customer_address', canonicalFieldId: 'cf-customer_address', sourceFactVersion: 1,
        extractedValue: 'Plot No. 1123/2456 Lane 4 Near Sai Mandir Patrapada Bhubaneswar',
        effectiveValue: 'Plot No. 1123/2456, Lane 4, Patrapada, Bhubaneswar 751019',
        reviewedByActorId: 'Subhashree Panda (PC)', reviewedAtUtc: iso(today, '10:36:00') },
    ],
    relatedTasks: [
      { taskId: 'task-pc-verify-amount', taskType: 'DOCUMENT_FIELD_REVIEW', title: 'Check the booking amount read from the booking form (62% confidence)',
        status: 'READY', sourceType: 'DOCUMENT_FIELD', sourceCode: 'LOW_CONFIDENCE', createdAtUtc: iso(today, '10:32:00') },
      { taskId: 'task-tl-correction-1', taskType: 'FIELD_CORRECTION_APPROVAL', title: 'Approve the financier name correction proposed by the PC',
        status: 'AWAITING_REQUESTER_REVIEW', sourceType: 'DOCUMENT_FIELD', sourceCode: 'HIGH_CONFIDENCE_CORRECTION', createdAtUtc: iso(today, '10:40:00') },
    ],
    relatedRules: ['MINIMUM_BOOKING_AMOUNT', 'BOOKING_DATE_FLOOR'],
  };
}

// ── Tasks (P2TasksResponse) ─────────────────────────────────────────────────
const journeys = {
  [J1]: { customer_name: 'Bibhutibhushan Pradhan', outlet_name: outlets[1].outletName, vehicle: 'XUV 3XO AX5 L 1.2 TGDi 6AT Galvanic Grey Dual Tone', journey_reference: 'ADI-PAT-261107-009' },
  [J2]: { customer_name: 'Sasmita Mohapatra Behera', outlet_name: outlets[0].outletName, vehicle: 'Scorpio-N Z8 L 2.2 mHawk Diesel 4WD AT 7-Seater', journey_reference: 'ADI-TAM-261105-021' },
  [J3]: { customer_name: 'Debabrata Satapathy Mahapatra', outlet_name: outlets[1].outletName, vehicle: 'Thar ROXX AX7L 2.2 Diesel 4X4 AT Nebula Blue', journey_reference: 'ADI-PAT-261103-004' },
  [J4]: { customer_name: 'Tapan Kumar Patra', outlet_name: outlets[0].outletName, vehicle: 'Bolero Neo N10 (O) 1.5 mHawk100 Diesel', journey_reference: 'ADI-TAM-261107-014' },
};

let seq = 0;
function task(journeyId, o) {
  seq += 1;
  return {
    source_system: 'P2', reviewerClosure: null, legacy_queue_url: null, priority_rank: seq,
    task_id: o.id, journey_id: journeyId, root_task_id: null, parent_task_id: null, round_number: o.round ?? 1,
    task_type: o.type, category: o.category ?? 'DOCUMENT', origin_kind: o.origin ?? 'SYSTEM', source_type: o.sourceType ?? 'RULE',
    source_code: o.sourceCode ?? o.type, title: o.title, description: o.description, reference: o.reference ?? {},
    severity: o.severity ?? 'MEDIUM', priority: o.priority ?? 'NORMAL', assigned_role_code: o.role ?? 'PC', assigned_actor_id: null,
    raised_by_actor_id: o.raisedBy ?? null, raised_by_role_code: o.raisedByRole ?? null,
    allowed_actions: o.actions ?? ['ADD_COMMENT'], completion_protocol: o.protocol ?? 'MACHINE_VERIFIED',
    task_status: o.status ?? 'READY', due_at_utc: o.due === null ? null : hoursFrom(o.due ?? 6),
    created_at_utc: iso(o.createdDay ?? today, '10:32:00'), updated_at_utc: iso(today, '10:45:00'),
    ...journeys[journeyId], dealer_name: outlets[0].dealerName,
    queue_tab: o.tab ?? (o.docCategory ? 'DOCUMENTS' : 'OTHER'),
    document_category: o.docCategory ?? null, document: o.document ?? null,
    comment_count: o.comments ?? 0, verified_at_utc: null, completion_result: o.result ?? {},
  };
}

const doc = (category, categoryLabel, file, pages, reason, documentId = null) => ({ category, categoryLabel, file, pages, reason, documentId });

function pcTasks() {
  seq = 0;
  return [
    task(J1, { id: 'task-pc-missing-sanction', type: 'DOCUMENT_MISSING', sourceCode: 'DOCUMENT_MISSING', docCategory: 'MISSING_DOCUMENT', severity: 'HIGH', due: -5,
      title: 'Upload the finance sanction letter from HDFC Bank Ltd for this booking',
      description: 'The booking form names HDFC Bank Ltd as the financier, so the sanction letter (or the disbursement memo) is required before the delivery file can close.',
      actions: ['UPLOAD_DOCUMENT', 'ADD_COMMENT'], comments: 2,
      document: doc('MISSING_DOCUMENT', 'Missing document', null, [], 'Finance sanction letter: the deal is financed by HDFC Bank Ltd.') }),
    task(J1, { id: 'task-pc-missing-ew', type: 'DOCUMENT_MISSING', sourceCode: 'DOCUMENT_MISSING', docCategory: 'MISSING_DOCUMENT', due: 20,
      title: 'Upload the extended warranty invoice billed on the tax invoice',
      description: 'The tax invoice bills Extended Warranty (4th and 5th year, 1,00,000 km) for ₹14,160; its own invoice is not on file.',
      actions: ['UPLOAD_DOCUMENT', 'ADD_COMMENT'],
      document: doc('MISSING_DOCUMENT', 'Missing document', null, [], 'Extended warranty invoice for ₹14,160 billed on invoice MAH/PAT/2026-27/004512.') }),
    task(J1, { id: 'task-pc-quality', type: 'PC_PAGE_QUALITY_REJECTED', docCategory: 'IMAGE_QUALITY', severity: 'HIGH', priority: 'HIGH', due: -2,
      title: 'Re-scan page 3 of the insurance and RSA file: refused as blurred and faded',
      description: 'The scan-quality check refused page 3. Upload a clear, well-lit scan, or send the page as it is if you can read every figure on it.',
      actions: ['CLOSE_TASK', 'ADD_COMMENT'], protocol: 'HUMAN_CONFIRMED', reference: { pageQueues: [{ page: 3, queueId: 'q-3-3' }] },
      document: doc('IMAGE_QUALITY', 'Image quality', F3, [3], 'Blurred (sharpness 31 of 100) and faded at the right edge.') }),
    task(J1, { id: 'task-pc-resubmit', type: 'DOCUMENT_RESUBMIT', docCategory: 'FAILED_TO_READ', severity: 'HIGH', due: 3,
      title: 'Document to resubmit: page 4 of the delivery file was not read after five attempts',
      description: 'Document Intelligence did not answer for page 4 after 5 attempts over four hours. Send it again, or upload the page again.',
      actions: ['REUPLOAD_DOCUMENT', 'ADD_COMMENT'], reference: { pages: [{ queueId: 'q-2-4', pageNumbers: [4], templateKey: null, code: 'DI_TIMEOUT' }] },
      document: doc('FAILED_TO_READ', 'Failed to read', F2, [4], 'Document Intelligence did not answer after 5 attempts.') }),
    task(J1, { id: 'task-pc-unrecognized', type: 'PC_VERIFY_UNRECOGNIZED_DOCUMENT', docCategory: 'FAILED_TO_READ', severity: 'LOW', due: 30,
      title: 'Set the document type of page 6 of the booking docket',
      description: 'Document Intelligence could not tell what this page is. Choose its type, or keep it as Others with a name.',
      reference: { queueId: 'q-1-6' }, actions: ['ADD_COMMENT'],
      document: doc('FAILED_TO_READ', 'Failed to read', F1, [6], 'Not classified: a handwritten note on dealer letterhead.') }),
    task(J1, { id: 'task-pc-verify-amount', type: 'DOCUMENT_FIELD_REVIEW', sourceType: 'DOCUMENT_FIELD', sourceCode: 'LOW_CONFIDENCE', docCategory: 'MANUAL_VERIFICATION',
      category: 'FIELD_REVIEW', due: 8, title: 'Check the booking amount read from the booking form (62% confidence)',
      description: 'The booking amount was read as ₹21,000 with low confidence. Confirm it against the page or correct it.',
      reference: { documentId: REVIEW_DOCUMENT_ID, fieldKey: 'booking_amount' }, actions: ['CORRECT_EXTRACTED_FIELD', 'ADD_COMMENT'],
      document: doc('MANUAL_VERIFICATION', 'Manual verification', F1, [1], 'Booking amount ₹21,000 read at 62%.', REVIEW_DOCUMENT_ID) }),
    task(J1, { id: 'task-pc-verify-date', type: 'DOCUMENT_FIELD_REVIEW', sourceType: 'DOCUMENT_FIELD', sourceCode: 'DATE_BEFORE_FLOOR', docCategory: 'MANUAL_VERIFICATION',
      category: 'FIELD_REVIEW', due: 8, title: 'Check the booking date: read as 02 Nov 1907, before the programme started',
      description: 'A booking date before the programme started is almost certainly misread. Check the page and correct it.',
      reference: { documentId: REVIEW_DOCUMENT_ID, fieldKey: 'booking_date' }, actions: ['CORRECT_EXTRACTED_FIELD', 'ADD_COMMENT'],
      document: doc('MANUAL_VERIFICATION', 'Manual verification', F1, [1], 'Booking date read as 1907-11-02.', REVIEW_DOCUMENT_ID) }),
    task(J2, { id: 'task-pc-sku', type: 'SKU_CLOSEST_MATCH_CONFIRM', tab: 'MANUAL_VERIFICATION', category: 'SKU', due: 12, severity: 'MEDIUM',
      title: 'Confirm the vehicle: closest price-list match is Scorpio-N Z8 L Diesel 4WD AT 7-Seater (Midnight Black)',
      description: 'The invoice says "SCORPIO N Z8L D AT 4WD 7S MB" which matches no SKU exactly. The closest SKU in the November 2026 price list is suggested.',
      actions: ['ACCEPT', 'REJECT', 'ADD_COMMENT'] }),
    task(J2, { id: 'task-pc-confirm-cash', type: 'PC_CONFIRMATION', tab: 'MANUAL_VERIFICATION', category: 'PAYMENT', due: -26, priority: 'HIGH', severity: 'HIGH',
      title: 'Was the cash booking amount of ₹51,000 intimated to accounts the same day?',
      description: 'Receipt RCPT/TAM/2026-27/01877 shows ₹51,000 in cash on 05 Nov. Cash above ₹50,000 must be intimated to accounts the same day.',
      actions: ['COMPLETE_ACTION', 'ADD_COMMENT'], comments: 1,
      reference: { answers: [{ value: 'YES', label: 'Yes, intimated the same day' }, { value: 'NO', label: 'No, not intimated', requiresComment: true }] } }),
    task(J3, { id: 'task-pc-quality-2', type: 'PC_PAGE_QUALITY_REJECTED', docCategory: 'IMAGE_QUALITY', status: 'RETURNED', round: 2, due: -50, priority: 'URGENT', severity: 'CRITICAL',
      createdDay: dayOffset(3),
      title: 'Re-scan pages 2 and 5 of the Form 20 and Form 21 bundle: refused as too small and low contrast',
      description: 'Pages 2 and 5 are below the minimum resolution. The Team Lead returned the task: the earlier re-scan was the same photo.',
      actions: ['CLOSE_TASK', 'ADD_COMMENT'], protocol: 'HUMAN_CONFIRMED', comments: 4,
      reference: { pageQueues: [{ page: 2, queueId: 'q-j3-2' }, { page: 5, queueId: 'q-j3-5' }] },
      document: doc('IMAGE_QUALITY', 'Image quality', 'Form20_Form21_Debabrata_Satapathy_Mahapatra_Mobile_Photo_Compressed.pdf', [2, 5],
        'Too small (612 × 790 px) and low contrast; retake in daylight without a flash.') }),
    task(J3, { id: 'task-pc-wrong-name', type: 'DOCUMENT_MISSING', sourceCode: 'WRONG_CUSTOMER_NAME', docCategory: 'MISSING_DOCUMENT', due: 4,
      title: 'The insurance policy is in the name of "Debabrata Mahapatra", not the booking customer',
      description: 'Upload a policy issued in the customer\'s full name as on the booking form and PAN, or an endorsement correcting it.',
      actions: ['UPLOAD_DOCUMENT', 'ADD_COMMENT'],
      document: doc('MISSING_DOCUMENT', 'Missing document', 'Policy_3001-8817-2219-0001_ICICI_Lombard.pdf', [1],
        'Name on the policy differs from the booking customer.', 'doc-j3-policy') }),
  ];
}

function tlTasks() {
  seq = 100;
  return [
    task(J3, { id: 'task-tl-violation', type: 'TL_DATA_VIOLATION', role: 'TL', category: 'DISCOUNT', tab: 'OTHER', severity: 'CRITICAL', priority: 'URGENT', due: -30,
      title: 'Discount above the November grid: ₹48,500 given against ₹35,000 allowed for Thar ROXX AX7L Diesel AT',
      description: 'The cost sheet gives a consumer offer of ₹30,000 and a corporate discount of ₹18,500; the grid allows ₹35,000 in total for this variant.',
      reference: { findingId: 'finding-881' }, actions: ['CONFIRM_BREACH', 'MARK_FALSE_POSITIVE', 'ACCEPT_EXCEPTION', 'ADD_COMMENT'], comments: 3 }),
    task(J1, { id: 'task-tl-correction-1', type: 'FIELD_CORRECTION_APPROVAL', role: 'TL', sourceType: 'DOCUMENT_FIELD', tab: 'MANUAL_VERIFICATION',
      origin: 'HUMAN', raisedByRole: 'PC', due: 5, title: 'Approve the financier name correction proposed by the PC on the booking form',
      description: 'Read as "HDFC Bank Ltd, Bhubaneswar Saheed Nagar Branch" (84%). The PC proposes "HDFC Bank Ltd".',
      reference: { documentId: REVIEW_DOCUMENT_ID, fieldKey: 'financier_name' }, actions: ['APPROVE_CORRECTION', 'REJECT_CORRECTION', 'ADD_COMMENT'] }),
    task(J2, { id: 'task-tl-price-list', type: 'SKU_OTHER_MONTH_PRICE_LIST', role: 'TL', tab: 'MANUAL_VERIFICATION', category: 'SKU', due: 10,
      title: 'Approve pricing on the October 2026 price list: the SKU is not in November\'s list',
      description: 'Scorpio-N Z8 L Diesel 4WD AT 7-Seater (Midnight Black) was discontinued in the November list; the booking date (28 Oct) falls in October.',
      actions: ['ACCEPT', 'REJECT', 'ADD_COMMENT'] }),
    task(J4, { id: 'task-tl-delivery-review', type: 'DELIVERY_REVIEW', role: 'TL', tab: 'OTHER', category: 'REVIEW', due: 36, severity: 'LOW',
      title: 'Review the completed delivery of Bolero Neo N10 (O) for Tapan Kumar Patra',
      description: 'All delivery documents are read and every check passed. Look at the compliance report and mark the delivery reviewed.',
      actions: ['COMPLETE_ACTION', 'ADD_COMMENT'] }),
    task(J2, { id: 'task-tl-mr', type: 'TL_MANAGEMENT_REFERRAL', role: 'TL', tab: 'OTHER', category: 'DISCOUNT', due: 18,
      title: 'Enable a Management Referral of ₹10,000 requested by the PC for Sasmita Mohapatra Behera',
      description: 'The PC raised a Management Referral: referred by the Dealer Principal (existing fleet customer, 4 vehicles since 2022).',
      reference: { proposedAmount: '10000', proposedReason: 'Dealer Principal referral, fleet customer' }, actions: ['COMPLETE_ACTION', 'ADD_COMMENT'] }),
    task(J3, { id: 'task-tl-closure', type: 'CLOSURE_ACCEPTANCE', role: 'TL', tab: 'OTHER', category: 'CLOSURE', due: 60, severity: 'INFO',
      title: 'The Reviewer closed this journey with 2 items not mandatory: accept or reject the closure',
      description: 'The Reviewer accepted the PC\'s claims that the exchange evaluation sheet and the delivery checklist are not mandatory for this journey.',
      actions: ['ACCEPT', 'REJECT', 'ADD_COMMENT'] }),
  ];
}

function tasksResponse(url, role) {
  const params = url.searchParams;
  const view = params.get('view') || 'open';
  const filterRole = params.get('role');
  const journeyId = params.get('journey_id');
  let items = (filterRole === 'TL' || (role === 'TL' && filterRole !== 'PC')) ? tlTasks() : pcTasks();
  if (!filterRole && role === 'TL') items = [...tlTasks(), ...pcTasks()];
  if (journeyId) items = items.filter((t) => t.journey_id === journeyId);
  if (view !== 'open') {
    items = items.slice(0, 4).map((t) => ({ ...t, task_status: 'VERIFIED_COMPLETE', verified_at_utc: iso(today, '11:05:00') }));
  }
  const count = (tab) => (tab === 'ALL' ? items.length : items.filter((t) => t.queue_tab === tab).length);
  const cats = ['MANUAL_VERIFICATION', 'FAILED_TO_READ', 'IMAGE_QUALITY', 'MISSING_DOCUMENT'];
  const docCounts = (list) => Object.fromEntries([['TOTAL', list.filter((t) => t.document_category).length],
    ...cats.map((c) => [c, list.filter((t) => t.document_category === c).length])]);
  const byJourney = {};
  for (const id of new Set(items.map((t) => t.journey_id))) byJourney[id] = docCounts(items.filter((t) => t.journey_id === id));
  return {
    items,
    counts: { ALL: count('ALL'), DOCUMENTS: count('DOCUMENTS'), MANUAL_VERIFICATION: count('MANUAL_VERIFICATION') },
    documentCounts: docCounts(items),
    documentCountsByJourney: byJourney,
    sources: { p2: items.length, legacy: 0 },
  };
}

function taskDetail(taskId, role) {
  const found = [...pcTasks(), ...tlTasks()].find((t) => t.task_id === taskId) ?? pcTasks()[0];
  return {
    ...found,
    events: [
      { task_event_id: 1, event_type: 'CREATED', actor_role_code: 'SYSTEM', comment: null, details: {}, created_at_utc: iso(today, '10:32:00') },
      { task_event_id: 2, event_type: 'COMMENT_ADDED', actor_role_code: role, comment: 'Customer is bringing the HDFC sanction letter at delivery on Monday; branch manager confirmed on call.', details: {}, created_at_utc: iso(today, '11:02:00') },
    ],
  };
}

// ── Task Manager (TmTaskList, TmContext) ────────────────────────────────────
function tmTask(o) {
  return {
    taskId: o.id, scope: o.outletId ? 'OUTLET' : 'PROJECT', outletId: o.outletId ?? null,
    outletName: o.outletId ? outlets.find((x) => x.outletId === o.outletId)?.outletName : null,
    taskType: o.kind === 'GATE_PASS' ? 'GATE_PASS_UPLOAD' : 'GENERAL', category: 'GENERAL', kind: o.kind ?? 'ONE_OFF',
    title: o.title, description: o.description, reference: {}, priority: o.priority ?? 'NORMAL', status: o.status ?? 'OPEN',
    assignedRole: 'PC', assignedActorId: 'actor-pc-1', assignedName: 'Subhashree Panda',
    raisedByActorId: 'actor-tl-1', raisedByRole: 'TL', raisedByName: 'Rashmi Ranjan Mohanty',
    reviewerRole: 'TL', reviewerActorId: 'actor-tl-1', reviewerName: 'Rashmi Ranjan Mohanty',
    completionProtocol: o.protocol ?? 'REQUESTER_CONFIRMED', expectedCloseMinutes: o.minutes ?? 120,
    dueAtUtc: hoursFrom(o.due ?? 3), reviewDueAtUtc: null, createdAtUtc: iso(today, '09:10:00'), completedAtUtc: null,
    completedByName: null, closedAtUtc: null, scheduleId: o.kind === 'RECURRING' ? 'sch-1' : null,
    occurrenceDate: o.kind === 'RECURRING' || o.kind === 'GATE_PASS' ? today : null,
    sendBacks: o.sendBacks ?? 0, overdue: (o.due ?? 3) < 0, reviewOverdue: false, missed: false, incomplete: false, closedLate: false,
    commentCount: o.comments ?? 0, myActions: ['START', 'COMPLETE_ACTION', 'ADD_COMMENT'],
  };
}
function tmTasks() {
  const items = [
    tmTask({ id: 'tm-1', kind: 'GATE_PASS', outletId: 'o2', priority: 'HIGH', due: -1, minutes: 30,
      title: `Upload today's vehicle gate register (Patia Satellite Showroom)`,
      description: 'Photograph every page of the gate register for deliveries made today and upload it before 11:00.' }),
    tmTask({ id: 'tm-2', kind: 'RECURRING', outletId: 'o1', due: 5, minutes: 60,
      title: 'Daily: reconcile booking receipts against the DMS cash book for Aditya Hyundai, Tamando',
      description: 'Match every receipt issued yesterday with the DMS cash book; list differences in a comment.' }),
    tmTask({ id: 'tm-3', priority: 'URGENT', due: 2, minutes: 240, sendBacks: 1, comments: 3,
      title: 'Collect the original NDC for Sasmita Mohapatra Behera before delivery on Monday',
      description: 'The financier has not released the NDC; call the Saheed Nagar branch and get the original signed in your presence.' }),
  ];
  return { items, counts: { MINE: items.length, REVIEW: 0, RAISED: 0, ALL: items.length, ACTION: items.length }, role: 'PC' };
}
function tmContext(role) {
  return {
    role, actorId: role === 'TL' ? 'actor-tl-1' : 'actor-pc-1', canAssignTo: role === 'TL' ? ['PC'] : [],
    canCreateSchedules: role === 'TL', canSeeSchedules: role === 'TL', canSeeAll: role === 'TL', canSeeUtilisation: role === 'TL',
    assignees: [{ actorId: 'actor-pc-1', roleCode: 'PC', displayName: 'Subhashree Panda', outlets: outlets.map((o) => ({ outletId: o.outletId, outletName: o.outletName })), projectWide: false }],
    outlets: outlets.map((o) => ({ outletId: o.outletId, outletName: o.outletName })), today,
  };
}

// ── Missing documents (MissingDocumentsReport) ──────────────────────────────
const pcNames = ['Subhashree Panda', 'Prasanta Kumar Mohapatra', 'Lipsa Priyadarshini Jena'];
function missingJourney(i, basis, docs, keys) {
  const o = outlets[i % outlets.length];
  const names = ['Bibhutibhushan Pradhan', 'Sasmita Mohapatra Behera', 'Debabrata Satapathy Mahapatra', 'Tapan Kumar Patra',
    'Sk. Abdul Rahaman Khan', 'Jyotirmayee Swain', 'Biswajit Nayak', 'Priyabrata Dash Sharma'];
  return {
    journeyId: i === 0 ? J1 : `journey-mobile-${i + 1}`, reference: `ADI-${i % 2 ? 'TAM' : 'PAT'}-2611${String(7 - (i % 5)).padStart(2, '0')}-0${10 + i}`,
    customer: names[i % names.length], dealerId: o.dealerId, dealerName: o.dealerName, outletId: o.outletId, outletName: o.outletName,
    pcName: pcNames[i % pcNames.length], basis, uploadDay: dayOffset(i % 4), documents: docs, requirementKeys: keys,
    otherOpenTasks: i % 3, closed: i === 5, reviewerClosure: i === 6 ? { status: 'PENDING', closedAtUtc: iso(today, '09:00:00') } : null,
  };
}
const DOCS = {
  ew_invoice: 'Extended warranty invoice', rsa_invoice: 'RSA invoice', finance_sanction_letter: 'Finance sanction letter',
  form_21: 'Form 21 (sale certificate)', gate_pass: 'Vehicle gate pass', insurance_policy: 'Insurance policy',
  delivery_checklist: 'Signed delivery checklist',
};
function missingReport(url) {
  const pick = (...keys) => [keys.map((k) => DOCS[k]), keys];
  const days = [
    { date: today, journeys: [missingJourney(0, 'GATE_PASS', ...pick('finance_sanction_letter', 'ew_invoice', 'rsa_invoice', 'gate_pass')),
      missingJourney(1, 'UPLOAD', ...pick('form_21'))] },
    { date: dayOffset(1), journeys: [missingJourney(2, 'GATE_PASS', ...pick('insurance_policy', 'delivery_checklist')),
      missingJourney(3, 'GATE_PASS', ...pick('ew_invoice')), missingJourney(4, 'UPLOAD', ...pick('rsa_invoice', 'ew_invoice', 'form_21'))] },
    { date: dayOffset(2), journeys: [missingJourney(5, 'GATE_PASS', ...pick('gate_pass'))] },
    { date: dayOffset(4), journeys: [missingJourney(6, 'GATE_PASS', ...pick('finance_sanction_letter', 'insurance_policy')),
      missingJourney(7, 'GATE_PASS', ...pick('delivery_checklist'))] },
  ].map((d) => ({ ...d, label: d.date === today ? 'Today' : dayLabel(d.date) }));
  const all = days.flatMap((d) => d.journeys);
  const byDocument = Object.entries(DOCS).map(([key, name]) => ({ name, requirementKey: key, count: all.filter((j) => j.requirementKeys.includes(key)).length }))
    .filter((d) => d.count).sort((a, b) => b.count - a.count);
  const area = (o) => {
    const mine = all.filter((j) => j.outletId === o.outletId);
    return { dealerId: o.dealerId, dealerName: o.dealerName, outletId: o.outletId, outletName: o.outletName,
      journeys: mine.length, documents: mine.reduce((n, j) => n + j.documents.length, 0) };
  };
  const top = Number(url.searchParams.get('top') || 0);
  const close = [...all].sort((a, b) => a.documents.length - b.documents.length).slice(0, top || 5)
    .map((j) => ({ ...j, deliveryDate: j.uploadDay, deliveryLabel: j.uploadDay === today ? 'Today' : dayLabel(j.uploadDay) }));
  return {
    from: url.searchParams.get('from') || dayOffset(30), to: url.searchParams.get('to') || today, scope: 'ALL',
    totals: { journeys: all.length, documents: all.reduce((n, j) => n + j.documents.length, 0) },
    byDocument,
    byDealer: [{ dealerId: outlets[0].dealerId, dealerName: outlets[0].dealerName, journeys: all.length, documents: all.reduce((n, j) => n + j.documents.length, 0) }],
    byOutlet: outlets.map(area),
    days,
    closeToCompletion: { top: top || 5, journeys: close, eligible: all.length, heldByOtherTasks: 3 },
    outlets: outlets.map((o) => ({ dealerId: o.dealerId, dealerName: o.dealerName, outletId: o.outletId, outletName: o.outletName })),
    notes: [],
  };
}

// ── Vehicle photos and uploaded files ───────────────────────────────────────
const swatch = (color, label) => `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="${color}"/><text x="16" y="128" font-size="22" fill="#fff" font-family="sans-serif">${label}</text></svg>`)}`;
function vehiclePhotos() {
  const views = ['FRONT', 'REAR', 'LEFT', 'RIGHT', 'INTERIOR', 'ODOMETER', 'CHASSIS', 'DELIVERY'];
  const photos = views.slice(0, 6).map((v, i) => ({
    photoId: `photo-${i + 1}`, filename: `IMG_20261107_1${i}4218_${v.toLowerCase()}_XUV3XO_Galvanic_Grey.jpg`, contentType: 'image/jpeg',
    sizeBytes: 2_400_000 + i * 91_000, viewCode: v, uploadedByActorId: 'Subhashree Panda', uploadedAtUtc: iso(today, `11:0${i}:00`),
    url: swatch(['#2b4c7e', '#3f6e5a', '#6b4c8a', '#7a5a2e', '#2e6f7a', '#5a5a5a'][i], v),
  }));
  photos.push({ photoId: 'photo-pdf-1', filename: 'PDI_Checklist_Signed_XUV3XO_MA1NE2ZS5R6K12345.pdf', contentType: 'application/pdf',
    sizeBytes: 1_830_000, viewCode: 'OTHER', uploadedByActorId: 'Subhashree Panda', uploadedAtUtc: iso(today, '11:09:00'), url: null });
  return { photos, limit: 24, maxBytes: 15 * 1024 * 1024, views, pdfLimit: 3, maxPdfBytes: 50 * 1024 * 1024 };
}
function uploadedFiles(journeyId) {
  const f = (batchId, filename, pages, status, kb, time, replaces = false) => ({
    batchId, filename, contentType: 'application/pdf', sizeBytes: kb * 1024, pages, status,
    uploadedAtUtc: iso(today, time), uploadedBy: 'Subhashree Panda', replacesDocument: replaces,
  });
  return { journeyId, files: [
    f('batch-4', FOREIGN, 2, 'COMPLETED', 1310, '10:29:00'),
    f('batch-3', F3, 3, 'PARTIAL_FAILURE', 2210, '10:27:00'),
    f('batch-2', F2, 5, 'PROCESSING', 7340, '10:24:00'),
    f('batch-1', F1, 6, 'COMPLETED', 4812, '10:12:00'),
  ] };
}

// ── Fixtures ────────────────────────────────────────────────────────────────
const J = `/journeys/([^/?]+)`;
export const fixtures = [
  // Pushed live status is a Server-Sent Events stream the harness cannot serve as JSON; refuse it so the
  // screen falls back to polling /events (a 200 with no stream would reconnect in a tight loop).
  ['GET', new RegExp(`${P}${J}/live(\\?|$)`), () => ({ __status: 503, body: { detail: 'Live status is not available in the layout harness.' } })],
  ['GET', new RegExp(`${P}${J}/events(\\?|$)`), () => ({
    events: [{ event_id: 4812, event_type: 'PAGE_EXTRACTED', subject_type: 'QUEUE_UNIT', subject_id: 'q-2-1', details: {}, created_at_utc: iso(today, '10:31:00') }],
    cursor: 4812,
  })],
  ['GET', new RegExp(`${P}${J}/old-screen-documents(\\?|$)`), () => ({ documents: [
    { documentId: 'doc-old-screen-1', filename: 'Old_Capture_Screen_Delivery_Bundle_Bibhutibhushan_Pradhan_29-10-2026.pdf', documentType: 'tax_invoice' },
  ] })],
  ['GET', new RegExp(`${P}${J}/documents/([^/?]+)/content(\\?|$)`), () => ({ __status: 404, body: { detail: 'No page image in the layout harness.' } })],
  ['GET', new RegExp(`${P}${J}/documents/([^/?:]+)(\\?|$)`), (m) => documentReview(m[1], decodeURIComponent(m[2]))],
  ['GET', new RegExp(`${P}${J}/documents(\\?|$)`), (m) => documentsResponse(m[1])],
  ['GET', new RegExp(`${P}${J}/vehicle-photos(\\?|$)`), () => vehiclePhotos()],
  ['GET', new RegExp(`${P}${J}/uploads(\\?|$)`), (m) => uploadedFiles(m[1])],
  ['GET', new RegExp(`${P}/task-manager/context(\\?|$)`), (_m, _u, role) => tmContext(role)],
  ['GET', new RegExp(`${P}/task-manager/tasks(\\?|$)`), () => tmTasks()],
  ['GET', new RegExp(`${P}/tasks/([^/?]+)(\\?|$)`), (m, _u, role) => taskDetail(decodeURIComponent(m[1]), role)],
  ['GET', new RegExp(`${P}/tasks(\\?|$)`), (_m, url, role) => tasksResponse(url, role)],
  ['GET', new RegExp(`${P}/missing-documents(\\?|$)`), (_m, url) => missingReport(url)],
];
