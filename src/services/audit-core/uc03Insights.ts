import { auditCoreRequest } from './client';

/**
 * Business insights (product owner 2026-11-10): sales, discount control, product
 * penetration, insurance, finance, scrappage, payments and customer catchment. Read
 * live from the Journeys, for a Team Lead, PM or Executive over their own outlets.
 *
 * GET /p2/v1/tenants/{tenantId}/insights/{report}?dealer_id=&outlet_id=&from=&to=
 */
export const INSIGHT_REPORTS = [
  'sales', 'discounts', 'penetration', 'insurance', 'finance', 'scrappage', 'payments', 'catchment',
] as const;
export type InsightReport = (typeof INSIGHT_REPORTS)[number];

export interface InsightFilters {
  dealerId?: string;
  outletId?: string;
  from?: string;
  to?: string;
}

export interface InsightEnvelope {
  report: InsightReport;
  asOfUtc: string;
  filters: { dealerId: string | null; outletId: string | null; from: string | null; to: string | null; dateBasis: string };
  scope: {
    projectWide: boolean;
    dealers: { dealerId: string; dealer: string; outlets: { outletId: string; outlet: string }[] }[];
  };
  period: { first: string | null; last: string | null };
  notes: string[];
}

/** One group of a breakdown: a dealership, an outlet (parent = its dealership), a model
 *  (parent = its category) or a district. `thin` marks a group too small to read a rate from. */
export interface GroupRow {
  key: string;
  label: string;
  parent: string | null;
  thin?: boolean;
}

export interface JourneyRef {
  journeyId: string;
  reference: string | null;
  customer?: string | null;
  dealer?: string;
  outlet?: string;
  pc?: string | null;
}

// --------------------------------------------------------------------------- sales

export interface SalesBlock {
  journeys: number;
  sharePercent: number | null;
  deliveryStarted: number;
  delivered: number;
  statementDeals: number;
  billedDeals: number;
  billedValue: number;
  typicalExShowroom: number | null;
  typicalDaysToDeliver: number | null;
  daysMeasuredOn: number;
}
export type SalesRow = GroupRow & SalesBlock;
export interface SalesInsight extends InsightEnvelope {
  basis: { liveJourneys: number; thinBelow: number; bookingDateRead: number; priceInDoubt: number; modelNotResolved: number; deliveryDateInDoubt: number };
  network: SalesBlock;
  months: { month: string; booked: number; delivered: number }[];
  daysToDeliverBands: { band: string; deals: number }[];
  dealers: SalesRow[];
  outlets: SalesRow[];
  models: SalesRow[];
  categories: SalesRow[];
}

// --------------------------------------------------------------------------- penetration

export interface ProductCell {
  count: number;
  percent: number | null;
  amount: number | null;
  typical: number | null;
  expected?: number;
  gap?: number;
}
export interface ProductInfo { key: string; label: string; how: string }
export interface PenetrationRow extends GroupRow { deals: number; products: Record<string, ProductCell> }
export interface PenetrationInsight extends InsightEnvelope {
  basis: { liveJourneys: number; statementDeals: number; withoutStatement: number; thinBelow: number };
  products: ProductInfo[];
  network: { deals: number; products: Record<string, ProductCell> };
  dealers: PenetrationRow[];
  outlets: PenetrationRow[];
  models: PenetrationRow[];
  districts: PenetrationRow[];
  /** The accessory items fitted, from the accessory tax invoices on file. */
  accessoryItems: {
    journeysWithInvoice: number;
    lines: number;
    units: number;
    value: number;
    itemsSeen: number;
    /** The models the item split is kept for, busiest first. */
    topModels: string[];
    items: {
      label: string;
      lines: number;
      units: number;
      value: number;
      journeys: number;
      dealers: Record<string, number>;
      models: Record<string, number>;
    }[];
  };
}

// --------------------------------------------------------------------------- insurance

