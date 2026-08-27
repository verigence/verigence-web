export const UC03_OPERATIONAL_STALE_MS = 5 * 60 * 1000;
export const UC03_OPERATIONAL_GC_MS = 30 * 60 * 1000;

export function bookingWorkspaceQueryKey(tenantId?: string, journeyId?: string) {
  return ['uc03-booking-workspace', tenantId, journeyId] as const;
}

export function pcVerificationQueryKey(tenantId?: string, journeyId?: string) {
  return ['uc03-pc-verification', tenantId, journeyId] as const;
}

export function deliveryWorkspaceQueryKey(tenantId?: string, journeyId?: string) {
  return ['uc03-delivery-workspace', tenantId, journeyId] as const;
}
