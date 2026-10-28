/**
 * A possible duplicate booking, in the product owner's words (2026-10-28): the
 * same PAN or Aadhaar is a high-probability duplicate; a relative's name, the
 * same surname and pincode, a mobile or a GSTIN make it probable.
 */
export function matchLevelText(label?: string | null): string {
  return label === 'HIGH' ? 'High probability' : 'Probable';
}
