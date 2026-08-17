import { DEMO_DEALER_ID, DEMO_OUTLET_ID, DEMO_TENANT_ID } from '../data/demoData';

export type WebMode = 'demo' | 'core';

const configuredMode = import.meta.env.VITE_WEB_MODE?.trim().toLowerCase();

export const runtimeConfig = {
  mode: (configuredMode === 'core' ? 'core' : 'demo') as WebMode,
  tenantId: import.meta.env.VITE_TENANT_ID?.trim() || DEMO_TENANT_ID,
  defaultDealerId: import.meta.env.VITE_DEFAULT_DEALER_ID?.trim() || DEMO_DEALER_ID,
  defaultOutletId: import.meta.env.VITE_DEFAULT_OUTLET_ID?.trim() || DEMO_OUTLET_ID,
};

export function isDemoMode(): boolean {
  return runtimeConfig.mode === 'demo';
}
