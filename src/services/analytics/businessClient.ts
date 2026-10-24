import {
  analyticsRequest,
} from './client';

export type NumericValue = number | string | null;

interface ProjectAuditorSummary {
  total_journeys: number;
  booked_journeys: number;
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
  financed_bookings: number;
  finance_attach_pct: NumericValue;
  recorded_receipt_amount: NumericValue;
  payment_entry_count: number;
  journeys_with_payment_entries: number;
  payment_status_coded_records: number;
  payment_status_coverage_pct: NumericValue;
  insurance_source_unknown_journeys: number;
  insurance_source_ambiguous_journeys: number;
  insurance_premium_populated_journeys: number;
  journeys_with_pincode: number;
  reviewed_pincode_journeys: number;
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

interface AccessoryBreakdownRow {
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
  price_integrity: PricingIntegrityReport;
}

export interface PricingIntegrityReport {
  summary: {
    total_journeys: number;
    price_exception_journeys: number;
    discount_exception_journeys: number;
    invoice_conflict_journeys: number;
    journeys_with_pricing_exceptions: number;
    strict_excess_discount_amount: NumericValue;
    strict_excess_application_count: number;
    strict_excess_discount_journeys: number;
    known_excess_discount_amount: NumericValue;
    known_excess_application_count: number;
    known_excess_discount_journeys: number;
    unknown_entitlement_application_count: number;
    missing_discount_evidence_application_count: number;
    standard_price_line_count: number;
    comparable_price_line_count: number;
    invoice_backed_price_line_count: number;
    booking_backed_price_line_count: number;
    comparable_price_line_coverage_pct: number | null;
  };
  by_discount_key: Array<{
    discount_key: string;
    application_count: number;
    journey_count: number;
    strict_excess_discount_amount: NumericValue;
    strict_excess_application_count: number;
    strict_excess_journey_count: number;
    known_excess_discount_amount: NumericValue;
    excess_application_count: number;
    unknown_entitlement_count: number;
    missing_evidence_count: number;
  }>;
  by_dealer: Array<{
    dealer_name: string;
    price_exception_journeys: number;
    discount_exception_journeys: number;
    invoice_conflict_journeys: number;
    strict_excess_discount_amount: NumericValue;
    strict_excess_journeys: number;
    strict_excess_applications: number;
    known_excess_discount_amount: NumericValue;
    unknown_discount_applications: number;
  }>;
  by_outlet: Array<{
    dealer_name: string;
    outlet_name: string;
    price_exception_journeys: number;
    discount_exception_journeys: number;
    invoice_conflict_journeys: number;
    strict_excess_discount_amount: NumericValue;
    strict_excess_journeys: number;
    strict_excess_applications: number;
    known_excess_discount_amount: NumericValue;
    unknown_discount_applications: number;
  }>;
  exceptions: Array<{
    finding_id: string | null;
    journey_id: string;
    journey_reference: string | null;
    dealer_name: string;
    outlet_name: string;
    booking_date: string | null;
    model_name: string;
    variant_name: string;
    rule_key: string;
    title: string;
    description: string;
    severity: string;
    finding_status: string;
    owner_role_code: string | null;
    sla_due_at_utc: string | null;
  }>;
  definitions: Record<string, string>;
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


interface AnalyticsBusinessDelivery {
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

interface AnalyticsBusinessDiscounts {
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
    strict_excess_discount_amount: NumericValue;
    strict_excess_application_count: number;
    strict_excess_discount_journeys: number;
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
  by_dealer_model_variant: Array<{
    dealer_name: string;
    outlet_name: string;
    model_name: string;
    variant_name: string;
    booked_units: number;
    discounted_units: number;
    actual_discount_amount: NumericValue;
    avg_discount_per_discounted_unit: NumericValue;
    known_excess_discount_amount: NumericValue;
    known_excess_units: number;
    strict_excess_discount_amount: NumericValue;
    strict_excess_units: number;
    units_with_unknown_entitlement: number;
  }>;
  by_discount_key: Array<{
    discount_key: string;
    application_count: number;
    journey_count: number;
    actual_discount_amount: NumericValue;
    eligible_discount_amount: NumericValue;
  }>;
  above_eligible_definition: string;
  pricing_integrity: PricingIntegrityReport;
}

interface AnalyticsBusinessInsurance {
  tenant_id: string;
  data_as_of: string;
  summary: {
    journeys: number;
    booked_journeys: number;
    insurance_journeys: number;
    dealer_arranged_journeys: number;
    customer_arranged_journeys: number;
    source_ambiguous_journeys: number;
    source_unknown_journeys: number;
    route_information_populated: number;
    self_insurance_flag_populated: number;
    self_insurance_journeys: number;
    premium_amount: NumericValue;
    premium_populated: number;
    premium_comparable: number;
    standard_premium_amount: NumericValue;
    premium_variance_amount: NumericValue;
    avg_premium: NumericValue;
    policies_with_add_ons: number;
    intermediary_populated: number;
    misp_code_populated: number;
    insurance_record_rate_pct: number | null;
    route_information_coverage_pct: number | null;
    explicit_route_coverage_pct: number | null;
    intermediary_coverage_pct: number | null;
    misp_code_coverage_pct: number | null;
    premium_coverage_pct: number | null;
    add_on_policy_attach_pct: number | null;
    add_on_journey_penetration_pct: number | null;
  };
  by_insurer: Array<{
    insurer_name: string;
    policy_count: number;
    premium_populated: number;
    premium_amount: NumericValue;
    avg_premium: NumericValue;
  }>;
  by_insurer_outlet: Array<{
    dealer_id: string | null;
    dealer_name: string;
    outlet_id: string | null;
    outlet_name: string;
    insurer_name: string;
    policy_count: number;
    premium_populated: number;
    premium_amount: NumericValue;
    avg_premium: NumericValue;
  }>;
  by_source: Array<{
    insurance_by: string;
    policy_count: number;
  }>;
  by_source_outlet: Array<{
    dealer_id: string | null;
    dealer_name: string;
    outlet_id: string | null;
    outlet_name: string;
    source_assessment: string;
    insurance_by: string;
    insurance_source: string;
    self_insurance_flag: string;
    misp_code: string;
    intermediary_code: string;
    intermediary_name: string;
    insurer_name: string;
    policy_count: number;
    premium_populated: number;
    premium_amount: NumericValue;
  }>;
  by_route: Array<{
    route: string;
    policy_count: number;
    premium_populated: number;
    premium_amount: NumericValue;
    avg_premium: NumericValue;
  }>;
  by_outlet: Array<{
    dealer_id: string | null;
    dealer_name: string;
    outlet_id: string | null;
    outlet_name: string;
    booked_journeys: number;
    insurance_journeys: number;
    dealer_arranged_journeys: number;
    customer_arranged_journeys: number;
    source_ambiguous_journeys: number;
    source_unknown_journeys: number;
    premium_populated: number;
    premium_comparable: number;
    premium_amount: NumericValue;
    standard_premium_amount: NumericValue;
    premium_variance_amount: NumericValue;
    avg_premium: NumericValue;
  }>;
  add_ons: Array<{
    dealer_id: string | null;
    dealer_name: string;
    outlet_id: string | null;
    outlet_name: string;
    add_on_name: string;
    policy_count: number;
    policy_attach_pct: number | null;
    journey_penetration_pct: number | null;
    raw_terms: string[];
  }>;
  definition: string;
}

interface AnalyticsBusinessVas {
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
  by_product_type: Array<{
    dealer_name: string;
    outlet_name: string;
    model_name: string;
    variant_name: string;
    addon_type: string;
    record_count: number;
    journey_count: number;
    priced_records: number;
    actual_amount: NumericValue;
    avg_record_amount: NumericValue;
  }>;
  warranty_rsa: {
    ew_record_count: number;
    ew_journey_count: number;
    ew_four_year_journey_count: number;
    ew_five_year_journey_count: number;
    ew_term_not_recorded_journey_count: number;
    rsa_record_count: number;
    rsa_journey_count: number;
    by_product: Array<{
      dealer_id: string | null;
      dealer_name: string;
      outlet_id: string | null;
      outlet_name: string;
      model_name: string;
      variant_name: string;
      product_type: 'EW' | 'RSA';
      source_record_count: number;
      journey_count: number;
      four_year_journeys: number;
      five_year_journeys: number;
      term_not_recorded_journeys: number;
      addon_source_journeys: number;
      invoice_source_journeys: number;
    }>;
  };
  booking_invoice_reconciliation: {
    by_category: Array<{
      category: 'EW' | 'INSURANCE' | 'RSA' | 'FASTAG' | 'ACCESSORIES';
      booked_proposal_journeys: number;
      delivered_proposal_journeys: number;
      invoice_awaiting_journeys: number;
      delivery_invoice_purchase_journeys: number;
      proposed_and_invoiced_journeys: number;
      unverified_invoice_evidence_journeys: number;
      proposal_with_unverified_invoice_evidence_journeys: number;
      proposal_not_observed_on_invoice_journeys: number;
      proposal_without_invoice_evidence_journeys: number;
      invoice_only_journeys: number;
      invoice_covered_delivered_journeys: number;
      proposal_invoice_match_pct: number | null;
    }>;
    by_dealer_model_variant: Array<{
      dealer_id: string | null;
      dealer_name: string;
      outlet_id: string | null;
      outlet_name: string;
      model_name: string;
      variant_name: string;
      category: 'EW' | 'INSURANCE' | 'RSA' | 'FASTAG' | 'ACCESSORIES';
      booked_proposal_journeys: number;
      delivered_proposal_journeys: number;
      invoice_awaiting_journeys: number;
      delivery_invoice_purchase_journeys: number;
      proposed_and_invoiced_journeys: number;
      unverified_invoice_evidence_journeys: number;
      proposal_with_unverified_invoice_evidence_journeys: number;
      proposal_not_observed_on_invoice_journeys: number;
      proposal_without_invoice_evidence_journeys: number;
      invoice_only_journeys: number;
      invoice_purposes: string | null;
      unverified_invoice_purposes: string | null;
    }>;
    invoice_coverage: {
      delivered_journeys: number;
      delivered_journeys_with_tax_invoice_lines: number;
      delivery_tax_invoice_documents: number;
      delivery_tax_invoice_lines: number;
      unclassified_tax_invoice_lines: number;
      delivered_journeys_with_unverified_vas_evidence: number;
      unverified_invoice_documents: number;
      unverified_invoice_lines: number;
      classified_unverified_vas_lines: number;
      unclassified_unverified_invoice_lines: number;
      invoice_coverage_pct: number | null;
    };
    definition: string;
  };
  accessory_cost_by_product: Array<{
    dealer_name: string;
    outlet_name: string;
    model_name: string;
    variant_name: string;
    evidence_rows: number;
    standard_amount_rows: number;
    actual_amount_rows: number;
    comparable_rows: number;
    comparable_standard_amount: NumericValue | null;
    comparable_actual_amount: NumericValue | null;
    comparable_actual_minus_standard: NumericValue;
  }>;
  accessory_items: Array<{
    dealer_name: string;
    outlet_name: string;
    model_name: string;
    variant_name: string;
    line_category: string;
    item_description: string;
    item_code: string | null;
    invoice_sources: string | null;
    invoice_lines: number;
    invoice_count: number;
    invoiced_quantity: NumericValue | null;
    lines_with_quantity: number;
    net_amount: NumericValue | null;
    lines_with_net_amount: number;
    line_discount_amount: NumericValue | null;
  }>;
  accessory_line_coverage: {
    total_invoice_lines: number;
    confirmed_tax_invoice_lines: number;
    confirmed_tax_invoices: number;
    proforma_lines: number;
    unclassified_lines: number;
    confirmed_lines_with_item_label: number;
    confirmed_lines_with_quantity: number;
    confirmed_lines_with_net_amount: number;
    duplicate_invoice_groups: number;
    duplicate_source_documents: number;
  };
  by_model_outlet: Array<{
    dealer_name: string;
    outlet_name: string;
    model_name: string;
    variant_name: string;
    booked_journeys: number;
    attached_journeys: number;
    actual_amount: NumericValue;
    penetration_pct: number | null;
  }>;
  accessory_codes: string[];
  definition: string;
}

interface AnalyticsBusinessFinance {
  tenant_id: string;
  data_as_of: string;
  summary: {
    booked_journeys: number;
    financed_journeys: number;
    finance_record_attach_pct: NumericValue;
    finance_record_count: number;
    high_confidence_loan_records: number;
    high_confidence_loan_amount: NumericValue;
    medium_confidence_loan_records: number;
    medium_confidence_loan_amount: NumericValue;
    unverified_or_missing_loan_records: number;
    loan_amount_capture_pct: number | null;
  };
  by_lender: Array<{
    lender_name: string;
    finance_type: string;
    finance_record_count: number;
    financed_journeys: number;
    loan_amount: NumericValue;
  }>;
  by_lender_outlet: Array<{
    dealer_name: string;
    outlet_name: string;
    lender_name: string;
    confidence: string;
    finance_record_count: number;
    financed_journeys: number;
    loan_amount: NumericValue;
  }>;
  by_outlet: Array<{
    dealer_name: string;
    outlet_name: string;
    booked_journeys: number;
    financed_journeys: number;
    finance_record_attach_pct: number | null;
    high_confidence_loan_records: number;
    high_confidence_loan_amount: NumericValue;
    medium_confidence_loan_records: number;
    medium_confidence_loan_amount: NumericValue;
  }>;
  definition: string;
}

interface AnalyticsBusinessPayments {
  tenant_id: string;
  data_as_of: string;
  summary: {
    payment_entry_count: number;
    journeys_with_payment_entries: number;
    recorded_receipt_amount: NumericValue;
    status_coded_entries: number;
    status_coverage_pct: number | null;
    channel_count: number;
    unmapped_entries: number;
  };
  by_channel: Array<{
    channel: string;
    payment_entry_count: number;
    journey_count: number;
    recorded_receipt_amount: NumericValue;
    status_coded_entries: number;
  }>;
  by_outlet: Array<{
    dealer_name: string;
    outlet_name: string;
    channel: string;
    payment_entry_count: number;
    journey_count: number;
    recorded_receipt_amount: NumericValue;
    status_coded_entries: number;
  }>;
  definition: string;
}

interface AnalyticsBusinessGeography {
  tenant_id: string;
  data_as_of: string;
  coverage: { available: number; total: number; coverage_pct: number | null };
  quality: {
    reviewed_journeys: number;
    provisional_journeys: number;
    reviewed_pct_of_pincode_records: number | null;
    source_field: string;
    source_note: string;
  };
  available: boolean;
  rows: Array<{
    customer_pincode: string;
    district_name: string | null;
    locality_names: string[];
    dealer_id: string | null;
    dealer_name: string;
    outlet_id: string | null;
    outlet_name: string;
    model_name: string;
    booking_date: string | null;
    delivery_date: string | null;
    journey_count: number;
    actual_deliveries: number;
    finance_journeys: number;
    insurance_journeys: number;
    accessory_journeys: number;
    avg_discount: NumericValue;
  }>;
  outlet_locations: Array<{
    outlet_id: string;
    dealer_id: string | null;
    dealer_name: string | null;
    outlet_name: string;
    outlet_code: string | null;
    pincode: string | null;
    latitude: NumericValue;
    longitude: NumericValue;
    location_precision: 'OUTLET_COORDINATE' | 'PIN_CENTROID' | string;
  }>;
  map_boundaries: Array<{
    boundary_key: 'odisha-pin' | 'odisha-district' | string;
    boundary_type: 'PIN' | 'DISTRICT';
    content_gzip_base64: string;
    source_name: string;
    source_url: string;
  }>;
  privacy: string;
}

interface AnalyticsBusinessSalesProduct {
  tenant_id: string;
  data_as_of: string;
  by_outlet: Array<{
    dealer_id: string | null;
    dealer_name: string;
    outlet_id: string | null;
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
  by_dealer_model_variant: Array<{
    dealer_name: string;
    outlet_name: string;
    model_name: string;
    variant_name: string;
    booked_units: number;
    delivered_units: number;
  }>;
  model_variant_coverage: {
    booked_journeys: number;
    model_labelled_journeys: number;
    variant_labelled_journeys: number;
    catalogue_mapped_journeys: number;
    unresolved_journeys: number;
  };
  by_colour: Array<{ colour_name: string; journey_count: number }>;
  by_month: Array<{ period: string; booked_units: number; delivered_units: number }>;
  delivery_definition: Record<string, string>;
}

interface AnalyticsBusinessCompliance {
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

export type AnalyticsBusinessReportKey = 'sales-product' | 'finance' | 'insurance' | 'addons' | 'discounts' | 'payments' | 'geography' | 'turnaround' | 'findings';

export type AnalyticsBusinessReportPayload =
  | { kind: 'sales-product'; data: AnalyticsBusinessSalesProduct }
  | { kind: 'finance'; data: AnalyticsBusinessFinance }
  | { kind: 'insurance'; data: AnalyticsBusinessInsurance }
  | { kind: 'addons'; data: AnalyticsBusinessVas }
  | { kind: 'payments'; data: AnalyticsBusinessPayments }
  | { kind: 'geography'; data: AnalyticsBusinessGeography }
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
    case 'sales-product':
      return { kind: report, data: await analyticsRequest<AnalyticsBusinessSalesProduct>(`${root}/sales-product`, accessToken, signal) };
    case 'finance':
      return { kind: report, data: await analyticsRequest<AnalyticsBusinessFinance>(`${root}/finance`, accessToken, signal) };
    case 'insurance':
      return { kind: report, data: await analyticsRequest<AnalyticsBusinessInsurance>(`${root}/insurance`, accessToken, signal) };
    case 'addons':
      return { kind: report, data: await analyticsRequest<AnalyticsBusinessVas>(`${root}/vas`, accessToken, signal) };
    case 'payments':
      return { kind: report, data: await analyticsRequest<AnalyticsBusinessPayments>(`${root}/payments`, accessToken, signal) };
    case 'geography':
      return { kind: report, data: await analyticsRequest<AnalyticsBusinessGeography>(`${root}/geography`, accessToken, signal) };
    case 'discounts':
      return { kind: report, data: await analyticsRequest<AnalyticsBusinessDiscounts>(`${root}/discounts`, accessToken, signal) };
    case 'turnaround':
      return { kind: report, data: await analyticsRequest<AnalyticsBusinessDelivery>(`${root}/delivery`, accessToken, signal) };
    case 'findings':
      return { kind: report, data: await analyticsRequest<AnalyticsBusinessCompliance>(`${root}/compliance`, accessToken, signal) };
  }
}
