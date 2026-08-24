import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
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
  type ReadinessCheck,
  type RoleMapping,
  type RoleMappingCandidate,
  type Uc02Project,
} from '../services/audit-core/uc02Admin';
import {
  deleteDealerAdmin,
  deleteOutletAdmin,
  getDealerDeletionImpact,
  getOutletDeletionImpact,
  patchDealerAdmin,
  patchOutletAdmin,
  resetProjectMasters,
} from '../services/audit-core/uc02AdminMutations';
import {
  downloadMasterImportErrorReport,
  listMasterImportRows,
  type MasterImportRow,
} from '../services/audit-core/uc02MasterImports';
import { deleteConfiguringDealerSetup, listProjectOutlets } from '../services/audit-core/uc02Stabilization';
import { auditCoreErrorMessage } from '../services/audit-core/errorMessage';
import { useSessionStore } from '../store/sessionStore';

const MAHINDRA_SEGMENT_CODES = new Set([
  'PASSENGER_VEHICLE',
  'COMMERCIAL',
  'BATTERY_ELECTRIC',
]);
const MAHINDRA_SPECIALIZED_MASTER_KEYS = new Set(['PRODUCT_MASTER', 'PRICE_LIST', 'DISCOUNT_SCHEME']);

type DealerEditor = { mode: 'new' } | { mode: 'edit'; item: DealerAdmin } | null;
type OutletEditor = { mode: 'new' } | { mode: 'edit'; item: OutletAdmin } | null;

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

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="uc02-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function dependencySummary(dependencies: Record<string, number>) {
  const active = Object.entries(dependencies).filter(([, count]) => count > 0);
  return active.length
    ? active.map(([name, count]) => `${name.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${count}`).join(' · ')
    : 'No dependent Project data was reported.';
}

