import { auditCoreRawRequest, auditCoreRequest } from './client';

export type OnboardingAction = 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'ERROR';

export type OnboardingProjectRow = {
  row: number;
  code: string | null;
  name: string | null;
  oemCode: string | null;
  active: boolean;
  startDate: string | null;
  endDate: string | null;
  tenantId: string | null;
  projectStatus: string | null;
  activate: boolean;
  action: OnboardingAction;
  changes: Record<string, [unknown, unknown]>;
  messages: string[];
  warnings?: string[];
};

export type OnboardingDealerRow = {
  projectCode: string | null;
  dealerCode: string;
  dealerName: string;
  dealerId: string | null;
  action: OnboardingAction;
  changes: Record<string, [unknown, unknown]>;
  rows: number[];
};

export type OnboardingOutletRow = {
  row: number;
  outletCode: string | null;
  projectCode: string | null;
  dealerName: string | null;
  dealerCode: string | null;
  outletName: string | null;
  city: string | null;
  stateRegion: string | null;
  outletClassification: 'ONSITE' | 'SATELLITE';
  monthlyVehicleVolume: number | null;
  active: boolean;
  action: OnboardingAction;
  changes: Record<string, [unknown, unknown]>;
  messages: string[];
};

export type OnboardingSummary = {
  projects: Partial<Record<OnboardingAction, number>>;
  dealers: Partial<Record<OnboardingAction, number>>;
  outlets: Partial<Record<OnboardingAction, number>>;
  errors: number;
};

export type OnboardingResultRow = {
  row: number;
  code: string | null;
  action?: OnboardingAction;
  status: 'DONE' | 'FAILED';
  message: string | null;
  active?: boolean;
};

export type OnboardingImport = {
  importId: string;
  filename: string;
  status: 'PREVIEW_READY' | 'VALIDATION_FAILED' | 'APPLYING' | 'APPLIED' | 'APPLIED_WITH_ERRORS';
  plan: {
    fileErrors: string[];
    projects: OnboardingProjectRow[];
    dealers: OnboardingDealerRow[];
    outlets: OnboardingOutletRow[];
    summary: OnboardingSummary;
  };
  result?: { projects: OnboardingResultRow[]; outlets: OnboardingResultRow[] } | null;
  createdAtUtc?: string | null;
  appliedAtUtc?: string | null;
};

/** The blank template, or (withData) every Project, Dealer and Outlet in the same layout. */
export async function downloadOnboardingWorkbook(withData: boolean, accessToken?: string): Promise<Blob> {
  const response = await auditCoreRawRequest(`/v1/onboarding/workbook?data=${withData ? 'true' : 'false'}`, {
    accessToken, timeoutMs: 60_000,
  });
  return response.blob();
}

/** Validate a workbook; nothing changes until applyOnboardingImport. */
export function uploadOnboardingWorkbook(file: File, accessToken?: string) {
  const body = new FormData();
  body.append('file', file);
  return auditCoreRequest<OnboardingImport>('/v1/onboarding/imports', {
    method: 'POST', body, accessToken, timeoutMs: 60_000,
  });
}

/** Apply a validated preview. New Projects are provisioned, so this can take a while. */
export function applyOnboardingImport(importId: string, accessToken?: string) {
  return auditCoreRequest<OnboardingImport>(`/v1/onboarding/imports/${encodeURIComponent(importId)}:apply`, {
    method: 'POST', accessToken, timeoutMs: 180_000,
  });
}
