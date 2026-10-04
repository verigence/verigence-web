import { hrRequest } from './client';

/** SuperAdmin only (hr.housekeeping.manage). Each call is made once; nothing is retried. */
export type HousekeepingKind = 'ATTENDANCE' | 'LEAVE' | 'CLAIMS';

export interface HousekeepingScope {
  kind: HousekeepingKind;
  from_date: string;
  to_date: string;
}

export interface HousekeepingPreview {
  kind: HousekeepingKind;
  from: string;
  to: string;
  counts: Record<string, number>;
  blockedBy: string | null;
  filesNotRemoved?: number;
}

const base = '/hr/v1/housekeeping';

export const previewHousekeeping = (token: string, scope: HousekeepingScope) =>
  hrRequest<HousekeepingPreview>(`${base}/preview`, { accessToken: token, method: 'POST', body: { ...scope } });

export const purgeHousekeeping = (token: string, scope: HousekeepingScope) =>
  hrRequest<HousekeepingPreview>(`${base}/purge`, { accessToken: token, method: 'POST', body: { ...scope, confirm: 'DELETE' } });
