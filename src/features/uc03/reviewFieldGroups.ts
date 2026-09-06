import type { ReviewV2UnmappedField } from '../../services/audit-core/uc03DocumentReviewV2';

const RECEIPT_DOCUMENT_TYPE = 'dealer_receipt';
const PC_REVIEW_THRESHOLD = 90;

export interface RawReviewGroup {
  groupKey: string;
  reviewKey: string;
  fieldKey: string;
  sources: ReviewV2UnmappedField[];
  selected: ReviewV2UnmappedField;
  mismatch: boolean;
  needsDecision: boolean;
}

function normalizedValue(value: unknown): string {
  if (typeof value === 'string') return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function hasValue(field: ReviewV2UnmappedField): boolean {
  return field.value !== null && field.value !== undefined && field.value !== '';
}

function isReceipt(field: ReviewV2UnmappedField): boolean {
  return field.documentTypeKey?.trim().toLowerCase() === RECEIPT_DOCUMENT_TYPE;
}

function needsPcReview(field: ReviewV2UnmappedField, reviewThreshold: number): boolean {
  return field.confidenceScore === null
    || field.confidenceScore === undefined
    || field.confidenceScore < reviewThreshold;
}

export function buildRawReviewGroups(
  fields: ReviewV2UnmappedField[],
  reviewThreshold = PC_REVIEW_THRESHOLD,
): RawReviewGroup[] {
  // The business policy is fixed at 90%. Older callers may still pass the former
  // 92% presentation threshold; never let that turn 90–91.99% facts into PC work.
  const effectiveReviewThreshold = Math.min(reviewThreshold, PC_REVIEW_THRESHOLD);
  const populated = fields.filter(hasValue);
  const receiptDocumentIds = [...new Set(
    populated.filter(isReceipt).map((field) => field.documentId),
  )].sort();
  const receiptOrdinal = new Map(
    receiptDocumentIds.map((documentId, index) => [documentId, index + 1] as const),
  );

  const nonReceiptDocumentsByField = new Map<string, Set<string>>();
  populated.filter((field) => !isReceipt(field)).forEach((field) => {
    const documents = nonReceiptDocumentsByField.get(field.fieldKey) ?? new Set<string>();
    documents.add(field.documentId);
    nonReceiptDocumentsByField.set(field.fieldKey, documents);
  });
  const repeatedNonReceiptKeys = new Set(
    [...nonReceiptDocumentsByField.entries()]
      .filter(([, documentIds]) => documentIds.size > 1)
      .map(([fieldKey]) => fieldKey),
  );

  const grouped = new Map<string, ReviewV2UnmappedField[]>();
  populated.forEach((field) => {
    let groupKey = `field:${field.fieldKey}`;
    if (isReceipt(field) || repeatedNonReceiptKeys.has(field.fieldKey)) {
      groupKey = `document:${field.documentId}:${field.fieldKey}`;
    }
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), field]);
  });

  return [...grouped.entries()].map(([groupKey, sources]) => {
    const sorted = [...sources].sort((left, right) => {
      const confidenceDelta = (right.confidenceScore ?? -1) - (left.confidenceScore ?? -1);
      if (confidenceDelta !== 0) return confidenceDelta;
      const documentDelta = left.documentLabel.localeCompare(right.documentLabel);
      if (documentDelta !== 0) return documentDelta;
      return left.documentId.localeCompare(right.documentId);
    });
    const selected = sorted[0];
    const mismatch = new Set(sources.map((source) => normalizedValue(source.value))).size > 1;
    const lowConfidence = sources.some((source) => needsPcReview(source, effectiveReviewThreshold));

    let reviewKey = `raw:${selected.fieldKey}`;
    if (isReceipt(selected)) {
      const ordinal = receiptOrdinal.get(selected.documentId);
      if (ordinal) reviewKey = `raw:receipt_${ordinal}_${selected.fieldKey.trim().toLowerCase()}`;
    } else if (repeatedNonReceiptKeys.has(selected.fieldKey)) {
      reviewKey = `raw:${selected.documentId}:${selected.fieldKey}`;
    }

    return {
      groupKey,
      reviewKey,
      fieldKey: selected.fieldKey,
      sources,
      selected,
      mismatch,
      // Mismatch stays visible for audit comparison but does not create PC work.
      needsDecision: lowConfidence,
    };
  });
}