import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import InfrastructureTab from '../InfrastructureTab';
import type { InfrastructureHealth } from '../../../../services/audit-core/systemHealth';

const hour = {
  samples: 60, connectionsMax: 41, connectionsAvg: 30, connectionsPeakAtUtc: '2026-10-31T09:12:00Z', activeMax: 4, activeAvg: 1.2,
  idleInTransactionMax: 1, maxConnections: 901, waitingOnLocksMax: 0, longestQuerySecondsMax: 12, transactions: 36000, tps: 10,
  tpsPeak: 55, tpsPeakAtUtc: '2026-10-31T09:40:00Z', cacheHitRatio: 0.991, blocksRead: 5000, lfcHitRatio: null, lfcMisses: null,
  deadlocks: 0, tempBytes: 0, sizeBytes: 2_500_000_000,
};

const sample: InfrastructureHealth = {
  generatedAtUtc: '2026-10-31T10:00:00Z',
  windowHours: 24,
  web: {
    status: 'CRITICAL', worker: 'verigence-web-dev',
    probe: { configured: true, ok: false, url: 'https://verigence-web-dev.example', statusCode: 503, latencyMs: 120, error: 'Answered HTTP 503.', checkedAtUtc: '2026-10-31T10:00:00Z' },
    analytics: {
      configured: true, available: true, error: null, requests: 1000, errors: 30, subrequests: 400, errorRate: 0.03,
      cpuTimeP50Ms: 1.5, cpuTimeP99Ms: 24, byStatus: [{ status: 'success', requests: 970 }, { status: 'scriptThrewException', requests: 30 }],
      hourly: [{ hour: '2026-10-31T09:00:00Z', requests: 630, errors: 30, subrequests: 200, cpuP50Ms: 1.2, cpuP99Ms: 90 }],
    },
  },
  r2: {
    status: 'OK', bucket: 'verigence-di-bucket-dev',
    probe: { configured: true, ok: true, latencyMs: 85, error: null, checkedAtUtc: '2026-10-31T10:00:00Z' },
    analytics: {
      configured: true, available: true, error: null, operations: 1000, clientErrors: 40, serverErrors: 0, serverErrorRate: 0,
      byAction: [{ actionType: 'GetObject', requests: 900, clientErrors: 0, serverErrors: 0 }], byStatusCode: [],
      hourly: [{ hour: '2026-10-31T09:00:00Z', reads: 940, writes: 50, lists: 0, deletes: 0, other: 0, clientErrors: 40, serverErrors: 0 }],
      storage: { objectCount: 12345, payloadBytes: 5_000_000_000, metadataBytes: 0, pendingUploads: 0, atUtc: '2026-10-31T09:30:00Z' },
    },
  },
  neon: {
    status: 'OK', projectId: 'round-scene-14217399',
    database: {
      sampled: true,
      latest: { minuteUtc: '2026-10-31T09:59:00Z', stale: false, connections: { active: 2, idle: 30, idleInTransaction: 0, other: 0 },
        connectionsTotal: 32, maxConnections: 901, waitingOnLocks: 0, longestQuerySeconds: 3, longestTransactionSeconds: 3, sizeBytes: 2_500_000_000 },
      window: hour, hourly: [{ hour: '2026-10-31T09:00:00Z', ...hour }], lfcAvailable: false,
      note: "Neon's local file cache figures need the neon extension; the buffer hit ratio is shown instead.",
    },
    api: { configured: false, available: false, error: 'NEON_API_KEY is not set on Audit Core.', projectId: 'round-scene-14217399', endpoints: [], compute: null },
    cpuNote: 'Per-minute CPU % is only in the Neon console.',
  },
  alerts: [{ severity: 'CRITICAL', code: 'WEB_PROBE_FAILED', message: 'The web app did not load: Answered HTTP 503.', service: 'cloudflare-web' }],
};

describe('Cloudflare & Neon tab', () => {
  it('draws the three nodes, their probes and the not-configured Neon API', () => {
    const client = new QueryClient();
    client.setQueryData(['admin', 'system-health', 'infrastructure', 24], sample);
    const html = renderToString(
      <QueryClientProvider client={client}><InfrastructureTab hours={24} accessToken="t" /></QueryClientProvider>,
    );
    for (const text of ['Cloudflare Worker', 'verigence-web-dev', 'Answered HTTP 503.', 'Needs attention', 'verigence-di-bucket-dev',
      '12,345', 'Neon DB', 'Transactions / s', '99.1%', 'scriptThrewException', 'Set NEON_API_KEY', 'Per-minute CPU %',
      'needs the neon extension']) {
      expect(html).toContain(text);
    }
  });
});
