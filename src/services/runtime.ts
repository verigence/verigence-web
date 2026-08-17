import { useSessionStore } from '../store/sessionStore';

function requiredScope(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is not available in the active login/session context.`);
  }
  return normalized;
}

export const runtimeConfig = {
  auditCoreConfigured: Boolean(import.meta.env.VITE_AUDIT_CORE_BASE_URL?.trim()),
  get tenantId(): string {
    return requiredScope(useSessionStore.getState().tenantId, 'Tenant');
  },
  get dealerId(): string {
    return requiredScope(useSessionStore.getState().dealerId, 'Dealer');
  },
  get outletId(): string {
    return requiredScope(useSessionStore.getState().outletId, 'Outlet');
  },
};
