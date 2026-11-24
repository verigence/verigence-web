import { auditCoreRequest } from './client';

/**
 * Daily Duties (Audit Core docs/DAILY_DUTIES_DESIGN_v1.0.md, product owner 2026-11-18): the PC's
 * list for the day, per Project. Project users call /p2/v1/tenants/{t}/duties/...; SuperAdmin calls
 * /v1/admin/tenants/{t}/duties/... from its own view. A Project with duties switched off answers
 * `enabled: false` and nothing else.
 */
export type DutiesMode = 'project' | 'admin';

export type DutyInputType = 'NUMBER' | 'AMOUNT' | 'TEXT';
export type DutyInput = { key: string; label: string; type: DutyInputType; required: boolean };

/** What the system reads for a duty it checks itself. NOTHING: nothing to judge by, the PC confirms. */
export type DutyProgress = { state: 'DONE' | 'PENDING' | 'NOTHING'; note: string; done: number | null; total: number | null };

export type DutyReason = {
  category: string; label: string; side: 'DEALERSHIP' | 'PC' | 'SYSTEM' | 'NONE'; remark: string | null;
  byActorId: string; byName: string; handledByActorId: string | null; handledByName: string | null;
  /** "Not received today": whether the PC told the relevant WhatsApp group. */
  informedGroup: boolean | null; at: string | null;
};

export type MyDutyStatus = 'DONE' | 'ON_TRACK' | 'NOT_RECEIVED' | 'PENDING';

export type MyDutyItem = {
  itemId: string; dutyId: string; title: string; description: string; mandatory: boolean;
  dutyDate: string; forDate: string; status: MyDutyStatus; carriedDays: number; daysLeft: number | null;
  closeMode: 'TICK' | 'AUTO'; checkerCode: string | null; hint: string | null; nilLabel: string | null;
  progress: DutyProgress | null; checkFailed: boolean;
  inputs: DutyInput[]; values: Record<string, string | number>; comment: string | null;
  allowNotReceived: boolean; doneAt: string | null; doneByName: string | null; doneSource: 'PC' | 'SYSTEM' | null;
  canTick: boolean; canUndo: boolean; myReason: DutyReason | null; reasons: DutyReason[];
};

export type DutyReasonCategory = { code: string; label: string; side: string; needsPerson?: boolean; needsRemark?: boolean };

export type MyDutyOutlet = {
  outletId: string; outletName: string; dealerName: string;
  colleagues: Array<{ actorId: string; name: string }>; items: MyDutyItem[];
};

export type MyDutyCounts = {
  total: number; done: number; onTrack: number; pending: number; mandatoryPending: number; needReason: number;
};

export type MyDay = {
  enabled: boolean; date: string; role: string | null; applies: boolean;
  cutoffTimeIst?: string; dayClosedAt?: string | null; counts?: MyDutyCounts; outlets?: MyDutyOutlet[];
  reasonCategories?: DutyReasonCategory[];
};

export type DutyCloseReason = { itemId: string; category: string; remark?: string | null; handledByActorId?: string | null };

export type DutySettings = {
  enabled: boolean; enabledFrom: string | null; cutoffTimeIst: string; defaultCarryDays: number;
  workingWeekdays: number[]; updatedByName: string | null; updatedAt: string | null; canManage: boolean;
};

export type DutyDefinition = {
  dutyId: string; standardCode: string | null; title: string; description: string; mandatory: boolean;
  weekdays: number[]; outletScope: 'ALL' | 'ONSITE' | 'SATELLITE' | 'SELECTED'; outletIds: string[];
  dayOffset: 0 | -1; closeMode: 'TICK' | 'AUTO'; checkerCode: string | null; inputs: DutyInput[];
  allowNotReceived: boolean; rolling: boolean; carryDays: number | null; sortOrder: number;
  status: 'ACTIVE' | 'INACTIVE'; effectiveFrom: string; updatedByName: string | null; updatedAt: string | null;
};

export type DutyDefinitionInput = Partial<Omit<DutyDefinition, 'dutyId' | 'standardCode' | 'updatedByName' | 'updatedAt'>>;

export type DutyDefinitions = {
  items: DutyDefinition[]; settings: DutySettings; canManage: boolean;
  checkers: Array<{ code: string; label: string }>; inputTypes: DutyInputType[];
  outlets: Array<{ outletId: string; outletName: string; classification: string; dealerName: string }>;
  standardMissing: Array<{ standardCode: string; title: string }>; today: string;
};

export type TeamDutyState = 'DONE' | 'DONE_LATE' | 'ON_TRACK' | 'PENDING' | 'NOT_RECEIVED' | 'INCOMPLETE';

export type TeamDutyCell = {
  itemId: string; dutyId: string; title: string; mandatory: boolean; forDate: string; dutyDate: string;
  state: TeamDutyState; carriedDays: number; doneAt: string | null; doneByName: string | null;
  doneSource: 'PC' | 'SYSTEM' | null; values: Record<string, string | number>; inputs: DutyInput[];
  comment: string | null; progress: DutyProgress | null; reasons: DutyReason[];
};

export type TeamDayClose = 'CLOSED' | 'NOT_CLOSED' | 'OPEN' | 'OFF';

export type TeamDutyOutlet = {
  outletId: string; outletName: string; dealerName: string;
  pcs: Array<{ actorId: string; name: string; dayClose: TeamDayClose; closedAt: string | null }>;
  items: TeamDutyCell[];
};

export type TeamDutyTotals = {
  done: number; doneLate: number; onTrack: number; pending: number; notReceived: number; incomplete: number;
};

