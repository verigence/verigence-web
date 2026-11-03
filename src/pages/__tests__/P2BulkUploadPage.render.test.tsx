import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import P2BulkUploadPage from '../P2BulkUploadPage';
import type { BulkUploadList } from '../../services/audit-core/uc03BulkUpload';

vi.mock('../../store/projectContextStore', () => {
  const state = () => ({
    selectedProject: { tenantId: 't1', operatingRole: 'PC', scope: { outlets: [
      { outletId: 'o1', outletName: 'Rasulgarh', dealerName: 'Adishakti' },
      { outletId: 'o2', outletName: 'Patia', dealerName: 'Adishakti' }] } },
    projects: [],
  });
  return {
    useProjectContextStore: Object.assign((select: (s: ReturnType<typeof state>) => unknown) => select(state()),
      { getState: state, subscribe: () => () => undefined }),
  };
});
vi.mock('../../store/sessionStore', () => {
  const state = () => ({ accessToken: 'token', outletId: 'o2', displayName: 'Ravi' });
  return {
    useSessionStore: Object.assign((select: (s: ReturnType<typeof state>) => unknown) => select(state()),
      { getState: state, subscribe: () => () => undefined }),
  };
});

const list: BulkUploadList = {
  inProgress: 1, multiOutlet: true,
  items: [{
    bulkId: 'b1', outletId: 'o2', dealerId: 'd1', status: 'PROCESSING', folder: 'p2-bulk/t1/Adishakti/Patia/2026-11-03',
    fileCount: 3, summary: {}, createdAtUtc: '2026-11-03T04:00:00Z', submittedAtUtc: '2026-11-03T04:05:00Z', finishedAtUtc: null,
    files: [
      { fileId: 'f1', filename: 'Asha Das delivery.pdf', sizeBytes: 100, uploaded: true, outcome: 'ADDED_TO_BOOKING',
        journeyId: 'j1', journeyReference: 'ADI-PA-261101-004', detail: 'Added to ADI-PA-261101-004: tax invoice tally' },
      { fileId: 'f2', filename: 'again.pdf', sizeBytes: 100, uploaded: true, outcome: 'EXACT_DUPLICATE',
        journeyId: 'j2', journeyReference: 'ADI-PA-261030-001', detail: null },
      { fileId: 'f3', filename: 'IMG_0042.pdf', sizeBytes: 100, uploaded: true, outcome: 'READING',
        journeyId: 'j3', journeyReference: null, detail: null },
    ],
  }],
};

function render(): string {
  const client = new QueryClient();
  client.setQueryData(['p2-bulk-uploads', 't1'], list);
  return renderToString(
    <QueryClientProvider client={client}><MemoryRouter><P2BulkUploadPage /></MemoryRouter></QueryClientProvider>,
  ).replaceAll('<!-- -->', '');
}

describe('Bulk upload page', () => {
  it('uploads for the selected outlet and lists where each file went', () => {
    const html = render();
    expect(html).toContain('Files for Patia');
    expect(html).toContain('Drag and drop files here');
    expect(html).toContain('Processing');
    expect(html).toContain('Added to booking');
    expect(html).toContain('Exact duplicate — not read');
    expect(html).toContain('Being read');
    expect(html).toContain('href="/p2/journeys/j1/documents"');
  });
});
