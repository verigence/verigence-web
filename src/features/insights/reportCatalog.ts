import { INSIGHT_REPORTS, type InsightReport } from '../../services/audit-core/uc03Insights';

/** The Analytics reports: the name in the menu, the page title and one line on what it answers. */
export const ANALYTICS_REPORTS: Record<InsightReport, { label: string; title: string; description: string }> = {
  sales: {
    label: 'Business overview', title: 'Business overview',
    description: 'What was booked, billed and delivered: by month, dealership, outlet and model.',
  },
  discounts: {
    label: 'Discount control', title: 'Discount control',
    description: 'Discount given against ex-showroom, the verdict on every discount, and who gives more than the rest.',
  },
  penetration: {
    label: 'Product penetration', title: 'Product penetration',
    description: 'What is sold with the vehicle: finance, in-house insurance, accessories, FASTag, RSA, extended warranty and scrappage.',
  },
  insurance: {
    label: 'Insurance', title: 'Insurance',
    description: 'In-house against outside, the agents outside policies went through, insurers, covers and renewals.',
  },
  finance: {
    label: 'Finance', title: 'Finance',
    description: 'Who funds the deals, the loan amount, and the loan against the ex-showroom price.',
  },
  scrappage: {
    label: 'Scrappage', title: 'Scrappage',
    description: 'The scrappage certificates used, where the old vehicles came from and the road tax they saved.',
  },
  payments: {
    label: 'Payments and cash', title: 'Payments and cash',
    description: 'How the money came in, by payment mode, and the cash received against the cash limit.',
  },
  catchment: {
    label: 'Customer catchment', title: 'Customer catchment',
    description: 'Where the customers live, by district and PIN code, and what each place buys.',
  },
};

/** Addresses of the reports this page had before 2026-11-10 still open the report that took their place. */
const EARLIER_REPORTS: Record<string, InsightReport> = {
  overview: 'sales', 'sales-product': 'sales', turnaround: 'sales', addons: 'penetration', geography: 'catchment',
  'trade-in': 'discounts',
};

export function reportFromParam(value: string | null): InsightReport {
  if (value && (INSIGHT_REPORTS as readonly string[]).includes(value)) return value as InsightReport;
  return (value && EARLIER_REPORTS[value]) || 'sales';
}
