export const UC03_OPERATIONAL_STALE_MS = Infinity;
export const UC03_OPERATIONAL_GC_MS = Infinity;

export function bookingWorkspaceQueryKey(tenantId?: string, journeyId?: string) {
  return ['uc03-booking-workspace', tenantId, journeyId] as const;
}

export function bookingPart1QueryKey(tenantId?: string, journeyId?: string) {
  return ['uc03-booking-part1', tenantId, journeyId] as const;
}

export function bookingDetailsQueryKey(tenantId?: string, journeyId?: string) {
  return ['uc03-booking-details', tenantId, journeyId] as const;
}

export function bookingDetailsOptionsQueryKey(tenantId?: string, journeyId?: string) {
  return ['uc03-booking-details-options', tenantId, journeyId] as const;
}

export function pcVerificationQueryKey(tenantId?: string, journeyId?: string) {
  return ['uc03-pc-verification', tenantId, journeyId] as const;
}

export function deliveryWorkspaceQueryKey(tenantId?: string, journeyId?: string) {
  return ['uc03-delivery-workspace', tenantId, journeyId] as const;
}
