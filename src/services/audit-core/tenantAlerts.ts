import { auditCoreRequest } from './client';

/**
 * Alerts every signed-in member of a Project sees (product owner, 2026-10-31):
 * "Same File Being Uploaded" -- a PC entered a journey whose PAN, mobile,
 * customer name and model are an earlier journey's. Audit Core publishes the
 * alert once the new file is deleted (or kept for review) and keeps it for
 * 24 hours. GET /p2/v1/tenants/{t}/alerts; any member of the Project may read it.
 */
export type TenantAlertKind = 'SAME_FILE_UPLOADED';
export type SameFileOutcome =
  | 'DELETED'
  | 'KEPT_NOT_INDIVIDUAL'
  | 'KEPT_REVIEWED'
  | 'KEPT_CLOSED'
  | 'DELETE_FAILED';

export type SameFileJourney = {
  journeyId?: string | null;
  reference?: string | null;
  pcName?: string | null;
  dealerName?: string | null;
  outletName?: string | null;
};

export type SameFileMatchedField = {
  field: 'pan' | 'mobile' | 'name' | 'model' | string;
  label: string;
  newValue?: string | null;
  existingValue?: string | null;
  exact?: boolean;
};

export type TenantAlert = {
  alertId: string;
  kind: TenantAlertKind | string;
  outcome?: SameFileOutcome | string | null;
  title: string;
  body: string;
  journeyId?: string | null;
  journeyReference?: string | null;
  payload: {
    customerName?: string | null;
    model?: string | null;
    variant?: string | null;
    newJourney?: SameFileJourney;
    existingJourney?: SameFileJourney;
    matchedFields?: SameFileMatchedField[];
    outcome?: string;
  };
  publishedAtUtc: string;
  expiresAtUtc: string;
};

export type TenantAlertList = { items: TenantAlert[]; serverTimeUtc: string };

export function getTenantAlerts(tenantId: string, accessToken?: string, since?: string) {
  const params = since ? `?${new URLSearchParams({ since })}` : '';
  return auditCoreRequest<TenantAlertList>(`/p2/v1/tenants/${encodeURIComponent(tenantId)}/alerts${params}`, {
    accessToken,
    cache: 'no-store',
  });
}

// ---- seen / dismissed --------------------------------------------------------------------------
// Dismissed per person and per Project, in this browser: an alert closed once
// does not come back on the next poll or after a reload. Storage may be
// unavailable (private mode, a blocked site); then alerts are dismissed for
// this page only.

const STORAGE_PREFIX = 'vg.tenantAlerts.dismissed';
const KEEP = 200;

export function dismissedStorageKey(tenantId: string, userKey: string | null | undefined): string {
  return `${STORAGE_PREFIX}:${tenantId}:${userKey || 'anonymous'}`;
}

export function readDismissed(key: string, storage: Pick<Storage, 'getItem'> | null = safeStorage()): Set<string> {
  try {
    const raw = storage?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

export function writeDismissed(key: string, ids: Iterable<string>, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(key, JSON.stringify(Array.from(ids).slice(-KEEP)));
  } catch {
    // Storage refused (quota, private mode): the dismissal lasts for this page only.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The alerts still to show: not dismissed, not expired, newest first. */
export function unseenAlerts(alerts: TenantAlert[] | undefined, dismissed: ReadonlySet<string>, now: Date = new Date()): TenantAlert[] {
  return (alerts ?? [])
    .filter((alert) => !dismissed.has(alert.alertId))
    .filter((alert) => {
      const expires = Date.parse(alert.expiresAtUtc);
      return Number.isNaN(expires) || expires > now.getTime();
    })
    .sort((a, b) => Date.parse(b.publishedAtUtc) - Date.parse(a.publishedAtUtc));
}

/** The alert's text, as Audit Core wrote it, or composed from its details. */
export function alertMessage(alert: TenantAlert): string {
  if (alert.body?.trim()) return alert.body.trim();
  const p = alert.payload ?? {};
  const n = p.newJourney ?? {};
  const place = [n.dealerName, n.outletName].filter(Boolean).join('/') || 'unknown dealership';
  const ref = n.reference || alert.journeyReference || 'the new journey';
  const kept = alert.outcome && alert.outcome !== 'DELETED';
  return `Same file being uploaded — ${p.customerName || 'Unknown customer'}, ${p.model || 'unknown model'}, `
    + `PC ${n.pcName || 'unknown'}, ${place}. The new file ${ref} ${kept ? 'was kept for review.' : 'was deleted.'}`;
}
