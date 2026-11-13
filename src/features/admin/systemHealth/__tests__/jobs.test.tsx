import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import JobsTab, { jobsKey } from '../JobsTab';
import { clockLabel, coverageText, isHhMm, sleepText } from '../jobsLogic';
import type { JobsOverview } from '../../../../services/audit-core/systemHealth';

describe('jobs helpers', () => {
  it('reads a 24-hour time the way people say it', () => {
    expect(clockLabel('21:30')).toBe('9:30 pm');
    expect(clockLabel('00:30')).toBe('12:30 am');
    expect(clockLabel('12:05')).toBe('12:05 pm');
    expect(clockLabel('08:00')).toBe('8:00 am');
    expect(clockLabel(null)).toBe('—');
    expect(isHhMm('21:30')).toBe(true);
    expect(isHhMm('24:00')).toBe(false);
    expect(isHhMm('9:30')).toBe(false);
  });

  it('says when the system sleeps and how far the last run reached', () => {
    expect(sleepText({ enabled: true, startIst: '00:30', endIst: '08:00' })).toContain('from 12:30 am to 8:00 am India time');
    expect(sleepText({ enabled: false, startIst: null, endIst: null })).toContain('does not sleep');
    expect(coverageText({ lastRunAtUtc: null, projectsRunLast: 0, projects: 3 })).toBe('Not run yet');
    expect(coverageText({ lastRunAtUtc: '2026-11-13T16:00:00Z', projectsRunLast: 3, projects: 3 })).toBe('3 of 3 Projects');
  });
});

const sample: JobsOverview = {
  timezone: 'Asia/Kolkata',
  sleepWindow: { enabled: true, startIst: '00:30', endIst: '08:00' },
  daily: [
    {
      key: 'DAYEND_CLEANUP', name: 'Day-end clean-up', what: 'Takes every failed page off its journey.', service: 'P2 worker',
      timeIst: '21:30', defaultTimeIst: '21:30', enabled: true, editable: true, insideSleepWindow: false,
      changedBy: null, changedAtUtc: null, lastRunAtUtc: '2026-11-13T16:00:05Z', projectsRunLast: 3, projects: 3,
    },
    {
      key: 'DATA_ARCHIVE', name: 'Data archive', what: 'Moves old records to the archive bucket.', service: 'P2 worker',
      timeIst: '02:15', defaultTimeIst: '21:50', enabled: true, editable: true, insideSleepWindow: true,
      changedBy: 'sa-1', changedAtUtc: '2026-11-13T08:00:00Z', lastRunAtUtc: null, projectsRunLast: 0, projects: 3,
    },
  ],
  driveRuns: [{
    tenantId: 't1', projectName: 'Mahindra Orissa', timeIst: '21:00', enabled: true,
    lastRunAtUtc: '2026-11-12T15:30:00Z', insideSleepWindow: false,
  }],
  recurring: [{ name: 'Document work queue', every: '1 second', service: 'P2 worker', what: 'Picks up the next pages.', pausedAsleep: true }],
  external: [{ name: 'Project sync', service: 'SevaSutra', when: 'Every 5 minutes', what: 'Keeps dealerships in step.', note: 'Not yet paused during the night\'s sleep.' }],
  changes: [{ job: 'Data archive', jobKey: 'DATA_ARCHIVE', oldTimeIst: '21:50', newTimeIst: '02:15', changedBy: 'sa-1', changedAtUtc: '2026-11-13T08:00:00Z' }],
};

describe('Jobs tab', () => {
  it('lists every job, with a time to set on the daily ones and the Drive run', () => {
    const client = new QueryClient();
    client.setQueryData(jobsKey, sample);
    const html = renderToString(<QueryClientProvider client={client}><JobsTab accessToken="t" /></QueryClientProvider>);
    for (const text of ['from 12:30 am to 8:00 am India time', 'Day-end clean-up', 'Data archive', '9:30 pm', 'default 9:50 pm',
      'Inside the sleep: wakes the system', 'Before the sleep', '3 of 3 Projects', 'Not run yet', 'Mahindra Orissa',
      'Document work queue', '1 second', 'SevaSutra', 'Every 5 minutes', '2:15 am', 'sa-1']) {
      expect(html).toContain(text);
    }
    // A time input and Save for each daily job and for the Project's Drive run.
    expect(html.match(/type="time"/g)).toHaveLength(3);
    expect(html).toContain('value="21:30"');
    expect(html).toContain('aria-label="Mahindra Orissa Drive run time (India time)"');
  });

  it('says so when no Project has Drive and no time was changed', () => {
    const client = new QueryClient();
    client.setQueryData(jobsKey, { ...sample, driveRuns: [], changes: [] });
    const html = renderToString(<QueryClientProvider client={client}><JobsTab accessToken="t" /></QueryClientProvider>);
    expect(html).toContain('No Project has Google Drive connected.');
    expect(html).toContain('No time has been changed yet.');
  });
});
