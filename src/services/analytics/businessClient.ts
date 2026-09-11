import {
  analyticsRequest,
  type AnalyticsBusinessScorecard,
  type AnalyticsDashboardData,
} from './client';

export type NumericValue = number | string | null;

export interface AnalyticsCoverageMetric {
  available: number;
  total: number;
  coverage_pct: number | null;
}

export interface AnalyticsBusinessOverviewSummary {
  journeys: number;
  delivery_records: number;
  actual_deliveries: number;
  finance_journeys: number;
  insurance_journeys: number;
  trade_in_journeys: number;
  accessory_journeys: number;
  ew_journeys: number;
  rsa_journeys: number;
  journeys_with_findings: number;
  journeys_with_missing_documents: number;
  payment_amount: NumericValue;
  discount_amount: NumericValue;
  insurance_premium_amount: NumericValue;
  accessories_value: NumericValue;
  rsa_value: NumericValue;
  ew_value: NumericValue;
  finance_penetration_pct: number | null;
  insurance_penetration_pct: number | null;
  trade_in_penetration_pct: number | null;
  accessory_penetration_pct: number | null;
  ew_penetration_pct: number | null;
  rsa_penetration_pct: number | null;
  journeys_with_findings_pct: number | null;
  journeys_with_missing_documents_pct: number | null;
}

export interface AnalyticsBusinessOverview {
  tenant_id: string;
  data_as_of: string;
  summary: AnalyticsBusinessOverviewSummary;
  top_models: Array<{
    model_name: string;
    journey_count: number;
    actual_deliveries: number;
    discount_amount: NumericValue;
  }>;
  outlets: Array<{
    dealer_id: string;
    dealer_name: string;
    outlet_id: string;
    outlet_name: string;
    journey_count: number;
    actual_deliveries: number;
    journeys_with_findings: number;
    finance_journeys: number;
    insurance_journeys: number;
    accessory_journeys: number;
    finding_rate_pct: number | null;
    finance_penetration_pct: number | null;
    insurance_penetration_pct: number | null;
    accessory_penetration_pct: number | null;
  }>;
}

export interface AnalyticsBusinessCoverage {
  tenant_id: string;
  data_as_of: string;
  journeys: number;
  metrics: Record<string, AnalyticsCoverageMetric>;
  interpretation: string;
}

export interface AnalyticsSalesProduct {
  tenant_id: string;
  data_as_of: string;
  by_outlet: Array<{
    dealer_id: string;
    dealer_name: string;
    outlet_id: string;
    outlet_name: string;
    journey_count: number;
    delivery_records: number;
    actual_deliveries: number;
    payment_amount: NumericValue;
  }>;
  by_model_variant: Array<{
    model_name: string;
    variant_name: string;
    journey_count: number;
    actual_deliveries: number;
    discount_amount: NumericValue;
    payment_amount: NumericValue;
  }>;
  by_colour: Array<{ colour_name: string; journey_count: number }>;
  delivery_definition: Record<string, string>;
}

export interface AnalyticsBusinessGeography {
  tenant_id: string;
  data_as_of: string;
  coverage: AnalyticsCoverageMetric;
  available: boolean;
  rows: Array<{
    customer_pincode: string;
    dealer_name: string;
    outlet_name: string;
    model_name: string;
    journey_count: number;
    actual_deliveries: number;
    finance_journeys: number;
    insurance_journeys: number;
    accessory_journeys: number;
    avg_discount: NumericValue;
  }>;
  privacy: string;
}

export interface AnalyticsCommercialComponents {
  tenant_id: string;
  data_as_of: string;
  rows: Array<{
    component_key: string;
    record_count: number;
    journey_count: number;
    standard_amount: NumericValue;
    actual_amount: NumericValue;
    avg_actual_amount: NumericValue;
  }>;
  note: string;
}

interface AnalyticsProjectDashboardWire {
  executive: {
    network: AnalyticsBusinessScorecard;
    overview: Omit<AnalyticsDashboardData, 'network'>;
  };
  business: AnalyticsBusinessOverview;
  coverage: AnalyticsBusinessCoverage;
  sales_product: AnalyticsSalesProduct;
  geography: AnalyticsBusinessGeography;
  commercial_components: AnalyticsCommercialComponents;
}

export interface AnalyticsBusinessProjectDashboard {
  data_as_of: string;
  legacy: AnalyticsDashboardData;
  business: AnalyticsBusinessOverview;
  coverage: AnalyticsBusinessCoverage;
  salesProduct: AnalyticsSalesProduct;
  geography: AnalyticsBusinessGeography;
  commercialComponents: AnalyticsCommercialComponents;
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
    premium_populated: number;
    premium_amount: NumericValue;
    avg_premium: NumericValue;
    self_insurance_journeys: number;
    policies_with_add_ons: number;
    insurance_penetration_pct: number | null;
    add_on_policy_attach_pct: number | null;
  };
  by_insurer: Array<{
    insurer_name: string;
    policy_count: number;
    premium_populated: number;
    premium_amount: NumericValue;
    avg_premium: NumericValue;
  }>;
  by_source: Array<{ insurance_by: string; policy_count: number }>;
  add_ons: Array<{
    add_on_name: string;
    policy_count: number;
    policy_attach_pct: number | null;
    journey_penetration_pct: number | null;
  }>;
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

export async function getBusinessProjectDashboard(
  tenantId: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<AnalyticsBusinessProjectDashboard> {
  const root = `/v1/analytics/tenants/${encodeURIComponent(tenantId)}`;
  const wire = await analyticsRequest<AnalyticsProjectDashboardWire>(
    `${root}/business-intelligence/project-dashboard`,
    accessToken,
    signal,
  );
  return {
    data_as_of: wire.business.data_as_of,
    legacy: { ...wire.executive.overview, network: wire.executive.network },
    business: wire.business,
    coverage: wire.coverage,
    salesProduct: wire.sales_product,
    geography: wire.geography,
    commercialComponents: wire.commercial_components,
  };
}

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
