import type { CapturedPage, ContinuationDecision, LogicalCapturedDocument } from './types';

const HIGH_CONTINUATION_SCORE = 0.75;
const MEDIUM_CONTINUATION_SCORE = 0.5;

// References that normally identify the logical document itself. Matching one
// across adjacent pages is meaningful evidence that the second page continues
// the first.
const STRONG_REFERENCE_KEYWORDS = [
  'POLICY', 'POLICY NO', 'POLICY NUMBER', 'INVOICE', 'INVOICE NO', 'INV NO',
  'APPLICATION', 'APPLICATION NO', 'LOAN', 'LOAN NO', 'REFERENCE', 'REF NO',
  'RECEIPT', 'RECEIPT NO', 'ACCOUNT', 'ACCOUNT NO', 'A/C', 'ORDER', 'ORDER NO',
  'PROPOSAL', 'PROPOSAL NO',
];

// Dealer files intentionally repeat these identifiers across unrelated
// documents. They are useful corroboration, but must never by themselves make
// an invoice, gate pass, insurance page, etc. one logical document.
const WEAK_REFERENCE_KEYWORDS = ['VIN', 'CHASSIS', 'ENGINE'];

const STOP_WORDS = new Set([
  'THE', 'AND', 'FOR', 'WITH', 'FROM', 'THIS', 'THAT', 'YOUR', 'PAGE', 'DATE',
  'NAME', 'ADDRESS', 'TOTAL', 'AMOUNT', 'CUSTOMER', 'DOCUMENT', 'INDIA', 'PRIVATE',
  'LIMITED', 'LTD', 'PLEASE', 'SIGNATURE', 'AUTHORIZED', 'AUTHORISED',
]);

interface PageMarker {
  current: number;
  total?: number;
}

