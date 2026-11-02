import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import P2DuplicateBookingsPage from '../P2DuplicateBookingsPage';
import type { DeletedDuplicateBooking } from '../../services/audit-core/uc03P2';

// Server rendering reads a zustand store's initial state, so the page's two
// stores are stood in for by plain values.
vi.mock('../../store/projectContextStore', () => {
  const state = () => ({ selectedProject: { tenantId: 't1' }, projects: [] });
  return {
    useProjectContextStore: Object.assign((select: (s: ReturnType<typeof state>) => unknown) => select(state()),
      { getState: state, subscribe: () => () => undefined }),
  };
});
vi.mock('../../store/sessionStore', () => {
  const state = () => ({ accessToken: 'token' });
  return {
    useSessionStore: Object.assign((select: (s: ReturnType<typeof state>) => unknown) => select(state()),
      { getState: state, subscribe: () => () => undefined }),
  };
});

const deleted = {
  deletionId: 'd1',
  deletedAtUtc: '2026-11-02T06:00:00Z',
  status: 'COMPLETED',
  journeyId: 'j-new',
  journeyReference: 'ADI-RD-261102-002',
  keptJourneyId: 'j-old',
  keptJourneyReference: 'ADI-RD-261101-001',
  customerName: 'Amit Kumar Sahoo',
  pcName: 'Rakesh',
  dealerName: 'Adishakti',
  outletName: 'Rasulgarh',
  model: 'THAR',
  pan: 'ABCPE1234F',
  aadhaarMasked: 'XXXX XXXX 1234',
  mobile: '9876543210',
  bookingReference: 'BK/0012',
} as unknown as DeletedDuplicateBooking;

function render(path: string): string {
  const client = new QueryClient();
  client.setQueryData(['p2-duplicates-deleted', 't1'], { generatedAtUtc: '', items: [deleted] });
  client.setQueryData(['p2-duplicates', 't1', false], { generatedAtUtc: '', pairs: [] });
  const page = (node: ReactNode) => (
    <QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{node}</MemoryRouter></QueryClientProvider>
  );
  return renderToString(page(<P2DuplicateBookingsPage />)).replaceAll('<!-- -->', '');
}

describe('Duplicate bookings tabs', () => {
  it('opens on Possible duplicates, with the Deleted tab beside it', () => {
    const html = render('/p2/duplicate-bookings');
    expect(html).toMatch(/<button[^>]*role="tab"[^>]*aria-selected="true"[^>]*>Possible duplicates/);
    expect(html).toMatch(/<button[^>]*role="tab"[^>]*aria-selected="false"[^>]*>Deleted/);
    expect(html).toContain('No possible duplicate bookings.');
    expect(html).not.toContain('ABCPE1234F');
  });

  it('lists each deleted booking with PAN and mobile in full and the Aadhaar masked', () => {
    const html = render('/p2/duplicate-bookings?tab=deleted');
    expect(html).toMatch(/<button[^>]*aria-selected="true"[^>]*>Deleted/);
    for (const value of ['Amit Kumar Sahoo', 'BK/0012', 'ABCPE1234F', 'XXXX XXXX 1234', '9876543210', 'THAR',
      'Rakesh', 'Adishakti · Rasulgarh', 'ADI-RD-261102-002', 'ADI-RD-261101-001']) {
      expect(html).toContain(value);
    }
    expect(html).toContain('href="/p2/journeys/j-old/overview"');
    expect(html).toContain('data-label="Aadhaar"');
  });
});
