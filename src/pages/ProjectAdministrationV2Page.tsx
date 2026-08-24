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
import {
  deleteConfiguringDealerSetup,
  getProjectDeletionImpact,
  hardDeleteProject,
  type ProjectDeletionImpact,
} from '../services/audit-core/uc02Stabilization';
import { auditCoreErrorMessage } from '../services/audit-core/errorMessage';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const MAHINDRA_SEGMENT_CODES = new Set(['PASSENGER_VEHICLE', 'COMMERCIAL', 'BATTERY_ELECTRIC']);
const MAHINDRA_SPECIALIZED_MASTER_KEYS = new Set(['PRODUCT_MASTER', 'PRICE_LIST', 'DISCOUNT_SCHEME']);

type DealerEditor = { mode: 'new' } | { mode: 'edit'; item: DealerAdmin } | null;
type OutletEditor = { mode: 'new' } | { mode: 'edit'; item: OutletAdmin } | null;
type EffectiveMasterVersion = MasterVersion & {
  configurationSource?: 'VERIGENCE_DEFAULT' | 'PROJECT_CUSTOM' | string;
  inherited?: boolean;
};

function randomKey(prefix: string) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `${prefix}-${suffix}`;
}

function errorMessage(error: unknown) {
  return auditCoreErrorMessage(error);
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

function EmptyMessage({ children }: { children: string }) {
  return <div className="uc02-empty">{children}</div>;
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
  const target = check.targetTask.toUpperCase();
  if (exact[target]) return exact[target];
  const value = `${check.area} ${check.checkKey}`.toUpperCase();
  if (value.includes('ROLE') || value.includes('MAPPING') || value.includes('PC_COVERAGE')) return 5;
  if (value.includes('MASTER') || value.includes('POLICY') || value.includes('DI_')) return 6;
  if (value.includes('OUTLET')) return 3;
  if (value.includes('DEALER')) return 2;
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

export default function ProjectAdministrationV2Page() {
  const [searchParams, setSearchParams] = useSearchParams();
  const accessToken = useSessionStore((state) => state.accessToken);
  const tenantId = useSessionStore((state) => state.tenantId);
  const role = useSessionStore((state) => state.role);
  const setBusinessContext = useSessionStore((state) => state.setBusinessContext);
  const clearOperationalProject = useProjectContextStore((state) => state.clearSelection);

  const requestedStep = Number(searchParams.get('step') || '1');
  const activeStep = Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= 8 ? requestedStep : 1;
  const currentStep = projectAdminSteps.find((item) => item.key === activeStep)!;

  const [project, setProject] = useState<Uc02Project | null>(null);
  const [projectForm, setProjectForm] = useState(emptyProjectForm);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [projectLoading, setProjectLoading] = useState(false);

  const [dealers, setDealers] = useState<DealerAdmin[]>([]);
  const [dealersLoaded, setDealersLoaded] = useState(false);
  const [dealerEditor, setDealerEditor] = useState<DealerEditor>(null);
  const [dealerForm, setDealerForm] = useState(emptyDealerForm);

  const [outletsByDealer, setOutletsByDealer] = useState<Record<string, OutletAdmin[]>>({});
  const [loadedOutletDealerIds, setLoadedOutletDealerIds] = useState<string[]>([]);
  const [outletDealerId, setOutletDealerId] = useState('');
  const [outletEditor, setOutletEditor] = useState<OutletEditor>(null);
  const [outletForm, setOutletForm] = useState(emptyOutletForm);

  const [candidateQuery, setCandidateQuery] = useState('');
  const [candidates, setCandidates] = useState<RoleMappingCandidate[]>([]);
  const [candidatesLoaded, setCandidatesLoaded] = useState(false);
  const [mappings, setMappings] = useState<RoleMapping[]>([]);
  const [mappingsLoaded, setMappingsLoaded] = useState(false);
  const [mappingEditorOpen, setMappingEditorOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [operatingRole, setOperatingRole] = useState<OperatingRole>('PC');
  const [scopeDealerIds, setScopeDealerIds] = useState<string[]>([]);
  const [scopeOutletIds, setScopeOutletIds] = useState<string[]>([]);
  const [mappingOutletDealerId, setMappingOutletDealerId] = useState('');

  const [masters, setMasters] = useState<MasterDescriptor[]>([]);
  const [mastersLoaded, setMastersLoaded] = useState(false);
  const [selectedMasterKey, setSelectedMasterKey] = useState('');
  const [masterEditorOpen, setMasterEditorOpen] = useState(false);
  const [masterVersions, setMasterVersions] = useState<EffectiveMasterVersion[]>([]);
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [masterWef, setMasterWef] = useState('');
  const [masterImport, setMasterImport] = useState<MasterImport | null>(null);
  const [masterRows, setMasterRows] = useState<MasterImportRow[]>([]);
  const [masterResetVersion, setMasterResetVersion] = useState(0);

  const [readiness, setReadiness] = useState<ProjectReadiness | null>(null);
  const [deletionImpact, setDeletionImpact] = useState<ProjectDeletionImpact | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const canCreateProject = role === 'SUPER_ADMIN';
  const canDeleteProject = role === 'SUPER_ADMIN' && Boolean(project && tenantId);
  const projectConfigured = Boolean(project && tenantId);
  const canResetMasters = project?.projectStatus === 'CONFIGURING';
  const isMahindraProject = Boolean(
    project?.segments.length && project.segments.every((segment) => MAHINDRA_SEGMENT_CODES.has(segment.segmentCode)),
  );
  const selectedMaster = useMemo(
    () => masters.find((item) => item.masterKey === selectedMasterKey) || null,
    [masters, selectedMasterKey],
  );
  const selectedMapping = useMemo(
    () => mappings.find((item) => item.userId === selectedUserId) || null,
    [mappings, selectedUserId],
  );
  const outletList = outletDealerId ? outletsByDealer[outletDealerId] || [] : [];
  const mappingOutletList = mappingOutletDealerId ? outletsByDealer[mappingOutletDealerId] || [] : [];
  const loadedOutlets = Object.values(outletsByDealer).flat();
  const visibleConfigurationMasters = isMahindraProject
    ? masters.filter((item) => item.ownerModule === 'DI' || !MAHINDRA_SPECIALIZED_MASTER_KEYS.has(item.masterKey))
    : masters;

  const clearFeedback = () => { setPageError(''); setNotice(''); };
  const goToStep = (step: number) => setSearchParams({ step: String(step) });

  function clearProjectScopedUi() {
    setDealers([]);
    setDealersLoaded(false);
    setDealerEditor(null);
    setDealerForm(emptyDealerForm());
    setOutletsByDealer({});
    setLoadedOutletDealerIds([]);
    setOutletDealerId('');
    setOutletEditor(null);
    setOutletForm(emptyOutletForm());
    setCandidates([]);
    setCandidatesLoaded(false);
    setMappings([]);
    setMappingsLoaded(false);
    setMappingEditorOpen(false);
    setSelectedUserId('');
    setScopeDealerIds([]);
    setScopeOutletIds([]);
    setMappingOutletDealerId('');
    setMasters([]);
    setMastersLoaded(false);
    setSelectedMasterKey('');
    setMasterEditorOpen(false);
    setMasterVersions([]);
    setMasterFile(null);
    setMasterWef('');
    setMasterImport(null);
    setMasterRows([]);
    setReadiness(null);
    setDeletionImpact(null);
    setDeleteConfirmation('');
  }

  function handleProjectSelection(nextTenantId: string) {
    clearFeedback();
    clearProjectScopedUi();
    setProject(null);
    setProjectForm(emptyProjectForm());
    goToStep(1);
    if (!nextTenantId) setBusinessContext({ tenantId: '', dealerId: '', outletId: '' });
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

  async function ensureDealers(force = false) {
    if (!tenantId || !accessToken) return [] as DealerAdmin[];
    if (dealersLoaded && !force) return dealers;
    const values = await listDealersAdmin(tenantId, accessToken);
    setDealers(values);
    setDealersLoaded(true);
    return values;
  }

  async function ensureOutlets(dealerId: string, force = false) {
    if (!tenantId || !accessToken || !dealerId) return [] as OutletAdmin[];
    if (loadedOutletDealerIds.includes(dealerId) && !force) return outletsByDealer[dealerId] || [];
    const values = await listOutletsAdmin(tenantId, dealerId, accessToken);
    setOutletsByDealer((current) => ({ ...current, [dealerId]: values }));
    setLoadedOutletDealerIds((current) => current.includes(dealerId) ? current : [...current, dealerId]);
    return values;
  }

  async function ensureCandidates(force = false) {
    if (!tenantId || !accessToken) return [] as RoleMappingCandidate[];
    if (candidatesLoaded && !force) return candidates;
    const values = await listRoleMappingCandidates(tenantId, '', accessToken);
    setCandidates(values);
    setCandidatesLoaded(true);
    return values;
  }

  async function ensureMappings(force = false) {
    if (!tenantId || !accessToken) return [] as RoleMapping[];
    if (mappingsLoaded && !force) return mappings;
    const values = await listRoleMappings(tenantId, accessToken);
    setMappings(values);
    setMappingsLoaded(true);
    return values;
  }

  async function ensureMasters(force = false) {
    if (!tenantId || !accessToken) return [] as MasterDescriptor[];
    if (mastersLoaded && !force) return masters;
    const values = await listProjectMasters(tenantId, accessToken);
    setMasters(values);
    setMastersLoaded(true);
    return values;
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
        if (activeStep === 2) await ensureDealers();
        if (activeStep === 3) {
          const values = await ensureDealers();
          const selected = outletDealerId || values[0]?.dealerId || '';
          if (selected) {
            setOutletDealerId(selected);
            await ensureOutlets(selected);
          }
        }
        if (activeStep === 4) await ensureCandidates();
        if (activeStep === 5) await Promise.all([ensureDealers(), ensureCandidates(), ensureMappings()]);
        if (activeStep === 6) await ensureMasters();
        if (activeStep === 7) setReadiness(await getProjectReadiness(tenantId, accessToken));
        if (activeStep === 8) {
          const [nextReadiness] = await Promise.all([
            getProjectReadiness(tenantId, accessToken),
            ensureDealers(),
            ensureMappings(),
          ]);
          setReadiness(nextReadiness);
        }
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
        setBusinessContext({ tenantId: result.tenantId, dealerId: '', outletId: '' });
        setNotice('Project created successfully.');
      }
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function inspectProjectDeletion() {
    if (!tenantId || !accessToken) return;
    clearFeedback();
    setBusy(true);
    try {
      setDeletionImpact(await getProjectDeletionImpact(tenantId, accessToken));
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function executeProjectDeletion() {
    if (!tenantId || !accessToken || !project || !deletionImpact) return;
    clearFeedback();
    if (!deletionImpact.canDelete) {
      setPageError(`Project has ${deletionImpact.journeyCount} Journey(s). Hard delete is prohibited.`);
      return;
    }
    if (deleteConfirmation.trim() !== project.projectName) {
      setPageError('Type the exact Project name to confirm permanent deletion.');
      return;
    }
    if (!window.confirm(`Permanently delete “${project.projectName}” across DI, Security and Audit Core? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await hardDeleteProject(tenantId, project.projectName, randomKey('project-hard-delete'), accessToken);
      clearOperationalProject();
      setBusinessContext({ tenantId: '', dealerId: '', outletId: '' });
      clearProjectScopedUi();
      setProject(null);
      setProjectForm(emptyProjectForm());
      setNotice('Project permanently deleted. Administrative deletion receipt retained.');
      goToStep(1);
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
    setBusy(true);
    try {
      if (project?.projectStatus === 'CONFIGURING') {
        if (!window.confirm(`Remove dealer “${item.dealerName}” and its empty setup outlets? Linked business data remains protected.`)) return;
        await deleteConfiguringDealerSetup(tenantId, item.dealerId, randomKey('dealer-setup-delete'), accessToken);
      } else {
        const impact = await getDealerDeletionImpact(tenantId, item.dealerId, accessToken);
        if (!impact.canDelete) {
          setPageError(`Dealer cannot be deleted. ${dependencySummary(impact.dependencies)}`);
          return;
        }
        if (!window.confirm(`Delete dealer “${item.dealerName}”?`)) return;
        await deleteDealerAdmin(tenantId, item.dealerId, randomKey('dealer-delete'), accessToken);
      }
      setDealers((current) => current.filter((dealer) => dealer.dealerId !== item.dealerId));
      setOutletsByDealer((current) => {
        const next = { ...current };
        delete next[item.dealerId];
        return next;
      });
      setLoadedOutletDealerIds((current) => current.filter((id) => id !== item.dealerId));
      if (outletDealerId === item.dealerId) setOutletDealerId('');
      setDealerEditor(null);
      setNotice('Dealer removed successfully.');
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function selectOutletDealer(dealerId: string) {
    setOutletDealerId(dealerId);
    setOutletEditor(null);
    if (!dealerId) return;
    clearFeedback();
    try {
      await ensureOutlets(dealerId);
    } catch (error) {
      setPageError(errorMessage(error));
    }
  }

  function openNewOutlet() {
    if (!outletDealerId) {
      setPageError('Select a Dealer before adding an Outlet.');
      return;
    }
    clearFeedback();
    setOutletForm({ ...emptyOutletForm(), dealerId: outletDealerId });
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
      let saved: OutletAdmin;
      if (outletEditor.mode === 'new') {
        saved = await createOutletAdmin(tenantId, outletForm.dealerId, payload, accessToken);
      } else {
        saved = await patchOutletAdmin(
          tenantId,
          outletEditor.item.dealerId,
          outletEditor.item.outletId,
          outletEditor.item.versionNo,
          { ...payload, status: outletForm.status },
          accessToken,
        );
      }
      setOutletsByDealer((current) => {
        const list = current[saved.dealerId] || [];
        return {
          ...current,
          [saved.dealerId]: [...list.filter((item) => item.outletId !== saved.outletId), saved],
        };
      });
      setLoadedOutletDealerIds((current) => current.includes(saved.dealerId) ? current : [...current, saved.dealerId]);
      setOutletEditor(null);
      setNotice(outletEditor.mode === 'new' ? 'Outlet added successfully.' : 'Outlet updated successfully.');
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
        setPageError(`Outlet cannot be deleted. ${dependencySummary(impact.dependencies)}`);
        return;
      }
      if (!window.confirm(`Delete outlet “${item.outletName}”?`)) return;
      await deleteOutletAdmin(tenantId, item.dealerId, item.outletId, randomKey('outlet-delete'), accessToken);
      setOutletsByDealer((current) => ({
        ...current,
        [item.dealerId]: (current[item.dealerId] || []).filter((outlet) => outlet.outletId !== item.outletId),
      }));
      setOutletEditor(null);
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
      setCandidatesLoaded(true);
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function toggleValue(values: string[], value: string, checked: boolean, setter: (next: string[]) => void) {
    setter(checked ? [...new Set([...values, value])] : values.filter((item) => item !== value));
  }

  async function openMappingEditor(userId = '') {
    clearFeedback();
    setSelectedUserId(userId);
    const existing = mappings.find((item) => item.userId === userId);
    setOperatingRole(existing?.operatingRole || 'PC');
    setScopeDealerIds(existing?.dealerIds || []);
    setScopeOutletIds(existing?.outletIds || []);
    setMappingEditorOpen(true);
    const values = await ensureDealers();
    const dealerId = mappingOutletDealerId || values[0]?.dealerId || '';
    if (dealerId) {
      setMappingOutletDealerId(dealerId);
      await ensureOutlets(dealerId);
    }
  }

  async function selectMappingOutletDealer(dealerId: string) {
    setMappingOutletDealerId(dealerId);
    if (!dealerId) return;
    try {
      await ensureOutlets(dealerId);
    } catch (error) {
      setPageError(errorMessage(error));
    }
  }

  async function saveMapping(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || !accessToken || !selectedUserId) return;
    clearFeedback();
    if (operatingRole === 'PC' && scopeOutletIds.length === 0) {
      setPageError('Select at least one Onsite or Satellite Dealer Outlet for the Process Consultant.');
      return;
    }
    setBusy(true);
    try {
      const result = await putRoleMapping(
        tenantId,
        selectedUserId,
        {
          operatingRole,
          dealerIds: operatingRole === 'CRM' ? scopeDealerIds : [],
          outletIds: operatingRole === 'PC' || operatingRole === 'CRM' ? scopeOutletIds : [],
        },
        randomKey('role-map'),
        accessToken,
      );
      if (!result.mapping || result.operationStatus !== 'COMPLETED') throw new Error('Role mapping did not complete.');
      setMappings((current) => [...current.filter((item) => item.userId !== result.mapping?.userId), result.mapping as RoleMapping]);
      setMappingsLoaded(true);
      setMappingEditorOpen(false);
      setNotice('Role mapping saved successfully.');
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
      if (result.operationStatus !== 'COMPLETED') throw new Error('Role mapping removal did not complete.');
      setMappings((current) => current.filter((item) => item.userId !== userId));
      setNotice('Role mapping removed.');
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function openMaster(masterKey: string) {
    if (!tenantId || !accessToken) return;
    setSelectedMasterKey(masterKey);
    setMasterImport(null);
    setMasterRows([]);
    setMasterFile(null);
    setMasterWef('');
    setMasterEditorOpen(true);
    const descriptor = masters.find((item) => item.masterKey === masterKey);
    if (!descriptor) return;
    try {
      setMasterVersions(
        (await listMasterVersions(tenantId, descriptor.ownerModule, descriptor.masterKey, accessToken)) as EffectiveMasterVersion[],
      );
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
      setNotice('Workbook validated. Review the preview before confirming.');
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
      setMasterVersions(
        (await listMasterVersions(tenantId, selectedMaster.ownerModule, selectedMaster.masterKey, accessToken)) as EffectiveMasterVersion[],
      );
      await ensureMasters(true);
      setNotice('Import confirmed. Publish the new version when ready.');
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
      setMasterVersions(
        (await listMasterVersions(tenantId, selectedMaster.ownerModule, selectedMaster.masterKey, accessToken)) as EffectiveMasterVersion[],
      );
      await ensureMasters(true);
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
    if (!window.confirm('Reset all Project-owned masters? Global reference masters and Verigence DI defaults are not deleted.')) return;
    setBusy(true);
    try {
      await resetProjectMasters(tenantId, accessToken);
      setMasterResetVersion((value) => value + 1);
      setMasterEditorOpen(false);
      setSelectedMasterKey('');
      setMasterVersions([]);
      await ensureMasters(true);
      setReadiness(null);
      setNotice('Project-owned masters reset successfully.');
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
      setNotice('Project activated successfully. Warnings remain visible and can be completed later.');
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
        description="Configure Project setup with lazy, context-based loading. Only Project validity and Security Tenant lifecycle block activation."
        actions={project && <StatusPill value={project.projectStatus} />}
      />

      <div className="uc02-project-strip">
        <div><span>Project</span><ProjectSelector currentProjectName={project?.projectName} onSelectionChange={handleProjectSelection} onError={setPageError} /></div>
        <div><span>Current Project</span><strong>{project?.projectName || (canCreateProject ? 'New Project' : 'Assigned Project')}</strong></div>
        <div><span>Setup Progress</span><strong>Step {activeStep} of 8</strong></div>
      </div>

      <ProjectAdminStepper activeStep={activeStep} onChange={goToStep} projectConfigured={projectConfigured} />

      {(pageError || notice) && (
        <div className={`uc02-message ${pageError ? 'uc02-message--error' : 'uc02-message--success'}`}>
          <strong>{pageError ? 'Action Required' : 'Updated'}</strong><span>{pageError || notice}</span>
        </div>
      )}

      <section className="uc02-workspace">
        <header className="uc02-workspace__header">
          <div><small>{currentStep.short}</small><h2>{currentStep.label}</h2><p>{currentStep.description}</p></div>
          <span className="uc02-workspace__step">Step {activeStep} of 8</span>
        </header>

        {activeStep === 1 && (
          <div className="uc02-step-body">
            {!project && !canCreateProject ? <EmptyMessage>Select the assigned Project before opening Project Administration.</EmptyMessage> : (
              <form className="uc02-card uc02-card--form" onSubmit={submitProject}>
                <div className="uc02-card__title"><h3>{project ? 'Project Details' : 'Create Project'}</h3><p>Project creation provisions Security, Audit Core and DI together.</p></div>
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

            {canDeleteProject && (
              <div className="uc02-card uc02-list-card">
                <div className="uc02-list-toolbar">
                  <div className="uc02-card__title"><h3>Permanent Project Deletion</h3><p>Allowed for CONFIGURING or ACTIVE only when Journey count is exactly zero.</p></div>
                  <button className="uc02-button uc02-button--danger" type="button" onClick={() => void inspectProjectDeletion()} disabled={busy}>Check Deletion Impact</button>
                </div>
                {deletionImpact && (
                  <div className="uc02-step-body">
                    <div className={`uc02-readiness-banner ${deletionImpact.canDelete ? 'ready' : 'blocked'}`}>
                      <strong>{deletionImpact.canDelete ? 'Hard Delete Permitted' : 'Hard Delete Blocked'}</strong>
                      <span>Journey count: {deletionImpact.journeyCount} · Project status: {deletionImpact.projectStatus}</span>
                    </div>
                    <div className="uc02-note">{deletionImpact.rule}</div>
                    <div className="uc02-checks">{deletionImpact.cleanupTargets.map((target) => <article className="uc02-check" key={target}><div><strong>{target}</strong></div></article>)}</div>
                    {deletionImpact.canDelete && (
                      <>
                        <Field label="Type exact Project Name to confirm"><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder={project?.projectName} /></Field>
                        <div className="uc02-actions"><button className="uc02-button uc02-button--danger" type="button" onClick={() => void executeProjectDeletion()} disabled={busy || deleteConfirmation.trim() !== project?.projectName}>Permanently Delete Project</button></div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeStep === 2 && (
          <div className="uc02-step-body">
            <div className="uc02-card uc02-list-card">
              <div className="uc02-list-toolbar"><div className="uc02-card__title"><h3>Project Dealers</h3><p>{dealers.length} configured</p></div><button className="uc02-button uc02-button--primary" type="button" onClick={openNewDealer} disabled={busy}>Add Dealer</button></div>
              {dealers.length ? <div className="uc02-table-wrap"><table className="uc02-table"><thead><tr><th>Dealer</th><th>Legal Name</th><th>Code</th><th>Status</th><th>Actions</th></tr></thead><tbody>{dealers.map((item) => <tr key={item.dealerId}><td><strong>{item.dealerName}</strong></td><td>{item.legalName || '—'}</td><td><code>{item.dealerCode}</code></td><td><StatusPill value={item.status} compact /></td><td><div className="uc02-row-actions"><button className="uc02-link-button" type="button" onClick={() => openEditDealer(item)}>Edit</button><button className="uc02-link-button uc02-link-button--danger" type="button" onClick={() => void removeDealer(item)} disabled={busy}>Delete</button></div></td></tr>)}</tbody></table></div> : <EmptyMessage>No dealers configured yet.</EmptyMessage>}
            </div>
            {dealerEditor && <form className="uc02-card uc02-editor-panel" onSubmit={submitDealer}><div className="uc02-list-toolbar"><div className="uc02-card__title"><h3>{dealerEditor.mode === 'new' ? 'Add Dealer' : `Edit ${dealerEditor.item.dealerName}`}</h3></div><button className="uc02-button" type="button" onClick={() => setDealerEditor(null)}>Close</button></div><div className="uc02-form-grid"><Field label="Dealer Name"><input required value={dealerForm.dealerName} onChange={(event) => setDealerForm({ ...dealerForm, dealerName: event.target.value })} /></Field><Field label="Legal Name"><input value={dealerForm.legalName} onChange={(event) => setDealerForm({ ...dealerForm, legalName: event.target.value })} /></Field>{dealerEditor.mode === 'edit' && <Field label="Status"><select value={dealerForm.status} onChange={(event) => setDealerForm({ ...dealerForm, status: event.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></Field>}</div><div className="uc02-actions"><button className="uc02-button uc02-button--primary" disabled={busy}>{busy ? 'Saving…' : 'Save Dealer'}</button></div></form>}
          </div>
        )}

        {activeStep === 3 && (
          <div className="uc02-step-body">
            <div className="uc02-card uc02-list-card">
              <div className="uc02-list-toolbar">
                <div className="uc02-card__title"><h3>Dealer Outlets</h3><p>Outlets load only for the selected Dealer and are cached for this page session.</p></div>
                <div className="uc02-toolbar-actions"><label className="uc02-filter"><span>Dealer</span><select value={outletDealerId} onChange={(event) => void selectOutletDealer(event.target.value)}><option value="">Select Dealer</option>{dealers.map((dealer) => <option value={dealer.dealerId} key={dealer.dealerId}>{dealer.dealerName}</option>)}</select></label><button className="uc02-button uc02-button--primary" type="button" onClick={openNewOutlet} disabled={busy || !outletDealerId}>Add Outlet</button></div>
              </div>
              {outletDealerId ? (outletList.length ? <div className="uc02-table-wrap"><table className="uc02-table"><thead><tr><th>Outlet</th><th>Location</th><th>Class</th><th>Status</th><th>Actions</th></tr></thead><tbody>{outletList.map((item) => <tr key={item.outletId}><td><strong>{item.outletName}</strong><small>{item.outletCode}</small></td><td>{[item.addressText, item.city, item.stateRegion, item.postalCode].filter(Boolean).join(', ') || '—'}</td><td>{item.outletClassification}</td><td><StatusPill value={item.status} compact /></td><td><div className="uc02-row-actions"><button className="uc02-link-button" type="button" onClick={() => openEditOutlet(item)}>Edit / Map</button><button className="uc02-link-button uc02-link-button--danger" type="button" onClick={() => void removeOutlet(item)} disabled={busy}>Delete</button></div></td></tr>)}</tbody></table></div> : <EmptyMessage>No outlets configured for this Dealer.</EmptyMessage>) : <EmptyMessage>Select a Dealer to load its outlets.</EmptyMessage>}
            </div>
            {outletEditor && <form key={outletEditor.mode === 'edit' ? outletEditor.item.outletId : 'new-outlet'} className="uc02-card uc02-editor-panel uc02-outlet-editor" data-uc02-outlet-editor="true" onSubmit={submitOutlet}><div className="uc02-list-toolbar"><div className="uc02-card__title"><h3>{outletEditor.mode === 'new' ? 'Add Dealer Outlet' : `Edit ${outletEditor.item.outletName}`}</h3><p>Manual address, Google Maps preview and exact GPS pinning are supported.</p></div><button className="uc02-button" type="button" onClick={() => setOutletEditor(null)}>Close</button></div><div className="uc02-form-grid"><Field label="Dealer"><select required disabled value={outletForm.dealerId}>{dealers.map((item) => <option key={item.dealerId} value={item.dealerId}>{item.dealerName}</option>)}</select></Field><Field label="Outlet Name"><input required value={outletForm.outletName} onChange={(event) => setOutletForm({ ...outletForm, outletName: event.target.value })} /></Field><Field label="Classification"><select value={outletForm.outletClassification} onChange={(event) => setOutletForm({ ...outletForm, outletClassification: event.target.value as 'ONSITE' | 'SATELLITE' })}><option value="ONSITE">Onsite</option><option value="SATELLITE">Satellite</option></select></Field>{outletEditor.mode === 'edit' && <Field label="Status"><select value={outletForm.status} onChange={(event) => setOutletForm({ ...outletForm, status: event.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></Field>}</div><Field label="Address"><textarea value={outletForm.addressText} onChange={(event) => setOutletForm({ ...outletForm, addressText: event.target.value })} /></Field><div className="uc02-form-grid"><Field label="City"><input value={outletForm.city} onChange={(event) => setOutletForm({ ...outletForm, city: event.target.value })} /></Field><Field label="State / Region"><input value={outletForm.stateRegion} onChange={(event) => setOutletForm({ ...outletForm, stateRegion: event.target.value })} /></Field><Field label="Postal Code"><input value={outletForm.postalCode} onChange={(event) => setOutletForm({ ...outletForm, postalCode: event.target.value })} /></Field><Field label="Monthly Vehicle Volume"><input type="number" min="0" value={outletForm.monthlyVehicleVolume} onChange={(event) => setOutletForm({ ...outletForm, monthlyVehicleVolume: event.target.value })} /></Field></div><input type="hidden" name="latitude" defaultValue={outletEditor.mode === 'edit' && outletEditor.item.latitude != null ? String(outletEditor.item.latitude) : ''} /><input type="hidden" name="longitude" defaultValue={outletEditor.mode === 'edit' && outletEditor.item.longitude != null ? String(outletEditor.item.longitude) : ''} /><div className="uc02-actions"><button className="uc02-button uc02-button--primary" disabled={busy}>{busy ? 'Saving…' : 'Save Outlet'}</button></div></form>}
          </div>
        )}

        {activeStep === 4 && (
          <div className="uc02-step-body"><div className="uc02-card uc02-list-card"><div className="uc02-card__title"><h3>Employees</h3><p>Security-owned users eligible for Project assignment.</p></div><form className="uc02-search" onSubmit={searchCandidates}><input value={candidateQuery} onChange={(event) => setCandidateQuery(event.target.value)} placeholder="Search by name or email" /><button className="uc02-button uc02-button--primary" disabled={busy}>Search</button></form>{candidates.length ? <div className="uc02-table-wrap"><table className="uc02-table"><thead><tr><th>Employee</th><th>Email</th><th>Status</th><th>Action</th></tr></thead><tbody>{candidates.map((item) => <tr key={item.userId}><td><strong>{item.displayName}</strong></td><td>{item.primaryEmail || '—'}</td><td><StatusPill value={item.status} compact /></td><td><button className="uc02-link-button" type="button" onClick={() => { void openMappingEditor(item.userId); goToStep(5); }}>Map Role</button></td></tr>)}</tbody></table></div> : <EmptyMessage>No employees loaded.</EmptyMessage>}<div className="uc02-note">Project Administration never deletes the global Security USER.</div></div></div>
        )}

        {activeStep === 5 && (
          <div className="uc02-step-body">
            <div className="uc02-card uc02-list-card"><div className="uc02-list-toolbar"><div className="uc02-card__title"><h3>Active Mappings</h3><p>{mappings.length} users mapped</p></div><button className="uc02-button uc02-button--primary" type="button" onClick={() => void openMappingEditor()} disabled={busy}>Assign Role</button></div>{mappings.length ? <div className="uc02-table-wrap"><table className="uc02-table"><thead><tr><th>Employee</th><th>Role</th><th>Scope</th><th>Actions</th></tr></thead><tbody>{mappings.map((item) => { const person = candidates.find((candidate) => candidate.userId === item.userId); return <tr key={item.userId}><td><strong>{person?.displayName || item.userId}</strong><small>{person?.primaryEmail || ''}</small></td><td>{item.operatingRole}</td><td>{item.outletIds.length ? `${item.outletIds.length} outlet(s)` : item.dealerIds.length ? `${item.dealerIds.length} dealer(s)` : 'Project-wide'}</td><td><div className="uc02-row-actions"><button className="uc02-link-button" type="button" onClick={() => void openMappingEditor(item.userId)}>Edit</button><button className="uc02-link-button uc02-link-button--danger" type="button" onClick={() => void removeMapping(item.userId)} disabled={busy}>Remove</button></div></td></tr>; })}</tbody></table></div> : <EmptyMessage>No active role mappings.</EmptyMessage>}</div>
            {mappingEditorOpen && <form className="uc02-card uc02-editor-panel" onSubmit={saveMapping}><div className="uc02-list-toolbar"><div className="uc02-card__title"><h3>{selectedMapping ? 'Edit Mapping' : 'Assign Role'}</h3><p>Outlet lists are loaded dealer-by-dealer only when needed.</p></div><button className="uc02-button" type="button" onClick={() => setMappingEditorOpen(false)}>Close</button></div><Field label="Employee"><select required value={selectedUserId} onChange={(event) => { setSelectedUserId(event.target.value); const existing = mappings.find((item) => item.userId === event.target.value); setOperatingRole(existing?.operatingRole || 'PC'); setScopeDealerIds(existing?.dealerIds || []); setScopeOutletIds(existing?.outletIds || []); }}><option value="">Select employee</option>{candidates.map((item) => <option key={item.userId} value={item.userId}>{item.displayName}{item.primaryEmail ? ` · ${item.primaryEmail}` : ''}</option>)}</select></Field><Field label="Operating Role"><select value={operatingRole} onChange={(event) => { setOperatingRole(event.target.value as OperatingRole); setScopeDealerIds([]); setScopeOutletIds([]); }}><option value="PC">Process Consultant</option><option value="TL">Team Lead</option><option value="PM">Project Manager</option><option value="CRM">CRM</option><option value="Executive">Executive</option></select></Field>{operatingRole === 'CRM' && <div className="uc02-scope"><strong>Dealer Scope (optional)</strong>{dealers.map((dealer) => <label key={dealer.dealerId}><input type="checkbox" checked={scopeDealerIds.includes(dealer.dealerId)} onChange={(event) => toggleValue(scopeDealerIds, dealer.dealerId, event.target.checked, setScopeDealerIds)} />{dealer.dealerName}</label>)}</div>}{(operatingRole === 'PC' || operatingRole === 'CRM') && <div className="uc02-scope"><strong>Outlet Scope {operatingRole === 'CRM' ? '(optional)' : ''}</strong><Field label="Load outlets for Dealer"><select value={mappingOutletDealerId} onChange={(event) => void selectMappingOutletDealer(event.target.value)}><option value="">Select Dealer</option>{dealers.map((dealer) => <option key={dealer.dealerId} value={dealer.dealerId}>{dealer.dealerName}</option>)}</select></Field>{mappingOutletList.map((outlet) => <label key={outlet.outletId}><input type="checkbox" checked={scopeOutletIds.includes(outlet.outletId)} onChange={(event) => toggleValue(scopeOutletIds, outlet.outletId, event.target.checked, setScopeOutletIds)} />{outlet.outletName} [{outlet.outletClassification}]</label>)}{mappingOutletDealerId && !mappingOutletList.length && <small>No outlets configured for this Dealer.</small>}<small>Previously selected outlets from other Dealers remain selected while you load another Dealer.</small></div>}{(operatingRole === 'TL' || operatingRole === 'PM' || operatingRole === 'Executive') && <div className="uc02-note">This role is Project-wide.</div>}<div className="uc02-actions"><button className="uc02-button uc02-button--primary" disabled={busy || !selectedUserId || (operatingRole === 'PC' && scopeOutletIds.length === 0)}>{busy ? 'Saving…' : 'Save Role Mapping'}</button></div></form>}
          </div>
        )}

        {activeStep === 6 && tenantId && project && (
          <div className="uc02-step-body">
            <div className="uc02-list-toolbar uc02-step-actions"><div className="uc02-card__title"><h3>Project Masters &amp; Document Intelligence</h3><p>Verigence DI defaults are effective without tenant duplication. Requirement Profiles are optional.</p></div>{canResetMasters && <button className="uc02-button uc02-button--danger" type="button" onClick={() => void resetMasters()} disabled={busy}>Reset Project Masters</button>}</div>
            {isMahindraProject && <MahindraMasterUploads key={`${tenantId}:${masterResetVersion}`} tenantId={tenantId} segments={project.segments} projectStatus={project.projectStatus} onError={setPageError} />}
            <div className="uc02-card uc02-list-card"><div className="uc02-card__title"><h3>{isMahindraProject ? 'Additional Configuration' : 'Project Configuration Catalogue'}</h3><p>Document Types and Extraction Profiles may use inherited Verigence defaults. DI Requirement Profiles are optional advanced configuration.</p></div>{visibleConfigurationMasters.length ? <div className="uc02-table-wrap"><table className="uc02-table"><thead><tr><th>Configuration</th><th>Owner</th><th>Status</th><th>Current Version</th><th>Action</th></tr></thead><tbody>{visibleConfigurationMasters.map((item) => { const optional = item.ownerModule === 'DI' && item.masterKey === 'REQUIREMENT_PROFILES'; return <tr key={`${item.ownerModule}-${item.masterKey}`}><td><strong>{item.displayName}</strong><small>{optional ? 'Optional advanced DI capability' : item.administrationModes.join(' / ')}</small></td><td>{item.ownerModule === 'DI' ? 'Document Intelligence' : 'Audit Core'}</td><td><StatusPill value={item.lifecycleStatus || (optional ? 'OPTIONAL' : 'NOT_CONFIGURED')} compact /></td><td><code>{item.currentVersionId || '—'}</code></td><td><button className="uc02-link-button" type="button" onClick={() => void openMaster(item.masterKey)}>{item.currentVersionId ? 'Use as-is / Customize' : optional ? 'Configure (Optional)' : 'Configure'}</button></td></tr>; })}</tbody></table></div> : <EmptyMessage>No Project configuration descriptors were returned.</EmptyMessage>}</div>
            {masterEditorOpen && selectedMaster && <div className="uc02-card uc02-editor-panel"><div className="uc02-list-toolbar"><div className="uc02-card__title"><h3>{selectedMaster.displayName}</h3><p>{selectedMaster.ownerModule === 'DI' ? 'Inherited Verigence defaults remain global. Customization creates tenant-specific versions.' : 'Project-owned version lifecycle.'}</p></div><button className="uc02-button" type="button" onClick={() => setMasterEditorOpen(false)}>Close</button></div>{selectedMaster.administrationModes.includes('EXCEL') && <div className="uc02-master-actions"><button className="uc02-button" type="button" onClick={() => void getTemplate()} disabled={busy}>Get Excel Template</button></div>}{selectedMaster.administrationModes.includes('EXCEL') && <form className="uc02-master-upload" onSubmit={submitMasterImport}><Field label="Completed Workbook"><input type="file" accept=".xlsx" required onChange={(event) => setMasterFile(event.target.files?.[0] || null)} /></Field>{selectedMaster.requiresWef && <Field label="Effective From"><input type="date" required value={masterWef} onChange={(event) => setMasterWef(event.target.value)} /></Field>}<button className="uc02-button uc02-button--primary" disabled={busy || !masterFile}>Upload &amp; Validate</button></form>}{selectedMaster.administrationModes.includes('FORM') && <div className="uc02-note">Form-managed configuration remains available. Existing effective versions are shown below.</div>}{masterImport && <div className="uc02-import-summary"><div><span>Status</span><StatusPill value={masterImport.status} /></div><div><span>Rows</span><strong>{masterImport.rowsParsed}</strong></div><div><span>Valid</span><strong>{masterImport.validRows}</strong></div><div><span>Warnings</span><strong>{masterImport.warningRows}</strong></div><div><span>Errors</span><strong>{masterImport.errorRows}</strong></div></div>}{masterRows.length > 0 && <div className="uc02-table-wrap"><table className="uc02-table"><thead><tr><th>Row</th><th>Status</th><th>Messages</th></tr></thead><tbody>{masterRows.slice(0, 100).map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td><StatusPill value={row.validationStatus} compact /></td><td>{row.messages.join(' · ') || 'No issues'}</td></tr>)}</tbody></table></div>}{masterImport && <div className="uc02-actions"><button className="uc02-button" type="button" onClick={() => void errorReport()}>Validation Report</button><button className="uc02-button uc02-button--primary" type="button" onClick={() => void confirmImport()} disabled={busy || masterImport.status !== 'PREVIEW_READY' || masterImport.errorRows > 0}>Confirm Import</button></div>}<div className="uc02-version-list"><h4>Effective Versions</h4>{masterVersions.length ? masterVersions.map((version) => { const inherited = version.inherited === true || version.configurationSource === 'VERIGENCE_DEFAULT'; return <div className="uc02-version-row" key={version.versionId}><span><strong>{inherited ? 'Verigence Default' : version.displayName || version.businessKey || `Version ${version.versionNo || ''}`}</strong><small>{inherited ? `${version.displayName || version.businessKey || ''} · Use as-is or customize` : version.effectiveFrom ? `Effective ${version.effectiveFrom}` : version.configurationSource === 'PROJECT_CUSTOM' ? 'Project customization' : 'Version details'}</small></span><StatusPill value={version.lifecycleStatus} compact />{version.lifecycleStatus === 'DRAFT' && !inherited && <button className="uc02-link-button" type="button" onClick={() => void publishVersion(version.versionId)}>Publish</button>}</div>; }) : <EmptyMessage>{selectedMaster.ownerModule === 'DI' && selectedMaster.masterKey === 'REQUIREMENT_PROFILES' ? 'No Requirement Profile configured. This is optional.' : 'No effective versions returned.'}</EmptyMessage>}</div></div>}
          </div>
        )}

        {activeStep === 7 && (
          <div className="uc02-step-body"><div className="uc02-card uc02-list-card"><div className="uc02-list-toolbar"><div className="uc02-card__title"><h3>Project Readiness</h3><p>Only Project validity and Security Tenant lifecycle are blocking. Other gaps remain visible warnings.</p></div><button className="uc02-button" type="button" onClick={() => void refreshReadiness()} disabled={busy}>Refresh Checks</button></div>{readiness ? <><div className={`uc02-readiness-banner ${readiness.readyToActivate ? 'ready' : 'blocked'}`}><strong>{readiness.readyToActivate ? 'Ready to Activate' : 'Activation Blocked'}</strong><span>Checked {new Date(readiness.evaluatedAtUtc).toLocaleString()}</span></div><div className="uc02-table-wrap"><table className="uc02-table uc02-readiness-table"><thead><tr><th>Area</th><th>Check</th><th>Status</th><th>Severity</th><th>Reason</th><th>Action</th></tr></thead><tbody>{readiness.checks.map((check) => { const target = targetStepForCheck(check); return <tr key={check.checkKey}><td>{check.area}</td><td><strong>{check.checkKey}</strong></td><td><StatusPill value={check.status} compact /></td><td>{check.severity}</td><td>{check.message}</td><td>{target && check.status !== 'PASS' ? <button className="uc02-link-button" type="button" onClick={() => goToStep(target)}>Go to Step {target}</button> : '—'}</td></tr>; })}</tbody></table></div></> : <EmptyMessage>Readiness has not been loaded.</EmptyMessage>}</div></div>
        )}

        {activeStep === 8 && (
          <div className="uc02-step-body uc02-activation-stack"><div className="uc02-card"><div className="uc02-card__title"><h3>Activation Summary</h3><p>Lazy loading is preserved; this summary does not force-load every Dealer Outlet.</p></div><div className="uc02-summary-grid"><div><span>Project</span><strong>{project?.projectName || '—'}</strong></div><div><span>Status</span><StatusPill value={project?.projectStatus || 'UNKNOWN'} /></div><div><span>Dealers</span><strong>{dealers.length}</strong></div><div><span>Outlets Loaded This Session</span><strong>{loadedOutlets.length}</strong></div><div><span>Role Mappings</span><strong>{mappings.length}</strong></div><div><span>Segments</span><strong>{project?.segments.length || 0}</strong></div></div></div><div className="uc02-card"><div className="uc02-list-toolbar"><div className="uc02-card__title"><h3>Activation Gate</h3><p>Warnings do not disable activation.</p></div><button className="uc02-button" type="button" onClick={() => void refreshReadiness()} disabled={busy}>Re-check Readiness</button></div>{readiness ? <div className={`uc02-readiness-banner ${readiness.readyToActivate ? 'ready' : 'blocked'}`}><strong>{readiness.readyToActivate ? 'Blocking Checks Passed' : 'Project Is Not Ready'}</strong><span>{readiness.checks.filter((item) => item.severity === 'BLOCKING' && item.status !== 'PASS').length} blocking item(s) remaining · {readiness.checks.filter((item) => item.severity === 'WARNING' && item.status !== 'PASS').length} warning(s)</span></div> : <EmptyMessage>Readiness has not been checked.</EmptyMessage>}<div className="uc02-actions"><button className="uc02-button uc02-button--primary" type="button" onClick={() => void doActivate()} disabled={busy || !readiness?.readyToActivate || project?.projectStatus === 'ACTIVE'}>{project?.projectStatus === 'ACTIVE' ? 'Project Is Active' : busy ? 'Activating…' : 'Activate Project'}</button></div></div></div>
        )}
      </section>

      <footer className="uc02-footer-nav"><button className="uc02-button" type="button" disabled={activeStep === 1} onClick={() => goToStep(activeStep - 1)}>Previous</button><span>{currentStep.label}</span><button className="uc02-button uc02-button--primary" type="button" disabled={activeStep === 8 || !projectConfigured} onClick={() => goToStep(activeStep + 1)}>Next</button></footer>
    </div>
  );
}