export interface ChannelBlock {
  deals: number;
  channels: Record<string, number>;
  inhouse: number;
  inhousePercent: number | null;
  inhousePremium: number | null;
  outside: number;
  outsidePercent: number | null;
  outsidePremium: number | null;
  noPolicy: number;
}
export type ChannelRow = GroupRow & ChannelBlock;
export interface OutsideAgent {
  key: string;
  agent: string;
  code: string | null;
  policies: number;
  premium: number | null;
  confirmedOutside: number;
  /** Every code read for this agent; more than one where a reader dropped a digit. */
  codes: string[];
  dealers: string[];
  outlets: { outlet: string; policies: number }[];
  journeys: JourneyRef[];
}
export interface InsuranceInsight extends InsightEnvelope {
  basis: {
    liveJourneys: number; statementDeals: number; policiesOnFile: number; policiesWithCovers: number;
    renewalDatesRead: number; thinBelow: number;
  };
  channelLabels: Record<string, string>;
  network: ChannelBlock;
  dealers: ChannelRow[];
  outlets: ChannelRow[];
  models: ChannelRow[];
  outsideAgents: OutsideAgent[];
  dealerCodeOffStatement: { policies: number; premium: number | null; journeys: (JourneyRef & { premium: number | null })[] };
  insurers: { insurer: string; policies: number; premium: number | null; inhouse: number; outside: number; sharePercent: number | null }[];
  covers: { cover: string; policies: number; percent: number | null }[];
  renewals: { month: string; policies: number; premium: number | null; inhouse: number; outside: number }[];
}

// --------------------------------------------------------------------------- scrappage

export interface ScrappageShareRow extends GroupRow { deals: number; certificates: number; percent: number | null; bonusGiven: number }
export interface ScrappageRegisterRow extends JourneyRef {
  model: string;
  bookingDate: string | null;
  certificateNumber: string | null;
  kind: string | null;
  oldRegistration: string | null;
  state: string | null;
  facility: string | null;
  certificates: number;
  bonusGiven: number;
  exShowroom: number | null;
  roadTaxPaid: number | null;
  roadTaxPercent: number | null;
  chargedOnStatement: number | null;
  paidAtRto: number | null;
  chargedAbovePaid: number | null;
}
export interface ScrappageInsight extends InsightEnvelope {
  basis: { liveJourneys: number; statementDeals: number; thinBelow: number; gapRupees: number };
  summary: {
    journeysWithCertificate: number; statementDealsWithCertificate: number; percentOfStatementDeals: number | null;
    certificates: number; transferred: number; original: number; bonusGiven: number; certificateWithoutBonus: number;
    oldVehiclesOutsideState: number | null; oldVehiclesStateRead: number; certificatesUsedTwice: number;
    estimatedRoadTaxSaved: number; roadTaxSavedOnDeals: number; chargedAbovePaid: { deals: number; amount: number };
  };
  states: { state: string; certificates: number }[];
  roadTaxEffect: {
    band: string; withCertificate: number; withoutCertificate: number; taxPercentWith: number | null;
    taxPercentWithout: number | null; savingPerDeal: number | null; saving: number | null;
  }[];
  dealers: ScrappageShareRow[];
  outlets: ScrappageShareRow[];
  models: ScrappageShareRow[];
  usedTwice: { certificateNumber: string | null; journeys: JourneyRef[] }[];
  register: ScrappageRegisterRow[];
}

// --------------------------------------------------------------------------- finance