export type TeamDuties = {
  enabled: boolean; from: string; to: string; today: string; canManage: boolean; cutoffTimeIst?: string;
  totals?: TeamDutyTotals;
  byDuty?: Array<TeamDutyTotals & { dutyId: string; title: string; sortOrder: number }>;
  byPc?: Array<{ actorId: string; name: string; daysClosed: number; daysNotClosed: number }>;
  days?: Array<{ date: string; workingDay: boolean; outlets: TeamDutyOutlet[] }>;
};

function base(mode: DutiesMode, tenantId: string): string {
  const t = encodeURIComponent(tenantId);
  return mode === 'admin' ? `/v1/admin/tenants/${t}/duties` : `/p2/v1/tenants/${t}/duties`;
}

const post = (accessToken: string | undefined, body: unknown = {}) => (
  { method: 'POST', accessToken, body: JSON.stringify(body) }
);

/** The signed-in PC's list for today in one Project. Short timeout: attendance never waits long for it. */
export function getMyDay(tenantId: string, accessToken?: string) {
  return auditCoreRequest<MyDay>(`${base('project', tenantId)}/my-day`, { accessToken, timeoutMs: 8_000 });
}

export function tickDuty(tenantId: string, itemId: string, values: Record<string, string | number>, comment: string | null,
  accessToken?: string) {
  return auditCoreRequest<MyDay>(`${base('project', tenantId)}/items/${encodeURIComponent(itemId)}/tick`,
    post(accessToken, { values, comment }));
}

export function undoDuty(tenantId: string, itemId: string, accessToken?: string) {
  return auditCoreRequest<MyDay>(`${base('project', tenantId)}/items/${encodeURIComponent(itemId)}/undo`, post(accessToken));
}

export function markDutyNotReceived(tenantId: string, itemId: string, informedGroup: boolean, comment: string | null,
  accessToken?: string) {
  return auditCoreRequest<MyDay>(`${base('project', tenantId)}/items/${encodeURIComponent(itemId)}/not-received`,
    post(accessToken, { informedGroup, comment }));
}

/** Day close, at check-out: a reason for every mandatory duty not done. */
export function closeMyDay(tenantId: string, reasons: DutyCloseReason[], accessToken?: string) {
  return auditCoreRequest<MyDay>(`${base('project', tenantId)}/my-day/close`,
    { ...post(accessToken, { reasons }), timeoutMs: 10_000 });
}

export function getTeamDuties(mode: DutiesMode, tenantId: string, range: { from: string; to: string }, accessToken?: string) {
  const params = new URLSearchParams(range);
  return auditCoreRequest<TeamDuties>(`${base(mode, tenantId)}/team?${params.toString()}`, { accessToken, timeoutMs: 20_000 });
}

/** A day's gate register or cash ledger duty at a PC's outlets, by state (product owner 2026-11-24). */
export type EvidenceDuty = {
  done: number; late: number; noCounts?: number; notReceived: number; pending: number; notDone: number;
  /** Summary only: the days of the range counted (a day still to be entered is not). */
  days?: number;
  outlets?: Array<{ outletName: string; state: 'DONE' | 'LATE' | 'NO_COUNTS' | 'NOT_RECEIVED' | 'PENDING' | 'NOT_DONE';
    amount: number | null; transactions: number | null; by: string | null }>;
};
export type EvidencePhotos = { drive: number; camera: number; unread: number };
export type EvidenceDay = { date: string; gate: EvidenceDuty; cash: EvidenceDuty; statements: number; photos: EvidencePhotos };
export type EvidencePc = {
  actorId: string; name: string; outlets: string[];
  summary: { gate: EvidenceDuty; cash: EvidenceDuty & { amount: number; transactions: number }; statements: number; photos: EvidencePhotos };
  days: EvidenceDay[];
};
export type DutyEvidence = {
  from: string; to: string; today: string; days: string[];
  /** The first day the cash ledger was asked for; days before it are not counted. */
  cashFrom?: string | null;
  pcs: EvidencePc[];
};

/** What each PC did, day by day: gate register, cash register, bank statements, photos. */
export function getDutyEvidence(mode: DutiesMode, tenantId: string, range: { from: string; to: string }, accessToken?: string) {
  const params = new URLSearchParams(range);
  return auditCoreRequest<DutyEvidence>(`${base(mode, tenantId)}/evidence?${params.toString()}`, { accessToken, timeoutMs: 20_000 });
}

export function getDutyDefinitions(mode: DutiesMode, tenantId: string, accessToken?: string) {
  return auditCoreRequest<DutyDefinitions>(`${base(mode, tenantId)}/definitions`, { accessToken });
}

export function createDuty(mode: DutiesMode, tenantId: string, body: DutyDefinitionInput, accessToken?: string) {
  return auditCoreRequest<DutyDefinition>(`${base(mode, tenantId)}/definitions`, post(accessToken, body));
}

export function updateDuty(mode: DutiesMode, tenantId: string, dutyId: string, body: DutyDefinitionInput, accessToken?: string) {
  return auditCoreRequest<DutyDefinition>(`${base(mode, tenantId)}/definitions/${encodeURIComponent(dutyId)}`,
    { method: 'PATCH', accessToken, body: JSON.stringify(body) });
}

export function addStandardDuties(mode: DutiesMode, tenantId: string, accessToken?: string) {
  return auditCoreRequest<{ added: number }>(`${base(mode, tenantId)}/definitions/standard`, post(accessToken));
}

export function updateDutySettings(mode: DutiesMode, tenantId: string,
  body: Partial<Pick<DutySettings, 'enabled' | 'cutoffTimeIst' | 'defaultCarryDays' | 'workingWeekdays'>>, accessToken?: string) {
  return auditCoreRequest<DutySettings>(`${base(mode, tenantId)}/settings`,
    { method: 'PUT', accessToken, body: JSON.stringify(body) });
}
