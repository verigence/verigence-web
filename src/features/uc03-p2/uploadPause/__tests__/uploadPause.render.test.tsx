import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import UploadPauseControl, { UPLOAD_PAUSE_ADMIN_KEY } from '../../../admin/systemHealth/UploadPauseControl';
import P2JourneyWorkspacePage from '../../../../pages/P2JourneyWorkspacePage';
import type { UploadPauseRows, UploadPauseStatus } from '../../../../services/audit-core/uploadPause';
import P2UploadPanel from '../../workspace/P2UploadPanel';
import { uploadPauseKey } from '../useUploadPause';

// Server rendering reads a zustand store's initial state, so the page's two
// stores are stood in for by plain values the tests set.
const stores = vi.hoisted(() => ({
  project: undefined as unknown,
  session: { accessToken: undefined as string | undefined, outletId: '' },
}));
vi.mock('../../../../store/projectContextStore', () => {
  const state = () => ({ selectedProject: stores.project, projects: [] });
  return {
    useProjectContextStore: Object.assign((select: (s: ReturnType<typeof state>) => unknown) => select(state()),
      { getState: state, subscribe: () => () => undefined }),
  };
});
vi.mock('../../../../store/sessionStore', () => {
  const state = () => stores.session;
  return {
    useSessionStore: Object.assign((select: (s: ReturnType<typeof state>) => unknown) => select(state()),
      { getState: state, subscribe: () => () => undefined }),
  };
});

const html = (node: ReactNode) => renderToString(node).replaceAll('<!-- -->', '');
const NOTICE = 'Uploads are paused for maintenance until 31 Dec, 11:30 pm IST. You can still open bookings and work your tasks.';
const FAR = '2099-12-31T18:00:00Z';

const transport = async () => ({
  journeyId: 'j1',
  transport: { init: async () => [], put: async () => undefined, finalize: async () => undefined },
});

describe('the upload panel while uploads are paused', () => {
  it('shows the notice above the drop area and turns the drop area and the pickers off', () => {
    const page = html(<P2UploadPanel journeyId="j1" getTransport={transport} onAccepted={() => undefined}
      pausedNotice={NOTICE} />);
    expect(page).toContain(NOTICE);
    expect(page.indexOf(NOTICE)).toBeLessThan(page.indexOf('p2w-upload__drop'));
    expect(page).toContain('p2w-upload is-paused');
    expect(page).toMatch(/<button[^>]*disabled=""[^>]*>Take photo/);
    expect(page).toMatch(/<button[^>]*disabled=""[^>]*>Choose files/);
    expect(page.match(/<input[^>]*type="file"[^>]*disabled=""/g)).toHaveLength(2);
  });

  it('is exactly as before when uploads are not paused', () => {
    const page = html(<P2UploadPanel journeyId="j1" getTransport={transport} onAccepted={() => undefined} />);
    expect(page).not.toContain('paused');
    expect(page).not.toContain('disabled');
  });
});

describe('the documents screen while uploads are paused', () => {
  afterEach(() => {
    stores.project = undefined;
    stores.session = { accessToken: undefined, outletId: '' };
  });

  function render(path: string, status?: UploadPauseStatus) {
    stores.session = { accessToken: 'token', outletId: 'o1' };
    stores.project = { tenantId: 't1', operatingRole: 'PC', scope: { outlets: [{ outletId: 'o1', outletName: 'Cuttack' }] } };
    const client = new QueryClient();
    if (status) client.setQueryData(uploadPauseKey('t1'), status);
    client.setQueryData(['p2-documents', 't1', 'j1'], { journeyId: 'j1', batches: [], documents: [], checklist: [] });
    client.setQueryData(['p2-360', 't1', 'j1', 'summary'], { journey: { journeyId: 'j1', reference: 'ADI-RD-261031-004', customerName: 'AZIZUR REHAMAN', outletName: 'Cuttack' } });
    return html(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes><Route path="/p2/journeys/:journeyId/documents" element={<P2JourneyWorkspacePage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('a booking opens and reads as usual, with the notice and no way to upload', () => {
    const page = render('/p2/journeys/j1/documents', { paused: true, message: 'Correcting', untilUtc: FAR });
    expect(page).toContain(NOTICE);
    expect(page).toContain('Adding documents to booking <strong>ADI-RD-261031-004</strong>');
    expect(page).toContain('p2w-upload is-paused');
    expect(page).toMatch(/<input[^>]*class="p2w-hidden-input"[^>]*type="file"[^>]*disabled=""/);
  });

  it('a new booking shows the same notice', () => {
    const page = render('/p2/journeys/new/documents', { paused: true, message: null, untilUtc: null });
    expect(page).toContain('New booking');
    expect(page).toContain('Uploads are paused for maintenance. You can still open bookings and work your tasks.');
    expect(page).toContain('p2w-upload is-paused');
  });

  it('shows nothing of it when uploads are open, the status is unknown, or the pause has ended', () => {
    for (const status of [undefined, { paused: false, message: null, untilUtc: null },
      { paused: true, message: null, untilUtc: '2020-01-01T00:00:00Z' }]) {
      const page = render('/p2/journeys/j1/documents', status);
      expect(page).not.toContain('Uploads are paused');
      expect(page).not.toContain('is-paused');
    }
  });
});

describe('the SuperAdmin switch on System Health', () => {
  function render(rows: UploadPauseRows) {
    const client = new QueryClient();
    client.setQueryData(UPLOAD_PAUSE_ADMIN_KEY, rows);
    return html(<QueryClientProvider client={client}><div className="p2w"><UploadPauseControl accessToken="t" /></div></QueryClientProvider>);
  }
  const row = { tenantId: null, paused: true, active: true, message: 'Correcting bookings', untilUtc: FAR,
    setByActorId: 'sa-1', setAtUtc: '2026-10-31T15:00:00Z' };

  it('shows the pause in force and offers to resume', () => {
    const page = render({ items: [row], serverTimeUtc: '2026-10-31T15:00:00Z' });
    expect(page).toContain('Uploads are paused for all Projects');
    expect(page).toContain('until 31 Dec, 11:30 pm IST');
    expect(page).toContain('Correcting bookings');
    expect(page).toContain('Last changed 31 Oct, 8:30 pm IST by sa-1.');
    expect(page).toContain('Resume uploads');
    expect(page).toContain('Update the pause');
  });

  it('shows uploads open, and Projects paused on their own', () => {
    const page = render({
      items: [{ ...row, paused: false, active: false, untilUtc: null }, { ...row, tenantId: 'tenant-a' }],
      serverTimeUtc: '2026-10-31T15:00:00Z',
    });
    expect(page).toContain('Uploads are open');
    expect(page).toContain('Pause uploads');
    expect(page).not.toContain('Resume uploads');
    expect(page).toContain('Also paused on its own for one Project:');
    expect(page).toContain('tenant-a');
  });
});
