import {
  analyticsRequest,
  type AnalyticsBusinessScorecard,
  type AnalyticsDashboardData,
} from './client';

export type NumericValue = number | string | null;

export interface ProjectAuditorSummary {
  total_journeys: number;
  delivered_cars: number;
  delivery_records: number;
  total_standard_discount: NumericValue;
  total_actual_discount: NumericValue;
  total_excess_discount: NumericValue;
  journeys_with_excess_discount: number;
  total_cash_discount: NumericValue;
  total_exchange_bonus: NumericValue;
  exchange_journeys: number;
  total_scrappage_bonus: NumericValue;
  scrappage_journeys: number;
  total_corporate_discount: NumericValue;
  total_mr_discount: NumericValue;
  total_other_discount: NumericValue;
  insured_journeys: number;
  inhouse_insurance_journeys: number;
  outside_insurance_journeys: number;
  total_insurance_premium: NumericValue;
  accessory_journeys: number;
  total_accessories_value: NumericValue;
  ew_journeys: number;
  total_ew_value: NumericValue;
  rsa_journeys: number;
  total_rsa_value: NumericValue;
  trade_in_journeys: number;
  total_trade_in_value: NumericValue;
  finance_journeys: number;
  total_payment_collected: NumericValue;
  booking_payment_collected: NumericValue;
  delivery_payment_collected: NumericValue;
  avg_booking_to_delivery_days: NumericValue;
  median_booking_to_delivery_days: NumericValue;
  journeys_with_findings: number;
  journeys_with_missing_docs: number;
}

export interface DealerAuditorRow {
  dealer_id: string;
  dealer_name: string;
  booked_cars: number;
  delivered_cars: number;
  standard_discount: NumericValue;
  actual_discount: NumericValue;
  excess_discount: NumericValue;
  excess_discount_journeys: number;
  exchange_bonus: NumericValue;
  exchange_journeys: number;
  scrappage_bonus: NumericValue;
  scrappage_journeys: number;
  total_insured: number;
  inhouse_insurance: number;
  outside_insurance: number;
  accessories_value: NumericValue;
  ew_value: NumericValue;
  rsa_value: NumericValue;
  payment_collected: NumericValue;
  avg_delivery_days: NumericValue;
  median_delivery_days: NumericValue;
  journeys_with_findings: number;
}

export interface OutletAuditorRow extends DealerAuditorRow {
  outlet_id: string;
  outlet_name: string;
  city: string | null;
  state_region: string | null;
}

export interface ModelVelocityRow {
  model_name: string;
  booked_units: number;
  delivered_units: number;
  standard_discount: NumericValue;
  actual_discount: NumericValue;
  excess_discount: NumericValue;
  avg_discount_per_car: NumericValue;
  avg_delivery_days: NumericValue;
  median_delivery_days: NumericValue;
  min_delivery_days: number | null;
  max_delivery_days: number | null;
}

export interface PincodePlacementRow {
  customer_pincode: string;
  dealer_name: string;
  outlet_name: string;
  car_count: number;
  delivered_count: number;
  total_discount: NumericValue;
  excess_discount: NumericValue;
  payment_collected: NumericValue;
}

export interface DiscountSchemeRow {
  discount_key: string;
  application_count: number;
  journey_count: number;
  actual_discount_amount: NumericValue;
  standard_eligible_amount: NumericValue;
  excess_discount_amount: NumericValue;
}

export interface AccessoryBreakdownRow {
  addon_type: string;
  record_count: number;
  journey_count: number;
  actual_amount: NumericValue;
  avg_amount: NumericValue;
}

export interface AuditorProjectDashboard {
  tenant_id: string;
  data_as_of: string;
  summary: ProjectAuditorSummary;
  dealers: DealerAuditorRow[];
  outlets: OutletAuditorRow[];
  models: ModelVelocityRow[];
  pincodes: PincodePlacementRow[];
  discount_schemes: DiscountSchemeRow[];
  accessories: AccessoryBreakdownRow[];
}