function targetStepForCheck(check: ReadinessCheck): number | null {
  const exact: Record<string, number> = {
    PROJECT_DETAILS: 1,
    DEALERS: 2,
    DEALER_OUTLETS: 3,
    EMPLOYEES: 4,
    ROLE_MAPPING: 5,
    PROJECT_MASTERS: 6,
    DOCUMENT_INTELLIGENCE: 6,
  };
  const targetTask = check.targetTask.toUpperCase();
  if (exact[targetTask]) return exact[targetTask];

  const value = `${check.area} ${check.checkKey}`.toUpperCase();
  if (value.includes('ROLE') || value.includes('MAPPING') || value.includes('TEAM') || value.includes('PC_COVERAGE')) return 5;
  if (value.includes('MASTER') || value.includes('POLICY') || value.includes('PRICE') || value.includes('PRODUCT') || value.includes('DI_')) return 6;
  if (value.includes('OUTLET')) return 3;
  if (value.includes('DEALER')) return 2;
  if (value.includes('EMPLOYEE') || value.includes('USER')) return 4;
  if (value.includes('PROJECT')) return 1;
  return null;
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

const emptyDealerForm = () => ({ dealerName: '', legalName: '', status: 'ACTIVE' });
const emptyOutletForm = () => ({
  dealerId: '',
  outletName: '',
  outletClassification: 'ONSITE' as 'ONSITE' | 'SATELLITE',
  addressText: '',
  city: '',
  stateRegion: '',
  postalCode: '',
  monthlyVehicleVolume: '',
  status: 'ACTIVE',
});

export default function ProjectAdministrationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const accessToken = useSessionStore((state) => state.accessToken);
  const tenantId = useSessionStore((state) => state.tenantId);
  const role = useSessionStore((state) => state.role);
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
  const [dealerEditor, setDealerEditor] = useState<DealerEditor>(null);
  const [dealerForm, setDealerForm] = useState(emptyDealerForm);

  const [outlets, setOutlets] = useState<OutletAdmin[]>([]);
  const [outletDealerFilter, setOutletDealerFilter] = useState('');
  const [outletEditor, setOutletEditor] = useState<OutletEditor>(null);
  const [outletForm, setOutletForm] = useState(emptyOutletForm);

  const [candidateQuery, setCandidateQuery] = useState('');
  const [candidates, setCandidates] = useState<RoleMappingCandidate[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [mappings, setMappings] = useState<RoleMapping[]>([]);
  const [mappingEditorOpen, setMappingEditorOpen] = useState(false);
  const [operatingRole, setOperatingRole] = useState<OperatingRole>('PC');
  const [scopeDealerIds, setScopeDealerIds] = useState<string[]>([]);
  const [scopeOutletIds, setScopeOutletIds] = useState<string[]>([]);

  const [masters, setMasters] = useState<MasterDescriptor[]>([]);
  const [selectedMasterKey, setSelectedMasterKey] = useState('');
  const [masterEditorOpen, setMasterEditorOpen] = useState(false);
  const [masterVersions, setMasterVersions] = useState<MasterVersion[]>([]);
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [masterWef, setMasterWef] = useState('');
  const [masterImport, setMasterImport] = useState<MasterImport | null>(null);
  const [masterRows, setMasterRows] = useState<MasterImportRow[]>([]);
  const [masterResetVersion, setMasterResetVersion] = useState(0);
  const [readiness, setReadiness] = useState<ProjectReadiness | null>(null);

  const selectedMaster = useMemo(
    () => masters.find((item) => item.masterKey === selectedMasterKey) || null,
    [masters, selectedMasterKey],
  );
  const selectedCandidate = useMemo(
    () => candidates.find((item) => item.userId === selectedUserId) || null,
    [candidates, selectedUserId],
  );
  const selectedMapping = useMemo(
    () => mappings.find((item) => item.userId === selectedUserId) || null,
    [mappings, selectedUserId],
  );
  const currentStep = projectAdminSteps.find((item) => item.key === activeStep)!;
  const isMahindraProject = Boolean(
    project?.segments.length && project.segments.every((segment) => MAHINDRA_SEGMENT_CODES.has(segment.segmentCode)),
  );
  const projectConfigured = Boolean(tenantId && project);
  const canCreateProject = role === 'SUPER_ADMIN';
  const canResetMasters = project?.projectStatus === 'CONFIGURING';
  const filteredOutlets = outletDealerFilter
    ? outlets.filter((item) => item.dealerId === outletDealerFilter)
    : outlets;
  const visibleConfigurationMasters = isMahindraProject
    ? masters.filter((item) => item.ownerModule === 'DI' || !MAHINDRA_SPECIALIZED_MASTER_KEYS.has(item.masterKey))
    : masters;

  const goToStep = (step: number) => setSearchParams({ step: String(step) });
  const clearFeedback = () => { setPageError(''); setNotice(''); };

  function clearProjectScopedUi() {
    setDealers([]);
    setDealerEditor(null);
    setDealerForm(emptyDealerForm());
    setOutlets([]);
    setOutletDealerFilter('');
    setOutletEditor(null);
    setOutletForm(emptyOutletForm());
    setCandidates([]);
    setSelectedUserId('');
    setMappings([]);
    setMappingEditorOpen(false);
    setScopeDealerIds([]);
    setScopeOutletIds([]);
    setMasters([]);
    setSelectedMasterKey('');
    setMasterEditorOpen(false);
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
      setProject(null);
      setPageError(errorMessage(error));
    } finally {
      setProjectLoading(false);
    }
  }

  useEffect(() => { void loadProject(); }, [tenantId, accessToken]);

  async function loadDealers() {
    if (!tenantId || !accessToken) return [] as DealerAdmin[];
    const values = await listDealersAdmin(tenantId, accessToken);
    setDealers(values);
    return values;
  }

  async function loadDealerHierarchy() {
    if (!tenantId || !accessToken) return;
    const [dealerValues, outletValues] = await Promise.all([
      listDealersAdmin(tenantId, accessToken),
      listProjectOutlets(tenantId, accessToken),
    ]);
    setDealers(dealerValues);
    setOutlets(outletValues);
  }

  async function loadMappings() {
    if (!tenantId || !accessToken) return;
    setMappings(await listRoleMappings(tenantId, accessToken));
  }

  async function loadRoleMappingContext() {
    if (!tenantId || !accessToken) return;
    await Promise.all([
      loadDealerHierarchy(),
      listRoleMappingCandidates(tenantId, '', accessToken).then(setCandidates),
      loadMappings(),
    ]);
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

  function openMappingEditor(userId = '') {
    selectMappingUser(userId);
    setMappingEditorOpen(true);
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
  }

  useEffect(() => {
    clearFeedback();
    setDealerEditor(null);
    setOutletEditor(null);
    if (activeStep !== 5) setMappingEditorOpen(false);
    if (activeStep !== 6) setMasterEditorOpen(false);
    if (!tenantId || !accessToken || activeStep === 1) return;
    void (async () => {
      try {
        if (activeStep === 2) await loadDealers();
        if (activeStep === 3) await loadDealerHierarchy();
        if (activeStep === 4) setCandidates(await listRoleMappingCandidates(tenantId, '', accessToken));
        if (activeStep === 5) await loadRoleMappingContext();
        if (activeStep === 6) await loadMasters();
        if (activeStep === 7) setReadiness(await getProjectReadiness(tenantId, accessToken));
        if (activeStep === 8) {
          const [nextReadiness] = await Promise.all([
            getProjectReadiness(tenantId, accessToken),
            loadDealerHierarchy(),
            loadMappings(),
          ]);
          setReadiness(nextReadiness);
        }
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
        if (!canCreateProject) throw new Error('Tenant Admin can administer only its assigned Project.');
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

  function openNewDealer() {
    clearFeedback();
    setDealerForm(emptyDealerForm());
    setDealerEditor({ mode: 'new' });
  }

  function openEditDealer(item: DealerAdmin) {
    clearFeedback();
    setDealerForm({ dealerName: item.dealerName, legalName: item.legalName || '', status: item.status });
    setDealerEditor({ mode: 'edit', item });
  }

  async function submitDealer(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !accessToken || !dealerEditor) return;
    clearFeedback();
    setBusy(true);
    try {
      if (dealerEditor.mode === 'new') {
        const created = await createDealerAdmin(
          tenantId,
          { dealerName: dealerForm.dealerName.trim(), legalName: dealerForm.legalName.trim() || null },
          accessToken,
        );
        setDealers((current) => [...current.filter((item) => item.dealerId !== created.dealerId), created]);
        setNotice('Dealer added successfully.');
      } else {
        const updated = await patchDealerAdmin(
          tenantId,
          dealerEditor.item.dealerId,
          dealerEditor.item.versionNo,
          {
            dealerName: dealerForm.dealerName.trim(),
            legalName: dealerForm.legalName.trim() || null,
            status: dealerForm.status,
          },
          accessToken,
        );
        setDealers((current) => current.map((item) => item.dealerId === updated.dealerId ? updated : item));
        setNotice('Dealer updated successfully.');
      }
      setDealerEditor(null);
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeDealer(item: DealerAdmin) {
    if (!tenantId || !accessToken) return;
    clearFeedback();
    if (project?.projectStatus === 'CONFIGURING') {
      if (!window.confirm(`Remove dealer “${item.dealerName}” from this configuring Project? Empty setup outlets will also be removed. Linked business data will remain protected.`)) return;
      setBusy(true);
      try {
        await deleteConfiguringDealerSetup(tenantId, item.dealerId, randomKey('dealer-setup-delete'), accessToken);
        setDealers((current) => current.filter((dealer) => dealer.dealerId !== item.dealerId));
        setOutlets((current) => current.filter((outlet) => outlet.dealerId !== item.dealerId));
        if (dealerEditor?.mode === 'edit' && dealerEditor.item.dealerId === item.dealerId) setDealerEditor(null);
        setNotice('Dealer setup removed successfully.');
      } catch (error) {
        setPageError(errorMessage(error));
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      const impact = await getDealerDeletionImpact(tenantId, item.dealerId, accessToken);
      if (!impact.canDelete) {
        setPageError(`Dealer cannot be deleted because dependent Project data exists. ${dependencySummary(impact.dependencies)}`);
        return;
      }
      if (!window.confirm(`Delete dealer “${item.dealerName}”? This cannot be undone.`)) return;
      await deleteDealerAdmin(tenantId, item.dealerId, randomKey('dealer-delete'), accessToken);
      setDealers((current) => current.filter((dealer) => dealer.dealerId !== item.dealerId));
      setOutlets((current) => current.filter((outlet) => outlet.dealerId !== item.dealerId));
      if (dealerEditor?.mode === 'edit' && dealerEditor.item.dealerId === item.dealerId) setDealerEditor(null);
      setNotice('Dealer deleted.');
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function openNewOutlet() {
    clearFeedback();
    const firstDealerId = outletDealerFilter || dealers[0]?.dealerId || '';
    setOutletForm({ ...emptyOutletForm(), dealerId: firstDealerId });
    setOutletEditor({ mode: 'new' });
  }

  function openEditOutlet(item: OutletAdmin) {
    clearFeedback();
    setOutletForm({
      dealerId: item.dealerId,
      outletName: item.outletName,
      outletClassification: item.outletClassification === 'SATELLITE' ? 'SATELLITE' : 'ONSITE',
      addressText: item.addressText || '',
      city: item.city || '',
      stateRegion: item.stateRegion || '',
      postalCode: item.postalCode || '',
      monthlyVehicleVolume: item.monthlyVehicleVolume == null ? '' : String(item.monthlyVehicleVolume),
      status: item.status,
    });
    setOutletEditor({ mode: 'edit', item });
  }

  async function submitOutlet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || !accessToken || !outletEditor || !outletForm.dealerId) return;
    clearFeedback();
    setBusy(true);
    try {
      const submitted = new FormData(event.currentTarget);
      const latitudeText = String(submitted.get('latitude') || '').trim();
      const longitudeText = String(submitted.get('longitude') || '').trim();
      const latitude = latitudeText ? Number(latitudeText) : null;
      const longitude = longitudeText ? Number(longitudeText) : null;
      const payload = {
        outletName: outletForm.outletName.trim(),
        outletClassification: outletForm.outletClassification,
        addressText: outletForm.addressText.trim() || null,
        city: outletForm.city.trim() || null,
        stateRegion: outletForm.stateRegion.trim() || null,
        postalCode: outletForm.postalCode.trim() || null,
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        monthlyVehicleVolume: outletForm.monthlyVehicleVolume ? Number(outletForm.monthlyVehicleVolume) : null,
      };
      if (outletEditor.mode === 'new') {
        const created = await createOutletAdmin(tenantId, outletForm.dealerId, payload, accessToken);
        setOutlets((current) => [...current.filter((item) => item.outletId !== created.outletId), created]);
        setNotice('Outlet added successfully.');
      } else {
        const updated = await patchOutletAdmin(
          tenantId,
          outletEditor.item.dealerId,
          outletEditor.item.outletId,
          outletEditor.item.versionNo,
          { ...payload, status: outletForm.status },
          accessToken,
        );
        setOutlets((current) => current.map((item) => item.outletId === updated.outletId ? updated : item));
        setNotice('Outlet updated successfully.');
      }
      setOutletEditor(null);
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeOutlet(item: OutletAdmin) {
    if (!tenantId || !accessToken) return;
    clearFeedback();
    setBusy(true);
    try {
      const impact = await getOutletDeletionImpact(tenantId, item.dealerId, item.outletId, accessToken);
      if (!impact.canDelete) {
        setPageError(`Outlet cannot be deleted because dependent Project data exists. ${dependencySummary(impact.dependencies)}`);
        return;
      }
      if (!window.confirm(`Delete outlet “${item.outletName}”? This cannot be undone.`)) return;
      await deleteOutletAdmin(tenantId, item.dealerId, item.outletId, randomKey('outlet-delete'), accessToken);
      setOutlets((current) => current.filter((outlet) => outlet.outletId !== item.outletId));
      if (outletEditor?.mode === 'edit' && outletEditor.item.outletId === item.outletId) setOutletEditor(null);
      setNotice('Outlet deleted.');
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function searchCandidates(event?: FormEvent) {
    event?.preventDefault();
    if (!tenantId || !accessToken) return;
    clearFeedback();
    setBusy(true);
    try {
      const values = await listRoleMappingCandidates(tenantId, candidateQuery, accessToken);
      setCandidates(values);
      if (selectedUserId && !values.some((item) => item.userId === selectedUserId)) setSelectedUserId('');
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function toggleValue(values: string[], value: string, checked: boolean, setter: (next: string[]) => void) {
    setter(checked ? [...new Set([...values, value])] : values.filter((item) => item !== value));
  }

  async function saveMapping(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !accessToken || !selectedUserId) return;
    clearFeedback();
    if (operatingRole === 'PC' && scopeOutletIds.length === 0) {
      setPageError('Select at least one Dealer Outlet for the Process Consultant. Onsite and Satellite outlets are both supported.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        operatingRole,
        dealerIds: operatingRole === 'CRM' ? scopeDealerIds : [],
        outletIds: operatingRole === 'PC' || operatingRole === 'CRM' ? scopeOutletIds : [],
      };
      const result = await putRoleMapping(tenantId, selectedUserId, payload, randomKey('role-map'), accessToken);
      if (result.operationStatus === 'COMPLETED' && result.mapping) {
        setMappings((current) => [...current.filter((item) => item.userId !== result.mapping?.userId), result.mapping as RoleMapping]);
        setMappingEditorOpen(false);
        setNotice('Role mapping saved successfully.');
      } else {
        setPageError('Role mapping could not be completed. Please try again.');
      }
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeMapping(userId: string) {
    if (!tenantId || !accessToken) return;
    clearFeedback();
    if (!window.confirm('Remove this Project role mapping?')) return;
    setBusy(true);
    try {
      const result = await deleteRoleMapping(tenantId, userId, randomKey('role-remove'), accessToken);
      if (result.operationStatus === 'COMPLETED') {
        setMappings((current) => current.filter((item) => item.userId !== userId));
        if (selectedUserId === userId) {
          setSelectedUserId('');
          setMappingEditorOpen(false);
        }
        setNotice('Role mapping removed.');
      } else {
        setPageError('Role mapping could not be removed. Please try again.');
      }
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function openMaster(masterKey: string) {
    setSelectedMasterKey(masterKey);
    setMasterImport(null);
    setMasterRows([]);
    setMasterFile(null);
    setMasterWef('');
    setMasterEditorOpen(true);
    if (!tenantId || !accessToken) return;
    const descriptor = masters.find((item) => item.masterKey === masterKey);
    if (!descriptor) return;
    try {
      setMasterVersions(await listMasterVersions(tenantId, descriptor.ownerModule, descriptor.masterKey, accessToken));
    } catch (error) {
      setPageError(errorMessage(error));
    }
  }

  async function getTemplate() {
    if (!tenantId || !accessToken || !selectedMaster) return;
    clearFeedback();
    setBusy(true);
    try {
      const blob = await downloadMasterTemplate(tenantId, selectedMaster.ownerModule, selectedMaster.masterKey, accessToken);
      triggerBlob(blob, `${selectedMaster.masterKey.toLowerCase()}-template.xlsx`);
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitMasterImport(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !accessToken || !selectedMaster || !masterFile) return;
    clearFeedback();
    setBusy(true);
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
      setNotice(imported.status === 'PREVIEW_READY'
        ? 'Workbook validated. Review the preview before confirming.'
        : 'Workbook received. Review its status before continuing.');
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!tenantId || !accessToken || !masterImport || !selectedMaster) return;
    clearFeedback();
    setBusy(true);
    try {
      const confirmed = await confirmMasterImport(tenantId, masterImport.importId, accessToken);
      setMasterImport(confirmed);
      setMasterVersions(await listMasterVersions(tenantId, selectedMaster.ownerModule, selectedMaster.masterKey, accessToken));
      await loadMasters();
      setNotice('Import confirmed. A new version is ready to publish.');
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function publishVersion(versionId: string) {
    if (!tenantId || !accessToken || !selectedMaster) return;
    clearFeedback();
    setBusy(true);
    try {
      await publishMasterVersion(tenantId, selectedMaster.ownerModule, selectedMaster.masterKey, versionId, accessToken);
      setMasterVersions(await listMasterVersions(tenantId, selectedMaster.ownerModule, selectedMaster.masterKey, accessToken));
      await loadMasters();
      setNotice('Project Master version published.');
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function errorReport() {
    if (!tenantId || !accessToken || !masterImport) return;
    try {
      const blob = await downloadMasterImportErrorReport(tenantId, masterImport.importId, accessToken);
      triggerBlob(blob, `${masterImport.masterKey.toLowerCase()}-${masterImport.importId}-validation.csv`);
    } catch (error) {
      setPageError(errorMessage(error));
    }
  }

  async function resetMasters() {
    if (!tenantId || !accessToken || !canResetMasters) return;
    clearFeedback();
    if (!window.confirm('Reset all Project-owned masters for this Project? Global OEM and reference masters are not deleted.')) return;
    setBusy(true);
    try {
      await resetProjectMasters(tenantId, accessToken);
      setMasterEditorOpen(false);
      setSelectedMasterKey('');
      setMasterImport(null);
      setMasterRows([]);
      setMasterVersions([]);
      setMasterResetVersion((value) => value + 1);
      setReadiness(null);
      await loadMasters();
      setNotice('Project Masters reset successfully.');
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function refreshReadiness() {
    if (!tenantId || !accessToken) return;
    clearFeedback();
    setBusy(true);
    try {
      setReadiness(await getProjectReadiness(tenantId, accessToken));
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function doActivate() {
    if (!tenantId || !accessToken) return;
    clearFeedback();
    setBusy(true);
    try {
      const result = await activateProject(tenantId, randomKey('activate'), accessToken);
      setReadiness(result.readiness);
      await loadProject();
      setNotice('Project activated successfully.');
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen-stack uc02-admin">
      <PageHeader
        eyebrow="Administration"
        title="Project Administration"
        description="Configure project details, dealers, outlets, team roles, master data, Document Intelligence and readiness before activation."
        actions={project && <StatusPill value={project.projectStatus} />}
      />

      <div className="uc02-project-strip">
        <div>
          <span>Project</span>
          <ProjectSelector currentProjectName={project?.projectName} onSelectionChange={handleProjectSelection} onError={setPageError} />
        </div>
        <div><span>Current Project</span><strong>{project?.projectName || (canCreateProject ? 'New Project' : 'Assigned Project')}</strong></div>
        <div><span>Setup Progress</span><strong>Step {activeStep} of 8</strong></div>
      </div>

      <ProjectAdminStepper activeStep={activeStep} onChange={goToStep} projectConfigured={projectConfigured} />

      {(pageError || notice) && (
        <div className={`uc02-message ${pageError ? 'uc02-message--error' : 'uc02-message--success'}`}>
          <strong>{pageError ? 'Action Required' : 'Updated'}</strong>
          <span>{pageError || notice}</span>
        </div>
      )}

      <section className="uc02-workspace">
        <header className="uc02-workspace__header">
          <div><small>{currentStep.short}</small><h2>{currentStep.label}</h2><p>{currentStep.description}</p></div>
          <span className="uc02-workspace__step">Step {activeStep} of 8</span>
        </header>

        {activeStep === 1 && (
          <div className="uc02-step-body">
            {!project && !canCreateProject ? (
              <EmptyMessage>Select your assigned Project from the dashboard before opening Project Administration.</EmptyMessage>
            ) : (
              <form className="uc02-card uc02-card--form" onSubmit={submitProject}>
                <div className="uc02-card__title"><h3>{project ? 'Project Details' : 'Create Project'}</h3><p>{project ? 'Update the Project information that can still be changed.' : 'Enter the Project details required to begin setup.'}</p></div>
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
            )}
          </div>
        )}

        {activeStep === 2 && (
          <div className="uc02-step-body">
            <div className="uc02-card uc02-list-card">
              <div className="uc02-list-toolbar">
                <div className="uc02-card__title"><h3>Project Dealers</h3><p>{dealers.length} configured</p></div>
                <button className="uc02-button uc02-button--primary" type="button" onClick={openNewDealer} disabled={busy}>Add Dealer</button>
              </div>
              {dealers.length ? (
                <div className="uc02-table-wrap"><table className="uc02-table">
                  <thead><tr><th>Dealer</th><th>Legal Name</th><th>Code</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>{dealers.map((item) => (
                    <tr key={item.dealerId}>
                      <td><strong>{item.dealerName}</strong></td>
                      <td>{item.legalName || '—'}</td>
                      <td><code>{item.dealerCode}</code></td>
                      <td><StatusPill value={item.status} compact /></td>
                      <td><div className="uc02-row-actions"><button className="uc02-link-button" type="button" onClick={() => openEditDealer(item)}>Edit</button><button className="uc02-link-button uc02-link-button--danger" type="button" onClick={() => void removeDealer(item)} disabled={busy}>Delete</button></div></td>
                    </tr>
                  ))}</tbody>
                </table></div>
              ) : <EmptyMessage>No dealers configured yet.</EmptyMessage>}
            </div>
            {dealerEditor && (
              <form className="uc02-card uc02-editor-panel" onSubmit={submitDealer}>
                <div className="uc02-list-toolbar"><div className="uc02-card__title"><h3>{dealerEditor.mode === 'new' ? 'Add Dealer' : `Edit ${dealerEditor.item.dealerName}`}</h3><p>Save the dealer and return to the full Project dealer list.</p></div><button className="uc02-button" type="button" onClick={() => setDealerEditor(null)}>Close</button></div>
                <div className="uc02-form-grid">
                  <Field label="Dealer Name"><input required value={dealerForm.dealerName} onChange={(event) => setDealerForm({ ...dealerForm, dealerName: event.target.value })} /></Field>
                  <Field label="Legal Name"><input value={dealerForm.legalName} onChange={(event) => setDealerForm({ ...dealerForm, legalName: event.target.value })} /></Field>
                  {dealerEditor.mode === 'edit' && <Field label="Status"><select value={dealerForm.status} onChange={(event) => setDealerForm({ ...dealerForm, status: event.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></Field>}
                </div>
                <div className="uc02-actions"><button className="uc02-button" type="button" onClick={() => setDealerEditor(null)}>Cancel</button><button className="uc02-button uc02-button--primary" disabled={busy}>{busy ? 'Saving…' : dealerEditor.mode === 'new' ? 'Add Dealer' : 'Save Dealer'}</button></div>
              </form>
            )}
          </div>
        )}

        {activeStep === 3 && (
          <div className="uc02-step-body">
            <div className="uc02-card uc02-list-card">
              <div className="uc02-list-toolbar">
                <div className="uc02-card__title"><h3>Dealer Outlets</h3><p>{filteredOutlets.length} shown · {outlets.length} total</p></div>
                <div className="uc02-toolbar-actions"><label className="uc02-filter"><span>Dealer</span><select value={outletDealerFilter} onChange={(event) => setOutletDealerFilter(event.target.value)}><option value="">All Dealers</option>{dealers.map((dealer) => <option key={dealer.dealerId} value={dealer.dealerId}>{dealer.dealerName}</option>)}</select></label><button className="uc02-button uc02-button--primary" type="button" onClick={openNewOutlet} disabled={busy || !dealers.length}>Add Outlet</button></div>
              </div>
              {filteredOutlets.length ? (
                <div className="uc02-table-wrap"><table className="uc02-table">
                  <thead><tr><th>Dealer</th><th>Outlet</th><th>Location</th><th>Class</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>{filteredOutlets.map((item) => {
                    const dealer = dealers.find((entry) => entry.dealerId === item.dealerId);
                    return (
                      <tr key={item.outletId}>
                        <td>{dealer?.dealerName || '—'}</td>
                        <td><strong>{item.outletName}</strong><small>{item.outletCode}</small></td>
                        <td>{[item.addressText, item.city, item.stateRegion, item.postalCode].filter(Boolean).join(', ') || '—'}</td>
                        <td>{item.outletClassification}</td>
                        <td><StatusPill value={item.status} compact /></td>
                        <td><div className="uc02-row-actions"><button className="uc02-link-button" type="button" onClick={() => openEditOutlet(item)}>Edit</button><button className="uc02-link-button" type="button" onClick={() => openEditOutlet(item)}>Map / Location</button><button className="uc02-link-button uc02-link-button--danger" type="button" onClick={() => void removeOutlet(item)} disabled={busy}>Delete</button></div></td>
                      </tr>
                    );
                  })}</tbody>
                </table></div>
              ) : <EmptyMessage>{dealers.length ? 'No outlets match this Dealer filter.' : 'Add a Dealer before creating an outlet.'}</EmptyMessage>}
            </div>
            {outletEditor && (
              <form
                key={outletEditor.mode === 'edit' ? outletEditor.item.outletId : 'new-outlet'}
                className="uc02-card uc02-editor-panel uc02-outlet-editor"
                data-uc02-outlet-editor="true"
                onSubmit={submitOutlet}
              >
                <div className="uc02-list-toolbar"><div className="uc02-card__title"><h3>{outletEditor.mode === 'new' ? 'Add Dealer Outlet' : `Edit ${outletEditor.item.outletName}`}</h3><p>Manual address entry and Google Maps are both supported. Maps never saves the outlet by itself.</p></div><button className="uc02-button" type="button" onClick={() => setOutletEditor(null)}>Close</button></div>
                <div className="uc02-form-grid">
                  <Field label="Dealer"><select required disabled={outletEditor.mode === 'edit'} value={outletForm.dealerId} onChange={(event) => setOutletForm({ ...outletForm, dealerId: event.target.value })}><option value="">Select dealer</option>{dealers.map((item) => <option key={item.dealerId} value={item.dealerId}>{item.dealerName}</option>)}</select></Field>
                  <Field label="Outlet Name"><input required value={outletForm.outletName} onChange={(event) => setOutletForm({ ...outletForm, outletName: event.target.value })} /></Field>
                  <Field label="Classification"><select value={outletForm.outletClassification} onChange={(event) => setOutletForm({ ...outletForm, outletClassification: event.target.value as 'ONSITE' | 'SATELLITE' })}><option value="ONSITE">Onsite</option><option value="SATELLITE">Satellite</option></select></Field>
                  {outletEditor.mode === 'edit' && <Field label="Status"><select value={outletForm.status} onChange={(event) => setOutletForm({ ...outletForm, status: event.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></Field>}
                </div>
                <Field label="Address"><textarea value={outletForm.addressText} onChange={(event) => setOutletForm({ ...outletForm, addressText: event.target.value })} /></Field>
                <div className="uc02-form-grid"><Field label="City"><input value={outletForm.city} onChange={(event) => setOutletForm({ ...outletForm, city: event.target.value })} /></Field><Field label="State / Region"><input value={outletForm.stateRegion} onChange={(event) => setOutletForm({ ...outletForm, stateRegion: event.target.value })} /></Field><Field label="Postal Code"><input value={outletForm.postalCode} onChange={(event) => setOutletForm({ ...outletForm, postalCode: event.target.value })} /></Field><Field label="Monthly Vehicle Volume"><input type="number" min="0" value={outletForm.monthlyVehicleVolume} onChange={(event) => setOutletForm({ ...outletForm, monthlyVehicleVolume: event.target.value })} /></Field></div>
                <input type="hidden" name="latitude" defaultValue={outletEditor.mode === 'edit' && outletEditor.item.latitude != null ? String(outletEditor.item.latitude) : ''} />
                <input type="hidden" name="longitude" defaultValue={outletEditor.mode === 'edit' && outletEditor.item.longitude != null ? String(outletEditor.item.longitude) : ''} />
                <div className="uc02-actions"><button className="uc02-button" type="button" onClick={() => setOutletEditor(null)}>Cancel</button><button className="uc02-button uc02-button--primary" disabled={busy || !outletForm.dealerId}>{busy ? 'Saving…' : outletEditor.mode === 'new' ? 'Add Outlet' : 'Save Outlet'}</button></div>
              </form>
            )}
          </div>
        )}

        {activeStep === 4 && (
          <div className="uc02-step-body"><div className="uc02-card uc02-list-card">
            <div className="uc02-list-toolbar"><div className="uc02-card__title"><h3>Employees</h3><p>Security-owned users eligible for Project assignment.</p></div></div>
            <form className="uc02-search" onSubmit={searchCandidates}><input value={candidateQuery} onChange={(event) => setCandidateQuery(event.target.value)} placeholder="Search by name or email" /><button className="uc02-button uc02-button--primary" disabled={busy}>Search</button></form>
            {candidates.length ? <div className="uc02-table-wrap"><table className="uc02-table"><thead><tr><th>Employee</th><th>Email</th><th>Status</th><th>Project Action</th></tr></thead><tbody>{candidates.map((item) => <tr key={item.userId}><td><strong>{item.displayName}</strong></td><td>{item.primaryEmail || 'Email unavailable'}</td><td><StatusPill value={item.status} compact /></td><td><button className="uc02-link-button" type="button" onClick={() => { openMappingEditor(item.userId); goToStep(5); }}>Map Role</button></td></tr>)}</tbody></table></div> : <EmptyMessage>No employees loaded yet.</EmptyMessage>}
            <div className="uc02-note">Employee identity is Security-owned. Project Administration assigns or removes Project roles; it does not delete the global USER.</div>
          </div></div>
        )}

        {activeStep === 5 && (
          <div className="uc02-step-body">
            <div className="uc02-card uc02-list-card">
              <div className="uc02-list-toolbar"><div className="uc02-card__title"><h3>Active Mappings</h3><p>{mappings.length} users mapped</p></div><button className="uc02-button uc02-button--primary" type="button" onClick={() => openMappingEditor('')} disabled={busy}>Assign Role</button></div>
              {mappings.length ? <div className="uc02-table-wrap"><table className="uc02-table"><thead><tr><th>Employee</th><th>Role</th><th>Scope</th><th>Actions</th></tr></thead><tbody>{mappings.map((item) => { const person = candidates.find((candidate) => candidate.userId === item.userId); return <tr key={item.userId}><td><strong>{person?.displayName || 'Assigned Employee'}</strong><small>{person?.primaryEmail || item.userId}</small></td><td><strong>{item.operatingRole}</strong></td><td>{item.outletIds.length ? `${item.outletIds.length} outlet(s)` : item.dealerIds.length ? `${item.dealerIds.length} dealer(s)` : 'Project-wide'}</td><td><div className="uc02-row-actions"><button className="uc02-link-button" type="button" onClick={() => openMappingEditor(item.userId)}>Edit</button><button className="uc02-link-button uc02-link-button--danger" type="button" onClick={() => void removeMapping(item.userId)} disabled={busy}>Remove</button></div></td></tr>; })}</tbody></table></div> : <EmptyMessage>No active role mappings yet.</EmptyMessage>}
            </div>
            {mappingEditorOpen && (
              <form className="uc02-card uc02-editor-panel" onSubmit={saveMapping}>
                <div className="uc02-list-toolbar"><div className="uc02-card__title"><h3>{selectedMapping ? 'Edit Mapping' : 'Assign Role'}</h3><p>Assign an operating role and its Project scope.</p></div><button className="uc02-button" type="button" onClick={() => setMappingEditorOpen(false)}>Close</button></div>
                <Field label="Employee"><select required value={selectedUserId} onChange={(event) => selectMappingUser(event.target.value)}><option value="">Select employee</option>{candidates.map((item) => <option key={item.userId} value={item.userId}>{item.displayName}{item.primaryEmail ? ` · ${item.primaryEmail}` : ''}</option>)}</select></Field>
                {selectedCandidate && <div className="uc02-selected-person"><strong>{selectedCandidate.displayName}</strong><span>{selectedCandidate.primaryEmail}</span></div>}
                <Field label="Operating Role"><select value={operatingRole} onChange={(event) => { setOperatingRole(event.target.value as OperatingRole); setScopeDealerIds([]); setScopeOutletIds([]); }}><option value="PC">Process Consultant</option><option value="TL">Team Lead</option><option value="PM">Project Manager</option><option value="CRM">CRM</option><option value="Executive">Executive</option></select></Field>
                {operatingRole === 'PC' && <div className="uc02-scope"><strong>Outlet Scope</strong><small>Select any Onsite or Satellite outlets this Process Consultant covers.</small>{dealers.flatMap((dealer) => outlets.filter((outlet) => outlet.dealerId === dealer.dealerId).map((outlet) => <label key={outlet.outletId}><input type="checkbox" checked={scopeOutletIds.includes(outlet.outletId)} onChange={(event) => toggleValue(scopeOutletIds, outlet.outletId, event.target.checked, setScopeOutletIds)} />{dealer.dealerName} · {outlet.outletName} [{outlet.outletClassification}]</label>))}{!outlets.length && <small>Add dealer outlets before assigning a Process Consultant.</small>}</div>}
                {operatingRole === 'CRM' && <><div className="uc02-scope"><strong>Dealer Scope (optional)</strong>{dealers.map((dealer) => <label key={dealer.dealerId}><input type="checkbox" checked={scopeDealerIds.includes(dealer.dealerId)} onChange={(event) => toggleValue(scopeDealerIds, dealer.dealerId, event.target.checked, setScopeDealerIds)} />{dealer.dealerName}</label>)}</div><div className="uc02-scope"><strong>Outlet Scope (optional; leave both blank for project-wide)</strong>{dealers.flatMap((dealer) => outlets.filter((outlet) => outlet.dealerId === dealer.dealerId).map((outlet) => <label key={outlet.outletId}><input type="checkbox" checked={scopeOutletIds.includes(outlet.outletId)} onChange={(event) => toggleValue(scopeOutletIds, outlet.outletId, event.target.checked, setScopeOutletIds)} />{dealer.dealerName} · {outlet.outletName} [{outlet.outletClassification}]</label>))}</div></>}
                {(operatingRole === 'TL' || operatingRole === 'PM' || operatingRole === 'Executive') && <div className="uc02-note">This role works across the Project; no Dealer or Outlet selection is required.</div>}
                <div className="uc02-actions"><button className="uc02-button" type="button" onClick={() => setMappingEditorOpen(false)}>Cancel</button><button className="uc02-button uc02-button--primary" disabled={busy || !selectedUserId || (operatingRole === 'PC' && scopeOutletIds.length === 0)}>{busy ? 'Saving…' : selectedMapping ? 'Update Role Mapping' : 'Save Role Mapping'}</button></div>
              </form>
            )}
          </div>
        )}

        {activeStep === 6 && tenantId && project && (
          <div className="uc02-step-body">
            <div className="uc02-list-toolbar uc02-step-actions"><div className="uc02-card__title"><h3>Project Masters &amp; Document Intelligence</h3><p>Complete every Project-owned and DI-owned configuration required by Readiness.</p></div>{canResetMasters && <button className="uc02-button uc02-button--danger" type="button" onClick={() => void resetMasters()} disabled={busy}>Reset Project Masters</button>}</div>
            {isMahindraProject && (
              <MahindraMasterUploads
                key={`${tenantId}:${masterResetVersion}`}
                tenantId={tenantId}
                segments={project.segments}
                projectStatus={project.projectStatus}
                onError={setPageError}
              />
            )}
            <div className="uc02-card uc02-list-card">
              <div className="uc02-card__title"><h3>{isMahindraProject ? 'Additional Required Configuration' : 'Project Configuration Catalogue'}</h3><p>Document Intelligence is configured here as part of the Project setup, not only at Readiness.</p></div>
              {visibleConfigurationMasters.length ? <div className="uc02-table-wrap"><table className="uc02-table"><thead><tr><th>Configuration</th><th>Owner</th><th>Status</th><th>WEF</th><th>Current Version</th><th>Actions</th></tr></thead><tbody>{visibleConfigurationMasters.map((item) => <tr key={`${item.ownerModule}-${item.masterKey}`}><td><strong>{item.displayName}</strong><small>{item.administrationModes.join(' / ')}</small></td><td>{item.ownerModule === 'DI' ? 'Document Intelligence' : 'Audit Core'}</td><td><StatusPill value={item.lifecycleStatus || 'NOT_CONFIGURED'} compact /></td><td>{item.currentWef || '—'}</td><td><code>{item.currentVersionId || '—'}</code></td><td><button className="uc02-link-button" type="button" onClick={() => void openMaster(item.masterKey)}>{item.administrationModes.includes('EXCEL') ? (item.currentVersionId ? 'Manage / Replace' : 'Configure') : 'View Versions'}</button></td></tr>)}</tbody></table></div> : <EmptyMessage>No additional Project or Document Intelligence configurations were returned.</EmptyMessage>}
            </div>
            {masterEditorOpen && selectedMaster && (
              <div className="uc02-card uc02-editor-panel">
                <div className="uc02-list-toolbar"><div className="uc02-card__title"><h3>{selectedMaster.displayName}</h3><p>{selectedMaster.ownerModule === 'DI' ? 'Document Intelligence configuration is owned and validated by DI through the Project Master facade.' : selectedMaster.requiresWef ? 'An effective date is required for this master.' : 'Manage the current master data and published versions.'}</p></div><button className="uc02-button" type="button" onClick={() => setMasterEditorOpen(false)}>Close</button></div>
                {selectedMaster.administrationModes.includes('EXCEL') && <div className="uc02-master-actions"><button className="uc02-button" type="button" onClick={() => void getTemplate()} disabled={busy}>Get Excel Template</button></div>}
                {selectedMaster.administrationModes.includes('EXCEL') && <form className="uc02-master-upload" onSubmit={submitMasterImport}><Field label="Completed Workbook"><input type="file" accept=".xlsx" required onChange={(event) => setMasterFile(event.target.files?.[0] || null)} /></Field>{selectedMaster.requiresWef && <Field label="Effective From"><input type="date" required value={masterWef} onChange={(event) => setMasterWef(event.target.value)} /></Field>}<button className="uc02-button uc02-button--primary" disabled={busy || !masterFile}>Upload &amp; Validate</button></form>}
                {selectedMaster.administrationModes.includes('FORM') && <div className="uc02-note">This configuration is form-managed. Existing versions are shown below. Its authoring fields are not currently exposed by the Project Administration API.</div>}
                {masterImport && <div className="uc02-import-summary"><div><span>Status</span><StatusPill value={masterImport.status} /></div><div><span>Rows</span><strong>{masterImport.rowsParsed}</strong></div><div><span>Valid</span><strong>{masterImport.validRows}</strong></div><div><span>Warnings</span><strong>{masterImport.warningRows}</strong></div><div><span>Errors</span><strong>{masterImport.errorRows}</strong></div></div>}
                {masterRows.length > 0 && <div className="uc02-table-wrap"><table className="uc02-table"><thead><tr><th>Row</th><th>Status</th><th>Messages</th></tr></thead><tbody>{masterRows.slice(0, 100).map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td><StatusPill value={row.validationStatus} compact /></td><td>{row.messages.join(' · ') || 'No issues'}</td></tr>)}</tbody></table></div>}
                {masterImport && <div className="uc02-actions"><button className="uc02-button" type="button" onClick={() => void errorReport()} disabled={busy}>Validation Report</button><button className="uc02-button uc02-button--primary" type="button" onClick={() => void confirmImport()} disabled={busy || masterImport.status !== 'PREVIEW_READY' || masterImport.errorRows > 0}>Confirm Import</button></div>}
                <div className="uc02-version-list"><h4>Versions</h4>{masterVersions.length ? masterVersions.map((version) => <div className="uc02-version-row" key={version.versionId}><span><strong>{version.displayName || version.businessKey || `Version ${version.versionNo || ''}`}</strong><small>{version.effectiveFrom ? `Effective ${version.effectiveFrom}` : 'Version details'}</small></span><StatusPill value={version.lifecycleStatus} compact />{version.lifecycleStatus === 'DRAFT' && <button className="uc02-link-button" type="button" onClick={() => void publishVersion(version.versionId)} disabled={busy}>Publish</button>}</div>) : <EmptyMessage>No versions yet.</EmptyMessage>}</div>
              </div>
            )}
            {!canResetMasters && <div className="uc02-note">Project Master deletion/reset is available only while the Project is CONFIGURING.</div>}
          </div>
        )}

        {activeStep === 7 && (
          <div className="uc02-step-body"><div className="uc02-card uc02-list-card">
            <div className="uc02-list-toolbar"><div className="uc02-card__title"><h3>Project Readiness</h3><p>Every check remains visible. Blocking failures prevent activation; warnings do not.</p></div><button className="uc02-button" type="button" onClick={() => void refreshReadiness()} disabled={busy}>Refresh Checks</button></div>
            {readiness ? <><div className={`uc02-readiness-banner ${readiness.readyToActivate ? 'ready' : 'blocked'}`}><strong>{readiness.readyToActivate ? 'Ready to Activate' : 'Activation Blocked'}</strong><span>Checked {new Date(readiness.evaluatedAtUtc).toLocaleString()}</span></div>{readiness.checks.length ? <div className="uc02-table-wrap"><table className="uc02-table uc02-readiness-table"><thead><tr><th>Area</th><th>Check</th><th>Status</th><th>Severity</th><th>Reason</th><th>Action</th></tr></thead><tbody>{readiness.checks.map((check) => { const targetStep = targetStepForCheck(check); return <tr key={check.checkKey}><td>{check.area}</td><td><strong>{check.checkKey}</strong></td><td><StatusPill value={check.status} compact /></td><td>{check.severity}</td><td>{check.message}<small>{check.targetTask}</small></td><td>{targetStep && check.status !== 'PASS' ? <button className="uc02-link-button" type="button" onClick={() => goToStep(targetStep)}>Go to Step {targetStep}</button> : '—'}</td></tr>; })}</tbody></table></div> : <EmptyMessage>No readiness checks were returned.</EmptyMessage>}</> : <EmptyMessage>Readiness has not been loaded.</EmptyMessage>}
          </div></div>
        )}

        {activeStep === 8 && (
          <div className="uc02-step-body uc02-activation-stack">
            <div className="uc02-card">
              <div className="uc02-card__title"><h3>Activation Summary</h3><p>Review the persisted Project configuration before activation.</p></div>
              <div className="uc02-summary-grid"><div><span>Project</span><strong>{project?.projectName || '—'}</strong></div><div><span>Status</span><StatusPill value={project?.projectStatus || 'UNKNOWN'} /></div><div><span>Dealers</span><strong>{dealers.length}</strong></div><div><span>Outlets</span><strong>{outlets.length}</strong></div><div><span>Role Mappings</span><strong>{mappings.length}</strong></div><div><span>Segments</span><strong>{project?.segments.length || 0}</strong></div></div>
            </div>
            <div className="uc02-card">
              <div className="uc02-list-toolbar"><div className="uc02-card__title"><h3>Readiness Blockers</h3><p>Activation remains disabled until every blocking check passes.</p></div><button className="uc02-button" type="button" onClick={() => void refreshReadiness()} disabled={busy}>Re-check Readiness</button></div>
              {readiness ? <><div className={`uc02-readiness-banner ${readiness.readyToActivate ? 'ready' : 'blocked'}`}><strong>{readiness.readyToActivate ? 'All Required Checks Passed' : 'Project Is Not Ready'}</strong><span>{readiness.checks.filter((item) => item.severity === 'BLOCKING' && item.status !== 'PASS').length} blocking item(s) remaining</span></div>{!readiness.readyToActivate && <div className="uc02-checks">{readiness.checks.filter((item) => item.severity === 'BLOCKING' && item.status !== 'PASS').map((check) => { const targetStep = targetStepForCheck(check); return <article key={check.checkKey} className="uc02-check"><StatusPill value={check.status} compact /><div><strong>{check.message}</strong><small>{check.area} · {check.targetTask}</small></div>{targetStep && <button className="uc02-link-button" type="button" onClick={() => goToStep(targetStep)}>Fix in Step {targetStep}</button>}</article>; })}</div>}</> : <EmptyMessage>Readiness has not been checked.</EmptyMessage>}
              <div className="uc02-actions"><button className="uc02-button uc02-button--primary" type="button" onClick={() => void doActivate()} disabled={busy || !readiness?.readyToActivate || project?.projectStatus === 'ACTIVE'}>{project?.projectStatus === 'ACTIVE' ? 'Project Is Active' : busy ? 'Activating…' : 'Activate Project'}</button></div>
            </div>
          </div>
        )}
      </section>

      <footer className="uc02-footer-nav"><button className="uc02-button" type="button" disabled={activeStep === 1} onClick={() => goToStep(activeStep - 1)}>Previous</button><span>{currentStep.label}</span><button className="uc02-button uc02-button--primary" type="button" disabled={activeStep === 8 || !projectConfigured} onClick={() => goToStep(activeStep + 1)}>Next</button></footer>
    </div>
  );
}
