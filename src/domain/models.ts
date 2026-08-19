export type UserRole = 'PC' | 'TL' | 'PM' | 'CRM' | 'TENANT_ADMIN' | 'SUPER_ADMIN';
export type DataBacking = 'CORE' | 'WEB_DEMO' | 'HYBRID';
export type JourneyStageKey =
  | 'booking'
  | 'commercials'
  | 'payment'
  | 'finance'
  | 'insurance'
  | 'tradeIn'
  | 'vehicle'
  | 'registration'
  | 'delivery'
  | 'review';

export interface CustomerSummary {
  customerId: string;
  displayName: string;
  mobileLast4?: string | null;
  emailReference?: string | null;
  externalCustomerRef?: string | null;
  status: string;
  outletId: string;
  dealerId: string;
}

export interface JourneySummary {
  journeyId: string;
  customerId: string;
  customerName: string;
  journeyReference?: string | null;
  bookingReference?: string | null;
  productLabel?: string | null;
  outletName: string;
  dealerName: string;
  auditState: string;
  auditOutcome: string;
  observedStatusCode?: string | null;
  actualDeliveryStatusCode?: string | null;
  evidenceCount: number;
  findingCount: number;
  updatedAt: string;
}

export interface EvidenceSummary {
  evidenceId: string;
  journeyId: string;
  documentTypeKey?: string | null;
  evidencePurpose: string;
  processingStatus: string;
  verificationStatus?: string | null;
  createdAtUtc: string;
  filename?: string;
  sourceLabel?: string;
}

export interface EvidenceFact {
  evidenceFactId: string;
  fieldKey: string;
  valueType: string;
  value: unknown;
  normalizedValue?: string | null;
  confidenceScore?: number | null;
  verificationStatus?: string | null;
  source?: string;
}

export interface FindingSummary {
  auditFindingId: string;
  journeyId: string;
  journeyReference: string;
  severity: string;
  findingStatus: string;
  title: string;
  description?: string | null;
  expectedSummary?: string | null;
  observedSummary?: string | null;
  resolutionReason?: string | null;
}

export interface WorkTask {
  taskId: string;
  taskType: string;
  status: string;
  dueAtUtc?: string | null;
  assignedActorId?: string | null;
  assignedRole?: string | null;
  journeyId?: string;
  journeyReference?: string;
  customerName?: string;
  outletName?: string;
}

export interface ReviewQueueItem {
  taskId: string;
  journeyId: string;
  journeyReference: string;
  customerName: string;
  outletName: string;
  submittedAt: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  evidenceCount: number;
  exceptionCount: number;
  assignedRole: 'TL' | 'PM';
}

export interface DailyOpsRun {
  runId: string;
  outletId: string;
  outletName: string;
  businessDate: string;
  pcActorId: string;
  status: string;
  startedAtUtc: string;
  completedAtUtc?: string | null;
}

export interface CrmInteraction {
  crmInteractionId: string;
  journeyId: string;
  journeyReference: string;
  customerName: string;
  interactionType: string;
  interactionStatus: string;
  outcomeCode?: string | null;
  notes?: string | null;
  attemptedAtUtc?: string | null;
  completedAtUtc?: string | null;
}

export interface EscalationSummary {
  escalationId: string;
  journeyId: string;
  journeyReference: string;
  escalationType: string;
  severity: string;
  status: string;
  assignedRoleCode?: string | null;
  summary: string;
  openedAtUtc: string;
  resolvedAtUtc?: string | null;
}

export interface DealerSummary {
  dealerId: string;
  dealerCode: string;
  dealerName: string;
  legalName?: string | null;
  status: string;
}

export interface OutletSummary {
  outletId: string;
  dealerId: string;
  outletCode: string;
  outletName: string;
  outletClassification: string;
  city?: string | null;
  stateRegion?: string | null;
  postalCode?: string | null;
  status: string;
}

export interface ProjectSummary {
  tenantId: string;
  projectCode: string;
  projectName: string;
}

export interface DashboardMetric {
  label: string;
  value: string;
  detail: string;
  trend?: string;
}

export interface DashboardModel {
  role: UserRole;
  metrics: DashboardMetric[];
  priorityWork: ReviewQueueItem[];
  recentJourneys: JourneySummary[];
  backing: DataBacking;
}

export interface JourneyWorkspaceModel {
  journey: JourneySummary;
  customer: CustomerSummary;
  evidence: EvidenceSummary[];
  findings: FindingSummary[];
  stages: Record<JourneyStageKey, Record<string, unknown> | null>;
  backing: DataBacking;
}
