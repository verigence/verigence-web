import { beforeEach, describe, expect, it, vi } from 'vitest';

// A plain function (not a spy) stands in for the HTTP call, so a refusal is just a rejected promise.
let respond: (path: string) => Promise<unknown> = () => Promise.resolve({});
const paths: string[] = [];
vi.mock('./client', async () => {
  const actual = await vi.importActual<typeof import('./client')>('./client');
  return {
    ...actual,
    auditCoreRequest: (path: string) => {
      paths.push(path);
      return respond(path);
    },
  };
});

import { AuditCoreHttpError } from './client';
import { runSkuResolutionBatch, runSkuResolutionForProject } from './skuResolution';

const done = { runId: 'r1', journeysTotal: 2, nextOffset: null, journeysConsidered: 1, journeysProcessed: 1, journeysFailed: [] };

describe('SKU run modes', () => {
  beforeEach(() => {
    paths.length = 0;
  });

  it('asks for the mode on every batch, defaulting to the old run', async () => {
    respond = () => Promise.resolve(done);
    await runSkuResolutionBatch('t 1', 0, undefined, 'tok');
    await runSkuResolutionBatch('t 1', 1, 'run/1', 'tok', 'RERESOLVE_DRY_RUN');
    expect(paths[0]).toBe('/v1/tenants/t%201/admin/backfill/sku-resolution?offset=0&limit=1&mode=RESOLVE');
    expect(paths[1]).toContain('mode=RERESOLVE_DRY_RUN&runId=run%2F1');
  });

  it('carries the mode through the whole run', async () => {
    const answers = [{ ...done, nextOffset: 1 }, { ...done, nextOffset: null }];
    respond = () => Promise.resolve(answers.shift());
    const cursor = { offset: 0, processed: 0, total: 0 };
    await runSkuResolutionForProject('t', 'tok', cursor, () => undefined, 'RERESOLVE_COMMIT');
    expect(paths.map((p) => p.includes('mode=RERESOLVE_COMMIT'))).toEqual([true, true]);
    expect(cursor.processed).toBe(2);
  });

  it('does not retry a refusal (Apply without a fresh check answers 409)', async () => {
    respond = () => Promise.reject(new AuditCoreHttpError(409, { detail: 'There is no completed check of this Project.' }));
    await expect(
      runSkuResolutionForProject('t', 'tok', { offset: 0, processed: 0, total: 0 }, () => undefined, 'RERESOLVE_COMMIT'),
    ).rejects.toThrow('no completed check');
    expect(paths).toHaveLength(1);
  });
});
