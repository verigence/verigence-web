import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MissingDocumentsDay } from '../uc03MissingDocuments';

async function load() {
  vi.resetModules();
  vi.stubEnv('VITE_AUDIT_CORE_BASE_URL', 'https://audit.example.test');
  return import('../uc03MissingDocuments');
}

const journey = (id: string, keys: string[], names: string[]) => ({
  journeyId: id, reference: id, customer: id, dealerId: 'd', dealerName: 'D', outletId: 'o', outletName: 'O',
  pcName: 'P', basis: 'GATE_PASS' as const, uploadDay: '2026-11-01', documents: names, requirementKeys: keys,
});

const days: MissingDocumentsDay[] = [
  { date: '2026-11-02', label: 'Mon 2 Nov', journeys: [journey('j1', ['rsa', 'form_21'], ['RSA Invoice', 'Form 21'])] },
  { date: '2026-11-01', label: 'Sun 1 Nov', journeys: [journey('j2', ['form_21'], ['Form 21']), journey('j3', ['rsa'], ['RSA Invoice'])] },
];

describe('missing documents client', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('asks for the period and outlet', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ days: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const { getMissingDocuments } = await load();
    await getMissingDocuments('t1', { from: '2026-10-27', outletId: 'o1' }, 'tok');
    expect(fetchMock.mock.calls[0][0]).toBe('https://audit.example.test/p2/v1/tenants/t1/missing-documents?from=2026-10-27&outletId=o1');
  });

  it('narrows the days to one document type', async () => {
    const { filterDaysByDocument } = await load();
    expect(filterDaysByDocument(days, null)).toBe(days);
    const rsa = filterDaysByDocument(days, 'rsa');
    expect(rsa.map((d) => d.journeys.map((j) => [j.journeyId, j.documents]))).toEqual([
      [['j1', ['RSA Invoice']]],
      [['j3', ['RSA Invoice']]],
    ]);
    expect(filterDaysByDocument(days, 'insurance')).toEqual([]);
  });

  it('counts the period back from today in IST', async () => {
    const { periodStart } = await load();
    // 20:00 UTC on 1 Nov is already 2 Nov in IST.
    expect(periodStart(7, new Date('2026-11-01T20:00:00Z'))).toBe('2026-10-27');
    expect(periodStart(1, new Date('2026-11-01T20:00:00Z'))).toBe('2026-11-02');
  });
});
