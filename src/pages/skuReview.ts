/**
 * Plain-words helpers for the SKU Check / Apply review (Administration > Run SKU Resolution).
 *
 * The server decides what happens to each Journey and says so in `proposal.group`; nothing here
 * re-decides it. This file only words it, counts it, filters it and writes it out as a CSV the
 * product owner can open in a sheet.
 */
import type {
  SkuApplyCheck,
  SkuCheckNumbers,
  SkuProposal,
  SkuResolutionRunItem,
  SkuResolutionRunSummary,
  SkuReviewGroup,
  SkuRunMode,
} from '../services/audit-core/skuResolution';

export type SkuReviewBucket = SkuReviewGroup | 'FAILED';

/** The order the groups are shown in: what needs a look first. */
export const BUCKET_ORDER: SkuReviewBucket[] = ['CHANGE', 'CONFIRM', 'FAILED', 'KEEP', 'LEFT_ALONE'];

export const BUCKET_LABEL: Record<SkuReviewBucket, string> = {
  CHANGE: 'Will change',
  CONFIRM: 'Needs PC confirmation',
  KEEP: 'Keep as it is',
  LEFT_ALONE: 'Left alone',
  FAILED: 'Failed',
};

/** Past tense for an Apply run, where the SKU has already changed. */
export const BUCKET_LABEL_DONE: Record<SkuReviewBucket, string> = {
  ...BUCKET_LABEL,
  CHANGE: 'Changed',
  CONFIRM: 'Kept, PC asked to confirm',
};

export const CHECK_VALID_HOURS = 24;

export function isReviewRun(mode: SkuRunMode | undefined): boolean {
  return mode === 'RERESOLVE_DRY_RUN' || mode === 'RERESOLVE_COMMIT';
}

export function runKindLabel(mode: SkuRunMode | undefined): string {
  if (mode === 'RERESOLVE_DRY_RUN') return 'Check (no changes)';
  if (mode === 'RERESOLVE_COMMIT') return 'Apply';
  return 'Run SKU resolution';
}

// ── words for what the server says ───────────────────────────────────────────

const BASIS_WORDS: Record<string, string> = {
  AUTO_MATCHED: 'Matched by its words; booking price agrees',
  AUTO_PRICE_MISMATCH: 'Matched by its words; price differs from the booking',
  AUTO_INVOICE_MATCHED: 'Set by the vehicle invoice',
  AUTO_LEGACY: 'Matched automatically earlier; not re-checked yet',
  AUTO_UNCONFIRMED: 'Kept, but the documents do not name it',
  PC_CONFIRMED: 'Confirmed by the PC',
  TL_APPROVED: 'Approved by the Team Lead',
};

export function basisWords(basis: string | null | undefined): string {
  if (!basis) return '';
  return BASIS_WORDS[basis] ?? 'Matched automatically';
}

const TASK_WORDS: Record<string, string> = {
  'SKU_PRICE_MISMATCH (booking)': 'Confirm the model and price (booking form)',
  'SKU_PRICE_MISMATCH (invoice)': 'Confirm the model and price (invoice)',
  SKU_NOT_CONFIRMED: 'Confirm the SKU: the documents do not name it',
  SKU_INVOICES_DISAGREE: 'Invoices name different vehicles: pick one',
  SKU_BOOKING_FORMS_DISAGREE: 'Booking forms name different vehicles: pick one',
  SKU_BOOKING_FORM_DIFFERS: 'A booking form names another vehicle than the confirmed SKU',
  SKU_INVOICE_REVIEW: 'Team Lead: an invoice names another vehicle',
  SKU_NOT_SET: 'Set the SKU: no vehicle is named',
  MODEL_NOT_IDENTIFIED: 'Pick the vehicle: the documents do not name one SKU',
  PRICE_MASTER_NOT_IN_FORCE: 'Load the price list in force on the booking date',
  'PC_BOOKING_DATE_MISSING or SKU_NOT_SET': 'Enter the booking date, or set the SKU',
};

export function taskWords(task: string): string {
  return TASK_WORDS[task] ?? task.replace(/_/g, ' ').toLowerCase();
}

export function tasksWords(proposal: SkuProposal | null | undefined): string[] {
  return (proposal?.tasks ?? []).map(taskWords);
}

// ── grouping ─────────────────────────────────────────────────────────────────

/**
 * The group a Journey is in. FAILED is the run item's own outcome; everything else is the server's
 * `proposal.group`. An item without a proposal (a run made before Check existed) has no group.
 */
export function itemBucket(item: SkuResolutionRunItem): SkuReviewBucket | null {
  if (item.outcome === 'FAILED') return 'FAILED';
  return item.proposal?.group ?? null;
}

export type BucketCounts = Record<SkuReviewBucket, number>;

export function bucketCounts(items: SkuResolutionRunItem[]): BucketCounts {
  const counts: BucketCounts = { CHANGE: 0, CONFIRM: 0, KEEP: 0, LEFT_ALONE: 0, FAILED: 0 };
  for (const item of items) {
    const bucket = itemBucket(item);
    if (bucket) counts[bucket] += 1;
  }
  return counts;
}

