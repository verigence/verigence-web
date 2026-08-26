import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '../components/PageHeader';
import {
  previewJourneyHousekeeping,
  purgeJourneyHousekeeping,
  type JourneyHousekeepingScope,
} from '../services/audit-core/housekeeping';
import {
  listDealersAdmin,
  listOutletsAdmin,
  listProjects,
} from '../services/audit-core/uc02Admin';
import {
  getTenantTransactionDataStatus,
  purgeTenantTransactionData,
} from '../services/di/housekeeping';
import { useSessionStore } from '../store/sessionStore';

export default function AdminHousekeepingPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [tenantId, setTenantId] = useState('');

  const [diConfirmation, setDiConfirmation] = useState('');
  const [diPurging, setDiPurging] = useState(false);
  const [diMessage, setDiMessage] = useState<string>();
  const [diError, setDiError] = useState<string>();

  const [journeyScope, setJourneyScope] = useState<JourneyHousekeepingScope>('TENANT');
  const [dealerId, setDealerId] = useState('');
  const [outletId, setOutletId] = useState('');
  const [journeyId, setJourneyId] = useState('');
  const [journeyConfirmation, setJourneyConfirmation] = useState('');
  const [journeyPurging, setJourneyPurging] = useState(false);
  const [journeyMessage, setJourneyMessage] = useState<string>();
  const [journeyError, setJourneyError] = useState<string>();

  const projectsQuery = useQuery({
    queryKey: ['admin-housekeeping-projects'],
    queryFn: () => listProjects(accessToken),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
    retry: 1,
  });

  const diStatusQuery = useQuery({
    queryKey: ['admin-di-housekeeping-status', tenantId],
    queryFn: () => getTenantTransactionDataStatus(tenantId, accessToken!),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 0,
    retry: 1,
  });

  const dealersQuery = useQuery({
    queryKey: ['admin-housekeeping-dealers', tenantId],
    queryFn: () => listDealersAdmin(tenantId, accessToken),
    enabled: Boolean(tenantId && accessToken && journeyScope === 'OUTLET'),
    staleTime: 30_000,
    retry: 1,
  });

  const outletsQuery = useQuery({
    queryKey: ['admin-housekeeping-outlets', tenantId, dealerId],
    queryFn: () => listOutletsAdmin(tenantId, dealerId, accessToken),
    enabled: Boolean(tenantId && dealerId && accessToken && journeyScope === 'OUTLET'),
    staleTime: 30_000,
    retry: 1,
  });

  const selectedProject = useMemo(
    () => projectsQuery.data?.find((project) => project.tenantId === tenantId),
    [projectsQuery.data, tenantId],
  );

  const journeySelection = useMemo(() => {
    if (journeyScope === 'TENANT') return tenantId ? { scope: 'TENANT' as const } : undefined;
    if (journeyScope === 'OUTLET') {
      return outletId ? { scope: 'OUTLET' as const, outletId } : undefined;
    }
    const normalizedJourneyId = journeyId.trim();
    return normalizedJourneyId
      ? { scope: 'JOURNEY' as const, journeyId: normalizedJourneyId }
      : undefined;
  }, [journeyId, journeyScope, outletId, tenantId]);

  const journeyScopeId = journeyScope === 'TENANT'
    ? tenantId
    : journeyScope === 'OUTLET'
      ? outletId
      : journeyId.trim();

  const journeyPreviewQuery = useQuery({
    queryKey: ['admin-journey-housekeeping-preview', tenantId, journeySelection],
    queryFn: () => previewJourneyHousekeeping(tenantId, journeySelection!, accessToken!),
    enabled: Boolean(tenantId && accessToken && journeySelection),
    staleTime: 0,
    retry: 1,
  });

  const diStatus = diStatusQuery.data;
  const journeyPreview = journeyPreviewQuery.data;
  const canPurgeDi = Boolean(
    tenantId && diConfirmation === tenantId && !diPurging && diStatus,
  );
  const canPurgeJourneys = Boolean(
    journeySelection
      && journeyScopeId
      && journeyConfirmation === journeyScopeId
      && journeyPreview
      && journeyPreview.journeys > 0
      && !journeyPurging,
  );

  const resetJourneySelection = (scope: JourneyHousekeepingScope = journeyScope) => {
    setJourneyScope(scope);
    setDealerId('');
    setOutletId('');
    setJourneyId('');
    setJourneyConfirmation('');
    setJourneyMessage(undefined);
    setJourneyError(undefined);
  };

  const handleTenantChange = (nextTenantId: string) => {
    setTenantId(nextTenantId);
    setDiConfirmation('');
    setDiMessage(undefined);
    setDiError(undefined);
    resetJourneySelection('TENANT');
  };

  const handleDiPurge = async () => {
    if (!accessToken || !tenantId || diConfirmation !== tenantId) return;
    setDiPurging(true);
    setDiMessage(undefined);
    setDiError(undefined);
    try {
      const result = await purgeTenantTransactionData(tenantId, accessToken);
      await diStatusQuery.refetch();
      setDiConfirmation('');
      setDiMessage(
        `DI housekeeping completed. ${result.deletedDocuments} document record${result.deletedDocuments === 1 ? '' : 's'} and ${result.deletedStorageObjects} stored object${result.deletedStorageObjects === 1 ? '' : 's'} were removed. DI configuration was preserved.`,
      );
    } catch (cause: unknown) {
      setDiError(cause instanceof Error ? cause.message : 'DI housekeeping could not be completed.');
    } finally {
      setDiPurging(false);
    }
  };

  const handleJourneyPurge = async () => {
    if (
      !accessToken
      || !tenantId
      || !journeySelection
      || !journeyScopeId
      || journeyConfirmation !== journeyScopeId
    ) return;
    setJourneyPurging(true);
    setJourneyMessage(undefined);
    setJourneyError(undefined);
    try {
      const result = await purgeJourneyHousekeeping(
        tenantId,
        journeySelection,
        journeyScopeId,
        accessToken,
      );
      await Promise.all([
        journeyPreviewQuery.refetch(),
        diStatusQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ['admin-housekeeping-dealers', tenantId] }),
      ]);
      setJourneyConfirmation('');
      setJourneyMessage(
        `Journey housekeeping completed. ${result.deletedJourneys} journey${result.deletedJourneys === 1 ? '' : 's'}, ${result.deletedEvidence} evidence record${result.deletedEvidence === 1 ? '' : 's'}, and ${result.deletedDiDocuments} linked DI document${result.deletedDiDocuments === 1 ? '' : 's'} were removed. ${result.deletedCustomers} orphan customer record${result.deletedCustomers === 1 ? '' : 's'} were removed. Project, Dealer, Outlet and configuration data were preserved.`,
      );
    } catch (cause: unknown) {
      setJourneyError(
        cause instanceof Error ? cause.message : 'Journey housekeeping could not be completed.',
      );
    } finally {
      setJourneyPurging(false);
    }
  };

  const diMetrics = diStatus ? [
    ['Documents', diStatus.documents],
    ['Stored Objects', diStatus.storageObjects],
    ['Extracted Facts', diStatus.extractedFacts],
    ['Accepted Field Values', diStatus.acceptedFieldValues],
    ['Processing Jobs', diStatus.processingJobs],
    ['Processing Runs', diStatus.processingRuns],
    ['Processor Invocations', diStatus.processorInvocations],
  ] as const : [];

  const journeyMetrics = journeyPreview ? [
    ['Journeys', journeyPreview.journeys],
    ['Customers Referenced', journeyPreview.customers],
    ['Evidence', journeyPreview.evidence],
    ['DI Documents', journeyPreview.diDocuments],
    ['Audit Findings', journeyPreview.auditFindings],
    ['Payments', journeyPreview.payments],
    ['Deliveries', journeyPreview.deliveries],
    ['Workflow Tasks', journeyPreview.workflowTasks],
  ] as const : [];

  return (
    <section className="admin-landing screen-stack">
      <PageHeader
        eyebrow="Administration · Housekeeping"
        title="Data Housekeeping"
        description="Safely remove transaction data while preserving Project, Dealer, Outlet, rules, masters and Document Intelligence configuration."
      />

      <div className="uc01-admin-config-grid">
        <article className="uc01-admin-config-card">
          <span className="eyebrow">Project selection</span>
          <h2>Select Project / Tenant</h2>
          <p>Every housekeeping action is restricted to the selected Project/Tenant and requires an explicit destructive confirmation.</p>
          <label className="uc03-booking-field">
            <span>Project / Tenant</span>
            <select
              value={tenantId}
              disabled={projectsQuery.isPending || diPurging || journeyPurging}
              onChange={(event) => handleTenantChange(event.target.value)}
            >
              <option value="">Select Project</option>
              {(projectsQuery.data ?? []).map((project) => (
                <option key={project.tenantId} value={project.tenantId}>
                  {project.projectName} · {project.projectCode}
                </option>
              ))}
            </select>
          </label>
          {tenantId ? <p><strong>Tenant ID:</strong> <code>{tenantId}</code></p> : null}
          {projectsQuery.isError ? (
            <div className="uc01-admin-message uc01-admin-message--error">Projects could not be loaded.</div>
          ) : null}
        </article>

        <aside className="uc01-admin-capability-card">
          <span>Authority</span><strong>SuperAdmin only</strong>
          <span>Protection</span><strong>Masters/configuration preserved</strong>
          <p>These actions are intended for housekeeping of transactional data. They do not delete the selected Project or its Dealer/Outlet hierarchy.</p>
        </aside>
      </div>

      {tenantId ? (
        <>
          <section className="admin-landing__projects" aria-labelledby="journey-housekeeping-title">
            <header>
              <div>
                <span className="eyebrow">Journey housekeeping</span>
                <h2 id="journey-housekeeping-title">Purge Journey Transactions</h2>
                <p>Remove Journey data from Audit Core and its linked documents/extraction data from DI.</p>
              </div>
            </header>

            <div className="uc01-admin-config-grid">
              <article className="uc01-admin-config-card">
                <label className="uc03-booking-field">
                  <span>Purge scope</span>
                  <select
                    value={journeyScope}
                    disabled={journeyPurging}
                    onChange={(event) => resetJourneySelection(event.target.value as JourneyHousekeepingScope)}
                  >
                    <option value="TENANT">All Dealers &amp; Outlets</option>
                    <option value="OUTLET">Specific Outlet</option>
                    <option value="JOURNEY">Specific Journey ID</option>
                  </select>
                </label>

                {journeyScope === 'OUTLET' ? (
                  <>
                    <label className="uc03-booking-field">
                      <span>Dealer</span>
                      <select
                        value={dealerId}
                        disabled={dealersQuery.isPending || journeyPurging}
                        onChange={(event) => {
                          setDealerId(event.target.value);
                          setOutletId('');
                          setJourneyConfirmation('');
                        }}
                      >
                        <option value="">Select Dealer</option>
                        {(dealersQuery.data ?? []).map((dealer) => (
                          <option key={dealer.dealerId} value={dealer.dealerId}>
                            {dealer.dealerName} · {dealer.dealerCode}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="uc03-booking-field">
                      <span>Outlet</span>
                      <select
                        value={outletId}
                        disabled={!dealerId || outletsQuery.isPending || journeyPurging}
                        onChange={(event) => {
                          setOutletId(event.target.value);
                          setJourneyConfirmation('');
                        }}
                      >
                        <option value="">Select Outlet</option>
                        {(outletsQuery.data ?? []).map((outlet) => (
                          <option key={outlet.outletId} value={outlet.outletId}>
                            {outlet.outletName} · {outlet.outletCode}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}

                {journeyScope === 'JOURNEY' ? (
                  <label className="uc03-booking-field">
                    <span>Journey ID</span>
                    <input
                      type="text"
                      value={journeyId}
                      disabled={journeyPurging}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => {
                        setJourneyId(event.target.value);
                        setJourneyConfirmation('');
                      }}
                      placeholder="Enter Journey ID"
                    />
                  </label>
                ) : null}

                {journeyScope === 'TENANT' ? (
                  <p><strong>Scope:</strong> Every Journey for every Dealer and Outlet in this Project/Tenant.</p>
                ) : null}
                {journeyScope === 'OUTLET' && outletId ? (
                  <p><strong>Outlet ID:</strong> <code>{outletId}</code></p>
                ) : null}
                {journeyScope === 'JOURNEY' && journeyId.trim() ? (
                  <p><strong>Journey ID:</strong> <code>{journeyId.trim()}</code></p>
                ) : null}
              </article>

              <aside className="uc01-admin-capability-card">
                <span>Deleted</span><strong>Selected Journey transaction graph</strong>
                <span>Also deleted</span><strong>Linked DI documents + extraction data</strong>
                <span>Preserved</span><strong>Project + Dealer + Outlet + masters/config</strong>
                <p>If a Customer still has another Journey, that Customer remains. A Customer is removed only when the purge leaves it with no Journeys.</p>
              </aside>
            </div>

            {journeyPreviewQuery.isPending && journeySelection ? (
              <div className="admin-landing__project-state">Loading Journey transaction counts…</div>
            ) : null}
            {journeyPreviewQuery.isError ? (
              <div className="admin-landing__project-state admin-landing__project-state--error">Journey transaction counts could not be loaded. Check the selected scope/ID.</div>
            ) : null}
            {journeyPreview ? (
              <>
                <div className="admin-landing__metrics" aria-label="Journey transaction counts">
                  {journeyMetrics.map(([label, value]) => (
                    <article className="admin-landing__metric" key={label}>
                      <span>{label}</span><strong>{value}</strong><small>Selected Scope</small>
                    </article>
                  ))}
                </div>

                <div className="uc01-admin-config-grid">
                  <article className="uc01-admin-config-card">
                    <span className="eyebrow">Destructive housekeeping</span>
                    <h2>Confirm Journey Purge</h2>
                    {journeyPreview.journeys === 0 ? (
                      <p>No Journeys exist in the selected scope. Nothing will be deleted.</p>
                    ) : (
                      <>
                        <p>This permanently removes the selected Journey transaction data from Audit Core and linked document data from DI.</p>
                        <p>To confirm, type the scope ID exactly:</p>
                        <label className="uc03-booking-field">
                          <span>{journeyScopeId}</span>
                          <input
                            type="text"
                            value={journeyConfirmation}
                            disabled={journeyPurging}
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(event) => setJourneyConfirmation(event.target.value)}
                            placeholder="Enter Scope ID"
                          />
                        </label>
                        <button
                          type="button"
                          className="uc01-admin-button uc01-admin-button--primary"
                          disabled={!canPurgeJourneys}
                          onClick={() => void handleJourneyPurge()}
                        >
                          {journeyPurging ? 'Purging…' : 'Purge Journey Data'}
                        </button>
                      </>
                    )}
                  </article>

                  <aside className="uc01-admin-capability-card">
                    <span>Execution order</span><strong>DI first → Audit Core second</strong>
                    <p>If linked DI cleanup fails, Audit Core Journey records are left untouched. The operation can be retried safely.</p>
                  </aside>
                </div>
              </>
            ) : null}

            {journeyMessage ? <div className="uc01-admin-message uc01-admin-message--success" role="status">{journeyMessage}</div> : null}
            {journeyError ? <div className="uc01-admin-message uc01-admin-message--error" role="alert">{journeyError}</div> : null}
          </section>

          <section className="admin-landing__projects" aria-labelledby="di-housekeeping-title">
            <header>
              <div>
                <span className="eyebrow">DI-only housekeeping</span>
                <h2 id="di-housekeeping-title">Purge All DI Transaction Data</h2>
                <p>Use this when you want to clear all DI documents for the Project/Tenant regardless of Journey linkage.</p>
              </div>
              <button
                type="button"
                className="uc01-admin-button"
                disabled={diStatusQuery.isFetching || diPurging}
                onClick={() => void diStatusQuery.refetch()}
              >
                {diStatusQuery.isFetching ? 'Refreshing…' : 'Refresh Counts'}
              </button>
            </header>

            {diStatusQuery.isPending ? <div className="admin-landing__project-state">Loading DI transaction counts…</div> : null}
            {diStatusQuery.isError ? <div className="admin-landing__project-state admin-landing__project-state--error">DI transaction counts could not be loaded.</div> : null}
            {diStatus ? (
              <div className="admin-landing__metrics" aria-label="DI transaction counts">
                {diMetrics.map(([label, value]) => (
                  <article className="admin-landing__metric" key={label}>
                    <span>{label}</span><strong>{value}</strong><small>Selected Tenant</small>
                  </article>
                ))}
              </div>
            ) : null}

            {diStatus ? (
              <div className="uc01-admin-config-grid" aria-label="Purge DI transaction data">
                <article className="uc01-admin-config-card">
                  <span className="eyebrow">Destructive housekeeping</span>
                  <h2>Confirm DI Purge</h2>
                  <p>This permanently removes the selected Tenant's DI document transactions and stored objects. It does not delete the Project or DI configuration.</p>
                  <p>To confirm, type the Tenant ID exactly:</p>
                  <label className="uc03-booking-field">
                    <span>{tenantId}</span>
                    <input
                      type="text"
                      value={diConfirmation}
                      disabled={diPurging}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => setDiConfirmation(event.target.value)}
                      placeholder="Enter Tenant ID"
                    />
                  </label>
                  <button
                    type="button"
                    className="uc01-admin-button uc01-admin-button--primary"
                    disabled={!canPurgeDi}
                    onClick={() => void handleDiPurge()}
                  >
                    {diPurging ? 'Purging…' : 'Purge DI Transaction Data'}
                  </button>
                </article>

                <aside className="uc01-admin-capability-card">
                  <span>Deleted</span><strong>All DI documents + processing/extracted data</strong>
                  <span>Preserved</span><strong>Tenant + DI configuration</strong>
                  <p>Document Types, Canonical Fields, Extraction Profiles and other DI configuration remain available for fresh processing.</p>
                </aside>
              </div>
            ) : null}

            {diMessage ? <div className="uc01-admin-message uc01-admin-message--success" role="status">{diMessage}</div> : null}
            {diError ? <div className="uc01-admin-message uc01-admin-message--error" role="alert">{diError}</div> : null}
          </section>
        </>
      ) : null}
    </section>
  );
}
