import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import CompleteProjectDeletionPanel from '../components/admin/CompleteProjectDeletionPanel';
import SecurityHousekeepingPanel from '../components/admin/SecurityHousekeepingPanel';
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
import '../styles/housekeeping-hierarchy.css';

type HousekeepingMode = 'PROJECT' | 'JOURNEY' | 'SYSTEM';
type SystemHousekeepingMode = 'SECURITY' | 'DI';

export default function AdminHousekeepingPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [tenantId, setTenantId] = useState('');
  const [housekeepingMode, setHousekeepingMode] = useState<HousekeepingMode>();
  const [systemHousekeepingMode, setSystemHousekeepingMode] = useState<SystemHousekeepingMode>();

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
    enabled: Boolean(
      tenantId
      && accessToken
      && housekeepingMode === 'SYSTEM'
      && systemHousekeepingMode === 'DI'
    ),
    staleTime: 0,
    retry: 1,
  });

  const dealersQuery = useQuery({
    queryKey: ['admin-housekeeping-dealers', tenantId],
    queryFn: () => listDealersAdmin(tenantId, accessToken),
    enabled: Boolean(
      tenantId
      && accessToken
      && housekeepingMode === 'JOURNEY'
      && journeyScope === 'OUTLET'
    ),
    staleTime: 30_000,
    retry: 1,
  });

  const outletsQuery = useQuery({
    queryKey: ['admin-housekeeping-outlets', tenantId, dealerId],
    queryFn: () => listOutletsAdmin(tenantId, dealerId, accessToken),
    enabled: Boolean(
      tenantId
      && dealerId
      && accessToken
      && housekeepingMode === 'JOURNEY'
      && journeyScope === 'OUTLET'
    ),
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
    enabled: Boolean(
      tenantId
      && accessToken
      && housekeepingMode === 'JOURNEY'
      && journeySelection
    ),
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
    setHousekeepingMode(undefined);
    setSystemHousekeepingMode(undefined);
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
        description="Choose one deletion scope at a time. The screen shows exactly what will be deleted, what will be preserved, and the confirmation required before anything is removed."
      />

      <div className="uc01-admin-config-grid">
        <article className="uc01-admin-config-card">
          <span className="eyebrow">Step 1 · Project</span>
          <h2>Select Project / Tenant</h2>
          <p>All housekeeping actions are restricted to the selected Project/Tenant.</p>
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
          {selectedProject ? (
            <p>
              <strong>Selected:</strong> {selectedProject.projectName} · {selectedProject.projectCode}
              <br />
              <strong>Tenant ID:</strong> <code>{tenantId}</code>
            </p>
          ) : null}
          {projectsQuery.isError ? (
            <div className="uc01-admin-message uc01-admin-message--error">Projects could not be loaded.</div>
          ) : null}
        </article>

        <aside className="uc01-admin-capability-card">
          <span>Authority</span><strong>SuperAdmin only</strong>
          <span>Safety</span><strong>Select scope → review impact → confirm</strong>
          <span>Execution</span><strong>Only one housekeeping path is shown at a time</strong>
          <p>No deletion runs merely by selecting a Project or housekeeping scope.</p>
        </aside>
      </div>

      {tenantId ? (
        <>
          <section className="housekeeping-scope-guide" aria-labelledby="housekeeping-scope-title">
            <div className="housekeeping-scope-guide__header">
              <div>
                <span className="eyebrow">Step 2 · Deletion scope</span>
                <h2 id="housekeeping-scope-title">What do you want to delete?</h2>
                <p>
                  Start with the business scope. The options below are deliberately separated so a
                  complete Project delete cannot be confused with Journey cleanup or system history cleanup.
                </p>
              </div>
            </div>

            <div className="housekeeping-action-grid" role="list" aria-label="Housekeeping deletion scopes">
              <button
                type="button"
                role="listitem"
                aria-pressed={housekeepingMode === 'PROJECT'}
                className={`housekeeping-action-card housekeeping-action-card--project${housekeepingMode === 'PROJECT' ? ' housekeeping-action-card--active' : ''}`}
                onClick={() => {
                  setHousekeepingMode('PROJECT');
                  setSystemHousekeepingMode(undefined);
                }}
              >
                <span className="housekeeping-action-card__level">Whole Project · Highest impact</span>
                <strong>Delete Complete Project</strong>
                <span>Remove the Project itself and all Project-owned data across DI, Security and Audit Core.</span>
                <small>Includes Journeys, linked documents, Security Tenant, setup and Project masters.</small>
              </button>

              <button
                type="button"
                role="listitem"
                aria-pressed={housekeepingMode === 'JOURNEY'}
                className={`housekeeping-action-card housekeeping-action-card--journey${housekeepingMode === 'JOURNEY' ? ' housekeeping-action-card--active' : ''}`}
                onClick={() => {
                  setHousekeepingMode('JOURNEY');
                  setSystemHousekeepingMode(undefined);
                }}
              >
                <span className="housekeeping-action-card__level">Business transactions · Project preserved</span>
                <strong>Delete Journey Data</strong>
                <span>Delete all Journeys, one Outlet's Journeys, or one individual Journey.</span>
                <small>Project, Dealers, Outlets, rules, masters and configuration remain.</small>
              </button>

              <button
                type="button"
                role="listitem"
                aria-pressed={housekeepingMode === 'SYSTEM'}
                className={`housekeeping-action-card housekeeping-action-card--system${housekeepingMode === 'SYSTEM' ? ' housekeeping-action-card--active' : ''}`}
                onClick={() => setHousekeepingMode('SYSTEM')}
              >
                <span className="housekeeping-action-card__level">System-only history · Narrowest scope</span>
                <strong>Delete System History</strong>
                <span>Clean only Security operational history or DI transaction documents.</span>
                <small>Use when business Journeys and Project structure must remain untouched.</small>
              </button>
            </div>

            <div className="housekeeping-hierarchy" aria-label="Deletion hierarchy summary">
              <div className="housekeeping-hierarchy__item">
                <span>Complete Project</span>
                <strong>Everything for the Project is removed</strong>
              </div>
              <div className="housekeeping-hierarchy__item">
                <span>Journey Data</span>
                <strong>Transactions removed; Project structure preserved</strong>
              </div>
              <div className="housekeeping-hierarchy__item">
                <span>System History</span>
                <strong>Only the selected system's operational data is removed</strong>
              </div>
            </div>
          </section>

          {housekeepingMode ? (
            <div className="housekeeping-workspace-banner" role="status">
              <p>
                <strong>Selected housekeeping path:</strong>{' '}
                {housekeepingMode === 'PROJECT'
                  ? 'Delete Complete Project'
                  : housekeepingMode === 'JOURNEY'
                    ? 'Delete Journey Data'
                    : 'Delete System History'}
              </p>
              <span>Review the impact below before confirming.</span>
            </div>
          ) : null}

          {housekeepingMode === 'PROJECT' ? (
            <CompleteProjectDeletionPanel tenantId={tenantId} accessToken={accessToken} />
          ) : null}

          {housekeepingMode === 'JOURNEY' ? (
            <section className="admin-landing__projects" aria-labelledby="journey-housekeeping-title">
              <header>
                <div>
                  <span className="eyebrow">Journey data · Project preserved</span>
                  <h2 id="journey-housekeeping-title">Choose Journey Deletion Scope</h2>
                  <p>
                    Remove Journey transactions from Audit Core and their linked documents/extraction data
                    from DI. Project setup and master data are not deleted.
                  </p>
                </div>
              </header>

              <div className="uc01-admin-config-grid">
                <article className="uc01-admin-config-card">
                  <label className="uc03-booking-field">
                    <span>Journey deletion scope</span>
                    <select
                      value={journeyScope}
                      disabled={journeyPurging}
                      onChange={(event) => resetJourneySelection(event.target.value as JourneyHousekeepingScope)}
                    >
                      <option value="TENANT">All Journeys in this Project</option>
                      <option value="OUTLET">All Journeys in one Outlet</option>
                      <option value="JOURNEY">One Journey by ID</option>
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
                    <p><strong>Selected scope:</strong> Every Journey for every Dealer and Outlet in this Project.</p>
                  ) : null}
                  {journeyScope === 'OUTLET' && outletId ? (
                    <p><strong>Selected Outlet ID:</strong> <code>{outletId}</code></p>
                  ) : null}
                  {journeyScope === 'JOURNEY' && journeyId.trim() ? (
                    <p><strong>Selected Journey ID:</strong> <code>{journeyId.trim()}</code></p>
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
                      <span className="eyebrow">Final confirmation</span>
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
          ) : null}

          {housekeepingMode === 'SYSTEM' ? (
            <>
              <section className="housekeeping-system-choice" aria-labelledby="system-housekeeping-choice-title">
                <div>
                  <span className="eyebrow">Step 3 · System</span>
                  <h2 id="system-housekeeping-choice-title">Choose the system history to clean</h2>
                  <p>Only the selected system's operational data is shown below. Project and Journey structure remain intact.</p>
                </div>
                <div className="housekeeping-system-choice__grid">
                  <button
                    type="button"
                    aria-pressed={systemHousekeepingMode === 'SECURITY'}
                    className={`housekeeping-system-choice__button${systemHousekeepingMode === 'SECURITY' ? ' housekeeping-system-choice__button--active' : ''}`}
                    onClick={() => setSystemHousekeepingMode('SECURITY')}
                  >
                    <strong>Security Operational History</strong>
                    <span>Sessions, access-context evaluations and Security events through a cutoff date.</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={systemHousekeepingMode === 'DI'}
                    className={`housekeeping-system-choice__button${systemHousekeepingMode === 'DI' ? ' housekeeping-system-choice__button--active' : ''}`}
                    onClick={() => setSystemHousekeepingMode('DI')}
                  >
                    <strong>DI Transaction Data</strong>
                    <span>All DI documents, stored objects, processing and extraction transaction data.</span>
                  </button>
                </div>
              </section>

              {systemHousekeepingMode === 'SECURITY' ? (
                <SecurityHousekeepingPanel tenantId={tenantId} accessToken={accessToken} />
              ) : null}

              {systemHousekeepingMode === 'DI' ? (
                <section className="admin-landing__projects" aria-labelledby="di-housekeeping-title">
                  <header>
                    <div>
                      <span className="eyebrow">System-only cleanup · Document Intelligence</span>
                      <h2 id="di-housekeeping-title">Purge All DI Transaction Data</h2>
                      <p>
                        Clear all DI documents for the Project/Tenant regardless of Journey linkage.
                        Project and DI configuration remain available.
                      </p>
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
                        <span className="eyebrow">Final confirmation</span>
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
                        <span>Preserved</span><strong>Project + Journey structure + DI configuration</strong>
                        <p>Document Types, Canonical Fields, Extraction Profiles and other DI configuration remain available for fresh processing.</p>
                      </aside>
                    </div>
                  ) : null}

                  {diMessage ? <div className="uc01-admin-message uc01-admin-message--success" role="status">{diMessage}</div> : null}
                  {diError ? <div className="uc01-admin-message uc01-admin-message--error" role="alert">{diError}</div> : null}
                </section>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