function id(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizedText(value: string): string {
  return value
    .toUpperCase()
    .replace(/[|]/g, 'I')
    .replace(/[^A-Z0-9/_.:#&()\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pageMarker(value: string): PageMarker | undefined {
  const text = normalizedText(value);
  const explicit = text.match(/\bPAGE\s*(?:NO\.?\s*)?(\d{1,3})\s*(?:OF|\/)\s*(\d{1,3})\b/);
  if (explicit) return { current: Number(explicit[1]), total: Number(explicit[2]) };
  const simple = text.match(/\bPAGE\s*(?:NO\.?\s*)?(\d{1,3})\b/);
  if (simple) return { current: Number(simple[1]) };
  return undefined;
}

function referenceValues(value: string, keywords: string[]): Set<string> {
  const text = normalizedText(value);
  const refs = new Set<string>();
  for (const keyword of keywords) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    const pattern = new RegExp(`\\b${escaped}\\s*(?:NUMBER|NO\\.?|#|:|-)?\\s*([A-Z0-9][A-Z0-9/_.-]{4,29})`, 'g');
    for (const match of text.matchAll(pattern)) {
      const candidate = match[1].replace(/[._/-]+$/g, '');
      if (candidate.length >= 5 && /\d/.test(candidate)) refs.add(candidate);
    }
  }
  return refs;
}

function hasSharedReference(previousText: string, currentText: string, keywords: string[]): boolean {
  const previousRefs = referenceValues(previousText, keywords);
  const currentRefs = referenceValues(currentText, keywords);
  return Array.from(previousRefs).some((value) => currentRefs.has(value));
}

function distinctiveTokens(value: string): Set<string> {
  const tokens = normalizedText(value)
    .split(/\s+/)
    .map((token) => token.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, ''))
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
  return new Set(tokens.slice(0, 250));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  left.forEach((token) => { if (right.has(token)) intersection += 1; });
  return intersection / (left.size + right.size - intersection);
}

function firstTokens(value: string): Set<string> {
  return new Set(Array.from(distinctiveTokens(value)).slice(0, 30));
}

export function scorePageContinuation(previousText: string, currentText: string): ContinuationDecision {
  if (!previousText.trim() || !currentText.trim()) {
    return { score: 0, confidence: 'LOW', reasons: [] };
  }

  let score = 0;
  let strongContinuationEvidence = false;
  const reasons: string[] = [];
  const previousMarker = pageMarker(previousText);
  const currentMarker = pageMarker(currentText);

  if (
    previousMarker
    && currentMarker
    && currentMarker.current === previousMarker.current + 1
    && (
      previousMarker.total === undefined
      || currentMarker.total === undefined
      || previousMarker.total === currentMarker.total
    )
  ) {
    score += 0.68;
    strongContinuationEvidence = true;
    reasons.push('sequential page numbering');
  }

  if (hasSharedReference(previousText, currentText, STRONG_REFERENCE_KEYWORDS)) {
    score += 0.58;
    strongContinuationEvidence = true;
    reasons.push('same document reference');
  }

  if (hasSharedReference(previousText, currentText, WEAK_REFERENCE_KEYWORDS)) {
    score += 0.14;
    reasons.push('same vehicle identifier');
  }

  if (/\b(CONTINUED|CONTD|CONTINUATION|CONTINUED ON NEXT PAGE)\b/i.test(previousText)) {
    score += 0.3;
    strongContinuationEvidence = true;
    reasons.push('continuation wording');
  }

  const tokenSimilarity = jaccard(distinctiveTokens(previousText), distinctiveTokens(currentText));
  if (tokenSimilarity >= 0.45) {
    score += 0.18;
    reasons.push('strong repeated document text');
  } else if (tokenSimilarity >= 0.3) {
    score += 0.08;
    reasons.push('repeated document text');
  }

  const headerSimilarity = jaccard(firstTokens(previousText), firstTokens(currentText));
  if (headerSimilarity >= 0.5) {
    score += 0.12;
    reasons.push('matching header text');
  }

  score = Math.min(1, Number(score.toFixed(2)));
  // AUTO grouping is deliberately stricter than a numeric similarity score:
  // generic layout/header text plus the same VIN must not merge two different
  // dealer documents. HIGH requires at least one real continuation signal.
  const confidence = strongContinuationEvidence && score >= HIGH_CONTINUATION_SCORE
    ? 'HIGH'
    : score >= MEDIUM_CONTINUATION_SCORE
      ? 'MEDIUM'
      : 'LOW';

  return { score, confidence, reasons };
}

/**
 * Single-page is the default. Only HIGH evidence auto-groups pages. MEDIUM
 * evidence leaves the page separate and surfaces a merge suggestion in review.
 */
export function buildInitialDocumentGroups(pages: CapturedPage[]): LogicalCapturedDocument[] {
  const groups: LogicalCapturedDocument[] = [];
  for (const page of pages) {
    const previousPage = groups.at(-1)?.pages.at(-1);
    if (!previousPage) {
      groups.push({ id: id('doc'), pages: [page], autoGrouped: false });
      continue;
    }

    const decision = scorePageContinuation(previousPage.ocrText, page.ocrText);
    if (decision.confidence === 'HIGH') {
      const current = groups[groups.length - 1];
      current.pages.push(page);
      current.autoGrouped = true;
      continue;
    }

    groups.push({
      id: id('doc'),
      pages: [page],
      autoGrouped: false,
      continuationFromPrevious: decision.confidence === 'MEDIUM' ? decision : undefined,
    });
  }
  return groups;
}

export function mergeWithPrevious(
  documents: LogicalCapturedDocument[],
  documentIndex: number,
): LogicalCapturedDocument[] {
  if (documentIndex <= 0 || documentIndex >= documents.length) return documents;
  const next = documents.map((document) => ({ ...document, pages: [...document.pages] }));
  next[documentIndex - 1].pages.push(...next[documentIndex].pages);
  next[documentIndex - 1].autoGrouped = false;
  next.splice(documentIndex, 1);
  return next;
}

export function startNewDocumentAtPage(
  documents: LogicalCapturedDocument[],
  documentIndex: number,
  pageIndex: number,
): LogicalCapturedDocument[] {
  const document = documents[documentIndex];
  if (!document || pageIndex <= 0 || pageIndex >= document.pages.length) return documents;
  const next = documents.map((item) => ({ ...item, pages: [...item.pages] }));
  const tail = next[documentIndex].pages.splice(pageIndex);
  next[documentIndex].autoGrouped = false;
  next.splice(documentIndex + 1, 0, { id: id('doc'), pages: tail, autoGrouped: false });
  return next;
}
