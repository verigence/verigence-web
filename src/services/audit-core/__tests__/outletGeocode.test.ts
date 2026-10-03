import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FOUND = {
  latitude: 20.4625,
  longitude: 85.8828,
  formattedAddress: 'Cuttack Sadar, Cuttack, Odisha 753001, India',
  googlePlaceId: 'place-1',
  precision: 'ROOFTOP',
  approximate: false,
  partialMatch: false,
  resultCount: 1,
};

async function load() {
  vi.resetModules();
  vi.stubEnv('VITE_AUDIT_CORE_BASE_URL', 'https://audit.example.test');
  return import('../outletGeocode');
}

describe('geocodeOutletAddress', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('posts the address once to the tenant route with the bearer token', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(FOUND), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const { geocodeOutletAddress } = await load();

    const result = await geocodeOutletAddress('tenant-1', { addressText: 'Station Road', city: 'Cuttack' }, 'tok');

    expect(result.latitude).toBe(20.4625);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://audit.example.test/v1/tenants/tenant-1/outlet-location/geocode');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ addressText: 'Station Road', city: 'Cuttack' });
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('surfaces the server message on failure and never retries', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      errorCode: 'VAC-SYS-002',
      title: 'Service temporarily unavailable',
      detail: 'Google location lookup is not available right now. Pin the location instead.',
      status: 503,
    }), { status: 503, headers: { 'Content-Type': 'application/problem+json' } }));
    const { geocodeOutletAddress } = await load();

    await expect(geocodeOutletAddress('tenant-1', { city: 'Cuttack' }, 'tok')).rejects.toThrow(/Pin the location instead/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
