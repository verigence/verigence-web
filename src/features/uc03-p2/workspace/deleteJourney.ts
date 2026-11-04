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

/** A Team Lead or a Reviewer deletes (the Reviewer from 2026-11-04); Audit
 * Core checks the same on its side. */
export function canDeleteJourney(operatingRole?: string | null): boolean {
  return operatingRole === 'TL' || operatingRole === 'REVIEWER';
}

/** Who may read a page again into a stage already marked reviewed, with a
 * reason (product owner 2026-11-04 added the Reviewer). Mirrors Audit Core. */
export function canOverrideReviewedStage(operatingRole?: string | null): boolean {
  return operatingRole === 'TL' || operatingRole === 'PM' || operatingRole === 'REVIEWER';
}
