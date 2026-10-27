import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AdminSystemHealthPage from '../../../../pages/AdminSystemHealthPage';
import type { SystemHealth } from '../../../../services/audit-core/systemHealth';

const sample: SystemHealth = {
  generatedAtUtc: '2026-10-27T08:00:00Z',
  windowHours: 24,
  alerts: [
    { severity: 'CRITICAL', code: 'DEPLOY_CRASHED', message: 'di-worker: deployment crashed at 2026-10-27T07:00:00Z.' },
    { severity: 'WARNING', code: 'WORK_OVER_30_MIN', message: 'Mahindra Orissa: 2 work item(s) waiting for more than 30 minutes.' },
  ],
  services: [
    {
      service: 'verigence-audit-core', status: 'UP', replicasAlive: 1, lastSeenAtUtc: '2026-10-27T07:59:30Z',
      currentVersion: 'abc123', upSinceUtc: '2026-10-27T07:15:00Z', boots: 2, restarts: 1, deploys: 1, uncleanStops: 1,
      lastUncleanStopAtUtc: '2026-10-27T06:00:00Z', requests: 60998, clientErrors: 6051, serverErrors: 53, slowRequests: 12,
      requestsLastHour: 2000, serverErrorsLastHour: 0,
      failingRoutes: [{ route: '/p2/v1/tenants/{tenant_id}/tasks', '4xx': 40, '5xx': 2 }],
      hourly: [{ hour: '2026-10-27T06:00:00Z', total: 100, '4xx': 5, '5xx': 1 }, { hour: '2026-10-27T07:00:00Z', total: 300, '4xx': 2, '5xx': 0 }],
    },
    {
      service: 'di-worker-legacy', status: 'DOWN', replicasAlive: 0, lastSeenAtUtc: '2026-10-27T07:00:00Z', currentVersion: null,
      upSinceUtc: null, boots: 1, restarts: 0, deploys: 0, uncleanStops: 1, lastUncleanStopAtUtc: '2026-10-27T07:00:00Z',
      requests: 0, clientErrors: 0, serverErrors: 0, slowRequests: 0, requestsLastHour: 0, serverErrorsLastHour: 0,
      failingRoutes: [], hourly: [],
    },
  ],
  resources: [{
    service: 'di-worker-v2', cpuMax: 0.68, cpuAvg: 0.01, cpuLimit: 12, cpuPeakAtUtc: '2026-10-27T05:00:00Z', cpuHotMinutes: 0,
    memoryMaxGb: 1.7, memoryAvgGb: 0.6, memoryLimitGb: 16, memoryPeakAtUtc: '2026-10-27T05:00:00Z',
    hourly: [{ hour: '2026-10-27T05:00:00Z', cpuMax: 0.68, cpuAvg: 0.02, memoryMaxGb: 1.7 }],
  }],
  railway: {
    webhookConfigured: true, lastEventAtUtc: '2026-10-27T07:00:00Z', deployments: 4,
    failedOrCrashed: [{ service: 'di-worker', status: 'CRASHED', atUtc: '2026-10-27T07:00:00Z', deploymentId: 'd1' }],
    monitorAlerts: [], events: [],
  },
  pipeline: {
    projects: [{
      tenantId: 't1', projectName: 'Mahindra Orissa', projectStatus: 'ACTIVE',
      documents: { inFlight: 25, over30m: 0, failed: 31, ready: 728, oldestInFlightAtUtc: '2026-10-27T07:50:00Z', byStatus: {} },
      work: { open: 38, over30m: 2, deadLetter: 0, completed: 2893, oldestOpenAtUtc: '2026-10-26T09:39:00Z', byStatus: {} },
      deadLettersOpen: 0, outboxProblems: 0, inboxProblems: 0,
      failureReasons: [{ kind: 'DOCUMENT', reason: 'DI_QUALITY_IMAGE_BLUR_SCORE', count: 20 }],
    }],
    workerJobs: [], documentIntelligence: null,
  },
  database: {
    database: 'neondb', sizeBytes: 2_500_000_000, maxConnections: 901, commits: 7636434, rollbacks: 222718, deadlocks: 272,
    tempFiles: 94, statsResetAtUtc: null, connections: { idle: 36, 'idle in transaction': 4, active: 1 },
    idleInTransactionOver5m: 4, activeOver1m: 0, waitingOnLocks: 0,
    slowQueries: [{ query: 'SELECT $1', calls: 10, meanMs: 1200.5, maxMs: 3000, totalMs: 12005 }], slowQueriesNote: null,
    window: { fromUtc: '2026-10-26T08:00:00Z', deadlocks: 3, rollbacks: 100, commits: 9900, tempFiles: 0, rollbackRatio: 0.01 },
  },
};