function searchText(item: SkuResolutionRunItem): string {
  const p = item.proposal;
  return [item.journeyLabel, item.modelLabel, item.skuCode, p?.oldSku, p?.proposedSku, p?.booking?.words, p?.invoice?.words]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Items of one group (or all), matching the search words, the groups that need a look first. */
export function filterItems(
  items: SkuResolutionRunItem[],
  bucket: SkuReviewBucket | 'ALL',
  search = '',
): SkuResolutionRunItem[] {
  const needle = search.trim().toLowerCase();
  const rank = (item: SkuResolutionRunItem) => {
    const index = BUCKET_ORDER.indexOf(itemBucket(item) ?? 'LEFT_ALONE');
    return index < 0 ? BUCKET_ORDER.length : index;
  };
  return items
    .filter((item) => bucket === 'ALL' || itemBucket(item) === bucket)
    .filter((item) => !needle || searchText(item).includes(needle))
    .map((item, position) => ({ item, position }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.position - b.position)
    .map(({ item }) => item);
}

// ── what happens to the Journey, in words ────────────────────────────────────

function leftAloneReason(proposal: SkuProposal): string {
  if (proposal.skipped === 'review_completed') return 'review is complete';
  if (proposal.skipped === 'booking_cancelled') return 'booking cancelled, duplicate or closed';
  if (proposal.oldBasis === 'TL_APPROVED') return 'approved by the Team Lead';
  if (proposal.oldBasis === 'PC_CONFIRMED' || proposal.action === 'KEEP_HUMAN') return 'set by the PC';
  return 'no document names the vehicle yet';
}

const TAKEN_WORDS: Record<string, string> = {
  SET: 'Set the SKU',
  REPLACED: 'Replaced the SKU',
  KEPT: 'Kept the SKU',
  KEPT_AND_FLAGGED: 'Kept the SKU; the PC is asked to confirm it',
  NO_SKU: 'No SKU; the PC is asked to set it',
};

/** The action for the table: what will happen (a Check) or what was done (an Apply). */
export function actionWords(item: SkuResolutionRunItem, applied: boolean): string {
  const p = item.proposal;
  if (item.outcome === 'FAILED') return `Failed, nothing changed${item.detail ? `: ${item.detail}` : ''}`;
  if (!p) return item.detail || '';
  if (p.group === 'LEFT_ALONE') return `Left alone: ${leftAloneReason(p)}`;
  if (applied && p.actionTaken) {
    const text = p.actionTaken === 'LEFT_ALONE' ? `Left alone: ${leftAloneReason(p)}` : (TAKEN_WORDS[p.actionTaken] ?? p.actionTaken);
    return p.differsFromCheck ? `${text} (different from the check)` : text;
  }
  if (p.group === 'CHANGE') return p.oldSku ? 'Replace the SKU' : 'Set the SKU';
  if (p.group === 'CONFIRM') return p.oldSku ? 'Keep the SKU; the PC is asked to confirm it' : 'No SKU; the PC is asked to set it';
  if (p.group === 'KEEP') return p.oldBasis !== p.proposedBasis ? 'Keep the SKU (how it was matched is updated)' : 'Keep the SKU';
  return '';
}

/** "Old SKU → new SKU", or just the SKU when it stays. */
export function skuChange(item: SkuResolutionRunItem): string {
  const p = item.proposal;
  if (!p) return item.skuCode || '';
  const before = p.oldSku || 'no SKU';
  const after = p.proposedSku || 'no SKU';
  return before === after ? before : `${before} → ${after}`;
}

export function basisChange(item: SkuResolutionRunItem): string {
  const p = item.proposal;
  if (!p) return '';
  const before = basisWords(p.oldBasis);
  const after = basisWords(p.proposedBasis);
  if (!before && !after) return '';
  if (!before) return after;
  if (!after || before === after) return before;
  return `${before} → ${after}`;
}

/** The vehicle as the booking form (or, failing that, the invoice) words it. */
export function vehicleAsBooked(item: SkuResolutionRunItem): string {
  const p = item.proposal;
  return p?.booking?.words || p?.words || p?.invoice?.words || item.modelLabel || '';
}

/** The words each document prints for the vehicle. */
export function documentWords(item: SkuResolutionRunItem): string {
  const p = item.proposal;
  if (!p) return '';
  const parts: string[] = [];
  if (p.booking?.words) parts.push(`Booking form: ${p.booking.words}`);
  if (p.invoice?.words) parts.push(`Invoice: ${p.invoice.words}`);
  if (!parts.length && p.words) parts.push(p.words);
  return parts.join('; ');
}

// ── prices ───────────────────────────────────────────────────────────────────

/** 1300000 → "₹13,00,000" (Indian digit grouping); nothing for a missing or unreadable value. */
export function rupees(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(number)}`;
}

export interface PriceColumns {
  booking: string;
  master: string;
  invoice: string;
  check: string;
}

const CHECK_WORDS: Record<string, string> = {
  MATCH: 'Prices agree',
  DIFFERS: 'Prices differ',
  MISSING: 'A price is missing',
};

export function priceColumns(item: SkuResolutionRunItem): PriceColumns {
  const p = item.proposal;
  if (!p) return { booking: '', master: '', invoice: '', check: '' };
  return {
    booking: rupees(p.booking?.exShowroom),
    master: rupees(p.masterExShowroom ?? p.booking?.masterExShowroom ?? p.invoice?.masterExShowroom),
    invoice: rupees(p.invoice?.exShowroom),
    check: p.priceCheck ? (CHECK_WORDS[p.priceCheck] ?? '') : '',
  };
}

// ── Apply ────────────────────────────────────────────────────────────────────

/** True while a Check run is still inside the 24 hours Apply accepts it for. */
export function checkIsFresh(startedAtUtc: string, now: Date = new Date()): boolean {
  const started = new Date(startedAtUtc).getTime();
  return Number.isFinite(started) && now.getTime() - started < CHECK_VALID_HOURS * 3_600_000;
}

/** Whether Apply can be pressed: the server says a usable Check exists. */
export function applyEnabled(gate: SkuApplyCheck | undefined, busy: boolean): boolean {
  return Boolean(gate?.allowed && gate.check && !busy);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The Check's numbers shown next to the Apply button. */
export function checkSummaryLine(check: SkuCheckNumbers, locale?: string): string {
  const parts = [
    `Check of ${new Date(check.startedAtUtc).toLocaleString(locale)}`,
    `${check.journeysChecked} of ${check.journeysTotal} journeys checked`,
    `${check.willChange} will change SKU`,
    `${check.needConfirmation} need PC confirmation`,
    `${check.keep} stay as they are`,
    `${check.leftAlone} left alone`,
  ];
  if (check.failed) parts.push(`${check.failed} failed (they are not changed)`);
  if (check.notChecked) {
    parts.push(`${plural(check.notChecked, 'journey was', 'journeys were')} added after the check`);
  }
  return `${parts.join(' · ')}.`;
}

/** What the confirm dialog says before anything is written. */
export function confirmLines(check: SkuCheckNumbers): string[] {
  const asks = check.needConfirmation === 1
    ? '1 journey keeps its SKU (or has none) and gets a PC task to confirm it.'
    : `${check.needConfirmation} journeys keep their SKU (or have none) and get a PC task to confirm it.`;
  const lines = [
    `${plural(check.willChange, 'journey', 'journeys')} will change SKU.`,
    asks,
    `${plural(check.keep + check.leftAlone, 'journey is', 'journeys are')} left alone (${check.keep} already right, ${check.leftAlone} set by a PC or Team Lead, review complete, or cancelled).`,
  ];
  if (check.failed) lines.push(`${plural(check.failed, 'journey', 'journeys')} failed in the check and will not be changed.`);
  if (check.notChecked) lines.push(`${plural(check.notChecked, 'journey', 'journeys')} added since the check will also be decided now.`);
  lines.push('Each decision is made again on the latest data, so a few journeys can differ from the check; the result shows which.');
  return lines;
}

/** The most recent complete Check run in the history list. */
export function latestCheckRun(runs: SkuResolutionRunSummary[] | undefined): SkuResolutionRunSummary | undefined {
  return (runs ?? []).find((run) => run.runMode === 'RERESOLVE_DRY_RUN' && run.status === 'COMPLETE');
}

// ── CSV ──────────────────────────────────────────────────────────────────────

export const CSV_COLUMNS = [
  'Journey',
  'Vehicle as booked',
  'Current SKU',
  'Proposed SKU',
  'Current basis',
  'Proposed basis',
  'Group',
  'Action',
  'Booking form ex-showroom',
  'Master ex-showroom',
  'Invoice ex-showroom',
  'Price check',
  "Document's words",
  'Why',
  'PC tasks',
] as const;

/** Quote a CSV cell; a leading = + @ (or - before a letter) is made harmless so a sheet does not run it as a formula. */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+@]/.test(text) || /^-(?!\d)/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(items: SkuResolutionRunItem[], applied: boolean): string {
  const rows = items.map((item) => {
    const p = item.proposal;
    const prices = priceColumns(item);
    const bucket = itemBucket(item);
    return [
      item.journeyLabel || item.journeyId.slice(0, 8),
      vehicleAsBooked(item),
      p?.oldSku ?? '',
      p?.proposedSku ?? item.skuCode ?? '',
      basisWords(p?.oldBasis),
      basisWords(p?.proposedBasis),
      bucket ? (applied ? BUCKET_LABEL_DONE[bucket] : BUCKET_LABEL[bucket]) : '',
      actionWords(item, applied),
      prices.booking,
      prices.master,
      prices.invoice,
      prices.check,
      documentWords(item),
      p?.why ?? '',
      tasksWords(p).join('; '),
    ];
  });
  return [CSV_COLUMNS.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))].join('\r\n');
}

export function csvFileName(runId: string, mode: SkuRunMode | undefined, startedAtUtc: string): string {
  const day = startedAtUtc.slice(0, 10) || 'run';
  return `sku-${mode === 'RERESOLVE_COMMIT' ? 'apply' : 'check'}-${day}-${runId.slice(0, 8)}.csv`;
}
