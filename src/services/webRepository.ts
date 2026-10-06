import {
  demoCrmInteractions,
  demoDailyOps,
  demoDealers,
  demoEscalations,
  demoEvidenceByJourney,
  demoEvidenceFacts,
  demoFindings,
  demoJourneys,
  demoOutlets,
  demoProject,
  demoReviews,
  demoStageData,
  demoTasks,
} from '../data/demoData';
import type {
  CustomerSummary,
  DashboardModel,
  DataBacking,
  EvidenceFact,
  EvidenceSummary,
  JourneySummary,
  JourneyWorkspaceModel,
  UserRole,
} from '../domain/models';
import { runtimeConfig } from './runtime';
import * as core from './audit-core/operations';

export interface RepositoryContext {
  accessToken?: string;
}

function demoDelay<T>(value: T): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), 90));
}

function mapCoreCustomer(row: core.CoreCustomer): CustomerSummary {
  return {
    customerId: row.customerId,
    displayName: row.displayName,
    mobileLast4: row.mobileLast4,
    emailReference: row.emailReference,
    externalCustomerRef: row.externalCustomerRef,
    status: row.status,
    outletId: row.outletId,
    dealerId: row.dealerId,
  };
}

async function optional<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

// Aggregate queue APIs are not exposed by Audit Core yet. These specific screens use Web-only data until those APIs exist.
export async function loadDailyOps(ctx: RepositoryContext = {}) {
  return {
    items: await core.listDailyOps(runtimeConfig.tenantId, runtimeConfig.defaultOutletId, ctx.accessToken),
    backing: 'CORE' as DataBacking,
  };
}

export function loadCrmRegister() {
  return demoDelay({ items: demoCrmInteractions, backing: 'WEB_DEMO' as DataBacking });
}

export function loadEscalationsRegister() {
  return demoDelay({ items: demoEscalations, backing: 'WEB_DEMO' as DataBacking });
}
