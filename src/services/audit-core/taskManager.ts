import { auditCoreRequest } from './client';

/**
 * Task Manager (Audit Core docs/TASK_MANAGER_DESIGN_v1.0.md): tasks that are
 * not tied to a booking, recurring tasks, the daily gate pass task, daily task
 * status, employee utilisation and time on Verigence. Everything is per
 * Project. Project users call /p2/v1/tenants/{t}/...; Superadmin calls
 * /v1/admin/tenants/{t}/task-manager/... from its own view.
 */
export type TaskManagerMode = 'project' | 'admin';

export type TmRole = 'PC' | 'TL' | 'PM' | 'CRM' | 'REVIEWER' | 'EXECUTIVE' | 'SUPER_ADMIN';
export type TmAction = 'START' | 'COMPLETE_ACTION' | 'ACCEPT' | 'REJECT' | 'ADD_COMMENT' | 'REASSIGN' | 'CANCEL';
export type TmView = 'mine' | 'review' | 'raised' | 'all';
export type TmStatusFilter = 'open' | 'done' | 'all';

export type TmPerson = {
  actorId: string;
  roleCode: TmRole;
  displayName?: string | null;
  outlets: Array<{ outletId: string; outletName?: string | null }>;
  projectWide: boolean;
};

export type TmContext = {
  role: TmRole | null;
  actorId: string;
  canAssignTo: TmRole[];
  canCreateSchedules: boolean;
  canSeeSchedules: boolean;
  canSeeAll: boolean;
  canSeeUtilisation: boolean;
  assignees: TmPerson[];
  outlets: Array<{ outletId: string; outletName: string }>;
  today: string;
};

export type TmTask = {
  taskId: string;
  scope: 'OUTLET' | 'PROJECT';
  outletId?: string | null;
  outletName?: string | null;
  taskType: string;
  category: string;
  kind: 'ONE_OFF' | 'RECURRING' | 'GATE_PASS' | 'SYSTEM';
  title: string;
  description: string;
  reference: Record<string, unknown>;
  priority: 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';
  status: string;
  assignedRole?: TmRole | null;
  assignedActorId?: string | null;
  assignedName?: string | null;
  raisedByActorId?: string | null;
  raisedByRole?: string | null;
  raisedByName?: string | null;
  reviewerRole?: string | null;
  reviewerActorId?: string | null;
  reviewerName?: string | null;
  completionProtocol: 'REQUESTER_CONFIRMED' | 'SELF_CLOSING' | 'SYSTEM_VERIFIED';
  expectedCloseMinutes?: number | null;
  dueAtUtc?: string | null;
  reviewDueAtUtc?: string | null;
  createdAtUtc: string;
  completedAtUtc?: string | null;
  completedByName?: string | null;
  closedAtUtc?: string | null;
  scheduleId?: string | null;
  occurrenceDate?: string | null;
  sendBacks: number;
  overdue: boolean;
  reviewOverdue: boolean;
  missed: boolean;
  incomplete: boolean;
  closedLate: boolean;
  commentCount: number;
  myActions: TmAction[];
};

export type TmTaskDetail = TmTask & {
  events: Array<{
    eventType: string; actorId?: string | null; actorRole?: string | null; actorName?: string | null;
    comment?: string | null; details: Record<string, unknown>; atUtc: string;
  }>;
};

export type TmTaskList = {
  items: TmTask[];
  counts: { MINE: number; REVIEW: number; RAISED: number; ALL: number; ACTION: number };
  role: TmRole | null;
};

export type TmSchedule = {
  scheduleId: string;
  systemKind?: string | null;
  title: string;
  description: string;
  priority: string;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  weekdays: number[];
  monthDay?: number | null;
  runTimeIst: string;
  expectedCloseMinutes: number;
  assigneeMode: 'ACTOR' | 'ROLE_EACH' | 'OUTLET_PCS';
  assignedRole?: TmRole | null;
  assignedActorId?: string | null;
  assignedName?: string | null;
  outletId?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  skipDates: string[];
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  createdByName?: string | null;
  createdByRole?: string | null;
};

export type TmScheduleInput = Partial<{
  title: string; description: string; priority: string; frequency: string; weekdays: number[];
  monthDay: number | null; runTimeIst: string; expectedCloseMinutes: number; assigneeMode: string;
  assignedRole: string | null; assignedActorId: string | null; outletId: string | null;
  startsOn: string | null; endsOn: string | null; status: string;
}>;

