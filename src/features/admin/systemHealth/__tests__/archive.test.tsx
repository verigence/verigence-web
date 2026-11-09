import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import DataArchiveTab from '../DataArchiveTab';
import { archiveTone, archiveToneLabel, durationText, nightLabel, runTone, tableLabel } from '../archiveLogic';
import type { ArchiveHealth } from '../../../../services/audit-core/systemHealth';

describe('data archive helpers', () => {
  it('maps the status and each run to a tone', () => {
    expect(archiveTone('RED')).toBe('bad');
    expect(archiveTone('AMBER')).toBe('warn');
    expect(archiveTone('GREEN')).toBe('ok');
    expect(archiveToneLabel('RED')).toBe('Failed last night');
    expect(runTone({ status: 'FAILED' })).toBe('bad');
    expect(runTone({ status: 'REFUSED' })).toBe('warn');
    expect(runTone({ status: 'SUCCEEDED' })).toBe('ok');
  });

  it('formats durations, tables and nights', () => {
    expect(durationText(null)).toBe('—');
    expect(durationText(0.64)).toBe('0.6 s');
    expect(durationText(42.2)).toBe('42 s');
    expect(durationText(185)).toBe('3 min 5 s');
    expect(durationText(3720)).toBe('1 h 2 min');
    expect(tableLabel('auditcore.rule_executions')).toBe('rule_executions');
    expect(nightLabel('2026-11-09')).toBe('Mon 9 Nov');
  });
});

const sample: ArchiveHealth = {
  generatedAtUtc: '2026-11-09T02:00:00Z',
  status: { tone: 'RED', reason: '2 of 3 runs failed on the night of 2026-11-09: P2DocumentStorageError: Failed to store archive/x. Rows not archived were kept.' },
  nights: [{
    night: '2026-11-09', failed: 2, succeeded: 1, archived: 0,
    runs: [{
      runId: 'r1', night: '2026-11-09', tenantId: 't1', projectName: 'Mahindra Orissa', table: 'auditcore.rule_executions',
      mode: 'LIVE', status: 'FAILED', candidates: 944489, archived: 0, objects: 0,
      error: 'P2DocumentStorageError: Failed to store archive/x', startedBy: 'p2-worker', startedAtUtc: '2026-11-08T21:30:24Z',
      finishedAtUtc: '2026-11-08T21:30:44Z', durationSeconds: 20, cutoffUtc: null,
    }],
  }],
  lastSucceededAtUtc: '2026-11-08T21:30:21Z', lastArchivedAtUtc: null, lastLiveSuccess: null,
  archivedToDate: 0, batchesToDate: 0, firstRunAtUtc: '2026-11-07T21:30:04Z',
  tables: [{ table: 'auditcore.rule_executions', rowsEstimate: 1063745, totalBytes: 505421824, tableBytes: 267378688 }],
  settings: {
    source: 'API environment', bucket: 'verigence-archive-dev', retentionDays: 365, batchSize: 5000, maxRowsPerTable: 500000,
    tables: [{ table: 'auditcore.rule_executions', key: 'rule_executions', enabled: true, ageDays: 30, description: 'x' }],
    problem: null,
  },
};

describe('Data archive tab', () => {
  it('shows the red status, the failed run and the settings without keys', () => {
    const client = new QueryClient();
    client.setQueryData(['admin', 'system-health', 'archive', 14], sample);
    const html = renderToString(<QueryClientProvider client={client}><DataArchiveTab accessToken="t" /></QueryClientProvider>);
    for (const text of ['Failed last night', 'Rows not archived were kept', 'Mahindra Orissa', 'rule_executions', 'FAILED',
      '9,44,489', 'Failed to store archive/x', '20 s', 'verigence-archive-dev', '365 days', 'Live', 'older than 30 days',
      '10,63,745 rows']) {
      expect(html).toContain(text);
    }
    expect(html).not.toMatch(/SECRET|ACCESS_KEY/);
  });
});
