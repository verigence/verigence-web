/**
 * Night control (product owner, 6 Nov 2026): from 20:00 to 08:30 IST Journey 360 and file downloads
 * are closed to everyone SuperAdmin has not given access to. The services refuse with HTTP 403 and the
 * code NIGHT_MODE; wherever that reaches a screen, the person reads "Night Mode On" and nothing else.
 *
 * Kept free of the service clients so both the Audit Core and the myHR client can use it.
 */

export const NIGHT_MODE_CODE = 'NIGHT_MODE';
export const NIGHT_MODE_MESSAGE = 'Night Mode On';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Whether a code-carrying payload says NIGHT_MODE: Audit Core `errorCode`, myHR `code`, or an error type URN. */
export function isNightModeProblem(problem: unknown): boolean {
  if (!isRecord(problem)) return false;
  if (problem.errorCode === NIGHT_MODE_CODE || problem.code === NIGHT_MODE_CODE || problem.reasonCode === NIGHT_MODE_CODE) return true;
  if (typeof problem.type === 'string' && problem.type.endsWith(`:${NIGHT_MODE_CODE}`)) return true;
  // A FastAPI HTTPException whose detail is a structured object.
  return isRecord(problem.detail) && isNightModeProblem(problem.detail);
}

/**
 * Whether an error is a night-mode refusal from any Verigence service: an AuditCoreHttpError
 * (`errorCode` / `problem`), an HrHttpError (`code`), or a plain payload.
 */
export function isNightModeError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  if (isNightModeProblem(error)) return true;
  return isRecord(error.problem) && isNightModeProblem(error.problem);
}
