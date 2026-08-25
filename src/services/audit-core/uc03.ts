import type { OperatingRole } from '../../domain/models';
import { auditCoreRequest } from './client';

export interface OperationalOutletScope {
  dealerId: string;
  dealerName: string;
  outletId: string;
  outletName: string;
  outletClassification: string;
}

export interface ProjectScopeSummary {
  allDealers: boolean;
  dealerCount: number;
  outletCount: number;
  outlets: OperationalOutletScope[];
}

export interface OperationalProject {
  tenantId: string;
  projectCode: string;
  projectName: string;
  projectStatus: 'ACTIVE';
  timezoneName: string;
  operatingRole: OperatingRole;
  scope: ProjectScopeSummary;
}

interface RawOperationalProject extends Omit<OperationalProject, 'operatingRole'> {
  operatingRole: string;
}

interface MyProjectsResponse {
  projects: RawOperationalProject[];
}

export type Uc03WorkType = 'ALL' | 'BOOKING' | 'DELIVERY';

export interface Uc03StageSummary {
  businessStatus: string | null;
  auditState: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE';
  auditStatus: 'NOT_EVALUATED' | 'NO_FLAGS' | 'FLAGS_RAISED';
  businessDate: string | null;
}

export interface Uc03WorkItem {
  journeyId: string;
  bookingReference: string | null;
  customerDisplayName: string;
  customerMobileLast4: string | null;
  productLabel: string | null;
  projectName: string;
  dealerId: string;
  dealerName: string;
  outletId: string;
  outletName: string;
  booking: Uc03StageSummary;
  delivery: Uc03StageSummary;
  openFlagCount: number;
  totalFlagCount: number;
  highestOpenSeverity: string | null;
  processingDocumentCount: number;
  proposalReadyCount: number;
  latestActivityAtUtc: string;
  nextActionCode: string | null;
}

export interface Uc03WorkItemPage {
  items: Uc03WorkItem[];
  pageSize: number;
  nextCursor: string | null;
  previousCursor: string | null;
  filters: {
    workType: Uc03WorkType;
    fromDate: string | null;
    toDate: string | null;
    timezoneName: string;
    outletId?: string | null;
  };
}

export interface Uc03LandingMetrics {
  bookingsInProgress: number;
  deliveryInProgress: number;
  needsAttention: number;
  auditFlags: number;
  auditInProgress: number;
}

export interface Uc03WorkItemFilters {
  workType: Uc03WorkType;
  fromDate?: string;
  toDate?: string;
  outletId?: string;
  cursor?: string;
}

function accessTokenRequired(accessToken?: string): string {
  const token = accessToken?.trim();
  if (!token) throw new Error('A Security human access token is required.');
  return token;
}

function normalizeOperatingRole(role: string): OperatingRole {
  switch (role.trim().toUpperCase()) {
    case 'PC': return 'PC';
    case 'TL': return 'TL';
    case 'PM': return 'PM';
    case 'CRM': return 'CRM';
    case 'EXECUTIVE': return 'EXECUTIVE';
    default: throw new Error('This Project has an unsupported operating role.');
  }
}

export async function listMyOperationalProjects(
  accessToken?: string,
): Promise<OperationalProject[]> {
  const response = await auditCoreRequest<MyProjectsResponse>('/v1/me/projects', {
    accessToken: accessTokenRequired(accessToken),
    cache: 'no-store',
  });
  return response.projects.map((project) => ({
    ...project,
    operatingRole: normalizeOperatingRole(project.operatingRole),
    scope: {
      ...project.scope,
      outlets: project.scope.outlets || [],
    },
  }));
}

export async function getUc03LandingMetrics(
  tenantId: string,
  outletId: string | undefined,
  accessToken?: string,
): Promise<Uc03LandingMetrics> {
  const search = new URLSearchParams();
  if (outletId) search.set('outletId', outletId);
  const suffix = search.size ? `?${search.toString()}` : '';
  return auditCoreRequest<Uc03LandingMetrics>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/uc03/landing-metrics${suffix}`,
    {
      accessToken: accessTokenRequired(accessToken),
      cache: 'no-store',
    },
  );
}

export async function listUc03WorkItems(
  tenantId: string,
  filters: Uc03WorkItemFilters,
  accessToken?: string,
): Promise<Uc03WorkItemPage> {
  const search = new URLSearchParams();
  search.set('workType', filters.workType);
  search.set('limit', '10');
  if (filters.fromDate) search.set('fromDate', filters.fromDate);
  if (filters.toDate) search.set('toDate', filters.toDate);
  if (filters.outletId) search.set('outletId', filters.outletId);
  if (filters.cursor) search.set('cursor', filters.cursor);

  return auditCoreRequest<Uc03WorkItemPage>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/uc03/work-items?${search.toString()}`,
    {
      accessToken: accessTokenRequired(accessToken),
      cache: 'no-store',
    },
  );
}