export async function getBusinessProjectDashboard(
  tenantId: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<AuditorProjectDashboard> {
  const root = `/v1/analytics/tenants/${encodeURIComponent(tenantId)}/business-intelligence`;
  return analyticsRequest<AuditorProjectDashboard>(
    `${root}/project-dashboard`,
    accessToken,
    signal,
  );
}

export interface AnalyticsCoverageMetric {
  available: number;
  total: number;
  coverage_pct: number | null;
}

export interface AnalyticsBusinessDelivery {
  tenant_id: string;
  data_as_of: string;
  summary: {
    booking_delivery_pairs: number;
    avg_booking_to_delivery_days: NumericValue;
    median_booking_to_delivery_days: NumericValue;
    p75_booking_to_delivery_days: NumericValue;
    p90_booking_to_delivery_days: NumericValue;
    planned_actual_pairs: number;
    on_time_deliveries: number;
    booking_allocation_pairs: number;
    avg_booking_to_allocation_days: NumericValue;
    on_time_delivery_pct: number | null;
  };
  by_outlet: Array<{
    dealer_name: string;
    outlet_name: string;
    completed_count: number;
    avg_days: NumericValue;
    median_days: NumericValue;
  }>;
  by_model: Array<{
    model_name: string;
    completed_count: number;
    avg_days: NumericValue;
    median_days: NumericValue;
  }>;
  definition: string;
}

export interface AnalyticsBusinessDiscounts {
  tenant_id: string;
  data_as_of: string;
  summary: {
    journeys: number;
    journeys_with_actual_discount: number;
    total_actual_discount: NumericValue;
    avg_discount_per_discounted_journey: NumericValue;
    avg_discount_per_journey: NumericValue;
    avg_discount_per_actual_delivery: NumericValue;
    above_eligible_discount_amount: NumericValue;
    above_eligible_journeys: number;
  };
  by_model: Array<{
    model_name: string;
    journeys: number;
    discounted_journeys: number;
    total_actual_discount: NumericValue;
    avg_discount_per_discounted_journey: NumericValue;
  }>;
  by_outlet: Array<{
    dealer_name: string;
    outlet_name: string;
    journeys: number;
    discounted_journeys: number;
    total_actual_discount: NumericValue;
    avg_discount_per_discounted_journey: NumericValue;
  }>;
  by_discount_key: Array<{
    discount_key: string;
    application_count: number;
    journey_count: number;
    actual_discount_amount: NumericValue;
    eligible_discount_amount: NumericValue;
  }>;
  above_eligible_definition: string;
}

export interface AnalyticsBusinessInsurance {
  tenant_id: string;
  data_as_of: string;
  summary: {
    journeys: number;
    insurance_journeys: number;
    premium_amount: NumericValue;
    premium_populated: number;
    avg_premium: NumericValue;
    policies_with_add_ons: number;
    insurance_penetration_pct: number | null;
    add_on_policy_attach_pct: number | null;
    add_on_journey_penetration_pct: number | null;
  };
  by_insurer: Array<{
    insurer_name: string;
    policy_count: number;
    premium_amount: NumericValue;
    avg_premium: NumericValue;
  }>;
  by_source: Array<{
    insurance_by: string;
    policy_count: number;
  }>;
  add_ons: Array<{
    add_on_name: string;
    policy_count: number;
    policy_attach_pct: number | null;
    journey_penetration_pct: number | null;
  }>;
  definition: string;
}

export interface AnalyticsBusinessVas {
  tenant_id: string;
  data_as_of: string;
  journeys: number;
  by_type: Array<{
    addon_type: string;
    record_count: number;
    journey_count: number;
    actual_amount: NumericValue;
    avg_record_amount: NumericValue;
    penetration_pct: number | null;
  }>;
  by_outlet: Array<{
    dealer_name: string;
    outlet_name: string;
    addon_type: string;
    journey_count: number;
    actual_amount: NumericValue;
  }>;
  accessory_codes: string[];
}

export interface AnalyticsBusinessCompliance {
  tenant_id: string;
  data_as_of: string;
  by_outlet: Array<{
    dealer_name: string;
    outlet_name: string;
    journeys: number;
    journeys_with_findings: number;
    finding_count: number;
    open_finding_count: number;
    high_finding_count: number;
    journeys_with_missing_documents: number;
    discount_value_on_affected_journeys: NumericValue;
    payment_value_on_affected_journeys: NumericValue;
    journeys_with_findings_pct: number | null;
    journeys_with_missing_documents_pct: number | null;
  }>;
  by_model: Array<{
    model_name: string;
    journeys: number;
    journeys_with_findings: number;
    finding_count: number;
    high_finding_count: number;
    journeys_with_findings_pct: number | null;
  }>;
  top_rules: Array<{
    rule_key: string;
    severity: string;
    finding_status: string;
    finding_count: number;
    journey_count: number;
  }>;
  commercial_value_note: string;
}

export type AnalyticsBusinessReportKey = 'insurance' | 'addons' | 'discounts' | 'turnaround' | 'findings';

export type AnalyticsBusinessReportPayload =
  | { kind: 'insurance'; data: AnalyticsBusinessInsurance }
  | { kind: 'addons'; data: AnalyticsBusinessVas }
  | { kind: 'discounts'; data: AnalyticsBusinessDiscounts }
  | { kind: 'turnaround'; data: AnalyticsBusinessDelivery }
  | { kind: 'findings'; data: AnalyticsBusinessCompliance };

export async function getBusinessAnalyticsReport(
  tenantId: string,
  accessToken: string,
  report: AnalyticsBusinessReportKey,
  signal?: AbortSignal,
): Promise<AnalyticsBusinessReportPayload> {
  const root = `/v1/analytics/tenants/${encodeURIComponent(tenantId)}/business-intelligence`;
  switch (report) {
    case 'insurance':
      return { kind: report, data: await analyticsRequest<AnalyticsBusinessInsurance>(`${root}/insurance`, accessToken, signal) };
    case 'addons':
      return { kind: report, data: await analyticsRequest<AnalyticsBusinessVas>(`${root}/vas`, accessToken, signal) };
    case 'discounts':
      return { kind: report, data: await analyticsRequest<AnalyticsBusinessDiscounts>(`${root}/discounts`, accessToken, signal) };
    case 'turnaround':
      return { kind: report, data: await analyticsRequest<AnalyticsBusinessDelivery>(`${root}/delivery`, accessToken, signal) };
    case 'findings':
      return { kind: report, data: await analyticsRequest<AnalyticsBusinessCompliance>(`${root}/compliance`, accessToken, signal) };
  }
}
