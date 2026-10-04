import { hrErrorMessage, HrHttpError } from '../../../services/hr/client';
import type { ClaimField, ClaimFormErrors } from './claimRules';

/** The request fields the service names in a validation error, mapped to this form's fields. */
const FIELD_OF_PROBLEM: Record<string, ClaimField> = {
  category: 'category',
  expense_date: 'expenseDate',
  amount: 'amount',
  distance_km: 'distanceKm',
  description: 'description',
  receipts: 'receipts',
  remove_receipts: 'receipts',
};

/** What to do about each error the claims endpoints give. The service's own wording is kept when it is already plain. */
const GUIDANCE: Record<string, string> = {
  CLAIM_LIMIT_EXCEEDED:
    'Travel above the monthly limit cannot be claimed. Check your other claims for that month, or lower this amount. If you think the limit is wrong, speak to HR.',
  CLAIM_NOT_EDITABLE: 'Only a claim that was sent back for correction can be changed. Open the claim to see where it stands.',
  CLAIM_NOT_CANCELLABLE: 'This claim can no longer be cancelled. Open it to see where it stands.',
  CLAIM_RATE_NOT_SET: 'HR has not set the per-km rate yet, so this category cannot be used. Ask HR, or choose another category.',
  HR_DEPENDENCY_UNAVAILABLE: 'The receipt could not be saved right now. Nothing was sent. Check your connection and send it again.',
};

export interface ClaimProblem {
  /** Plain words for a banner above the buttons. */
  message: string;
  /** Problems that belong to one field, shown beside it. */
  fields: ClaimFormErrors;
  /** True when the claim was refused because of the monthly limit. */
  limit: boolean;
}

export function describeClaimError(error: unknown, perKm = false): ClaimProblem {
  if (!(error instanceof HrHttpError)) return { message: hrErrorMessage(error), fields: {}, limit: false };
  const fields: ClaimFormErrors = {};
  switch (error.code) {
    case 'CLAIM_AMOUNT_INVALID':
      fields[perKm ? 'distanceKm' : 'amount'] = error.message;
      break;
    case 'CLAIM_DATE_INVALID':
      fields.expenseDate = error.message;
      break;
    case 'CLAIM_CATEGORY_UNKNOWN':
      fields.category = error.message;
      break;
    case 'CLAIM_RECEIPT_REQUIRED':
    case 'CLAIM_RECEIPT_INVALID':
      fields.receipts = error.message;
      break;
    case 'CLAIM_RATE_NOT_SET':
      fields.distanceKm = error.message;
      break;
    case 'HR_VALIDATION_FAILED':
      for (const problem of error.problems) {
        const key = FIELD_OF_PROBLEM[problem.field.split('.').pop() ?? ''];
        if (key) fields[key] = problem.message;
      }
      break;
    default:
  }
  const guidance = GUIDANCE[error.code];
  const reference = error.correlationId ? ` Reference: ${error.correlationId}.` : '';
  const message = guidance && error.status !== 401 && error.status !== 403
    ? `${error.message} ${guidance}${reference}`
    : hrErrorMessage(error);
  return { message, fields, limit: error.code === 'CLAIM_LIMIT_EXCEEDED' };
}
