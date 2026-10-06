import type { EmploymentStatus, StatusChange } from '../../services/hr/employees';

const ALL: EmploymentStatus[] = ['ACTIVE', 'SUSPENDED', 'TERMINATED', 'QUIT'];

/** The statuses HR may ask for: every one except the current status. */
export function statusChoices(current: EmploymentStatus): EmploymentStatus[] {
  return ALL.filter((s) => s !== current);
}

/** A request form is ready to send: a status is chosen and the reason has at least 3 letters. */
export function canSendRequest(input: { toStatus: string; reason: string }): boolean {
  return Boolean(input.toStatus) && input.reason.trim().length >= 3;
}

/**
 * What a person may do with a request. Only the CEO approves or rejects, and never their own
 * request; only the person who asked can take it back. The server decides again.
 */
export function statusChangeActions(
  change: Pick<StatusChange, 'status' | 'requestedBy'>,
  who: { userId: string | null; canApprove: boolean; canManage: boolean },
): { approve: boolean; reject: boolean; cancel: boolean } {
  const open = change.status === 'PENDING';
  const own = Boolean(who.userId) && change.requestedBy === who.userId;
  return {
    approve: open && who.canApprove && !own,
    reject: open && who.canApprove && !own,
    cancel: open && who.canManage && own,
  };
}