export type TmStatusCounts = {
  open: number; raisedOnDay: number; completedOnDay: number; completedLate: number; overdue: number;
  reviewOverdue: number; missed: number; incomplete: number;
};

export type TmStatusSection = {
  totals: TmStatusCounts;
  people: Array<TmStatusCounts & { actorId?: string | null; name?: string | null; role?: string | null }>;
  flags: Array<{
    taskId: string; journeyId?: string | null; journeyReference?: string | null; customerName?: string | null;
    outletName?: string | null; taskType: string; title: string; status: string;
    flags: Array<'OVERDUE' | 'REVIEW_OVERDUE' | 'MISSED' | 'INCOMPLETE' | 'CLOSED_LATE'>;
    assigneeName?: string | null; assigneeActorId?: string | null; assigneeRole?: string | null;
    reviewerRole?: string | null; reviewerName?: string | null;
    dueAtUtc?: string | null; reviewDueAtUtc?: string | null; completedAtUtc?: string | null; recurring: boolean;
  }>;
  flagsTruncated: boolean;
};

export type TmTaskStatus = {
  day: string;
  asOfUtc: string;
  journeyTasks: TmStatusSection;
  taskManager: TmStatusSection;
  notes: string[];
};

export type UtilisationDay = {
  date?: string;
  journeysStarted: number; filesUploaded: number; pagesUploaded: number; failedPages: number;
  tasksAssigned: number; tasksCompleted: number; tasksCompletedOnTime: number; sendBacksReceived: number;
  reviewsDone: number; journeyTasksWorked: number;
  activeMinutes: number; idleMinutes: number; backgroundMinutes: number;
  firstActiveAtUtc?: string | null; lastActiveAtUtc?: string | null; hourlyActiveMinutes: number[];
};

export type UtilisationPerson = {
  actorId: string;
  name?: string | null;
  role?: string | null;
  activeInProject: boolean;
  totals: UtilisationDay & {
    avgMinutesToComplete: number | null; overdueNow: number; reviewOverdueNow: number; daysActive: number;
  };
  days: UtilisationDay[];
};

export type UtilisationReport = {
  from: string; to: string; idleThresholdMinutes: number; people: UtilisationPerson[]; notes: string[];
};

export type ActivityPayload = {
  date: string;
  clientKind: 'WEB' | 'ANDROID' | 'IOS';
  displayName?: string;
  activeSeconds: number;
  idleSeconds: number;
  backgroundSeconds: number;
  hourlyActiveMinutes: number[];
  firstActiveAt?: string | null;
  lastActiveAt?: string | null;
  sessions?: Array<{ start: string; end: string; activeSeconds: number }>;
};

const LIST_TIMEOUT_MS = 30_000;

export function tmBase(mode: TaskManagerMode, tenantId: string): string {
  const t = encodeURIComponent(tenantId);
  return mode === 'admin' ? `/v1/admin/tenants/${t}/task-manager` : `/p2/v1/tenants/${t}/task-manager`;
}

function reportPath(mode: TaskManagerMode, tenantId: string, report: 'task-status' | 'employee-utilisation'): string {
  const t = encodeURIComponent(tenantId);
  return mode === 'admin' ? `/v1/admin/tenants/${t}/task-manager/${report}` : `/p2/v1/tenants/${t}/reports/${report}`;
}

export function getTmContext(mode: TaskManagerMode, tenantId: string, accessToken?: string) {
  return auditCoreRequest<TmContext>(`${tmBase(mode, tenantId)}/context`, { accessToken, cache: 'no-store' });
}

export function getTmTasks(
  mode: TaskManagerMode, tenantId: string, view: TmView, status: TmStatusFilter, accessToken?: string,
) {
  const params = new URLSearchParams({ view, status });
  return auditCoreRequest<TmTaskList>(`${tmBase(mode, tenantId)}/tasks?${params}`, {
    accessToken, timeoutMs: LIST_TIMEOUT_MS, cache: 'no-store',
  });
}

export function getTmTask(mode: TaskManagerMode, tenantId: string, taskId: string, accessToken?: string) {
  return auditCoreRequest<TmTaskDetail>(`${tmBase(mode, tenantId)}/tasks/${encodeURIComponent(taskId)}`, {
    accessToken, cache: 'no-store',
  });
}

