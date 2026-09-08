/**
 * deriveJourneyLine.ts — pure derivations for The Journey Line.
 *
 * The six-step line mirrors the PC Overview rail exactly (Booking Docs → Verify →
 * Complete, Delivery Docs → Verify → Complete). Aspect status is derived from the
 * relevant slice of the overview plus any open finding routed to that aspect by
 * its rule key.
 */
import type { JourneyOverview } from '../../../services/audit-core/uc03JourneySearch';

export type StepState = 'done' | 'current' | 'todo';

export interface JourneyStep {
  key: string;
  phase: 'Booking' | 'Delivery';
  label: string;
  state: StepState;
  at: string | null;
}

export type AspectKey =
  | 'deal'
  | 'payments'
  | 'discounts'
  | 'bank'
  | 'documents'
  | 'vehicle'
  | 'tradeIn'
  | 'customer'
  | 'registration'
  | 'insurance'
  | 'finance'
  | 'flags';

export type AspectStatus = 'ok' | 'warn' | 'bad' | 'wait';

export interface AspectMeta {
  key: AspectKey;
  label: string;
  status: AspectStatus;
  badge: number | null;
  hint: string;
}

const OPEN_STATES = new Set(['OPEN', 'ACKNOWLEDGED']);

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(r: Record<string, unknown> | null | undefined, key: string): string {
  const v = r?.[key];
  return v === null || v === undefined ? '' : String(v);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export function openFindings(overview: JourneyOverview): Array<Record<string, unknown>> {
  return (overview.findings || []).filter((f) => OPEN_STATES.has(str(rec(f), 'findingStatus')));
}

/** Route one finding to the aspect chip that owns it (rule-key prefix first). */
export function findingAspect(finding: Record<string, unknown>): AspectKey {
  const rule = str(finding, 'ruleKey').toUpperCase();
  const type = str(finding, 'findingTypeCode').toUpperCase();
  const key = rule || type;
  if (key.startsWith('MODEL_NOT_IDENTIFIED')) return 'deal';
  if (key.startsWith('PAYMENT_BANK_UNMATCHED') || key.startsWith('PAY_UNVERIFIED') || key.startsWith('PAYMENT')) {
    return 'payments';
  }
  if (key.includes('DISCOUNT')) return 'discounts';
  if (key.includes('REGISTRATION') || key.includes('RTO')) return 'registration';
  if (key.includes('INSURANCE')) return 'insurance';
  if (key.includes('TRADE') || key.includes('EXCHANGE') || key.includes('SCRAP')) return 'tradeIn';
  if (key.includes('FINANCE') || key.includes('HYPOTHECATION')) return 'finance';
  if (key.includes('DOCUMENT')) return 'documents';
  return 'flags';
}

// ── the six-step line ───────────────────────────────────────────────────────
export function deriveSteps(overview: JourneyOverview): { steps: JourneyStep[]; currentIndex: number } {
  const journey = rec(overview.journey) ?? {};
  const delivery = rec(overview.delivery);

  const bookingCaptureAt = str(journey, 'bookingCaptureCompletedAtUtc') || null;
  const bookingVerified = str(journey, 'bookingPcVerificationStatus').toUpperCase() === 'VERIFIED';
  const deliveryCaptureAt = str(journey, 'deliveryCaptureCompletedAtUtc') || null;
  const deliveryVerified = str(journey, 'deliveryPcVerificationStatus').toUpperCase() === 'VERIFIED';
  const deliveryStatus = str(journey, 'deliveryStatus').toUpperCase();
  const deliveredAt = str(delivery, 'actualDeliveredAt') || null;
  const deliveryDone =
    deliveryStatus === 'DELIVERY_COMPLETED' || Boolean(deliveredAt) || deliveryStatus === 'DELIVERED';
  const deliveryStarted = deliveryDone || Boolean(deliveryCaptureAt) || deliveryStatus.startsWith('DELIVERY');

  // currentIndex mirrors PcOverviewPage.journeyStep()
  let currentIndex: number;
  if (deliveryDone) currentIndex = 5;
  else if (deliveryStarted && deliveryCaptureAt && !deliveryVerified) currentIndex = 4;
  else if (deliveryStarted) currentIndex = 3;
  else if (bookingCaptureAt && bookingVerified) currentIndex = 2;
  else if (bookingCaptureAt) currentIndex = 1;
  else currentIndex = 0;

  const defs: Array<{ key: string; phase: 'Booking' | 'Delivery'; label: string; at: string | null }> = [
    { key: 'b-docs', phase: 'Booking', label: 'Documents', at: bookingCaptureAt },
    { key: 'b-verify', phase: 'Booking', label: 'Verify', at: bookingVerified ? bookingCaptureAt : null },
    { key: 'b-done', phase: 'Booking', label: 'Complete', at: bookingVerified ? bookingCaptureAt : null },
    { key: 'd-docs', phase: 'Delivery', label: 'Documents', at: deliveryCaptureAt },
    { key: 'd-verify', phase: 'Delivery', label: 'Verify', at: deliveryVerified ? deliveryCaptureAt : null },
    { key: 'd-done', phase: 'Delivery', label: 'Complete', at: deliveredAt },
  ];

  const steps: JourneyStep[] = defs.map((d, i) => ({
    ...d,
    state: i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'todo',
  }));
  return { steps, currentIndex };
}

// ── aspect chips ────────────────────────────────────────────────────────────
function worst(a: AspectStatus, b: AspectStatus): AspectStatus {
  const order: AspectStatus[] = ['ok', 'wait', 'warn', 'bad'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

export function deriveAspects(overview: JourneyOverview): AspectMeta[] {
  const open = openFindings(overview);
  const byAspect = new Map<AspectKey, Array<Record<string, unknown>>>();
  for (const f of open) {
    const a = findingAspect(f as Record<string, unknown>);
    if (!byAspect.has(a)) byAspect.set(a, []);
    byAspect.get(a)!.push(f as Record<string, unknown>);
  }

  const findingStatus = (aspect: AspectKey): AspectStatus => {
    const list = byAspect.get(aspect) ?? [];
    if (list.length === 0) return 'ok';
    const severe = list.some((f) => ['HIGH', 'CRITICAL'].includes(str(f, 'severity').toUpperCase()));
    return severe ? 'bad' : 'warn';
  };

  const has = (v: unknown): boolean => rec(v) !== null && Object.keys(rec(v) as object).length > 0;
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

  // Deal
  const pricing = overview.skuPricing;
  let deal: AspectStatus;
  if (!pricing) deal = byAspect.has('deal') ? findingStatus('deal') : 'wait';
  else {
    const comps = pricing.masterComponents || [];
    const exceptions = comps.filter((c) => c.deviationAmount !== null && Math.abs(c.deviationAmount) >= 0.01);
    const anyExtracted = comps.some((c) => c.deviationAmount !== null);
    if (!anyExtracted) deal = 'wait';
    else if (exceptions.length > 0) {
      const big = Math.abs(pricing.totalDeviationAmount ?? 0) >= 25000;
      deal = big ? 'bad' : 'warn';
    } else deal = 'ok';
    deal = worst(deal, findingStatus('deal'));
  }

  // Payments
  const receipts = list(overview.receipts) as Array<Record<string, unknown>>;
  const bankMatches = receipts
    .map((r) => rec(r['bankMatch']))
    .filter(Boolean) as Array<Record<string, unknown>>;
  let payments: AspectStatus;
  if (receipts.length === 0) payments = 'wait';
  else if (bankMatches.some((m) => str(m, 'status').toUpperCase() === 'UNMATCHED')) payments = 'warn';
  else if (bankMatches.some((m) => str(m, 'status').toUpperCase() === 'AMBIGUOUS')) payments = 'warn';
  else payments = 'ok';
  payments = worst(payments, findingStatus('payments'));

  // Discounts — over-grant / not-eligible
  const discounts = list(overview.discounts) as Array<Record<string, unknown>>;
  let disc: AspectStatus = discounts.length === 0 ? 'wait' : 'ok';
  for (const d of discounts) {
    const elig = str(d, 'eligibilityResult').toUpperCase();
    const std = num(d['standardEligibleAmount']);
    const act = num(d['actualDiscountAmount']);
    if (elig === 'NOT_ELIGIBLE') disc = worst(disc, 'bad');
    else if (std !== null && act !== null && act - std > 1) disc = worst(disc, 'warn');
  }
  disc = worst(disc, findingStatus('discounts'));

  const bankLines = list((overview as unknown as Record<string, unknown>)['bankStatementLines']);

  const metaFor = (
    key: AspectKey,
    label: string,
    status: AspectStatus,
    hint: string,
  ): AspectMeta => {
    const findings = byAspect.get(key) ?? [];
    return { key, label, status, badge: findings.length > 0 ? findings.length : null, hint };
  };

  const flagsCount = open.length;

  return [
    metaFor('deal', 'Deal', deal, 'Masters vs offered'),
    metaFor('payments', 'Payments', payments, 'Receipts & bank match'),
    metaFor('discounts', 'Discounts', disc, 'Entitled vs given'),
    metaFor('bank', 'Bank statements', bankLines.length > 0 ? 'ok' : 'wait', 'Extracted credit lines'),
    metaFor('documents', 'Documents', list(overview.evidence).length > 0 ? 'ok' : 'wait', 'Uploaded evidence'),
    metaFor('vehicle', 'Vehicle', worst(has(overview.vehicle) || has(overview.booking) ? 'ok' : 'wait', findingStatus('vehicle')), 'Allocation & specs'),
    metaFor('tradeIn', 'Trade-in / Scrappage', worst(has(overview.tradeIn) ? 'ok' : 'wait', findingStatus('tradeIn')), 'Exchange & scrappage'),
    metaFor('customer', 'Customer', worst(has(overview.customer) ? 'ok' : 'wait', findingStatus('customer')), 'KYC identity'),
    metaFor('registration', 'Registration', worst(has(overview.registration) ? 'ok' : 'wait', findingStatus('registration')), 'RTO & road tax'),
    metaFor('insurance', 'Insurance', worst(has(overview.insurance) ? 'ok' : 'wait', findingStatus('insurance')), 'Policy & premium'),
    metaFor('finance', 'Finance', worst(has(overview.finance) ? 'ok' : 'wait', findingStatus('finance')), 'Loan & hypothecation'),
    {
      key: 'flags',
      label: 'Flags',
      status: flagsCount === 0 ? 'ok' : open.some((f) => ['HIGH', 'CRITICAL'].includes(str(rec(f), 'severity').toUpperCase())) ? 'bad' : 'warn',
      badge: flagsCount > 0 ? flagsCount : null,
      hint: 'Open audit findings',
    },
  ];
}
