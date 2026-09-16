/**
 * Shared field-category classifier: buckets any extracted/reviewed field
 * into one of four business categories by its key/label text, purely via
 * keyword matching (no fuzzy scoring, no server round trip). Originally
 * inline in DeliveryReviewV2Page.tsx; extracted so JourneyDocumentsPage.tsx
 * groups its own per-document field list (e.g. payment fields together)
 * the same way instead of drifting into its own copy.
 */
export type FieldCategory = 'CUSTOMER' | 'VEHICLE' | 'FINANCIAL' | 'OTHER';

export const FIELD_CATEGORY_ORDER: FieldCategory[] = ['CUSTOMER', 'VEHICLE', 'FINANCIAL', 'OTHER'];

export function categoryFor(key: string, label: string): FieldCategory {
  const text = `${key} ${label}`.toLowerCase();
  if (/(customer|name|mobile|phone|email|address|pan|aadhaar|identity|dob)/.test(text)) return 'CUSTOMER';
  if (/(vehicle|model|variant|colour|color|vin|chassis|engine|registration|invoice|dealer|outlet)/.test(text)) return 'VEHICLE';
  if (/(price|amount|payment|receipt|discount|tax|gst|insurance|finance|balance|total|ex showroom|ex_showroom)/.test(text)) return 'FINANCIAL';
  return 'OTHER';
}

export function categoryTitle(category: FieldCategory): string {
  if (category === 'CUSTOMER') return 'Customer Details';
  if (category === 'VEHICLE') return 'Vehicle & Invoice Details';
  if (category === 'FINANCIAL') return 'Price & Payment Details';
  return 'Other Extracted Details';
}
