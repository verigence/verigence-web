import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import MahindraMasterUploads from '../features/project-admin/MahindraMasterUploads';
import ProjectAdminStepper, { projectAdminSteps } from '../features/project-admin/ProjectAdminStepper';
import ProjectReferenceFields from '../features/project-admin/ProjectReferenceFields';
import ProjectSelector from '../features/project-admin/ProjectSelector';
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
  uploadMasterImport,
  type DealerAdmin,
  type MasterDescriptor,
  type MasterImport,
  type MasterVersion,
  type OperatingRole,
  type OutletAdmin,
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
import { auditCoreErrorMessage } from '../services/audit-core/errorMessage';
import { useSessionStore } from '../store/sessionStore';

const MAHINDRA_SEGMENT_CODES = new Set([
  'PASSENGER_VEHICLE',
  'COMMERCIAL',
  'BATTERY_ELECTRIC',
]);

function randomKey(prefix: string) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `${prefix}-${suffix}`;
}

function errorMessage(error: unknown) {
  return auditCoreErrorMessage(error);
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

const emptyProjectForm = () => ({
  projectName: '',
  oemId: '',
  segmentIds: [] as string[],
  effectiveStartDate: '',
  effectiveEndDate: '',
  timezoneName: 'Asia/Kolkata',
  regionCode: '',
});

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

  const [projectForm, setProjectForm] = useState(emptyProjectForm);
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
  const selectedMapping = useMemo(() => mappings.find((item) => item.userId === selectedUserId) || null, [mappings, selectedUserId]);
  const currentStep = projectAdminSteps.find((item) => item.key === activeStep)!;
  const isMahindraProject = Boolean(
    project?.segments.length &&
    project.segments.every((segment) => MAHINDRA_SEGMENT_CODES.has(segment.segmentCode)),
  );

  const goToStep = (step: number) => setSearchParams({ step: String(step) });
  const clearFeedback = () => { setPageError(''); setNotice(''); };

  function clearProjectScopedUi() {
    setDealers([]);
    setSelectedDealerId('');
    setOutlets([]);
    setCandidates([]);
    setSelectedUserId('');
    setMappings([]);
    setScopeDealerIds([]);
    setScopeOutletIds([]);
    setMasters([]);
    setSelectedMasterKey('');
    setMasterVersions([]);
    setMasterFile(null);
    setMasterWef('');
    setMasterImport(null);
    setMasterRows([]);
    setReadiness(null);
  }

  function handleProjectSelection(nextTenantId: string) {
    clearFeedback();
    clearProjectScopedUi();
    goToStep(1);
    if (!nextTenantId) {
      setProject(null);
      setProjectForm(emptyProjectForm());
    }
  }

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
        segmentIds: value.segments.map((segment) => segment.segmentId),
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

  async function loadDealers(preferredDealerId?: string) {
    if (!tenantId || !accessToken) return [] as DealerAdmin[];
    const values = await listDealersAdmin(tenantId, accessToken);
    setDealers(values);
    const dealerId = preferredDealerId || selectedDealerId || values[0]?.dealerId || '';
    setSelectedDealerId(dealerId);
    return values;
  }

  async function loadDealersAndOutlets(preferredDealerId?: string) {
    if (!tenantId || !accessToken) return;
    const values = await loadDealers(preferredDealerId);
    const dealerId = preferredDealerId || selectedDealerId || values[0]?.dealerId || '';
    if (dealerId) setOutlets(await listOutletsAdmin(tenantId, dealerId, accessToken));
    else setOutlets([]);
  }

  async function loadMappings() {
    if (!tenantId || !accessToken) return;
    setMappings(await listRoleMappings(tenantId, accessToken));
  }

  async function loadRoleMappingContext() {
    if (!tenantId || !accessToken) return;
    const dealerValues = await loadDealers();
    const outletGroups = await Promise.all(
      dealerValues.map((dealer) => listOutletsAdmin(tenantId, dealer.dealerId, accessToken)),
    );
    setOutlets(outletGroups.flat());
  }

  function selectMappingUser(userId: string) {
    setSelectedUserId(userId);
    const existing = mappings.find((item) => item.userId === userId);
    if (existing) {
      setOperatingRole(existing.operatingRole);
      setScopeDealerIds(existing.dealerIds);
      setScopeOutletIds(existing.outletIds);
    } else {
      setOperatingRole('PC');
      setScopeDealerIds([]);
      setScopeOutletIds([]);
    }
  }

  useEffect(() => {
    if (!selectedUserId) return;
    const existing = mappings.find((item) => item.userId === selectedUserId);
    if (!existing) return;
    setOperatingRole(existing.operatingRole);
    setScopeDealerIds(existing.dealerIds);
    setScopeOutletIds(existing.outletIds);
  }, [mappings, selectedUserId]);

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
        if (activeStep === 2) await loadDealers();
        if (activeStep === 3) await loadDealersAndOutlets();
        if (activeStep === 5) await loadRoleMappingContext();
        if ([4, 5].includes(activeStep)) setCandidates(await listRoleMappingCandidates(tenantId, '', accessToken));
        if (activeStep === 5) await loadMappings();
        if (activeStep === 6 && !isMahindraProject) await loadMasters();
        if ([7, 8].includes(activeStep)) setReadiness(await getProjectReadiness(tenantId, accessToken));
      } catch (error) {
        setPageError(errorMessage(error));
      }
    })();
  }, [activeStep, tenantId, accessToken, isMahindraProject]);

  async function submitProject(event: FormEvent) {
    event.preventDefault();
    clearFeedback();
    setBusy(true);
    try {
      if (!accessToken) throw new Error('Sign in is required.');
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
        setNotice('Project details updated successfully.');
      } else {
        const result = await createProject(
          {
            projectName: projectForm.projectName.trim(),
            oemId: projectForm.oemId.trim(),
            segmentIds: projectForm.segmentIds,
            effectiveStartDate: projectForm.effectiveStartDate,
            effectiveEndDate: projectForm.effectiveEndDate || null,
            timezoneName: projectForm.timezoneName.trim(),
            regionCode: projectForm.regionCode.trim() || null,
          },
          randomKey('project-create'),
          accessToken,
        );
        if (result.provisioningStatus !== 'READY' || !result.tenantId) {
          throw new Error('Project setup did not complete. Please try again.');
        }
        setBusinessContext({ tenantId: result.tenantId, dealerId: '', outletId: '' });
        setNotice('Project created successfully.');
      }
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitDealer(event: FormEvent) {
    event.preventDefault(); if (!tenantId || !accessToken) return;
    clearFeedback(); setBusy(true);
    try {
      const created = await createDealerAdmin(tenantId, { dealerName: dealerForm.dealerName.trim(), legalName: dealerForm.legalName.trim() || null }, accessToken);
      setDealerForm({ dealerName: '', legalName: '' });
      setDealers((current) => [...current.filter((item) => item.dealerId !== created.dealerId), created]);
      setSelectedDealerId(created.dealerId);
      setOutlets([]);
      setNotice('Dealer added successfully.');
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
      const created = await createOutletAdmin(
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
      setOutlets((current) => [...current.filter((item) => item.outletId !== created.outletId), created]);
      setNotice('Outlet added successfully.');
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
        dealerIds: operatingRole === 'CRM' ? scopeDealerIds : [],
        outletIds: operatingRole === 'PC' || operatingRole === 'CRM' ? scopeOutletIds : [],
      };
      const result = await putRoleMapping(tenantId, selectedUserId, payload, randomKey('role-map'), accessToken);
      await loadMappings();
      setNotice(result.operationStatus === 'COMPLETED' ? 'Role mapping saved successfully.' : 'Role mapping could not be completed. Please try again.');
    } catch (error) { setPageError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function removeMapping(userId: string) {
    if (!tenantId || !accessToken) return;
    clearFeedback(); setBusy(true);
    try {
      const result = await deleteRoleMapping(tenantId, userId, randomKey('role-remove'), accessToken);
      await loadMappings();
      setNotice(result.operationStatus === 'COMPLETED' ? 'Role mapping removed.' : 'Role mapping could not be removed. Please try again.');
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
      setNotice(imported.status === 'PREVIEW_READY' ? 'Workbook validated. Review the preview before confirming.' : 'Workbook received. Review its status before continuing.');
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
      setNotice('Import confirmed. A new version is ready to publish.');
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
      setNotice('Project activated successfully.');
    } catch (error) { setPageError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  const projectConfigured = Boolean(tenantId && project);

  return (
    <div className="screen-stack uc02-admin">
      <PageHeader
        eyebrow="Administration"
        title="Project Administration"
        description="Configure project details, dealers, outlets, team roles, master data and readiness before activation."
        actions={project && <StatusPill value={project.projectStatus} />}
      />

      <div className="uc02-project-strip">
        <div>
          <span>Project</span>
          <ProjectSelector currentProjectName={project?.projectName} onSelectionChange={handleProjectSelection} onError={setPageError} />
        </div>
        <div><span>Current Project</span><strong>{project?.projectName || 'New Project'}</strong></div>
        <div><span>Setup Progress</span><strong>Step {activeStep} of 8</strong></div>
      </div>

      <ProjectAdminStepper activeStep={activeStep} onChange={goToStep} projectConfigured={projectConfigured} />

      {(pageError || notice) && <div className={`uc02-message ${pageError ? 'uc02-message--error' : 'uc02-message--success'}`}><strong>{pageError ? 'Could Not Complete Request' : 'Updated'}</strong><span>{pageError || notice}</span></div>}

      <section className="uc02-workspace">
        <header className="uc02-workspace__header"><div><small>{currentStep.short}</small><h2>{currentStep.label}</h2><p>{currentStep.description}</p></div><span className="uc02-workspace__step">Step {activeStep} of 8</span></header>

        {activeStep === 1 && (
          <div className="uc02-grid uc02-grid--project">
            <form className="uc02-card" onSubmit={submitProject}>
              <div className="uc02-card__title"><h3>{project ? 'Project Details' : 'Create Project'}</h3><p>{project ? 'Update the project information that can still be changed.' : 'Enter the project details required to begin setup.'}</p></div>
              <div className="uc02-form-grid">
                <Field label="Project Name"><input required value={projectForm.projectName} onChange={(event) => setProjectForm({ ...projectForm, projectName: event.target.value })} /></Field>
                <ProjectReferenceFields
                  oemId={projectForm.oemId}
                  segmentIds={projectForm.segmentIds}
                  disabled={Boolean(project)}
                  onOemChange={(oemId) => setProjectForm((current) => ({ ...current, oemId }))}
                  onSegmentsChange={(segmentIds) => setProjectForm((current) => ({ ...current, segmentIds }))}
                  onError={setPageError}
                />
                <Field label="Effective Start"><input type="date" required disabled={Boolean(project)} value={projectForm.effectiveStartDate} onChange={(event) => setProjectForm({ ...projectForm, effectiveStartDate: event.target.value })} /></Field>
                <Field label="Effective End"><input type="date" value={projectForm.effectiveEndDate} onChange={(event) => setProjectForm({ ...projectForm, effectiveEndDate: event.target.value })} /></Field>
                <Field label="Timezone"><input required value={projectForm.timezoneName} onChange={(event) => setProjectForm({ ...projectForm, timezoneName: event.target.value })} /></Field>
                <Field label="Region / Geography"><input value={projectForm.regionCode} onChange={(event) => setProjectForm({ ...projectForm, regionCode: event.target.value })} /></Field>
              </div>
              <div className="uc02-actions"><button className="uc02-button uc02-button--primary" disabled={busy || projectLoading}>{busy ? 'Saving…' : project ? 'Save Project Details' : 'Create Project'}</button></div>
            </form>
          </div>
        )}

        {activeStep === 2 && (
          <div className="uc02-grid">
            <form className="uc02-card" onSubmit={submitDealer}>
              <div className="uc02-card__title"><h3>Add Dealer</h3><p>Add a dealer to this project.</p></div>
              <Field label="Dealer Name"><input required value={dealerForm.dealerName} onChange={(event) => setDealerForm({ ...dealerForm, dealerName: event.target.value })} /></Field>
              <Field label="Legal Name"><input value={dealerForm.legalName} onChange={(event) => setDealerForm({ ...dealerForm, legalName: event.target.value })} /></Field>
              <div className="uc02-actions"><button className="uc02-button uc02-button--primary" disabled={busy}>Add Dealer</button></div>
            </form>
            <div className="uc02-card uc02-card--wide"><div className="uc02-card__title"><h3>Project Dealers</h3><p>{dealers.length} configured</p></div>{dealers.length ? <div className="uc02-table-wrap"><table className="uc02-table"><thead><tr><th>Dealer</th><th>Status</th></tr></thead><tbody>{dealers.map((item) => <tr key={item.dealerId}><td><strong>{item.dealerName}</strong><small>{item.legalName}</small></td><td><StatusPill value={item.status} compact /></td></tr>)}</tbody></table></div> : <EmptyMessage>No dealers configured yet.</EmptyMessage>}</div>
          </div>
        )}

        {activeStep === 3 && (
          <div className="uc02-grid">
            <form className="uc02-card" onSubmit={submitOutlet}>
              <div className="uc02-card__title"><h3>Add Dealer Outlet</h3><p>Add an outlet location for the selected dealer.</p></div>
              <Field label="Dealer"><select required value={selectedDealerId} onChange={(event) => void changeDealer(event.target.value)}><option value="">Select dealer</option>{dealers.map((item) => <option key={item.dealerId} value={item.dealerId}>{item.dealerName}</option>)}</select></Field>
              <Field label="Outlet Name"><input required value={outletForm.outletName} onChange={(event) => setOutletForm({ ...outletForm, outletName: event.target.value })} /></Field>
              <Field label="Classification"><select value={outletForm.outletClassification} onChange={(event) => setOutletForm({ ...outletForm, outletClassification: event.target.value as 'ONSITE' | 'SATELLITE' })}><option value="ONSITE">Onsite</option><option value="SATELLITE">Satellite</option></select></Field>
              <Field label="Address"><textarea value={outletForm.addressText} onChange={(event) => setOutletForm({ ...outletForm, addressText: event.target.value })} /></Field>
              <div className="uc02-form-grid"><Field label="City"><input value={outletForm.city} onChange={(event) => setOutletForm({ ...outletForm, city: event.target.value })} /></Field><Field label="State / Region"><input value={outletForm.stateRegion} onChange={(event) => setOutletForm({ ...outletForm, stateRegion: event.target.value })} /></Field><Field label="Postal Code"><input value={outletForm.postalCode} onChange={(event) => setOutletForm({ ...outletForm, postalCode: event.target.value })} /></Field><Field label="Monthly Vehicle Volume"><input type="number" min="0" value={outletForm.monthlyVehicleVolume} onChange={(event) => setOutletForm({ ...outletForm, monthlyVehicleVolume: event.target.value })} /></Field></div>
              <div className="uc02-actions"><button className="uc02-button uc02-button--primary" disabled={busy || !selectedDealerId}>Add Outlet</button></div>
            </form>
            <div className="uc02-card uc02-card--wide"><div className="uc02-card__title"><h3>{selectedDealer ? `${selectedDealer.dealerName} Outlets` : 'Dealer Outlets'}</h3><p>{outlets.length} configured</p></div>{outlets.length ? <div className="uc02-table-wrap"><table className="uc02-table"><thead><tr><th>Outlet</th><th>Location</th><th>Class</th><th>Status</th></tr></thead><tbody>{outlets.map((item) => <tr key={item.outletId}><td><strong>{item.outletName}</strong></td><td>{[item.city, item.stateRegion].filter(Boolean).join(', ') || '—'}</td><td>{item.outletClassification}</td><td><StatusPill value={item.status} compact /></td></tr>)}</tbody></table></div> : <EmptyMessage>Select a dealer or add its first outlet.</EmptyMessage>}</div>
          </div>
        )}

        {activeStep === 4 && (
          <div className="uc02-card">
            <div className="uc02-card__title"><h3>Employees</h3><p>Find people who can be assigned to this project.</p></div>
            <form className="uc02-search" onSubmit={searchCandidates}><input value={candidateQuery} onChange={(event) => setCandidateQuery(event.target.value)} placeholder="Search by name or email" /><button className="uc02-button uc02-button--primary" disabled={busy}>Search</button></form>
            {candidates.length ? <div className="uc02-table-wrap"><table className="uc02-table"><thead><tr><th>Employee</th><th>Status</th><th></th></tr></thead><tbody>{candidates.map((item) => <tr key={item.userId}><td><strong>{item.displayName}</strong><small>{item.primaryEmail || 'Email unavailable'}</small></td><td><StatusPill value={item.status} compact /></td><td><button className="uc02-link-button" type="button" onClick={() => { selectMappingUser(item.userId); goToStep(5); }}>Map Role</button></td></tr>)}</tbody></table></div> : <EmptyMessage>No employees loaded yet.</EmptyMessage>}
          </div>
        )}

        {activeStep === 5 && (
          <div className="uc02-grid uc02-grid--mapping">
            <form className="uc02-card" onSubmit={saveMapping}>
              <div className="uc02-card__title"><h3>Role Mapping</h3><p>Assign an operating role and working scope.</p></div>
              <Field label="Employee"><select required value={selectedUserId} onChange={(event) => selectMappingUser(event.target.value)}><option value="">Select employee</option>{candidates.map((item) => <option key={item.userId} value={item.userId}>{item.displayName}{item.primaryEmail ? ` · ${item.primaryEmail}` : ''}</option>)}</select></Field>
              {selectedCandidate && <div className="uc02-selected-person"><strong>{selectedCandidate.displayName}</strong><span>{selectedCandidate.primaryEmail}</span></div>}
              {selectedMapping && <div className="uc02-note">Saved mapping loaded: {selectedMapping.operatingRole} · {selectedMapping.outletIds.length ? `${selectedMapping.outletIds.length} outlet(s)` : selectedMapping.dealerIds.length ? `${selectedMapping.dealerIds.length} dealer(s)` : 'Project-wide'}.</div>}
              <Field label="Operating Role"><select value={operatingRole} onChange={(event) => { setOperatingRole(event.target.value as OperatingRole); setScopeDealerIds([]); setScopeOutletIds([]); }}><option value="PC">Process Consultant</option><option value="TL">Team Lead</option><option value="PM">Project Manager</option><option value="CRM">CRM</option><option value="Executive">Executive</option></select></Field>
              {operatingRole === 'PC' && <div className="uc02-scope"><strong>Outlet Scope</strong>{dealers.flatMap((dealer) => outlets.filter((outlet) => outlet.dealerId === dealer.dealerId).map((outlet) => <label key={outlet.outletId}><input type="checkbox" checked={scopeOutletIds.includes(outlet.outletId)} onChange={(event) => toggleValue(scopeOutletIds, outlet.outletId, event.target.checked, setScopeOutletIds)} />{dealer.dealerName} · {outlet.outletName}</label>))}{!outlets.length && <small>Add dealer outlets before assigning a Process Consultant.</small>}</div>}
              {operatingRole === 'CRM' && <><div className="uc02-scope"><strong>Dealer Scope (optional)</strong>{dealers.map((dealer) => <label key={dealer.dealerId}><input type="checkbox" checked={scopeDealerIds.includes(dealer.dealerId)} onChange={(event) => toggleValue(scopeDealerIds, dealer.dealerId, event.target.checked, setScopeDealerIds)} />{dealer.dealerName}</label>)}</div><div className="uc02-scope"><strong>Outlet Scope (optional; leave both scopes blank for project-wide access)</strong>{dealers.flatMap((dealer) => outlets.filter((outlet) => outlet.dealerId === dealer.dealerId).map((outlet) => <label key={outlet.outletId}><input type="checkbox" checked={scopeOutletIds.includes(outlet.outletId)} onChange={(event) => toggleValue(scopeOutletIds, outlet.outletId, event.target.checked, setScopeOutletIds)} />{dealer.dealerName} · {outlet.outletName}</label>))}</div></>}
              {(operatingRole === 'TL' || operatingRole === 'PM' || operatingRole === 'Executive') && <div className="uc02-note">This role works across the project; no dealer or outlet selection is required.</div>}
              <div className="uc02-actions"><button className="uc02-button uc02-button--primary" disabled={busy || !selectedUserId}>{selectedMapping ? 'Update Role Mapping' : 'Save Role Mapping'}</button></div>
            </form>
            <div className="uc02-card uc02-card--wide"><div className="uc02-card__title"><h3>Active Mappings</h3><p>{mappings.length} users mapped</p></div>{mappings.length ? <div className="uc02-table-wrap"><table className="uc02-table"><thead><tr><th>Employee</th><th>Role</th><th>Scope</th><th></th></tr></thead><tbody>{mappings.map((item) => { const person = candidates.find((candidate) => candidate.userId === item.userId); return <tr key={item.userId}><td><strong>{person?.displayName || 'Assigned Employee'}</strong><small>{person?.primaryEmail || ''}</small></td><td><strong>{item.operatingRole}</strong></td><td>{item.outletIds.length ? `${item.outletIds.length} outlet(s)` : item.dealerIds.length ? `${item.dealerIds.length} dealer(s)` : 'Project-wide'}</td><td><button className="uc02-link-button uc02-link-button--danger" type="button" onClick={() => void removeMapping(item.userId)} disabled={busy}>Remove</button></td></tr>; })}</tbody></table></div> : <EmptyMessage>No active role mappings yet.</EmptyMessage>}</div>
          </div>
        )}

        {activeStep === 6 && isMahindraProject && tenantId && project && (
          <MahindraMasterUploads
            tenantId={tenantId}
            segments={project.segments}
            onError={setPageError}
          />
        )}

        {activeStep === 6 && !isMahindraProject && (
          <div className="uc02-master-layout">
            <aside className="uc02-card uc02-master-list"><div className="uc02-card__title"><h3>Master Catalogue</h3><p>Select a master to upload or manage its versions.</p></div>{masters.map((item) => <button key={`${item.ownerModule}-${item.masterKey}`} type="button" className={`uc02-master-list__item${selectedMasterKey === item.masterKey ? ' active' : ''}`} onClick={() => void changeMaster(item.masterKey)}><span><strong>{item.displayName}</strong><small>{item.administrationModes.includes('EXCEL') ? 'Excel supported' : 'Managed configuration'}</small></span><StatusPill value={item.lifecycleStatus || 'NOT_CONFIGURED'} compact /></button>)}</aside>
            <div className="uc02-card uc02-card--wide">
              {selectedMaster ? <><div className="uc02-card__title"><h3>{selectedMaster.displayName}</h3><p>{selectedMaster.requiresWef ? 'An effective date is required for this master.' : 'Manage the current master data and published versions.'}</p></div>
                {selectedMaster.administrationModes.includes('EXCEL') && <div className="uc02-master-actions"><button className="uc02-button" type="button" onClick={() => void getTemplate()} disabled={busy}>Get Excel Template</button></div>}
                {selectedMaster.administrationModes.includes('EXCEL') && <form className="uc02-master-upload" onSubmit={submitMasterImport}><Field label="Completed Workbook"><input type="file" accept=".xlsx" required onChange={(event) => setMasterFile(event.target.files?.[0] || null)} /></Field>{selectedMaster.requiresWef && <Field label="Effective From"><input type="date" required value={masterWef} onChange={(event) => setMasterWef(event.target.value)} /></Field>}<button className="uc02-button uc02-button--primary" disabled={busy || !masterFile}>Upload &amp; Validate</button></form>}
                {masterImport && <div className="uc02-import-summary"><div><span>Status</span><StatusPill value={masterImport.status} /></div><div><span>Rows</span><strong>{masterImport.rowsParsed}</strong></div><div><span>Valid</span><strong>{masterImport.validRows}</strong></div><div><span>Warnings</span><strong>{masterImport.warningRows}</strong></div><div><span>Errors</span><strong>{masterImport.errorRows}</strong></div></div>}
                {masterRows.length > 0 && <div className="uc02-table-wrap"><table className="uc02-table"><thead><tr><th>Row</th><th>Status</th><th>Messages</th></tr></thead><tbody>{masterRows.slice(0, 100).map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td><StatusPill value={row.validationStatus} compact /></td><td>{row.messages.join(' · ') || 'No issues'}</td></tr>)}</tbody></table></div>}
                {masterImport && <div className="uc02-actions"><button className="uc02-button" type="button" onClick={() => void errorReport()} disabled={busy}>Validation Report</button><button className="uc02-button uc02-button--primary" type="button" onClick={() => void confirmImport()} disabled={busy || masterImport.status !== 'PREVIEW_READY' || masterImport.errorRows > 0}>Confirm Import</button></div>}
                <div className="uc02-version-list"><h4>Versions</h4>{masterVersions.length ? masterVersions.map((version) => <div className="uc02-version-row" key={version.versionId}><span><strong>{version.displayName || version.businessKey || `Version ${version.versionNo || ''}`}</strong><small>{version.effectiveFrom ? `Effective ${version.effectiveFrom}` : 'Version details'}</small></span><StatusPill value={version.lifecycleStatus} compact />{version.lifecycleStatus === 'DRAFT' && <button className="uc02-link-button" type="button" onClick={() => void publishVersion(version.versionId)} disabled={busy}>Publish</button>}</div>) : <EmptyMessage>No versions yet.</EmptyMessage>}</div>
              </> : <EmptyMessage>Select a Project Master.</EmptyMessage>}
            </div>
          </div>
        )}

        {activeStep === 7 && (
          <div className="uc02-card"><div className="uc02-card__title uc02-card__title--row"><div><h3>Project Readiness</h3><p>Complete all required items before activation.</p></div><button className="uc02-button" type="button" onClick={() => void refreshReadiness()} disabled={busy}>Refresh Checks</button></div>{readiness ? <><div className={`uc02-readiness-banner ${readiness.readyToActivate ? 'ready' : 'blocked'}`}><strong>{readiness.readyToActivate ? 'Ready to Activate' : 'Activation Blocked'}</strong><span>Checked {new Date(readiness.evaluatedAtUtc).toLocaleString()}</span></div><div className="uc02-checks">{readiness.checks.map((check) => <article key={check.checkKey} className="uc02-check"><StatusPill value={check.status} compact /><div><strong>{check.message}</strong><small>{check.severity === 'BLOCKING' ? 'Required before activation' : 'Review recommended'}</small></div></article>)}</div></> : <EmptyMessage>Run the readiness check to continue.</EmptyMessage>}</div>
        )}

        {activeStep === 8 && (
          <div className="uc02-grid uc02-grid--activation"><div className="uc02-card"><div className="uc02-card__title"><h3>Activate Project</h3><p>Review readiness and activate the project when all required checks have passed.</p></div>{readiness ? <div className={`uc02-readiness-banner ${readiness.readyToActivate ? 'ready' : 'blocked'}`}><strong>{readiness.readyToActivate ? 'All Required Checks Passed' : 'Project Is Not Ready'}</strong><span>{readiness.checks.filter((item) => item.severity === 'BLOCKING' && item.status !== 'PASS').length} required item(s) remaining</span></div> : <EmptyMessage>Readiness has not been checked.</EmptyMessage>}<div className="uc02-actions"><button className="uc02-button" type="button" onClick={() => void refreshReadiness()} disabled={busy}>Re-check Readiness</button><button className="uc02-button uc02-button--primary" type="button" onClick={() => void doActivate()} disabled={busy || !readiness?.readyToActivate || project?.projectStatus === 'ACTIVE'}>{project?.projectStatus === 'ACTIVE' ? 'Project Is Active' : 'Activate Project'}</button></div></div><aside className="uc02-card uc02-card--soft"><div className="uc02-card__title"><h3>Before You Activate</h3></div><ol className="uc02-ordered"><li>Confirm all required readiness checks have passed.</li><li>Review the project, dealer, outlet and team setup.</li><li>Confirm the required master data has been published.</li><li>Activate only when the project is ready for operational use.</li></ol></aside></div>
        )}
      </section>

      <footer className="uc02-footer-nav"><button className="uc02-button" type="button" disabled={activeStep === 1} onClick={() => goToStep(activeStep - 1)}>Previous</button><span>{currentStep.label}</span><button className="uc02-button uc02-button--primary" type="button" disabled={activeStep === 8 || !projectConfigured} onClick={() => goToStep(activeStep + 1)}>Next</button></footer>
    </div>
  );
}
