import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import ProjectAdminStepper, { projectAdminSteps } from '../features/project-admin/ProjectAdminStepper';
import { AuditCoreHttpError } from '../services/audit-core/client';
import {
  activateProject,
  confirmMasterImport,
  createDealerAdmin,
  createOutletAdmin,
  createProject,
  deleteRoleMapping,
  downloadMasterTemplate,
  getProjectAdmin,
  getProjectReadiness,
  listDealersAdmin,
  listMasterVersions,
  listOutletsAdmin,
  listProjectMasters,
  listRoleMappingCandidates,
  listRoleMappings,
  patchProjectAdmin,
  publishMasterVersion,
  putRoleMapping,
  retryProvisioningOperation,
  uploadMasterImport,
  type DealerAdmin,
  type MasterDescriptor,
  type MasterImport,
  type MasterVersion,
  type OperatingRole,
  type OutletAdmin,
  type ProjectProvisioningResult,
  type ProjectReadiness,
  type RoleMapping,
  type RoleMappingCandidate,
  type Uc02Project,
} from '../services/audit-core/uc02Admin';
import {
  downloadMasterImportErrorReport,
  listMasterImportRows,
  type MasterImportRow,
} from '../services/audit-core/uc02MasterImports';
import { useSessionStore } from '../store/sessionStore';

function randomKey(prefix: string) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `${prefix}-${suffix}`;
}

