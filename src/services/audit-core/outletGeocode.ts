import { auditCoreRequest } from './client';

export interface OutletAddressInput {
  addressText?: string;
  city?: string;
  stateRegion?: string;
  postalCode?: string;
}

export interface OutletGeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  googlePlaceId: string | null;
  /** ROOFTOP is a precise building match; anything else is an area estimate. */
  precision: string;
  approximate: boolean;
  partialMatch: boolean;
  resultCount: number;
}

/**
 * Where is this address? Read-only: nothing is saved. The admin confirms the result on the map
 * and saves it through the normal outlet form. One request per click; never retried here.
 */
export function geocodeOutletAddress(
  tenantId: string,
  address: OutletAddressInput,
  accessToken?: string,
) {
  return auditCoreRequest<OutletGeocodeResult>(`/v1/tenants/${tenantId}/outlet-location/geocode`, {
    method: 'POST',
    body: JSON.stringify(address),
    timeoutMs: 12_000,
    ...(accessToken ? { accessToken } : {}),
  });
}
