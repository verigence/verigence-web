import { useEffect, useMemo, useState } from 'react';
import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import { type Uc03WorkItem, type Uc03WorkItemPage } from '../services/audit-core/uc03';
import type { DeliveryWorkspace } from '../services/audit-core/uc03Delivery';
import { useProjectContextStore } from '../store/projectContextStore';
import DeliveryCaptureV2WorkspacePage from './DeliveryCaptureV2WorkspacePage';

function bootstrapWorkspace(item: Uc03WorkItem, operatingRole: string): DeliveryWorkspace {
  return {
    journeyId: item.journeyId,
    operatingRole,
    delivery: {
      businessStatus: item.delivery.businessStatus || '',
      auditState: item.delivery.auditState,
      auditStatus: item.delivery.auditStatus,
      aggregateVersion: 0,
      startedAtUtc: null,
      completedAtUtc: null,
    },
    booking: {
      businessStatus: item.booking.businessStatus,
      closureDisposition: null,
      incompleteAtDelivery: false,
      warning: null,
    },
    intimation: { answer: 'UNANSWERED', reason: null },
    vehicle: {
      expectedVin: null,
      expectedChassisNumber: null,
      observedVin: null,
      observedChassisNumber: null,
      observedSourceEvidenceId: null,
      reconciliationStatus: 'NOT_EVALUATED',
      evaluatorKey: null,
      evaluatedAtUtc: null,
    },
    documents: [],
    payments: [],
    flags: [],
  };
}

export default function DeliveryCaptureV2FastEntry() {
  const { journeyId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const project = useProjectContextStore((state) => state.selectedProject);
  const workspaceKey = ['uc03-delivery-workspace-v2-entry', project?.tenantId, journeyId] as const;
  const existingWorkspace = queryClient.getQueryData<DeliveryWorkspace>(workspaceKey);

  const cachedWorkItem = useMemo<Uc03WorkItem | undefined>(() => {
    if (!project?.tenantId || !journeyId) return undefined;
    const cachedPages = queryClient.getQueriesData<InfiniteData<Uc03WorkItemPage>>({
      queryKey: ['uc03-work-items', project.tenantId],
    });
    for (const [, cached] of cachedPages) {
      const match = cached?.pages
        .flatMap((page) => page.items)
        .find((item) => item.journeyId === journeyId);
      if (match) return match;
    }
    return undefined;
  }, [journeyId, project?.tenantId, queryClient]);

  const [handoffReady, setHandoffReady] = useState(Boolean(existingWorkspace || !cachedWorkItem));

  useEffect(() => {
    if (!project?.tenantId || !journeyId || existingWorkspace || !cachedWorkItem) {
      if (!cachedWorkItem) setHandoffReady(true);
      return;
    }
    queryClient.setQueryData<DeliveryWorkspace>(
      ['uc03-delivery-workspace-v2-entry', project.tenantId, journeyId],
      bootstrapWorkspace(cachedWorkItem, project.operatingRole),
      { updatedAt: Date.now() },
    );
    setHandoffReady(true);
  }, [cachedWorkItem, existingWorkspace, journeyId, project, queryClient]);

  if (!project || !journeyId) return null;

  if (handoffReady) return <DeliveryCaptureV2WorkspacePage />;

  return (
    <div className="screen-stack uc03-v2-capture uc03-delivery-v2-page">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate('/dashboard')}>← Work List</button>
      </div>
      <PageHeader
        eyebrow="Delivery · V2"
        title={cachedWorkItem?.customerDisplayName || 'Delivery'}
        description="Opening Delivery documents…"
      />
      <section className="uc03-c1-start-panel" aria-busy="true">
        <div>
          <span className="uc03-c1-eyebrow">Delivery Journey</span>
          <h2>Loading document workspace</h2>
          <p>The Delivery screen is opening from the Work Queue context while detailed audit data loads.</p>
        </div>
        <div className="uc03-project-gate__spinner" aria-hidden="true" />
      </section>
    </div>
  );
}
