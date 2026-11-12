import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import P2DriveUploadsPage from '../P2DriveUploadsPage';
import {
  clockTime,
  rescanPages,
  type DriveConnection,
  type DriveFileList,
  type DriveRunList,
  type DriveTotals,
} from '../../services/audit-core/uc03DriveIntake';

const role = vi.hoisted(() => ({ value: 'PC' }));

vi.mock('../../store/projectContextStore', () => {
  const state = () => ({
    selectedProject: { tenantId: 't1', operatingRole: role.value, scope: { outlets: [
      { outletId: 'o1', outletName: 'Cuttack', dealerName: 'Aditya Motors' },
      { outletId: 'o2', outletName: 'Jajpur', dealerName: 'Aditya Motors' }] } },
    projects: [{ tenantId: 't2', operatingRole: 'TL', scope: { outlets: [
      { outletId: 'h1', outletName: 'Patia', dealerName: 'Aditya Hyundai' },
      { outletId: 'h2', outletName: 'Khurda', dealerName: 'Aditya Hyundai' },
      { outletId: 'h3', outletName: 'Rasulgarh', dealerName: 'Utkal Hyundai' }] } }],
  });
  return {
    useProjectContextStore: Object.assign((select: (s: ReturnType<typeof state>) => unknown) => select(state()),
      { getState: state, subscribe: () => () => undefined }),
  };
});
vi.mock('../../store/sessionStore', () => {
  const state = () => ({ accessToken: 'token', outletId: 'o1', displayName: 'Ravi' });
  return {
    useSessionStore: Object.assign((select: (s: ReturnType<typeof state>) => unknown) => select(state()),
      { getState: state, subscribe: () => () => undefined }),
  };
});

const totals: DriveTotals = {
  files: 3, documents: 2, photos: 1, taken: 3, duplicates: 0, setAside: 0, failed: 0, waiting: 0, reading: 0,
  newBookings: 2, addedToBookings: 0, keptForReview: 0, pages: 6, pagesRead: 5, pagesToRescan: 1, pagesReading: 0,
  manualVerificationTasks: 2,
};
const connection: DriveConnection = {
  configured: true, connected: true, status: 'CONNECTED', account: 'project@example.com',
  folderUrl: 'https://drive.google.com/drive/folders/root', retentionDays: 30, lastCheckedAtUtc: '2026-11-12T06:00:00Z',
  problem: null, canConnect: false, canRun: true, waitingByOutlet: { o1: 2, o2: 5 }, waiting: 7,
};
const runs: DriveRunList = {
  inProgress: 0,
  items: [{
    runId: 'r1', trigger: 'PC_SUBMIT', mode: 'NOW', status: 'DONE', requestedBy: 'pc1', requestedByRole: 'PC',
    requestedByName: 'Ravi', dealerId: null, outletId: 'o1', date: null, summary: { totals }, detail: null,
    requestedAtUtc: '2026-11-12T06:05:00Z', startedAtUtc: '2026-11-12T06:05:10Z', finishedAtUtc: '2026-11-12T06:20:00Z',
  }],
};
const waiting: DriveFileList = {
  date: '2026-11-12', totals,
  files: [
    { outletId: 'o1', customerFolder: 'Akansh-456909', bookingNumber: '456909', journeyId: null, journeyReference: null,
      filename: 'docket.pdf', kind: 'DOCUMENT', state: 'WAITING', detail: null, uploadDate: '2026-11-12', seenAtUtc: null,
      pages: 0, pagesRead: 0, rescan: [] },
    { outletId: 'o2', customerFolder: 'Bimal-778899', bookingNumber: '778899', journeyId: null, journeyReference: null,
      filename: 'other outlet.pdf', kind: 'DOCUMENT', state: 'WAITING', detail: null, uploadDate: '2026-11-12', seenAtUtc: null,
      pages: 0, pagesRead: 0, rescan: [] },
  ],
};

