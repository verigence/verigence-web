import {
  MAX_CLAIM_AMOUNT,
  MAX_DESCRIPTION_LENGTH,
  MAX_DISTANCE_KM,
  MAX_RECEIPTS_PER_CLAIM,
  type ClaimCategory,
  type ClaimSummary,
} from '../../../services/hr/claims';
import { formatMonth, formatRupeesShort, monthOf } from './claimFormat';

/**
 * Checks that mirror the HR service's rules so a person hears about a mistake before uploading
 * photos. The service repeats every check and is the only authority: nothing here approves a claim.
 * Amounts are compared as whole paise (integers), never added up as floating point rupees.
 */

export interface ClaimFormValues {
  category: string;
  expenseDate: string;
  amount: string;
  distanceKm: string;
  description: string;
}

export type ClaimField = 'category' | 'expenseDate' | 'amount' | 'distanceKm' | 'description' | 'receipts';
export type ClaimFormErrors = Partial<Record<ClaimField, string>>;

export const emptyClaimForm = (today: string): ClaimFormValues => ({
  category: '',
  expenseDate: today,
  amount: '',
  distanceKm: '',
  description: '',
});

/** Rupees as typed ("450", "450.5") or a JSON number -> whole paise. Null when it is not money. */
export function toPaise(value: string | number): number | null {
  const text = typeof value === 'number' ? (Number.isFinite(value) ? value.toFixed(2) : '') : value.trim();
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

function paiseToText(paise: number): string {
  const whole = Math.floor(paise / 100);
  return `${whole}.${String(paise % 100).padStart(2, '0')}`;
}

/** An integer holding `text` times 10^scale (extra decimals dropped), or null. */
function scaled(text: string, scale: number): number | null {
  const match = /^(\d{1,9})(?:\.(\d{0,12}))?$/.exec(text.trim());
  if (!match) return null;
  return Number(match[1] + (match[2] ?? '').padEnd(scale, '0').slice(0, scale));
}

/**
 * About how much a per-km claim comes to ("12.5" km at 4.5 per km -> "56.25"). Display only: the
 * service works out the real amount when the claim is sent.
 */
export function estimatePerKm(distanceKm: string, ratePerKm: number | null | undefined): string | null {
  if (!ratePerKm || ratePerKm <= 0) return null;
  const km = scaled(distanceKm, 2);
  const rate = scaled(ratePerKm.toFixed(4), 4);
  if (!km || !rate) return null;
  const paise = Math.round((km * rate) / 10_000);
  return paiseToText(paise);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isRealDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** Older than `months` calendar months before the submission date (same rule as the service). */
export function isStale(expense: string, submitted: string, months: number): boolean {
  if (!isRealDate(expense) || !isRealDate(submitted)) return false;
  const year = Number(submitted.slice(0, 4));
  const month = Number(submitted.slice(5, 7));
  const day = Number(submitted.slice(8, 10));
  const index = year * 12 + (month - 1) - months;
  const limitYear = Math.floor(index / 12);
  const limitMonth = (index % 12) + 1;
  const limitDay = Math.min(day, daysInMonth(limitYear, limitMonth));
  const limit = `${String(limitYear).padStart(4, '0')}-${String(limitMonth).padStart(2, '0')}-${String(limitDay).padStart(2, '0')}`;
  return expense < limit;
}

export interface ValidationContext {
  category: ClaimCategory | undefined;
  /** Receipts that will be on the claim: new photos plus ones kept from before. */
  receiptCount: number;
  /** IST today, YYYY-MM-DD. */
  today: string;
}

export function validateClaimForm(values: ClaimFormValues, ctx: ValidationContext): ClaimFormErrors {
  const errors: ClaimFormErrors = {};
  const { category } = ctx;
  if (!values.category || !category) errors.category = 'Choose what the expense was for.';

  if (!values.expenseDate) errors.expenseDate = 'Enter the expense date.';
  else if (!isRealDate(values.expenseDate)) errors.expenseDate = 'Enter the expense date.';
  else if (values.expenseDate > ctx.today) errors.expenseDate = 'The expense date cannot be in the future.';

  if (category?.perKm) {
    const km = values.distanceKm.trim();
    if (!/^\d{1,4}(\.\d)?$/.test(km) || Number(km) <= 0) {
      errors.distanceKm = 'Enter the distance in km, for example 12.5.';
    } else if (Number(km) > MAX_DISTANCE_KM) {
      errors.distanceKm = `The distance can be at most ${MAX_DISTANCE_KM} km.`;
    } else if (!category.ratePerKm || category.ratePerKm <= 0) {
      errors.distanceKm = 'HR has not set the per-km rate yet, so this category cannot be used.';
    }
  } else if (category) {
    const text = values.amount.trim();
    const paise = toPaise(text);
    if (paise === null || paise <= 0) {
      errors.amount = 'Enter an amount in rupees, with at most two decimals.';
    } else if (paise > MAX_CLAIM_AMOUNT * 100) {
      errors.amount = `That amount is too large for one claim (the most is ${formatRupeesShort(MAX_CLAIM_AMOUNT)}).`;
    }
  }

  if (values.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Keep the description under ${MAX_DESCRIPTION_LENGTH} characters.`;
  }

  if (ctx.receiptCount > MAX_RECEIPTS_PER_CLAIM) {
    errors.receipts = `Attach at most ${MAX_RECEIPTS_PER_CLAIM} receipts.`;
  } else if (category?.receiptRequired && ctx.receiptCount === 0) {
    errors.receipts = 'Attach a photo of the receipt for this claim.';
  }
  return errors;
}

export interface ClaimOutlook {
  /** Travel for the expense month if this claim is added, in whole paise; null for meals or no amount. */
  projectedTravelPaise: number | null;
  overLimit: boolean;
  needsFinance: boolean;
  stale: boolean;
}

/**
 * What the person can expect, shown before sending. It repeats the service's arithmetic on whole
 * paise; the service still decides. `excludePaise` is this claim's own earlier amount when editing.
 */
export function claimOutlook(args: {
  category: ClaimCategory | undefined;
  amountPaise: number | null;
  expenseDate: string;
  today: string;
  summary: ClaimSummary | undefined;
  excludePaise?: number;
}): ClaimOutlook {
  const { category, amountPaise, summary } = args;
  const stale = Boolean(summary && isRealDate(args.expenseDate) && isStale(args.expenseDate, args.today, summary.staleAfterMonths));
  if (!category || category.kind !== 'TRAVEL' || amountPaise === null || !summary || summary.month !== monthOf(args.expenseDate)) {
    return { projectedTravelPaise: null, overLimit: false, needsFinance: false, stale };
  }
  const used = toPaise(summary.travelUsed) ?? 0;
  const projected = Math.max(used - (args.excludePaise ?? 0), 0) + amountPaise;
  const limit = toPaise(summary.travelLimit) ?? 0;
  const threshold = toPaise(summary.financeThreshold) ?? 0;
  return { projectedTravelPaise: projected, overLimit: projected > limit, needsFinance: projected > threshold, stale };
}

export function outlookNotes(outlook: ClaimOutlook, summary: ClaimSummary | undefined, expenseDate: string): string[] {
  const notes: string[] = [];
  if (outlook.needsFinance && !outlook.overLimit && summary) {
    notes.push(
      `Your travel for ${formatMonth(monthOf(expenseDate))} would go above ${formatRupeesShort(summary.financeThreshold)}, so Finance approves this claim.`,
    );
  }
  if (outlook.stale && summary) {
    notes.push(
      `This expense is more than ${summary.staleAfterMonths} months old, so Finance also has to approve it as an exception.`,
    );
  }
  return notes;
}
