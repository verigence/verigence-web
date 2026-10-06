import { describe, expect, it } from 'vitest';

import { visibleNavGroups } from '../features/rollout/featureFlags';
import { priceMasterNavItems } from './priceMasterNav';

describe('price master menu entries', () => {
  it('PC searches, TL and PM search and upload, everyone else sees nothing', () => {
    expect(priceMasterNavItems('PC').map((i) => i.to)).toEqual(['/price-masters']);
    expect(priceMasterNavItems('TL').map((i) => i.to)).toEqual(['/price-masters', '/price-masters/upload']);
    expect(priceMasterNavItems('PM').map((i) => i.to)).toEqual(['/price-masters', '/price-masters/upload']);
    expect(priceMasterNavItems('CRM')).toEqual([]);
    expect(priceMasterNavItems('EXECUTIVE')).toEqual([]);
  });

  it('they are drawn: the Audit group is shown when Audit is on, and the retired Workspace group never is', () => {
    const groups = [{ key: 'phase2' }, { key: 'workspace' }];
    expect(visibleNavGroups(groups, { AUDIT: true, ANALYTICS: false }).map((g) => g.key)).toEqual(['phase2']);
  });
});