export interface FinanceBlock {
  deals: number;
  financed: number;
  percent: number | null;
  loanKnown: number;
  loanTotal: number | null;
  typicalLoan: number | null;
  typicalLoanToValue: number | null;
}
export type FinanceRow = GroupRow & FinanceBlock;
export interface FinanceInsight extends InsightEnvelope {
  basis: { liveJourneys: number; statementDeals: number; thinBelow: number; gapRupees: number; financedAllLiveJourneys: number };
  summary: FinanceBlock & {
    loanAboveExShowroom: number; loanBelowSixtyPercent: number; loanToValueKnown: number;
    sanctionAndDisbursalRead: number; sanctionDiffersFromDisbursal: number;
    shortDisbursed: { deals: number; amount: number };
  };
  lenders: {
    lender: string; deals: number; sharePercent: number | null; loanKnown: number; loanTotal: number | null;
    typicalLoan: number | null; typicalLoanToValue: number | null; dealers: Record<string, number>;
  }[];
  loanToValueBands: { band: string; deals: number }[];
  loanBands: { band: string; deals: number }[];
  dealers: FinanceRow[];
  outlets: FinanceRow[];
  models: FinanceRow[];
  sanctionGaps: (JourneyRef & { lender: string | null; sanctioned: number; disbursed: number; short: number })[];
}

// --------------------------------------------------------------------------- payments

export interface PaymentsBlock {
  journeys: number;
  journeysWithReceipts: number;
  receipts: number;
  amount: number;
  cashReceipts: number;
  cashAmount: number;
  cashPercent: number | null;
  journeysPayingCash: number;
  cashAboveLimit: number;
  cashAboveLimitAmount: number;
  cashAtLimit: number;
  cashAtLimitAmount: number;
  cashNearLimit: number;
  cashNearLimitAmount: number;
  journeysCashAboveLimitInAll: number;
  modeNotRead: number;
  modeNotReadAmount: number;
  modeNotReadPercent: number | null;
}
export type PaymentsRow = GroupRow & PaymentsBlock;
export interface PaymentsInsight extends InsightEnvelope {
  basis: { liveJourneys: number; cashLimit: number; nearLimitFrom: number; refunds: number; refundAmount: number };
  network: PaymentsBlock;
  modes: { mode: string; label: string; receipts: number; journeys: number; amount: number; sharePercent: number | null; typical: number | null }[];
  dealers: PaymentsRow[];
  outlets: PaymentsRow[];
  cashAboveLimit: (JourneyRef & { amount: number; date: string | null; receiptNumber: string | null })[];
  cashAroundLimit: (JourneyRef & { amount: number; band: 'ABOVE' | 'AT' | 'NEAR'; date: string | null; receiptNumber: string | null })[];
  cashAboveLimitInAll: (JourneyRef & { cashTotal: number; cashReceipts: number; largestReceipt: number })[];
}

// --------------------------------------------------------------------------- catchment

export interface PlaceRow extends GroupRow {
  journeys: number;
  sharePercent: number | null;
  pins: number;
  statementDeals: number;
  products: Record<string, ProductCell> | null;
  outlets: { outlet: string; journeys: number }[];
}
export interface CatchmentInsight extends InsightEnvelope {
  basis: {
    liveJourneys: number; withPin: number; withDistrict: number; withoutPlace: number; pins: number; districts: number;
    thinBelow: number;
  };
  products: ProductInfo[];
  districts: PlaceRow[];
  pins: PlaceRow[];
  outlets: (GroupRow & {
    journeys: number; located: number; districts: number; homeDistrict: string | null; homeSharePercent: number | null;
    topDistricts: { district: string; journeys: number; percent: number | null }[];
  })[];
  map: CustomerMapData;
}

/** One row of the customer map: a PIN code (or a district, where no PIN code was read),
 *  an outlet and a model. `products` counts the statement deals that took each product. */
export interface MapCell {
  pin: string | null;
  onMap: boolean;
  district: string | null;
  dealerId: string | null;
  dealer: string | null;
  outletId: string | null;
  outlet: string | null;
  model: string | null;
  journeys: number;
  delivered: number;
  deals: number;
  products: Record<string, number>;
}
export interface CustomerMapData {
  boundaries: { key: string; type: 'PIN' | 'DISTRICT'; state?: string; source?: string }[];
  cells: MapCell[];
  localities: Record<string, string[]>;
  outlets: { outletId: string; outlet: string; dealerId: string | null; dealer: string | null; pin: string | null }[];
  offMap: number;
}
export interface MapBoundary { key: string; type: 'PIN' | 'DISTRICT'; source: string; contentGzipBase64: string }