function errorMessage(error: unknown) {
  if (error instanceof AuditCoreHttpError) {
    const code = error.problem?.errorCode ? `${error.problem.errorCode}: ` : '';
    return `${code}${error.problem?.detail || error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected error.';
}

function triggerBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function EmptyMessage({ children }: { children: string }) {
  return <div className="uc02-empty">{children}</div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="uc02-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export default function ProjectAdministrationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const accessToken = useSessionStore((state) => state.accessToken);
  const tenantId = useSessionStore((state) => state.tenantId);
  const setBusinessContext = useSessionStore((state) => state.setBusinessContext);
  const requestedStep = Number(searchParams.get('step') || '1');
  const activeStep = Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= 8 ? requestedStep : 1;

  const [project, setProject] = useState<Uc02Project | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [provisioning, setProvisioning] = useState<ProjectProvisioningResult | null>(null);

  const [projectForm, setProjectForm] = useState({
    projectName: '', oemId: '', productCategoryId: '', effectiveStartDate: '', effectiveEndDate: '', timezoneName: 'Asia/Kolkata', regionCode: '',
  });
  const [dealers, setDealers] = useState<DealerAdmin[]>([]);
  const [dealerForm, setDealerForm] = useState({ dealerName: '', legalName: '' });
  const [selectedDealerId, setSelectedDealerId] = useState('');
  const [outlets, setOutlets] = useState<OutletAdmin[]>([]);
  const [outletForm, setOutletForm] = useState({ outletName: '', outletClassification: 'ONSITE' as 'ONSITE' | 'SATELLITE', addressText: '', city: '', stateRegion: '', postalCode: '', monthlyVehicleVolume: '' });

  const [candidateQuery, setCandidateQuery] = useState('');
  const [candidates, setCandidates] = useState<RoleMappingCandidate[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [mappings, setMappings] = useState<RoleMapping[]>([]);
  const [operatingRole, setOperatingRole] = useState<OperatingRole>('PC');
  const [scopeDealerIds, setScopeDealerIds] = useState<string[]>([]);
  const [scopeOutletIds, setScopeOutletIds] = useState<string[]>([]);

  const [masters, setMasters] = useState<MasterDescriptor[]>([]);
  const [selectedMasterKey, setSelectedMasterKey] = useState('');
  const [masterVersions, setMasterVersions] = useState<MasterVersion[]>([]);
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [masterWef, setMasterWef] = useState('');
  const [masterImport, setMasterImport] = useState<MasterImport | null>(null);
  const [masterRows, setMasterRows] = useState<MasterImportRow[]>([]);
  const [readiness, setReadiness] = useState<ProjectReadiness | null>(null);

  const selectedDealer = useMemo(() => dealers.find((item) => item.dealerId === selectedDealerId) || null, [dealers, selectedDealerId]);
  const selectedMaster = useMemo(() => masters.find((item) => item.masterKey === selectedMasterKey) || null, [masters, selectedMasterKey]);
  const selectedCandidate = useMemo(() => candidates.find((item) => item.userId === selectedUserId) || null, [candidates, selectedUserId]);
  const currentStep = projectAdminSteps.find((item) => item.key === activeStep)!;

  const goToStep = (step: number) => setSearchParams({ step: String(step) });
  const clearFeedback = () => { setPageError(''); setNotice(''); };

  async function loadProject() {
    if (!tenantId || !accessToken) {
      setProject(null);
      return;
    }
    setProjectLoading(true);
    try {
      const value = await getProjectAdmin(tenantId, accessToken);
      setProject(value);
      setProjectForm({
        projectName: value.projectName,
        oemId: value.oemId,
        productCategoryId: value.productCategoryId,
        effectiveStartDate: value.effectiveStartDate,
        effectiveEndDate: value.effectiveEndDate || '',
        timezoneName: value.timezoneName,
        regionCode: value.regionCode || '',
      });
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setProjectLoading(false);
    }
  }

  useEffect(() => { void loadProject(); }, [tenantId, accessToken]);

  async function loadDealersAndOutlets(preferredDealerId?: string) {
    if (!tenantId || !accessToken) return;
    const values = await listDealersAdmin(tenantId, accessToken);
    setDealers(values);
    const dealerId = preferredDealerId || selectedDealerId || values[0]?.dealerId || '';
    setSelectedDealerId(dealerId);
    if (dealerId) setOutlets(await listOutletsAdmin(tenantId, dealerId, accessToken));
    else setOutlets([]);
  }

  async function loadMappings() {
    if (!tenantId || !accessToken) return;
    setMappings(await listRoleMappings(tenantId, accessToken));
  }

  async function loadMasters() {
    if (!tenantId || !accessToken) return;
    const values = await listProjectMasters(tenantId, accessToken);
    setMasters(values);
    const nextKey = selectedMasterKey || values[0]?.masterKey || '';
    setSelectedMasterKey(nextKey);
    if (nextKey) {
      const descriptor = values.find((item) => item.masterKey === nextKey)!;
      setMasterVersions(await listMasterVersions(tenantId, descriptor.ownerModule, nextKey, accessToken));
    }
  }

  useEffect(() => {
    clearFeedback();
    if (!tenantId || !accessToken || activeStep === 1) return;
    void (async () => {
      try {
        if ([2, 3, 5].includes(activeStep)) await loadDealersAndOutlets();
        if (activeStep === 4) setCandidates(await listRoleMappingCandidates(tenantId, '', accessToken));
        if (activeStep === 5) await loadMappings();
        if (activeStep === 6) await loadMasters();
        if ([7, 8].includes(activeStep)) setReadiness(await getProjectReadiness(tenantId, accessToken));
      } catch (error) {
        setPageError(errorMessage(error));
      }
    })();
  }, [activeStep, tenantId, accessToken]);

  async function submitProject(event: FormEvent) {
    event.preventDefault();
    clearFeedback();
    setBusy(true);
    try {
      if (!accessToken) throw new Error('Security access token is required.');
      if (project && tenantId) {
        const updated = await patchProjectAdmin(
          tenantId,
          project.versionNo,
          {
            projectName: projectForm.projectName.trim(),
            effectiveEndDate: projectForm.effectiveEndDate || null,
            timezoneName: projectForm.timezoneName.trim(),
            regionCode: projectForm.regionCode.trim() || null,
          },
          accessToken,
        );
        setProject(updated);
        setNotice('Project details updated. OEM, Product Category and Effective Start remain immutable once dependent data exists.');
      } else {
        const result = await createProject(
          {
            projectName: projectForm.projectName.trim(),
            oemId: projectForm.oemId.trim(),
            productCategoryId: projectForm.productCategoryId.trim(),
            effectiveStartDate: projectForm.effectiveStartDate,
            effectiveEndDate: projectForm.effectiveEndDate || null,
            timezoneName: projectForm.timezoneName.trim(),
            regionCode: projectForm.regionCode.trim() || null,
          },
          randomKey('project-create'),
          accessToken,
        );
        setProvisioning(result);
        if (result.tenantId) {
          setBusinessContext({ tenantId: result.tenantId, dealerId: '', outletId: '' });
          setNotice(result.provisioningStatus === 'READY' ? 'Project created and provisioning is ready.' : 'Project operation created. Complete provisioning before continuing.');
        }
      }
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function retryProvisioning() {
    if (!provisioning || !accessToken) return;
    clearFeedback(); setBusy(true);
    try {
      const result = await retryProvisioningOperation(provisioning.operationId, accessToken);
      setProvisioning(result);
      if (result.tenantId) setBusinessContext({ tenantId: result.tenantId });
      setNotice(`Provisioning status: ${result.provisioningStatus}.`);
    } catch (error) { setPageError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function submitDealer(event: FormEvent) {
    event.preventDefault(); if (!tenantId || !accessToken) return;
    clearFeedback(); setBusy(true);
    try {
      const created = await createDealerAdmin(tenantId, { dealerName: dealerForm.dealerName.trim(), legalName: dealerForm.legalName.trim() || null }, accessToken);
      setDealerForm({ dealerName: '', legalName: '' });
      await loadDealersAndOutlets(created.dealerId);
      setNotice('Dealer created. Internal Dealer Code was generated by Audit Core.');
    } catch (error) { setPageError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function changeDealer(dealerId: string) {
    setSelectedDealerId(dealerId);
    if (!tenantId || !accessToken || !dealerId) { setOutlets([]); return; }
    try { setOutlets(await listOutletsAdmin(tenantId, dealerId, accessToken)); }
    catch (error) { setPageError(errorMessage(error)); }
  }

  async function submitOutlet(event: FormEvent) {
    event.preventDefault(); if (!tenantId || !accessToken || !selectedDealerId) return;
    clearFeedback(); setBusy(true);
    try {
      await createOutletAdmin(
        tenantId,
        selectedDealerId,
        {
          outletName: outletForm.outletName.trim(),
          outletClassification: outletForm.outletClassification,
          addressText: outletForm.addressText.trim() || null,
          city: outletForm.city.trim() || null,
          stateRegion: outletForm.stateRegion.trim() || null,
          postalCode: outletForm.postalCode.trim() || null,
          monthlyVehicleVolume: outletForm.monthlyVehicleVolume ? Number(outletForm.monthlyVehicleVolume) : null,
        },
        accessToken,
      );
      setOutletForm({ outletName: '', outletClassification: 'ONSITE', addressText: '', city: '', stateRegion: '', postalCode: '', monthlyVehicleVolume: '' });
      setOutlets(await listOutletsAdmin(tenantId, selectedDealerId, accessToken));
      setNotice('Outlet created. Internal Outlet Code was generated by Audit Core.');
    } catch (error) { setPageError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function searchCandidates(event?: FormEvent) {
    event?.preventDefault(); if (!tenantId || !accessToken) return;
    clearFeedback(); setBusy(true);
    try {
      const values = await listRoleMappingCandidates(tenantId, candidateQuery, accessToken);
      setCandidates(values);
      if (selectedUserId && !values.some((item) => item.userId === selectedUserId)) setSelectedUserId('');
    } catch (error) { setPageError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  function toggleValue(values: string[], value: string, checked: boolean, setter: (next: string[]) => void) {
    setter(checked ? [...new Set([...values, value])] : values.filter((item) => item !== value));
  }

  async function saveMapping(event: FormEvent) {
    event.preventDefault(); if (!tenantId || !accessToken || !selectedUserId) return;
    clearFeedback(); setBusy(true);
    try {
      const payload = {
        operatingRole,
        dealerIds: operatingRole === 'TL' || operatingRole === 'CRM' ? scopeDealerIds : [],
        outletIds: operatingRole === 'PC' ? scopeOutletIds : [],
      };
      const result = await putRoleMapping(tenantId, selectedUserId, payload, randomKey('role-map'), accessToken);
      await loadMappings();
      setNotice(result.operationStatus === 'COMPLETED' ? 'Role mapping saved in Security and Audit Core.' : 'Role mapping requires recovery; operation was preserved for reconciliation.');
    } catch (error) { setPageError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function removeMapping(userId: string) {
    if (!tenantId || !accessToken) return;
    clearFeedback(); setBusy(true);
    try {
      const result = await deleteRoleMapping(tenantId, userId, randomKey('role-remove'), accessToken);
      await loadMappings();
      setNotice(result.operationStatus === 'COMPLETED' ? 'Role mapping removed.' : 'Role removal requires recovery; operation was preserved.');
    } catch (error) { setPageError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function changeMaster(masterKey: string) {
    setSelectedMasterKey(masterKey); setMasterImport(null); setMasterRows([]); setMasterFile(null); setMasterWef('');
    if (!tenantId || !accessToken) return;
    const descriptor = masters.find((item) => item.masterKey === masterKey);
    if (!descriptor) return;
    try { setMasterVersions(await listMasterVersions(tenantId, descriptor.ownerModule, descriptor.masterKey, accessToken)); }
    catch (error) { setPageError(errorMessage(error)); }
  }

  async function getTemplate() {
    if (!tenantId || !accessToken || !selectedMaster) return;
    clearFeedback(); setBusy(true);
    try {
      const blob = await downloadMasterTemplate(tenantId, selectedMaster.ownerModule, selectedMaster.masterKey, accessToken);
      triggerBlob(blob, `${selectedMaster.masterKey.toLowerCase()}-template.xlsx`);
    } catch (error) { setPageError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function submitMasterImport(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !accessToken || !selectedMaster || !masterFile) return;
    clearFeedback(); setBusy(true);
    try {
      const imported = await uploadMasterImport(
        tenantId,
        selectedMaster.ownerModule,
        selectedMaster.masterKey,
        masterFile,
        selectedMaster.requiresWef ? masterWef || null : null,
        randomKey('master-import'),
        accessToken,
      );
      setMasterImport(imported);
      const rows = await listMasterImportRows(tenantId, imported.importId, undefined, accessToken);
      setMasterRows(rows.items);
      setNotice(imported.status === 'PREVIEW_READY' ? 'Workbook parsed and validated. Review the staging preview before confirming.' : `Import status: ${imported.status}.`);
    } catch (error) { setPageError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function confirmImport() {
    if (!tenantId || !accessToken || !masterImport || !selectedMaster) return;
    clearFeedback(); setBusy(true);
    try {
      const confirmed = await confirmMasterImport(tenantId, masterImport.importId, accessToken);
      setMasterImport(confirmed);
      setMasterVersions(await listMasterVersions(tenantId, selectedMaster.ownerModule, selectedMaster.masterKey, accessToken));
      setNotice('Import confirmed. A draft version is now available for publish.');
    } catch (error) { setPageError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function publishVersion(versionId: string) {
    if (!tenantId || !accessToken || !selectedMaster) return;
    clearFeedback(); setBusy(true);
    try {
      await publishMasterVersion(tenantId, selectedMaster.ownerModule, selectedMaster.masterKey, versionId, accessToken);
      setMasterVersions(await listMasterVersions(tenantId, selectedMaster.ownerModule, selectedMaster.masterKey, accessToken));
      setNotice('Project Master version published.');
    } catch (error) { setPageError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function errorReport() {
    if (!tenantId || !accessToken || !masterImport) return;
    try {
      const blob = await downloadMasterImportErrorReport(tenantId, masterImport.importId, accessToken);
      triggerBlob(blob, `${masterImport.masterKey.toLowerCase()}-${masterImport.importId}-validation.csv`);
    } catch (error) { setPageError(errorMessage(error)); }
  }

  async function refreshReadiness() {
    if (!tenantId || !accessToken) return;
    clearFeedback(); setBusy(true);
    try { setReadiness(await getProjectReadiness(tenantId, accessToken)); }
    catch (error) { setPageError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function doActivate() {
    if (!tenantId || !accessToken) return;
    clearFeedback(); setBusy(true);
    try {
      const result = await activateProject(tenantId, randomKey('activate'), accessToken);
      setReadiness(result.readiness);
      await loadProject();
      setNotice(`Project activated. Security Tenant: ${result.securityTenantStatus}; Audit Core Project: ${result.projectStatus}.`);
    } catch (error) { setPageError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  const projectConfigured = Boolean(tenantId && project);

  return (
    <div className="screen-stack uc02-admin">
      <PageHeader
        eyebrow="Administration · UC02"
        title="Project administration"
        description="Configure the Project hierarchy, operating team, governed masters and readiness before activation. Technical codes are generated by the platform; OEM and Product Category IDs remain text inputs for this phase."
        backing="CORE"
        actions={project && <StatusPill value={project.projectStatus} />}
      />

      <div className="uc02-project-strip">
        <div><span>Current Project</span><strong>{project?.projectName || 'Not created / selected'}</strong></div>
        <div><span>Tenant ID</span><code>{tenantId || '—'}</code></div>
        {project && <div><span>Project version</span><strong>v{project.versionNo}</strong></div>}
      </div>

      <ProjectAdminStepper activeStep={activeStep} onChange={goToStep} projectConfigured={projectConfigured} />

      {(pageError || notice) && <div className={`uc02-message ${pageError ? 'uc02-message--error' : 'uc02-message--success'}`}><strong>{pageError ? 'Action failed' : 'Updated'}</strong><span>{pageError || notice}</span></div>}

      <section className="uc02-workspace">
        <header className="uc02-workspace__header"><div><small>{currentStep.short}</small><h2>{currentStep.label}</h2><p>{currentStep.description}</p></div><span className="uc02-workspace__step">Step {activeStep} of 8</span></header>

        {activeStep === 1 && (
          <div className="uc02-grid uc02-grid--project">
            <form className="uc02-card" onSubmit={submitProject}>
              <div className="uc02-card__title"><h3>{project ? 'Project details' : 'Create Project'}</h3><p>{project ? 'Update mutable Project properties.' : 'The backend creates Security Tenant, Audit Core Project and DI provisioning as one durable operation.'}</p></div>
              <div className="uc02-form-grid">
                <Field label="Project name"><input required value={projectForm.projectName} onChange={(event) => setProjectForm({ ...projectForm, projectName: event.target.value })} /></Field>
                <Field label="OEM ID" hint="Text box for now; lookup/dropdown is deferred."><input required disabled={Boolean(project)} value={projectForm.oemId} onChange={(event) => setProjectForm({ ...projectForm, oemId: event.target.value })} placeholder="UUID" /></Field>
                <Field label="Product Category ID" hint="Text box for now; lookup/dropdown is deferred."><input required disabled={Boolean(project)} value={projectForm.productCategoryId} onChange={(event) => setProjectForm({ ...projectForm, productCategoryId: event.target.value })} placeholder="UUID" /></Field>
                <Field label="Effective start"><input type="date" required disabled={Boolean(project)} value={projectForm.effectiveStartDate} onChange={(event) => setProjectForm({ ...projectForm, effectiveStartDate: event.target.value })} /></Field>
                <Field label="Effective end"><input type="date" value={projectForm.effectiveEndDate} onChange={(event) => setProjectForm({ ...projectForm, effectiveEndDate: event.target.value })} /></Field>
                <Field label="Timezone"><input required value={projectForm.timezoneName} onChange={(event) => setProjectForm({ ...projectForm, timezoneName: event.target.value })} /></Field>
                <Field label="Region / geography"><input value={projectForm.regionCode} onChange={(event) => setProjectForm({ ...projectForm, regionCode: event.target.value })} /></Field>
              </div>
              <div className="uc02-actions"><button className="uc02-button uc02-button--primary" disabled={busy || projectLoading}>{busy ? 'Saving…' : project ? 'Save Project details' : 'Create Project'}</button></div>
            </form>
            <aside className="uc02-card uc02-card--soft">
              <div className="uc02-card__title"><h3>Provisioning</h3><p>Project creation is not complete until Security, Audit Core and DI have all succeeded.</p></div>
              {provisioning ? <div className="uc02-status-stack"><StatusPill value={provisioning.provisioningStatus} /><dl><div><dt>Operation</dt><dd>{provisioning.operationId}</dd></div><div><dt>Current step</dt><dd>{provisioning.currentStep}</dd></div><div><dt>Tenant</dt><dd>{provisioning.tenantId || 'Pending'}</dd></div></dl>{provisioning.provisioningStatus !== 'READY' && <button className="uc02-button" type="button" onClick={() => void retryProvisioning()} disabled={busy}>Retry provisioning</button>}</div> : <EmptyMessage>{project ? 'This Project is already established in the current session.' : 'Create the Project to start the durable provisioning operation.'}</EmptyMessage>}
            </aside>
          </div>
        )}

        {activeStep === 2 && (
          <div className="uc02-grid">
            <form className="uc02-card" onSubmit={submitDealer}>
              <div className="uc02-card__title"><h3>Add dealer</h3><p>Dealer Code is generated internally and is not entered by the administrator.</p></div>
              <Field label="Dealer name"><input required value={dealerForm.dealerName} onChange={(event) => setDealerForm({ ...dealerForm, dealerName: event.target.value })} /></Field>
              <Field label="Legal name"><input value={dealerForm.legalName} onChange={(event) => setDealerForm({ ...dealerForm, legalName: event.target.value })} /></Field>
              <div className="uc02-actions"><button className="uc02-button uc02-button--primary" disabled={busy}>Add dealer</button></div>
            </form>
            <div className="uc02-card uc02-card--wide"><div className="uc02-card__title"><h3>Project dealers</h3><p>{dealers.length} configured</p></div>{dealers.length ? <div className="uc02-table-wrap"><table className="uc02-table"><thead><tr><th>Dealer</th><th>Internal code</th><th>Status</th></tr></thead><tbody>{dealers.map((item) => <tr key={item.dealerId}><td><strong>{item.dealerName}</strong><small>{item.legalName}</small></td><td><code>{item.dealerCode}</code></td><td><StatusPill value={item.status} compact /></td></tr>)}</tbody></table></div> : <EmptyMessage>No dealers configured yet.</EmptyMessage>}</div>
          </div>
        )}

        {activeStep === 3 && (
          <div className="uc02-grid">
            <form className="uc02-card" onSubmit={submitOutlet}>
              <div className="uc02-card__title"><h3>Add dealer outlet</h3><p>Outlet Code is generated internally.</p></div>
              <Field label="Dealer"><select required value={selectedDealerId} onChange={(event) => void changeDealer(event.target.value)}><option value="">Select dealer</option>{dealers.map((item) => <option key={item.dealerId} value={item.dealerId}>{item.dealerName}</option>)}</select></Field>
              <Field label="Outlet name"><input required value={outletForm.outletName} onChange={(event) => setOutletForm({ ...outletForm, outletName: event.target.value })} /></Field>
              <Field label="Classification"><select value={outletForm.outletClassification} onChange={(event) => setOutletForm({ ...outletForm, outletClassification: event.target.value as 'ONSITE' | 'SATELLITE' })}><option value="ONSITE">Onsite</option><option value="SATELLITE">Satellite</option></select></Field>
              <Field label="Address"><textarea value={outletForm.addressText} onChange={(event) => setOutletForm({ ...outletForm, addressText: event.target.value })} /></Field>
              <div className="uc02-form-grid"><Field label="City"><input value={outletForm.city} onChange={(event) => setOutletForm({ ...outletForm, city: event.target.value })} /></Field><Field label="State / region"><input value={outletForm.stateRegion} onChange={(event) => setOutletForm({ ...outletForm, stateRegion: event.target.value })} /></Field><Field label="Postal code"><input value={outletForm.postalCode} onChange={(event) => setOutletForm({ ...outletForm, postalCode: event.target.value })} /></Field><Field label="Monthly vehicle volume"><input type="number" min="0" value={outletForm.monthlyVehicleVolume} onChange={(event) => setOutletForm({ ...outletForm, monthlyVehicleVolume: event.target.value })} /></Field></div>
              <div className="uc02-actions"><button className="uc02-button uc02-button--primary" disabled={busy || !selectedDealerId}>Add outlet</button></div>
            </form>
            <div className="uc02-card uc02-card--wide"><div className="uc02-card__title"><h3>{selectedDealer ? `${selectedDealer.dealerName} outlets` : 'Dealer outlets'}</h3><p>{outlets.length} configured</p></div>{outlets.length ? <div className="uc02-table-wrap"><table className="uc02-table"><thead><tr><th>Outlet</th><th>Location</th><th>Class</th><th>Status</th></tr></thead><tbody>{outlets.map((item) => <tr key={item.outletId}><td><strong>{item.outletName}</strong><small><code>{item.outletCode}</code></small></td><td>{[item.city, item.stateRegion].filter(Boolean).join(', ') || '—'}</td><td>{item.outletClassification}</td><td><StatusPill value={item.status} compact /></td></tr>)}</tbody></table></div> : <EmptyMessage>Select a dealer or add its first outlet.</EmptyMessage>}</div>
          </div>
        )}

        {activeStep === 4 && (
          <div className="uc02-card">
            <div className="uc02-card__title"><h3>Employees</h3><p>Search Security global users who can be mapped into this Project. This is UC02 role-mapping candidate search, not the deferred UC01 employee browse package.</p></div>
            <form className="uc02-search" onSubmit={searchCandidates}><input value={candidateQuery} onChange={(event) => setCandidateQuery(event.target.value)} placeholder="Search by name or email" /><button className="uc02-button uc02-button--primary" disabled={busy}>Search</button></form>
            {candidates.length ? <div className="uc02-table-wrap"><table className="uc02-table"><thead><tr><th>Employee</th><th>User ID</th><th>Status</th><th></th></tr></thead><tbody>{candidates.map((item) => <tr key={item.userId}><td><strong>{item.displayName}</strong><small>{item.primaryEmail || 'No email'}</small></td><td><code>{item.userId}</code></td><td><StatusPill value={item.status} compact /></td><td><button className="uc02-link-button" type="button" onClick={() => { setSelectedUserId(item.userId); goToStep(5); }}>Map role</button></td></tr>)}</tbody></table></div> : <EmptyMessage>No employee candidates loaded.</EmptyMessage>}
          </div>
        )}

        {activeStep === 5 && (
          <div className="uc02-grid uc02-grid--mapping">
            <form className="uc02-card" onSubmit={saveMapping}>
              <div className="uc02-card__title"><h3>Role mapping</h3><p>Security owns the operating role; Audit Core owns Dealer/Outlet business scope.</p></div>
              <Field label="Employee"><select required value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}><option value="">Select employee</option>{candidates.map((item) => <option key={item.userId} value={item.userId}>{item.displayName} · {item.primaryEmail || item.userId}</option>)}{selectedUserId && !candidates.some((item) => item.userId === selectedUserId) && <option value={selectedUserId}>{selectedUserId}</option>}</select></Field>
              {selectedCandidate && <div className="uc02-selected-person"><strong>{selectedCandidate.displayName}</strong><span>{selectedCandidate.primaryEmail}</span></div>}
              <Field label="Operating role"><select value={operatingRole} onChange={(event) => { setOperatingRole(event.target.value as OperatingRole); setScopeDealerIds([]); setScopeOutletIds([]); }}><option value="PC">Process Consultant (PC)</option><option value="TL">Team Lead (TL)</option><option value="PM">Project Manager (PM)</option><option value="CRM">CRM</option><option value="Executive">Executive</option></select></Field>
              {operatingRole === 'PC' && <div className="uc02-scope"><strong>Outlet scope</strong>{dealers.flatMap((dealer) => outlets.filter((outlet) => outlet.dealerId === dealer.dealerId).map((outlet) => <label key={outlet.outletId}><input type="checkbox" checked={scopeOutletIds.includes(outlet.outletId)} onChange={(event) => toggleValue(scopeOutletIds, outlet.outletId, event.target.checked, setScopeOutletIds)} />{dealer.dealerName} · {outlet.outletName}</label>))}{!outlets.length && <small>Select W3 and load outlets before mapping a PC.</small>}</div>}
              {(operatingRole === 'TL' || operatingRole === 'CRM') && <div className="uc02-scope"><strong>Dealer scope {operatingRole === 'CRM' && '(leave blank for Project-wide)'}</strong>{dealers.map((dealer) => <label key={dealer.dealerId}><input type="checkbox" checked={scopeDealerIds.includes(dealer.dealerId)} onChange={(event) => toggleValue(scopeDealerIds, dealer.dealerId, event.target.checked, setScopeDealerIds)} />{dealer.dealerName}</label>)}</div>}
              {(operatingRole === 'PM' || operatingRole === 'Executive') && <div className="uc02-note">{operatingRole} is Project-wide; no Dealer or Outlet scope is required.</div>}
              <div className="uc02-actions"><button className="uc02-button uc02-button--primary" disabled={busy || !selectedUserId}>Save role mapping</button></div>
            </form>
            <div className="uc02-card uc02-card--wide"><div className="uc02-card__title"><h3>Active mappings</h3><p>{mappings.length} users mapped</p></div>{mappings.length ? <div className="uc02-table-wrap"><table className="uc02-table"><thead><tr><th>User</th><th>Role</th><th>Scope</th><th></th></tr></thead><tbody>{mappings.map((item) => <tr key={item.userId}><td><code>{item.userId}</code></td><td><strong>{item.operatingRole}</strong></td><td>{item.outletIds.length ? `${item.outletIds.length} outlet(s)` : item.dealerIds.length ? `${item.dealerIds.length} dealer(s)` : 'Project-wide'}</td><td><button className="uc02-link-button uc02-link-button--danger" type="button" onClick={() => void removeMapping(item.userId)} disabled={busy}>Remove</button></td></tr>)}</tbody></table></div> : <EmptyMessage>No active role mappings yet.</EmptyMessage>}</div>
          </div>
        )}

        {activeStep === 6 && (
          <div className="uc02-master-layout">
            <aside className="uc02-card uc02-master-list"><div className="uc02-card__title"><h3>Master catalogue</h3><p>Audit Core + DI ownership through one facade.</p></div>{masters.map((item) => <button key={`${item.ownerModule}-${item.masterKey}`} type="button" className={`uc02-master-list__item${selectedMasterKey === item.masterKey ? ' active' : ''}`} onClick={() => void changeMaster(item.masterKey)}><span><strong>{item.displayName}</strong><small>{item.ownerModule}</small></span><StatusPill value={item.lifecycleStatus || 'NOT_CONFIGURED'} compact /></button>)}</aside>
            <div className="uc02-card uc02-card--wide">
              {selectedMaster ? <><div className="uc02-card__title"><h3>{selectedMaster.displayName}</h3><p>{selectedMaster.ownerModule} · {selectedMaster.uploadMode} · {selectedMaster.requiresWef ? 'WEF required' : 'No WEF'}</p></div>
                {selectedMaster.administrationModes.includes('EXCEL') && <div className="uc02-master-actions"><button className="uc02-button" type="button" onClick={() => void getTemplate()} disabled={busy}>Get Excel template</button></div>}
                {selectedMaster.administrationModes.includes('EXCEL') && <form className="uc02-master-upload" onSubmit={submitMasterImport}><Field label="Completed workbook"><input type="file" accept=".xlsx" required onChange={(event) => setMasterFile(event.target.files?.[0] || null)} /></Field>{selectedMaster.requiresWef && <Field label="With effect from"><input type="date" required value={masterWef} onChange={(event) => setMasterWef(event.target.value)} /></Field>}<button className="uc02-button uc02-button--primary" disabled={busy || !masterFile}>Upload & validate</button></form>}
                {masterImport && <div className="uc02-import-summary"><div><span>Status</span><StatusPill value={masterImport.status} /></div><div><span>Rows</span><strong>{masterImport.rowsParsed}</strong></div><div><span>Valid</span><strong>{masterImport.validRows}</strong></div><div><span>Warnings</span><strong>{masterImport.warningRows}</strong></div><div><span>Errors</span><strong>{masterImport.errorRows}</strong></div></div>}
                {masterRows.length > 0 && <div className="uc02-table-wrap"><table className="uc02-table"><thead><tr><th>Row</th><th>Status</th><th>Parsed values</th><th>Messages</th></tr></thead><tbody>{masterRows.slice(0, 100).map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td><StatusPill value={row.validationStatus} compact /></td><td><code className="uc02-json">{JSON.stringify(row.parsedData)}</code></td><td>{row.messages.join(' · ') || '—'}</td></tr>)}</tbody></table></div>}
                {masterImport && <div className="uc02-actions"><button className="uc02-button" type="button" onClick={() => void errorReport()} disabled={busy}>Validation report</button><button className="uc02-button uc02-button--primary" type="button" onClick={() => void confirmImport()} disabled={busy || masterImport.status !== 'PREVIEW_READY' || masterImport.errorRows > 0}>Confirm import</button></div>}
                <div className="uc02-version-list"><h4>Versions</h4>{masterVersions.length ? masterVersions.map((version) => <div className="uc02-version-row" key={version.versionId}><span><strong>{version.displayName || version.businessKey || `Version ${version.versionNo || ''}`}</strong><small>{version.effectiveFrom ? `WEF ${version.effectiveFrom}` : version.versionId}</small></span><StatusPill value={version.lifecycleStatus} compact />{version.lifecycleStatus === 'DRAFT' && <button className="uc02-link-button" type="button" onClick={() => void publishVersion(version.versionId)} disabled={busy}>Publish</button>}</div>) : <EmptyMessage>No versions yet.</EmptyMessage>}</div>
              </> : <EmptyMessage>Select a Project Master.</EmptyMessage>}
            </div>
          </div>
        )}

        {activeStep === 7 && (
          <div className="uc02-card"><div className="uc02-card__title uc02-card__title--row"><div><h3>Project readiness</h3><p>Activation is blocked until every BLOCKING check passes.</p></div><button className="uc02-button" type="button" onClick={() => void refreshReadiness()} disabled={busy}>Refresh checks</button></div>{readiness ? <><div className={`uc02-readiness-banner ${readiness.readyToActivate ? 'ready' : 'blocked'}`}><strong>{readiness.readyToActivate ? 'Ready to activate' : 'Activation blocked'}</strong><span>Evaluated {new Date(readiness.evaluatedAtUtc).toLocaleString()}</span></div><div className="uc02-checks">{readiness.checks.map((check) => <article key={check.checkKey} className="uc02-check"><StatusPill value={check.status} compact /><div><strong>{check.area} · {check.checkKey}</strong><p>{check.message}</p><small>{check.severity} · Resolve in {check.targetTask}</small></div></article>)}</div></> : <EmptyMessage>Run the readiness evaluation.</EmptyMessage>}</div>
        )}

        {activeStep === 8 && (
          <div className="uc02-grid uc02-grid--activation"><div className="uc02-card"><div className="uc02-card__title"><h3>Activate Project</h3><p>Audit Core evaluates readiness first, activates the canonical Security Tenant second, and marks Audit Core ACTIVE only after Security confirms ACTIVE.</p></div>{readiness ? <div className={`uc02-readiness-banner ${readiness.readyToActivate ? 'ready' : 'blocked'}`}><strong>{readiness.readyToActivate ? 'All blocking checks passed' : 'Project is not ready'}</strong><span>{readiness.checks.filter((item) => item.severity === 'BLOCKING' && item.status !== 'PASS').length} blocking issue(s)</span></div> : <EmptyMessage>Readiness has not been evaluated.</EmptyMessage>}<div className="uc02-actions"><button className="uc02-button" type="button" onClick={() => void refreshReadiness()} disabled={busy}>Re-check readiness</button><button className="uc02-button uc02-button--primary" type="button" onClick={() => void doActivate()} disabled={busy || !readiness?.readyToActivate || project?.projectStatus === 'ACTIVE'}>{project?.projectStatus === 'ACTIVE' ? 'Project is ACTIVE' : 'Activate Project'}</button></div></div><aside className="uc02-card uc02-card--soft"><div className="uc02-card__title"><h3>Activation safety</h3></div><ol className="uc02-ordered"><li>Readiness must be PASS.</li><li>The same human SuperAdmin Security token is propagated.</li><li>Security Tenant must return ACTIVE.</li><li>Only then does Audit Core become ACTIVE.</li></ol></aside></div>
        )}
      </section>

      <footer className="uc02-footer-nav"><button className="uc02-button" type="button" disabled={activeStep === 1} onClick={() => goToStep(activeStep - 1)}>Previous</button><span>{currentStep.short} · {currentStep.label}</span><button className="uc02-button uc02-button--primary" type="button" disabled={activeStep === 8 || !projectConfigured} onClick={() => goToStep(activeStep + 1)}>Next</button></footer>
    </div>
  );
}
