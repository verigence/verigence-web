import {
  demoCrmInteractions,
  demoCustomers,
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

export async function loadCustomers(ctx: RepositoryContext = {}): Promise<{ items: CustomerSummary[]; backing: DataBacking }> {
  if (runtimeConfig.mode === 'demo') return demoDelay({ items: demoCustomers, backing: 'WEB_DEMO' });
  const rows = await core.listCustomers(runtimeConfig.tenantId, runtimeConfig.defaultOutletId, ctx.accessToken);
  return { items: rows.map(mapCoreCustomer), backing: 'CORE' };
}

export async function loadJourneys(ctx: RepositoryContext = {}): Promise<{ items: JourneySummary[]; backing: DataBacking }> {
  if (runtimeConfig.mode === 'demo') return demoDelay({ items: demoJourneys, backing: 'WEB_DEMO' });

  const [customers, dealers] = await Promise.all([
    core.listCustomers(runtimeConfig.tenantId, runtimeConfig.defaultOutletId, ctx.accessToken),
    core.listDealers(runtimeConfig.tenantId, ctx.accessToken),
  ]);
  const dealerMap = new Map(dealers.map((dealer) => [dealer.dealerId, dealer.dealerName]));
  const outletCache = new Map<string, string>();
  for (const dealer of dealers) {
    const outlets = await core.listOutlets(runtimeConfig.tenantId, dealer.dealerId, ctx.accessToken);
    for (const outlet of outlets) outletCache.set(outlet.outletId, outlet.outletName);
  }

  const lists = await Promise.all(
    customers.map(async (customer) => ({
      customer,
      journeys: await core.listJourneys(runtimeConfig.tenantId, customer.customerId, ctx.accessToken),
    })),
  );

  const items: JourneySummary[] = [];
  for (const { customer, journeys } of lists) {
    for (const journey of journeys) {
      const evidence = await core.listEvidence(runtimeConfig.tenantId, journey.journeyId, ctx.accessToken).catch(() => []);
      const findings = await core.listFindings(runtimeConfig.tenantId, journey.journeyId, ctx.accessToken).catch(() => []);
      const booking = await core.getBooking(runtimeConfig.tenantId, journey.journeyId, ctx.accessToken).catch(() => null);
      const product = booking && typeof booking.product === 'object' && booking.product ? (booking.product as Record<string, unknown>) : null;
      items.push({
        journeyId: journey.journeyId,
        customerId: customer.customerId,
        customerName: customer.displayName,
        journeyReference: journey.journeyReference,
        bookingReference: booking ? String(booking.bookingReference ?? '') || null : null,
        productLabel: product ? [product.modelName, product.variantName, product.colourName].filter(Boolean).join(' · ') : null,
        outletName: outletCache.get(journey.outletId) || journey.outletId,
        dealerName: dealerMap.get(journey.dealerId) || journey.dealerId,
        auditState: journey.auditState,
        auditOutcome: journey.auditOutcome,
        observedStatusCode: journey.observedStatusCode,
        actualDeliveryStatusCode: journey.actualDeliveryStatusCode,
        evidenceCount: evidence.length,
        findingCount: findings.length,
        updatedAt: new Date().toISOString(),
      });
    }
  }
  return { items, backing: 'CORE' };
}

export async function loadDashboard(role: UserRole, ctx: RepositoryContext = {}): Promise<DashboardModel> {
  const journeyResult = await loadJourneys(ctx).catch(() => ({ items: demoJourneys, backing: 'WEB_DEMO' as DataBacking }));
  const openJourneys = journeyResult.items.filter((item) => item.auditState !== 'COMPLETED').length;
  const exceptionCount = journeyResult.items.reduce((sum, item) => sum + item.findingCount, 0);
  const metricsByRole: Record<UserRole, DashboardModel['metrics']> = {
    PC: [
      { label: 'Active journeys', value: String(openJourneys), detail: 'Evidence collection and submission work' },
      { label: 'Evidence pending', value: '8', detail: 'Documents processing or awaiting capture' },
      { label: 'Sent back', value: String(journeyResult.items.filter((j) => j.auditState === 'SENT_BACK').length), detail: 'Needs PC attention' },
      { label: 'Today complete', value: '14', detail: 'Journeys submitted today' },
    ],
    TL: [
      { label: 'Review queue', value: String(demoReviews.filter((r) => r.assignedRole === 'TL').length), detail: 'PC submissions awaiting TL action' },
      { label: 'High risk', value: '3', detail: 'High / critical items in scope' },
      { label: 'Open findings', value: String(exceptionCount), detail: 'Across active journeys' },
      { label: 'SLA at risk', value: '2', detail: 'Due in the next 90 minutes' },
    ],
    PM: [
      { label: 'PM decisions', value: String(demoReviews.filter((r) => r.assignedRole === 'PM').length), detail: 'Escalated review decisions' },
      { label: 'Critical cases', value: '1', detail: 'Requires PM disposition' },
      { label: 'Open escalations', value: String(demoEscalations.filter((e) => e.status === 'OPEN').length), detail: 'Across assigned outlets' },
      { label: 'Breach rate', value: '4.8%', detail: 'Current rolling period' },
    ],
    CRM: [
      { label: 'CRM work', value: String(demoCrmInteractions.length), detail: 'Open customer interactions' },
      { label: 'Follow-ups due', value: '5', detail: 'Due today' },
      { label: 'Escalated', value: '1', detail: 'Needs operational support' },
      { label: 'Completed today', value: '18', detail: 'Customer interactions closed' },
    ],
    TENANT_ADMIN: [
      { label: 'Active dealers', value: String(demoDealers.length), detail: 'Tenant dealer hierarchy' },
      { label: 'Active outlets', value: String(demoOutlets.length), detail: 'Configured locations' },
      { label: 'Access requests', value: '2', detail: 'Pending approval' },
      { label: 'Active users', value: '47', detail: 'Across operational roles' },
    ],
    SUPER_ADMIN: [
      { label: 'Active tenants', value: '4', detail: 'Platform organizations' },
      { label: 'Access requests', value: '4', detail: 'Pending across tenants' },
      { label: 'Platform users', value: '182', detail: 'Active identities' },
      { label: 'Core health', value: 'Healthy', detail: 'Web preview status' },
    ],
  };
  return {
    role,
    metrics: metricsByRole[role],
    priorityWork: demoReviews,
    recentJourneys: journeyResult.items.slice(0, 4),
    backing: journeyResult.backing === 'CORE' ? 'HYBRID' : 'WEB_DEMO',
  };
}

async function optional<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

export async function loadJourneyWorkspace(journeyId: string, ctx: RepositoryContext = {}): Promise<JourneyWorkspaceModel> {
  if (runtimeConfig.mode === 'demo') {
    const journey = demoJourneys.find((item) => item.journeyId === journeyId) || demoJourneys[0];
    const customer = demoCustomers.find((item) => item.customerId === journey.customerId) || demoCustomers[0];
    return demoDelay({
      journey,
      customer,
      evidence: demoEvidenceByJourney[journey.journeyId] || [],
      findings: demoFindings.filter((item) => item.journeyId === journey.journeyId),
      stages: demoStageData[journey.journeyId] as JourneyWorkspaceModel['stages'],
      backing: 'WEB_DEMO',
    });
  }

  const journey = await core.getJourney(runtimeConfig.tenantId, journeyId, ctx.accessToken);
  const customer = await core.getCustomer(runtimeConfig.tenantId, journey.customerId, ctx.accessToken);
  const [booking, commercials, payments, finance, insurance, tradeIn, vehicle, registration, delivery, evidence, findings, audit] =
    await Promise.all([
      optional(core.getBooking(runtimeConfig.tenantId, journeyId, ctx.accessToken)),
      optional(core.getCommercials(runtimeConfig.tenantId, journeyId, ctx.accessToken)),
      core.listPayments(runtimeConfig.tenantId, journeyId, ctx.accessToken).catch(() => []),
      optional(core.getFinance(runtimeConfig.tenantId, journeyId, ctx.accessToken)),
      optional(core.getInsurance(runtimeConfig.tenantId, journeyId, ctx.accessToken)),
      optional(core.getTradeIn(runtimeConfig.tenantId, journeyId, ctx.accessToken)),
      optional(core.getVehicle(runtimeConfig.tenantId, journeyId, ctx.accessToken)),
      optional(core.getRegistration(runtimeConfig.tenantId, journeyId, ctx.accessToken)),
      optional(core.getDelivery(runtimeConfig.tenantId, journeyId, ctx.accessToken)),
      core.listEvidence(runtimeConfig.tenantId, journeyId, ctx.accessToken).catch(() => []),
      core.listFindings(runtimeConfig.tenantId, journeyId, ctx.accessToken).catch(() => []),
      optional(core.getAuditState(runtimeConfig.tenantId, journeyId, ctx.accessToken)),
    ]);
  const product = booking && typeof booking.product === 'object' && booking.product ? (booking.product as Record<string, unknown>) : null;
  const summary: JourneySummary = {
    journeyId: journey.journeyId,
    customerId: journey.customerId,
    customerName: customer.displayName,
    journeyReference: journey.journeyReference,
    bookingReference: booking ? String(booking.bookingReference ?? '') || null : null,
    productLabel: product ? [product.modelName, product.variantName, product.colourName].filter(Boolean).join(' · ') : null,
    outletName: journey.outletId,
    dealerName: journey.dealerId,
    auditState: journey.auditState,
    auditOutcome: journey.auditOutcome,
    observedStatusCode: journey.observedStatusCode,
    actualDeliveryStatusCode: journey.actualDeliveryStatusCode,
    evidenceCount: evidence.length,
    findingCount: findings.length,
    updatedAt: new Date().toISOString(),
  };
  return {
    journey: summary,
    customer: mapCoreCustomer(customer),
    evidence,
    findings,
    stages: {
      booking,
      commercials,
      payment: { payments },
      finance,
      insurance,
      tradeIn,
      vehicle,
      registration,
      delivery,
      review: audit ? { ...audit } : null,
    },
    backing: 'CORE',
  };
}

export async function loadEvidenceDetail(
  journeyId: string,
  evidenceId: string,
  ctx: RepositoryContext = {},
): Promise<{ evidence: EvidenceSummary; facts: EvidenceFact[]; backing: DataBacking }> {
  if (runtimeConfig.mode === 'demo') {
    const evidence = Object.values(demoEvidenceByJourney).flat().find((item) => item.evidenceId === evidenceId) || demoEvidenceByJourney[demoJourneys[0].journeyId][0];
    return demoDelay({ evidence, facts: demoEvidenceFacts[evidence.evidenceId] || [], backing: 'WEB_DEMO' });
  }
  const detail = await core.getEvidence(runtimeConfig.tenantId, journeyId, evidenceId, ctx.accessToken);
  return { evidence: detail, facts: detail.facts, backing: 'CORE' };
}

export async function loadTasks(ctx: RepositoryContext = {}) {
  if (runtimeConfig.mode === 'demo') return demoDelay({ items: demoTasks, backing: 'WEB_DEMO' as DataBacking });
  return { items: await core.listTasks(runtimeConfig.tenantId, ctx.accessToken), backing: 'CORE' as DataBacking };
}

export async function loadOrganization(ctx: RepositoryContext = {}) {
  if (runtimeConfig.mode === 'demo') {
    return demoDelay({ project: demoProject, dealers: demoDealers, outlets: demoOutlets, backing: 'WEB_DEMO' as DataBacking });
  }
  const [project, dealers] = await Promise.all([
    core.getProject(runtimeConfig.tenantId, ctx.accessToken),
    core.listDealers(runtimeConfig.tenantId, ctx.accessToken),
  ]);
  const outletGroups = await Promise.all(
    dealers.map((dealer) => core.listOutlets(runtimeConfig.tenantId, dealer.dealerId, ctx.accessToken)),
  );
  return { project, dealers, outlets: outletGroups.flat(), backing: 'CORE' as DataBacking };
}

export function loadReviews() {
  return demoDelay({ items: demoReviews, backing: 'WEB_DEMO' as DataBacking });
}

export function loadFindingsRegister() {
  return demoDelay({ items: demoFindings, backing: 'WEB_DEMO' as DataBacking });
}

export function loadEvidenceRegister() {
  return demoDelay({ items: Object.values(demoEvidenceByJourney).flat(), backing: 'WEB_DEMO' as DataBacking });
}

export async function loadDailyOps(ctx: RepositoryContext = {}) {
  if (runtimeConfig.mode === 'demo') return demoDelay({ items: demoDailyOps, backing: 'WEB_DEMO' as DataBacking });
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
