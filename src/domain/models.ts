export type UserRole = 'PC' | 'TL' | 'PM' | 'CRM' | 'TENANT_ADMIN' | 'SUPER_ADMIN';
export type OperatingRole = 'PC' | 'TL' | 'PM' | 'CRM' | 'EXECUTIVE';
export type DataBacking = 'CORE' | 'WEB_DEMO' | 'HYBRID';






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


export interface DailyOpsRun {
  runId: string;
  outletId: string;
  outletName: string;
  businessDate: string;
  pcActorId: string;
  status: string;
  startedAtUtc: string;
  completedAtUtc?: string | null;
  versionNo: number;
}








