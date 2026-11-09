import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SevaSutraInstanceCard from '../SevaSutraInstanceCard';
import type { SevaSutraInstance } from '../../../services/audit-core/uc02Admin';

function render(instance: SevaSutraInstance | null, canManage: boolean) {
  const client = new QueryClient();
  client.setQueryData(['sevasutra-instance', 't1'], { instance });
  return renderToString(
    <QueryClientProvider client={client}>
      <SevaSutraInstanceCard tenantId="t1" projectName="Kalinga Group - Service Audit" accessToken="x" canManage={canManage} />
    </QueryClientProvider>,
  );
}

const live: SevaSutraInstance = {
  tenantId: 't1', dealershipName: 'Kalinga Motors', subdomain: 'kalinga', status: 'LIVE', statusMessage: null,
  dealerCode: 'kalinga-motors', liveHostname: 'kalinga.sevasutra.jbrconsulting.in', requestedAtUtc: '2026-11-09T05:00:00Z', reportedAtUtc: '2026-11-09T05:10:00Z',
};

describe('SevaSutra instance card', () => {
  it('offers a Super Admin the creation, with the address suggested from the Project name', () => {
    const html = render(null, true);
    expect(html).toContain('Create SevaSutra instance');
    expect(html).toContain('value="kalinga"');
    expect(html).toContain('.sevasutra.jbrconsulting.in');
  });

  it('tells anyone else a Super Admin creates it', () => {
    const html = render(null, false);
    expect(html).not.toContain('Create SevaSutra instance');
    expect(html).toContain('A Super Admin creates it here');
  });

  it('shows a live instance with its address and a link to it', () => {
    const html = render(live, true);
    expect(html).toContain('Kalinga Motors');
    expect(html).toContain('href="https://kalinga.sevasutra.jbrconsulting.in"');
    expect(html).toContain('Change name or address');
  });

  it('shows why an address could not go live', () => {
    const html = render({ ...live, status: 'FAILED', statusMessage: 'Could not put the address live: zone not found' }, true);
    expect(html).toContain('zone not found');
    expect(html).toContain('Change address and try again');
    expect(html).not.toContain('Open SevaSutra');
  });
});