export function raiseTmTasks(
  mode: TaskManagerMode, tenantId: string,
  body: { title: string; description: string; assigneeActorIds: string[]; expectedCloseMinutes: number;
          priority: string; outletId?: string | null },
  accessToken?: string,
) {
  return auditCoreRequest<{ taskIds: string[] }>(`${tmBase(mode, tenantId)}/tasks`, {
    method: 'POST', accessToken, body: JSON.stringify(body),
  });
}

export function actOnTmTask(
  mode: TaskManagerMode, tenantId: string, taskId: string, action: TmAction, accessToken?: string,
  comment?: string, details: Record<string, unknown> = {},
) {
  return auditCoreRequest<TmTaskDetail>(`${tmBase(mode, tenantId)}/tasks/${encodeURIComponent(taskId)}/actions`, {
    method: 'POST', accessToken, body: JSON.stringify({ action, comment: comment || null, details }),
  });
}

export function getTmSchedules(mode: TaskManagerMode, tenantId: string, accessToken?: string) {
  return auditCoreRequest<{ items: TmSchedule[] }>(`${tmBase(mode, tenantId)}/schedules`, {
    accessToken, cache: 'no-store',
  });
}

export function createTmSchedule(mode: TaskManagerMode, tenantId: string, body: TmScheduleInput, accessToken?: string) {
  return auditCoreRequest<TmSchedule>(`${tmBase(mode, tenantId)}/schedules`, {
    method: 'POST', accessToken, body: JSON.stringify(body),
  });
}

export function updateTmSchedule(
  mode: TaskManagerMode, tenantId: string, scheduleId: string, body: TmScheduleInput, accessToken?: string,
) {
  return auditCoreRequest<TmSchedule>(`${tmBase(mode, tenantId)}/schedules/${encodeURIComponent(scheduleId)}`, {
    method: 'PATCH', accessToken, body: JSON.stringify(body),
  });
}

export function skipTmScheduleDate(
  mode: TaskManagerMode, tenantId: string, scheduleId: string, date: string, reason: string, accessToken?: string,
) {
  return auditCoreRequest<{ cancelledTasks: number }>(
    `${tmBase(mode, tenantId)}/schedules/${encodeURIComponent(scheduleId)}/skip`,
    { method: 'POST', accessToken, body: JSON.stringify({ date, reason }) },
  );
}

export function getTmTaskStatus(mode: TaskManagerMode, tenantId: string, day: string, accessToken?: string) {
  return auditCoreRequest<TmTaskStatus>(`${reportPath(mode, tenantId, 'task-status')}?day=${encodeURIComponent(day)}`, {
    accessToken, timeoutMs: LIST_TIMEOUT_MS,
  });
}

export function getUtilisation(
  mode: TaskManagerMode, tenantId: string, from: string, to: string, accessToken?: string,
) {
  const params = new URLSearchParams({ from, to });
  return auditCoreRequest<UtilisationReport>(`${reportPath(mode, tenantId, 'employee-utilisation')}?${params}`, {
    accessToken, timeoutMs: LIST_TIMEOUT_MS,
  });
}

export function postActivity(tenantId: string, payload: ActivityPayload, accessToken?: string) {
  return auditCoreRequest<{ recorded: boolean }>(`/p2/v1/tenants/${encodeURIComponent(tenantId)}/activity`, {
    method: 'POST', accessToken, body: JSON.stringify(payload), keepalive: true,
  });
}

// ---------------------------------------------------------------------------
// Employee engagement (day / week / month) and the DI dashboard (2026-10-27).
// Executive and Superadmin only; the server enforces it.
// ---------------------------------------------------------------------------

export type EngagementPeriod = 'day' | 'week' | 'month';

export type MinMaxAvg = { min: number | null; avg: number | null; max: number | null };

export type EngagementEfficacy = {
  inUsePct: number | null;
  avgActiveMinutesPerDayActive: number | null;
  daysActivePct: number | null;
  filesPerActiveHour: number | null;
  tasksPerActiveHour: number | null;
  onTimePct: number | null;
  badScanPct: number | null;
};

