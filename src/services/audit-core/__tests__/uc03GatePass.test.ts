import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function load() {
  vi.resetModules();
  vi.stubEnv('VITE_AUDIT_CORE_BASE_URL', 'https://audit.example.test');
  return import('../uc03GatePass');
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('gate pass client', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('uploads the photo as multipart with the outlet and PC name', async () => {
    fetchMock.mockResolvedValue(json({ gatePassId: 'g1' }));
    const { uploadGatePass } = await load();
    await uploadGatePass('t1', { outletId: 'o1', pcName: 'Asha', file: new Blob(['x'], { type: 'image/jpeg' }), filename: 'a.jpg' }, 'tok');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://audit.example.test/p2/v1/tenants/t1/gate-passes');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('outletId')).toBe('o1');
    expect((init.body as FormData).get('pcName')).toBe('Asha');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('asks for one outlet or one dealer, outlet first', async () => {
    fetchMock.mockResolvedValue(json({ days: [] }));
    const { getGatePassCalendar } = await load();
    await getGatePassCalendar('t1', { month: '2026-10', outletId: 'o1', dealerId: 'd1' }, 'tok');
    expect(fetchMock.mock.calls[0][0]).toBe('https://audit.example.test/p2/v1/tenants/t1/gate-passes/calendar?month=2026-10&outletId=o1');
  });

  it('shows the plain sentence Audit Core gave for a refused photo', async () => {
    fetchMock.mockResolvedValue(json({ detail: 'The photo is blurred. Take it again.', status: 422 }, 422));
    const { uploadGatePass, gatePassErrorText } = await load();
    const cause = await uploadGatePass('t1', { outletId: 'o1', file: new Blob(['x']), filename: 'a.jpg' }, 'tok').catch((e) => e);
    expect(gatePassErrorText(cause, 'fallback')).toBe('The photo is blurred. Take it again.');
  });
});
