/** A Team Lead's reason for deleting a journey must say something: Audit Core
 * refuses fewer than this many characters, and the dialog says so before it asks. */
export const MIN_DELETE_REASON_LENGTH = 10;

export function deleteReasonProblem(reason: string): string | undefined {
  const length = reason.trim().length;
  if (length === 0) return 'Give the reason for deleting this journey.';
  if (length < MIN_DELETE_REASON_LENGTH) {
    return `Say a little more: at least ${MIN_DELETE_REASON_LENGTH} characters (${length} so far).`;
  }
  return undefined;
}

/** Only a Team Lead deletes; Audit Core checks the same on its side. */
export function canDeleteJourney(operatingRole?: string | null): boolean {
  return operatingRole === 'TL';
}
