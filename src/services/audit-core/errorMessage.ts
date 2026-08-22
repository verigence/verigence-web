import { AuditCoreHttpError } from './client';

export function auditCoreErrorMessage(error: unknown): string {
  if (error instanceof AuditCoreHttpError) {
    const problem = error.problem;
    const message = problem?.detail || problem?.title || error.message;
    return problem?.errorCode ? `${problem.errorCode}: ${message}` : message;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'We could not complete your request. Please try again.';
}
