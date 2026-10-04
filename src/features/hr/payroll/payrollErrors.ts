import { hrErrorMessage, HrHttpError } from '../../../services/hr/client';

/** What to tell a person when the CEO cannot approve because the CA has not confirmed the settings. */
export const STATUTORY_UNCONFIRMED_TEXT =
  'Your CA has not confirmed the statutory settings (PF, ESI and professional tax) that this run was calculated with, so it cannot be approved yet. ' +
  'Send it back to HR: they confirm the settings with the CA, recompute the run and submit it again.';

const overrides: Record<string, string> = {
  PAYROLL_STATUTORY_UNCONFIRMED: STATUTORY_UNCONFIRMED_TEXT,
};

/**
 * One plain sentence for any payroll failure. The service words most errors for people already
 * (for example "You cannot approve your own proposal or your own salary."), so its text is kept,
 * including for 403, where the general helper would hide it.
 */
export function payrollErrorMessage(error: unknown): string {
  if (error instanceof HrHttpError) {
    const override = overrides[error.code];
    if (override) return error.correlationId ? `${override} Reference: ${error.correlationId}.` : override;
    if (error.status === 403 && error.code === 'HR_PERMISSION_DENIED') {
      return error.correlationId ? `${error.message} Reference: ${error.correlationId}.` : error.message;
    }
  }
  return hrErrorMessage(error);
}

export function errorCode(error: unknown): string | undefined {
  return error instanceof HrHttpError ? error.code : undefined;
}
