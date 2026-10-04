/**
 * Query keys for the inbox. The three list keys are siblings, and photos and receipts sit
 * under different roots, so refreshing one list never touches another tab or a loaded image.
 */
export const approvalKeys = {
  attendance: ['hr', 'approvals', 'attendance'] as const,
  leave: ['hr', 'approvals', 'leave'] as const,
  claims: ['hr', 'approvals', 'claims'] as const,
  photo: (attendanceId: string, event: string) => ['hr', 'approval-photo', attendanceId, event] as const,
  claimDetail: (claimId: string) => ['hr', 'approval-claim', claimId] as const,
  receipt: (claimId: string, receiptId: string) => ['hr', 'approval-receipt', claimId, receiptId] as const,
};