export type EngagementCell = {
  activeMinutes: number; idleMinutes: number; backgroundMinutes: number;
  sessions: number; sessionMinutes: MinMaxAvg; daysActive: number; workingDays: number;
  usualStart: string | null; usualEnd: string | null;
  firstActiveAtUtc: string | null; lastActiveAtUtc: string | null; hourlyActiveMinutes: number[];
  journeysStarted: number; filesUploaded: number; pagesUploaded: number; badScans: number; notReadInTime: number;
  journeyTasksWorked: number; taskActions: number;
  tasksAssigned: number; tasksCompleted: number; tasksCompletedOnTime: number; sendBacksReceived: number;
  reviewsDone: number;
  efficacy: EngagementEfficacy;
};

export type EngagementPersonPeriod = EngagementCell & { periodStart: string; label: string; from: string; to: string };

export type EngagementPerson = {
  actorId: string;
  name?: string | null;
  role?: string | null;
  activeInProject: boolean;
  outlets: string[];
  totals: EngagementCell;
  periods: EngagementPersonPeriod[];
};

export type EngagementReport = {
  from: string; to: string; period: EngagementPeriod;
  periods: Array<{ periodStart: string; label: string }>;
  workingDays: number; idleThresholdMinutes: number; sessionGapMinutes: number;
  people: EngagementPerson[];
  notes: string[];
};

export type DiOutcome =
  | 'READ_FIRST' | 'READ_RETRIED' | 'NEEDS_REVIEW' | 'EXTRA_COPY' | 'BAD_SCAN' | 'NOT_READ_IN_TIME'
  | 'FAILED_OTHER' | 'DUPLICATE' | 'REMOVED' | 'IN_PROGRESS';

export type DiStats = { min: number | null; avg: number | null; median: number | null; max: number | null; count: number };

export type DiDay = {
  day: string;
  files: number; pages: number; duplicateFiles: number; notUploadedFiles: number; documents: number;
  filesInProgress: number;
  outcomes: Record<DiOutcome, number>;
  pagesByOutcome: Record<DiOutcome, number>;
  badScanReasons: Record<string, number>;
  avgPagesPerFile: number | null;
  fileSizeMb: { avg: number | null; max: number | null };
  processingMinutes: DiStats;
  readFirstPct: number | null;
  failedPct: number | null;
};

export type DiFailed = {
  queueId: string; journeyId: string; batchId: string; filename?: string | null; pageNumbers: number[];
  documentType?: string | null; uploadedAtUtc: string; failedAtUtc: string;
  uploadedBy?: string | null; uploadedByName?: string | null;
  outcome: DiOutcome; group: string; reason: string; code?: string | null; retried: boolean;
  openUrl?: string | null; journeyReference?: string | null; customerName?: string | null; outletName?: string | null;
};

export type DiDashboard = {
  from: string; to: string;
  totals: DiDay;
  days: DiDay[];
  failureReasons: Array<{ group: string; reason: string; documents: number; pages: number }>;
  byPc: Array<{ actorId: string; name?: string | null; documents: number; pages: number; badScans: number;
                notReadInTime: number; failedOther: number; readFirst: number;
                badScanPct: number | null; readFirstPct: number | null }>;
  byDocumentType: Array<{ documentType: string; documents: number; readFirst: number; retried: number; failed: number;
                          readFirstPct: number | null }>;
  byHour: Array<{ hour: number; documents: number; failed: number; notReadInTime: number }>;
  failed: DiFailed[];
  failedTruncated: boolean;
  linkExpiresInSeconds: number;
  notes: string[];
};

function newReportPath(mode: TaskManagerMode, tenantId: string, report: 'engagement' | 'di-dashboard'): string {
  const t = encodeURIComponent(tenantId);
  return mode === 'admin' ? `/v1/admin/tenants/${t}/task-manager/${report}` : `/p2/v1/tenants/${t}/reports/${report}`;
}

export function getEngagement(
  mode: TaskManagerMode, tenantId: string, from: string, to: string, period: EngagementPeriod, accessToken?: string,
) {
  const params = new URLSearchParams({ from, to, period });
  return auditCoreRequest<EngagementReport>(`${newReportPath(mode, tenantId, 'engagement')}?${params}`, {
    accessToken, timeoutMs: 60_000,
  });
}

export function getDiDashboard(mode: TaskManagerMode, tenantId: string, from: string, to: string, accessToken?: string) {
  const params = new URLSearchParams({ from, to });
  return auditCoreRequest<DiDashboard>(`${newReportPath(mode, tenantId, 'di-dashboard')}?${params}`, {
    accessToken, timeoutMs: 60_000, cache: 'no-store',
  });
}