function render(link: DriveConnection = connection, at = '/p2/drive-uploads'): string {
  const client = new QueryClient();
  client.setQueryData(['p2-drive-connection', 't1'], link);
  client.setQueryData(['p2-drive-runs', 't1'], runs);
  client.setQueryData(['p2-drive-waiting', 't1'], waiting);
  return renderToString(
    <QueryClientProvider client={client}><MemoryRouter initialEntries={[at]}><P2DriveUploadsPage /></MemoryRouter></QueryClientProvider>,
  ).replaceAll('<!-- -->', '');
}

describe('Drive uploads page', () => {
  it('lets a PC submit their outlet and shows only its waiting files', () => {
    role.value = 'PC';
    const html = render();
    expect(html).toContain('Connected as <strong>project@example.com</strong>');
    expect(html).toContain('Submit for Cuttack');
    expect(html).toContain('2 files waiting in Drive for this outlet');
    expect(html).toContain('Submit Drive uploads');
    expect(html).toContain('Akansh-456909');
    expect(html).not.toContain('other outlet.pdf');
    expect(html).not.toContain('Take files now');
    expect(html).toContain('3 files · 5 of 6 pages read · 1 page to scan again · 2 manual verification tasks');
    expect(html).toContain('Files are taken at 9:00 pm every day');
  });

  it('lets a Team Lead take a day’s files for an outlet or all of theirs', () => {
    role.value = 'TL';
    const html = render();
    expect(html).toContain('Take files now');
    expect(html).toContain('7 files waiting in Drive across your outlets');
    expect(html).toContain('All my outlets');
    expect(html).toContain('other outlet.pdf');
    expect(html).not.toContain('Submit Drive uploads');
  });

  it('offers the connection to an administrator only', () => {
    role.value = 'TL';
    const off = { ...connection, connected: false, status: 'NOT_CONNECTED' as const, account: null };
    expect(render(off)).toContain('not connected yet');
    expect(render(off)).not.toContain('Connect Google Drive');
    expect(render({ ...off, canConnect: true })).toContain('Connect Google Drive');
  });

  it('shows the Project’s own run time and gives an administrator the settings', () => {
    role.value = 'TL';
    expect(render({ ...connection, dailyRunTime: '18:30' })).toContain('Files are taken at 6:30 pm every day');
    expect(render({ ...connection, dailyRunEnabled: false })).toContain('The daily run is off');
    expect(render()).not.toContain('Save settings');
    const admin = render({ ...connection, canConnect: true, dailyRunTime: '18:30', dailyRunEnabled: true, outletIds: ['o1'],
      outlets: [
        { dealerId: 'd1', dealerName: 'Aditya Motors', outletId: 'o1', outletName: 'Cuttack', pcs: 2, usesDrive: true },
        { dealerId: 'd1', dealerName: 'Aditya Motors', outletId: 'o3', outletName: 'Puri', pcs: 0, usesDrive: false }] });
    expect(admin).toContain('Save settings');
    expect(admin).toContain('Take files every day at');
    expect(admin).toContain('Puri<span class="p2w-muted"> · no PC mapped</span>');
    expect(clockTime('00:05')).toBe('12:05 am');
    expect(clockTime(undefined)).toBe('9:00 pm');
  });

  it('says which Project the answer from Google is about', () => {
    role.value = 'TL';
    const own = render(connection, '/p2/drive-uploads?drive=connected&project=t1');
    expect(own).toContain('Google Drive is connected.');
    expect(own).not.toContain('This page shows');
    const other = render(connection, '/p2/drive-uploads?drive=connected&project=t2');
    expect(other).toContain('<strong>Aditya Hyundai, Utkal Hyundai:</strong> Google Drive is connected.');
    expect(other).toContain('This page shows a different Project');
    expect(other).toContain('Open that Project');
    expect(render(connection, '/p2/drive-uploads?drive=connected&project=t9')).toContain('<strong>Another Project:</strong>');
  });

  it('names the pages to scan again', () => {
    expect(rescanPages({ pages: [3], reason: 'blurred', code: null })).toBe('page 3');
    expect(rescanPages({ pages: [2, 5], reason: 'faded', code: null })).toBe('pages 2, 5');
    expect(rescanPages({ pages: [], reason: 'not split', code: null })).toBe('the whole file');
  });
});
