import { DEMO_DEALER_ID, DEMO_OUTLET_ID, DEMO_TENANT_ID } from '../data/demoData';

export const runtimeConfig = {
  tenantId: import.meta.env.VITE_TENANT_ID?.trim() || DEMO_TENANT_ID,
  defaultDealerId: import.meta.env.VITE_DEFAULT_DEALER_ID?.trim() || DEMO_DEALER_ID,
  defaultOutletId: import.meta.env.VITE_DEFAULT_OUTLET_ID?.trim() || DEMO_OUTLET_ID,
  auditCoreConfigured: Boolean(import.meta.env.VITE_AUDIT_CORE_BASE_URL?.trim()),
};
