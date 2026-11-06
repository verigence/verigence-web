import { describe, expect, it } from 'vitest';

import { accessLocationsPath, mapLink } from '../../services/audit-core/accessLocations';

describe('sign-in locations', () => {
  it('reads the Project report or the SuperAdmin one', () => {
    expect(accessLocationsPath('project', 't 1')).toBe('/p2/v1/tenants/t%201/access-locations');
    expect(accessLocationsPath('admin', 't')).toBe('/v1/admin/tenants/t/access-locations');
  });

  it('links a place to Google Maps', () => {
    expect(mapLink(20.51881, 85.88)).toBe('https://www.google.com/maps/search/?api=1&query=20.51881,85.88000');
  });
});