// --------------------------------------------------------------------------- discount control

export type Verdict = 'OVER_ENTITLEMENT' | 'KIT_AS_CASH' | 'ENTITLEMENT_UNKNOWN' | 'UNDER_ENTITLEMENT';
export interface DiscountBlock {
  deals: number;
  discountedDeals: number;
  given: number | null;
  exShowroom: number | null;
  givenPercent: number | null;
  perDeal: number | null;
  typicalDiscount: number | null;
  verdicts: Record<Verdict, { lines: number; journeys: number; amount: number | null }>;
  expectedGiven?: number | null;
  aboveExpected?: number | null;
  index?: number | null;
}
export type DiscountRow = GroupRow & DiscountBlock;
export interface DiscountOutlier extends JourneyRef {
  model: string;
  variant: string | null;
  bookingDate: string | null;
  exShowroom: number | null;
  given: number;
  percent: number | null;
  lines: { key: string; label: string; amount: number }[];
  verdicts: Verdict[];
}
export interface DiscountInsight extends InsightEnvelope {
  basis: {
    liveJourneys: number; billedDeals: number; pricedDeals: number; priceNotRead: number; priceInDoubt: number; notYetCalculated: number;
    thinBelow: number; outlierPercent: number; outlierAmount: number; toleranceRupees: number;
  };
  verdictLabels: Record<Verdict, string>;
  network: DiscountBlock;
  concentration: { discountedDeals: number; aboveMark: number; aboveMarkGiven: number | null; aboveMarkSharePercent: number | null };
  byDiscount: { key: string; label: string; deals: number; given: number | null; sharePercent: number | null; over: number | null; kitAsCash: number | null; unknown: number | null }[];
  unknownByReason: { reason: string; key: string; label: string; lines: number; amount: number }[];
  dealers: DiscountRow[];
  outlets: DiscountRow[];
  models: DiscountRow[];
  outliers: DiscountOutlier[];
  decisions: {
    rules: { rule: string; raised: number; open: number; closedOnRecheck: number; confirmedBreach: number; falsePositive: number; other: number }[];
    raised: number;
    decidedByAPerson: number;
    remarks: { journeyId: string; rule: string; decision: string; remark: string }[];
  };
}

export interface InsightByReport {
  sales: SalesInsight;
  discounts: DiscountInsight;
  penetration: PenetrationInsight;
  insurance: InsuranceInsight;
  finance: FinanceInsight;
  scrappage: ScrappageInsight;
  payments: PaymentsInsight;
  catchment: CatchmentInsight;
}

function token(accessToken?: string): string {
  const value = accessToken?.trim();
  if (!value) throw new Error('Please sign in again to open this report.');
  return value;
}

export async function getInsight<R extends InsightReport>(
  tenantId: string,
  report: R,
  filters: InsightFilters = {},
  accessToken?: string,
): Promise<InsightByReport[R]> {
  const query = new URLSearchParams();
  if (filters.dealerId) query.set('dealer_id', filters.dealerId);
  if (filters.outletId) query.set('outlet_id', filters.outletId);
  if (filters.from) query.set('from', filters.from);
  if (filters.to) query.set('to', filters.to);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return auditCoreRequest<InsightByReport[R]>(
    `/p2/v1/tenants/${encodeURIComponent(tenantId)}/insights/${report}${suffix}`,
    { method: 'GET', accessToken: token(accessToken), cache: 'no-store', timeoutMs: 45_000 },
  );
}

/** One outline of the customer map (GeoJSON, gzip, base64). Reference data: it does not change. */
export async function getMapBoundary(tenantId: string, key: string, accessToken?: string): Promise<MapBoundary> {
  return auditCoreRequest<MapBoundary>(
    `/p2/v1/tenants/${encodeURIComponent(tenantId)}/insight-boundaries/${encodeURIComponent(key)}`,
    { method: 'GET', accessToken: token(accessToken), timeoutMs: 45_000 },
  );
}