describe('System health page', () => {
  it('draws every section from a full payload', () => {
    const client = new QueryClient();
    client.setQueryData(['admin', 'system-health', 24], sample);
    const html = renderToString(
      <QueryClientProvider client={client}><AdminSystemHealthPage /></QueryClientProvider>,
    );
    for (const text of ['Needs attention now', 'deployment crashed', 'Services', 'Silent', 'CPU and memory',
      'Deployments (Railway)', 'Mahindra Orissa', 'DI_QUALITY_IMAGE_BLUR_SCORE', 'Slowest queries', '0.68 of 12 vCPU']) {
      expect(html).toContain(text);
    }
  });

  it('shows Document Intelligence per Project and its own database', () => {
    const client = new QueryClient();
    client.setQueryData(['admin', 'system-health', 24], {
      ...sample,
      pipeline: {
        ...sample.pipeline,
        documentIntelligence: {
          available: true, error: null, leaseReclaims: 2,
          schedulerProblems: [{ runName: 'nightly_reprocess', runDate: '2026-10-26', startedAtUtc: '2026-10-26T20:00:00Z', completedAtUtc: null, errorCode: null }],
          projects: [{
            tenantId: 't1', projectName: 'Mahindra Orissa', projectStatus: 'ACTIVE',
            classification: { inFlight: 1, over30m: 0, failed: 4, completed: 90, oldestInFlightAtUtc: '2026-10-27T07:40:00Z', byStatus: {} },
            extraction: { inFlight: 3, over30m: 2, failed: 0, completed: 80, oldestInFlightAtUtc: '2026-10-27T07:00:00Z', byStatus: {} },
            failureReasons: [{ queue: 'classification', errorCode: 'GEMINI_TIMEOUT', count: 4 }],
          }],
        },
      },
      diDatabase: { ...sample.database, database: 'railway', window: null, slowQueries: null, slowQueriesNote: 'pg_stat_statements is not installed' },
    });
    const html = renderToString(
      <QueryClientProvider client={client}><AdminSystemHealthPage /></QueryClientProvider>,
    );
    for (const text of ['Document Intelligence, per Project', 'GEMINI_TIMEOUT', 'taken back from a worker', 'nightly_reprocess',
      'Document Intelligence database (railway)', 'Audit Core database (neondb)']) {
      expect(html).toContain(text);
    }
  });

  it('says when Document Intelligence could not be read', () => {
    const client = new QueryClient();
    client.setQueryData(['admin', 'system-health', 24], {
      ...sample,
      pipeline: { ...sample.pipeline, documentIntelligence: { available: false, error: 'Document Intelligence answered HTTP 503.', projects: [], leaseReclaims: 0, schedulerProblems: [] } },
      diDatabase: null,
    });
    const html = renderToString(
      <QueryClientProvider client={client}><AdminSystemHealthPage /></QueryClientProvider>,
    );
    expect(html).toContain('could not be read');
    expect(html).not.toContain('Document Intelligence database');
  });

  it('says plainly when nothing has reported yet', () => {
    const client = new QueryClient();
    client.setQueryData(['admin', 'system-health', 24], {
      ...sample, alerts: [], services: [], resources: [],
      railway: { ...sample.railway, webhookConfigured: false, failedOrCrashed: [] },
      pipeline: { ...sample.pipeline, projects: [] },
      database: { ...sample.database, slowQueries: null, slowQueriesNote: 'pg_stat_statements is not installed', window: null },
    });
    const html = renderToString(<QueryClientProvider client={client}><AdminSystemHealthPage /></QueryClientProvider>);
    expect(html).toContain('Healthy');
    expect(html).toContain('No service has sent a heartbeat yet');
    expect(html).toContain('not connected yet');
    expect(html).toContain('pg_stat_statements is not installed');
  });
});
