import { supportReference } from '../../observability/correlation';
import { AuditCoreHttpError } from './client';

export function auditCoreErrorMessage(error: unknown): string {
  if (error instanceof AuditCoreHttpError) {
    const problem = error.problem;
    const message = problem?.detail || problem?.title || error.message;
    const baseMessage = problem?.errorCode ? `${problem.errorCode}: ${message}` : message;
    const reference = supportReference(error.correlationId);
    return reference ? `${baseMessage} Reference: ${reference}` : baseMessage;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'We could not complete your request. Please try again.';
}
