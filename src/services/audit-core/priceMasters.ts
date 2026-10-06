import { auditCoreRequest } from './client';

/** One vehicle in the standard price format (the same for every OEM). Amounts are exact decimal strings. */
export interface PriceMasterStandard {
  wefDate: string | null;
  priceListVersion: number | null;
  exShowroom: string | null;
  tcs: string | null;
  insurance: {
    inHouse: string | null;
    options: {
      type: 'PRIVATE' | 'COMMERCIAL' | 'STANDARD';
      skuCode: string;
      amount: string | null;
      selected: boolean;
      onRoadWithoutHypo: string | null;
      onRoadWithHypo: string | null;
    }[];
    selectionNeeded: boolean;
  };
  ewFourthYear: string | null;
  ewFourthAndFifthYear: string | null;
  accessoriesKit: string | null;
  essentialAccessories: string | null;
  rsa: string | null;
  fastag: string | null;
  registrationWithoutHypo: string | null;
  registrationWithHypo: string | null;
  hypothecationCharge: string | null;
  hypothecationSource: 'PRICE_LIST' | 'VERSION_DEFAULT' | null;
  onRoadWithoutHypo: string | null;
  onRoadWithHypo: string | null;
  onRoadByEw: Record<'NONE' | '4TH' | '4TH_5TH', { withoutHypo: string | null; withHypo: string | null }>;
  minimumBookingAmount: string | null;
  extraCharges: { key: string; label: string; amount: string | null }[];
}

export interface PriceMasterVehicle {
  sku: {
    skuCode: string;
    model: string;
    variant: string;
    trim: string | null;
    fuel: string | null;
    transmission: string | null;
    drive: string | null;
    seater: string | null;
  };
  standard: PriceMasterStandard;
}

export interface PriceSheetResponse {
  on: string;
  priceList: { version: number | null; effectiveFrom: string | null; effectiveTo: string | null } | null;
  /** The original names of the files the price list was loaded from. */
  sourceFiles: string[];
  total: number;
  truncated: boolean;
  vehicles: PriceMasterVehicle[];
}

export interface PriceSheetFilters {
  model: string;
  trim: string;
  variant: string;
  fuel: string;
  seater: string;
}

export const EMPTY_PRICE_SHEET_FILTERS: PriceSheetFilters = { model: '', trim: '', variant: '', fuel: '', seater: '' };

const wholeRupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const withPaise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Exact rupees (paise kept when there are any); a missing amount is a dash, never a zero. */
export function formatRupees(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return Number.isInteger(amount) ? wholeRupees.format(amount) : withPaise.format(amount);
}

export function fetchPriceSheet(
  tenantId: string,
  on: string,
  filters: PriceSheetFilters,
  accessToken?: string,
) {
  const params = new URLSearchParams({ on });
  (Object.keys(filters) as (keyof PriceSheetFilters)[]).forEach((key) => {
    const value = filters[key].trim();
    if (value) params.set(key, value);
  });
  return auditCoreRequest<PriceSheetResponse>(
    `/p2/v1/tenants/${encodeURIComponent(tenantId)}/standard/price-sheet?${params.toString()}`,
    accessToken ? { accessToken } : {},
  );
}
