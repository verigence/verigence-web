import type { DataBacking } from '../domain/models';
import { runtimeConfig } from './runtime';
import * as core from './audit-core/operations';

export interface RepositoryContext {
  accessToken?: string;
}

export async function loadDailyOps(ctx: RepositoryContext = {}) {
  return {
    items: await core.listDailyOps(runtimeConfig.tenantId, runtimeConfig.defaultOutletId, ctx.accessToken),
    backing: 'CORE' as DataBacking,
  };
}
