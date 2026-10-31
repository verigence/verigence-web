import { auditCoreRequest } from './client';

/** SuperAdmin System Health (product owner 2026-10-27). Mirrors GET /v1/admin/system-health. */

export type HealthSeverity = 'CRITICAL' | 'WARNING';

export interface HealthAlert {
  severity: HealthSeverity;
  code: string;
  message: string;
  service?: string;
  tenantId?: string;
}

export interface ServiceHealth {
  service: string;
  status: 'UP' | 'DOWN' | 'NO_HEARTBEAT';
  replicasAlive: number;
  lastSeenAtUtc: string | null;
  currentVersion: string | null;
  upSinceUtc: string | null;
  boots: number;
  restarts: number;
  deploys: number;
  uncleanStops: number;
  lastUncleanStopAtUtc: string | null;
  requests: number;
  clientErrors: number;
  serverErrors: number;
  slowRequests: number;
  requestsLastHour: number;
  serverErrorsLastHour: number;
  failingRoutes: Array<{ route: string; '4xx': number; '5xx': number }>;
  hourly: Array<{ hour: string; total: number; '4xx': number; '5xx': number }>;
}

export interface ResourceHealth {
  service: string;
  cpuMax: number | null;
  cpuAvg: number | null;
  cpuLimit: number | null;
  cpuPeakAtUtc: string | null;
  cpuHotMinutes: number;
  memoryMaxGb: number | null;
  memoryAvgGb: number | null;
  memoryLimitGb: number | null;
  memoryPeakAtUtc: string | null;
  hourly: Array<{ hour: string; cpuMax: number | null; cpuAvg: number | null; memoryMaxGb: number | null }>;
}

export interface RailwayHealth {
  webhookConfigured: boolean;
  lastEventAtUtc: string | null;
  deployments: number;
  failedOrCrashed: Array<{ service: string | null; status: string; atUtc: string | null; deploymentId: string | null }>;
  monitorAlerts: Array<{ service: string | null; type: string; severity: string | null; atUtc: string | null }>;
  events: Array<{ service: string | null; type: string; status: string | null; severity: string | null; environment: string | null; atUtc: string | null }>;
}

export interface ProjectPipeline {
  tenantId: string;
  projectName: string;
  projectStatus: string | null;
  documents: { inFlight: number; over30m: number; failed: number; ready: number; oldestInFlightAtUtc: string | null; byStatus: Record<string, number> };
  work: { open: number; over30m: number; deadLetter: number; completed: number; oldestOpenAtUtc: string | null; byStatus: Record<string, number> };
  deadLettersOpen: number;
  outboxProblems: number;
  inboxProblems: number;
  failureReasons: Array<{ kind: string; reason: string; count: number }>;
}

export interface DatabaseHealth {
  database: string;
  sizeBytes: number;
  maxConnections: number;
  commits: number;
  rollbacks: number;
  deadlocks: number;
  tempFiles: number;
  statsResetAtUtc: string | null;
  connections: Record<string, number>;
  idleInTransactionOver5m: number;
  activeOver1m: number;
  waitingOnLocks: number;
  slowQueries: Array<{ query: string; calls: number; meanMs: number; maxMs: number; totalMs: number }> | null;
  slowQueriesNote: string | null;
  window: { fromUtc: string; deadlocks?: number; rollbacks?: number; commits?: number; tempFiles?: number; rollbackRatio?: number; note?: string } | null;
}

export interface SystemHealth {
  generatedAtUtc: string;
  windowHours: number;
  alerts: HealthAlert[];
  services: ServiceHealth[];
  resources: ResourceHealth[];
  railway: RailwayHealth;
  pipeline: {
    projects: ProjectPipeline[];
    workerJobs: Array<{ kind: string; status: string; count: number }>;
    documentIntelligence: DocumentIntelligenceHealth | null;
  };
  database: DatabaseHealth;
  /** Document Intelligence's own database (it is not Audit Core's); null when DI could not be read. */
  diDatabase?: DatabaseHealth | null;
}

export interface DiQueueCounts {
  inFlight: number;
  over30m: number;
  failed: number;
  completed: number;
  oldestInFlightAtUtc: string | null;
  byStatus: Record<string, number>;
}

export interface DiProjectQueues {
  tenantId: string;
  projectName: string;
  projectStatus: string | null;
  classification: DiQueueCounts;
  extraction: DiQueueCounts;
  failureReasons: Array<{ queue: string; errorCode: string; count: number }>;
}

/** From DI's GET /v1/platform/health, mapped to Project names by Audit Core. */
export interface DocumentIntelligenceHealth {
  available: boolean;
  error: string | null;
  projects: DiProjectQueues[];
  leaseReclaims: number;
  schedulerProblems: Array<{ runName: string; runDate: string; startedAtUtc: string | null; completedAtUtc: string | null; errorCode: string | null }>;
}

export function getSystemHealth(hours: number, accessToken: string) {
  return auditCoreRequest<SystemHealth>(`/v1/admin/system-health?hours=${encodeURIComponent(String(hours))}`, {
    accessToken,
    timeoutMs: 20_000,
  });
}

/** GET /v1/admin/system-health/errors: failed API requests by HTTP status and error code (2026-10-30). */
export interface ErrorCodeRow {
  key: string;
  status: number;
  errorCode: string | null;
  category: string;
  meaning: string;
  count: number;
  share: number | null;
  routes: Array<{ service: string; route: string; count: number }>;
}

export interface ErrorRouteRow {
  service: string;
  route: string;
  clientErrors: number;
  serverErrors: number;
  notClassified: number;
  codes: Array<{ key: string; status: number; errorCode: string | null; count: number }>;
}

export interface SystemHealthErrors {
  generatedAtUtc: string;
  windowHours: number;
  totals: { requests: number; clientErrors: number; serverErrors: number; classified: number; notClassified: number };
  byCode: ErrorCodeRow[];
  byRoute: ErrorRouteRow[];
  notes: string[];
}

export function getSystemHealthErrors(hours: number, accessToken: string) {
  return auditCoreRequest<SystemHealthErrors>(
    `/v1/admin/system-health/errors?hours=${encodeURIComponent(String(hours))}`,
    { accessToken, timeoutMs: 20_000 },
  );
}

/** GET /v1/admin/system-health/daily: one row per IST day (2026-10-30). */
export interface DailyHealthRow {
  date: string;
  documents: number;
  read: number;
  badScan: number;
  notReadInTime: number;
  failedOther: number;
  inProgress: number;
  diFailedPct: number | null;
  diSystemFailedPct: number | null;
  requests: number;
  clientErrors: number;
  serverErrors: number;
  unauthenticated: number;
  forbidden: number;
  notFound: number;
  otherClientErrors: number;
  codes: Record<string, number>;
  restarts: number;
  uncleanStops: number;
  deploys: number;
  deploysFailed: number;
  deadLetters: number;
}

export interface SystemHealthDaily {
  generatedAtUtc: string;
  from: string;
  to: string;
  timezone: string;
  tenantId: string | null;
  projects: Array<{ tenantId: string; projectName: string; projectStatus: string | null }>;
  days: DailyHealthRow[];
  requestsRecordedFrom: string | null;
  codesRecordedFrom: string | null;
  notes: string[];
}

export function getSystemHealthDaily(days: number, tenantId: string | null, accessToken: string) {
  const params = new URLSearchParams({ days: String(days) });
  if (tenantId) params.set('tenantId', tenantId);
  return auditCoreRequest<SystemHealthDaily>(`/v1/admin/system-health/daily?${params.toString()}`, {
    accessToken,
    timeoutMs: 30_000,
  });
}
