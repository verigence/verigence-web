import { useEffect, useMemo, useState, type FormEvent } from 'react';

import {
  confirmMasterImport,
  downloadMasterTemplate,
  listMasterVersions,
  publishMasterVersion,
  uploadMasterImport,
  type MasterImport,
  type MasterVersion,
} from '../../services/audit-core/uc02Admin';
import {
  getFormMaster,
  saveAuditControl,
  saveBusinessStatusCode,
  saveDocumentRequirementProfile,
  saveProjectPolicy,
  type FormMasterKey,
  type FormMasterState,
} from '../../services/audit-core/uc02MasterForms';
import { auditCoreErrorMessage } from '../../services/audit-core/errorMessage';
import { useSessionStore } from '../../store/sessionStore';

const FORM_MASTER_BY_LABEL: Record<string, FormMasterKey> = {
  'Document Requirement Profiles': 'DOCUMENT_REQUIREMENT_PROFILE',
  'Audit Controls': 'AUDIT_CONTROL',
  'Project Policy': 'PROJECT_POLICY',
  'Business Status Codes': 'BUSINESS_STATUS_CODES',
};

const DI_MASTER_BY_LABEL: Record<string, string> = {
  'Document Types': 'DOCUMENT_TYPES',
  'Extraction Profiles': 'EXTRACTION_PROFILES',
  'Requirement Profiles': 'REQUIREMENT_PROFILES',
};

type Selection =
  | { kind: 'AUDIT_CORE'; label: string; masterKey: FormMasterKey }
  | { kind: 'DI'; label: string; masterKey: string };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fieldStyle(): React.CSSProperties {
  return { width: '100%', minHeight: 42, border: '1px solid #c9d8e8', borderRadius: 8, padding: '8px 10px' };
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(7, 31, 60, 0.42)', display: 'grid', placeItems: 'center', padding: 24 }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section style={{ width: 'min(920px, 96vw)', maxHeight: '90vh', overflow: 'auto', background: '#fff', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,.24)', padding: 22 }}>
        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, borderBottom: '1px solid #e5edf5', paddingBottom: 14, marginBottom: 18 }}>
          <div><small style={{ color: '#008d9b', fontWeight: 700 }}>Step 6 configuration</small><h2 style={{ margin: '4px 0 0' }}>{title}</h2></div>
          <button type="button" className="uc02-button" onClick={onClose}>Close</button>
        </header>
        {children}
      </section>
    </div>
  );
}

export default function ProjectMasterActionOverlay() {
  const tenantId = useSessionStore((state) => state.tenantId);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [state, setState] = useState<FormMasterState | null>(null);
  const [versions, setVersions] = useState<MasterVersion[]>([]);
  const [diFile, setDiFile] = useState<File | null>(null);
  const [diImport, setDiImport] = useState<MasterImport | null>(null);

  const [profileCode, setProfileCode] = useState('STANDARD');
  const [profileName, setProfileName] = useState('Standard Journey Requirements');
  const [profileFrom, setProfileFrom] = useState(today());
  const [profileTo, setProfileTo] = useState('');
  const [profileItems, setProfileItems] = useState('BOOKING_FORM | BOOKING_FORM | BOOKING | REQUIRED');

  const [controlKey, setControlKey] = useState('');
  const [controlName, setControlName] = useState('');
  const [controlArea, setControlArea] = useState('BOOKING');
  const [controlFrom, setControlFrom] = useState(today());
  const [controlTo, setControlTo] = useState('');
  const [evaluatorKey, setEvaluatorKey] = useState('');
  const [executionMode, setExecutionMode] = useState<'ON_SAVE' | 'NIGHTLY' | 'ON_DEMAND'>('ON_SAVE');
  const [severity, setSeverity] = useState('MEDIUM');

  const [policyFrom, setPolicyFrom] = useState(today());
  const [policyTo, setPolicyTo] = useState('');
  const [satelliteThreshold, setSatelliteThreshold] = useState('');
  const [policySettings, setPolicySettings] = useState('{}');

  const [statusDomain, setStatusDomain] = useState('JOURNEY');
  const [statusCode, setStatusCode] = useState('');
  const [statusLabel, setStatusLabel] = useState('');
  const [statusDescription, setStatusDescription] = useState('');
  const [statusFrom, setStatusFrom] = useState('');
  const [statusTo, setStatusTo] = useState('');
  const [statusActive, setStatusActive] = useState(true);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest('button.uc02-link-button');
      if (!button) return;
      const row = button.closest('tr');
      const label = row?.querySelector('td strong')?.textContent?.trim();
      if (!label) return;
      const formKey = FORM_MASTER_BY_LABEL[label];
      const diKey = DI_MASTER_BY_LABEL[label];
      if (!formKey && !diKey) return;
      event.preventDefault();
      event.stopPropagation();
      setError('');
      setState(null);
      setVersions([]);
      setDiFile(null);
      setDiImport(null);
      setSelection(formKey ? { kind: 'AUDIT_CORE', label, masterKey: formKey } : { kind: 'DI', label, masterKey: diKey });
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  useEffect(() => {
    if (!selection || !tenantId || !accessToken) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        if (selection.kind === 'AUDIT_CORE') {
          const loaded = await getFormMaster(tenantId, selection.masterKey, accessToken);
          if (cancelled) return;
          setState(loaded);
          const data = loaded.data;
          if (selection.masterKey === 'DOCUMENT_REQUIREMENT_PROFILE' && data && !Array.isArray(data)) {
            setProfileCode(String(data.profileCode || 'STANDARD'));
            setProfileName(String(data.profileName || 'Standard Journey Requirements'));
            setProfileFrom(String(data.effectiveFrom || today()));
            setProfileTo(String(data.effectiveTo || ''));
            const items = Array.isArray(data.items) ? data.items : [];
            if (items.length) setProfileItems(items.map((item) => `${item.requirementKey || ''} | ${item.documentTypeKey || ''} | ${item.processArea || ''} | ${item.requirementLevel || 'REQUIRED'}`).join('\n'));
          }
          if (selection.masterKey === 'AUDIT_CONTROL' && data && !Array.isArray(data)) {
            setControlKey(String(data.controlKey || ''));
            setControlName(String(data.controlName || ''));
            setControlArea(String(data.processArea || 'BOOKING'));
            setControlFrom(String(data.effectiveFrom || today()));
            setControlTo(String(data.effectiveTo || ''));
            setEvaluatorKey(String(data.evaluatorKey || ''));
            setExecutionMode((data.executionMode as typeof executionMode) || 'ON_SAVE');
            setSeverity(String(data.defaultSeverity || 'MEDIUM'));
          }
          if (selection.masterKey === 'PROJECT_POLICY' && data && !Array.isArray(data)) {
            setPolicyFrom(String(data.effectiveFrom || today()));
            setPolicyTo(String(data.effectiveTo || ''));
            setSatelliteThreshold(data.satelliteMonthlyVolumeThreshold == null ? '' : String(data.satelliteMonthlyVolumeThreshold));
            setPolicySettings(JSON.stringify(data.policySettings || {}, null, 2));
          }
        } else {
          const loaded = await listMasterVersions(tenantId, 'DI', selection.masterKey, accessToken);
          if (!cancelled) setVersions(loaded);
        }
      } catch (cause) {
        if (!cancelled) setError(auditCoreErrorMessage(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selection, tenantId, accessToken]);

  const latestDraft = useMemo(() => state?.lifecycleStatus === 'DRAFT' && state.versionId ? state.versionId : null, [state]);

  async function saveForm(event: FormEvent) {
    event.preventDefault();
    if (!selection || selection.kind !== 'AUDIT_CORE' || !tenantId || !accessToken) return;
    setLoading(true);
    setError('');
    try {
      let saved: FormMasterState;
      if (selection.masterKey === 'DOCUMENT_REQUIREMENT_PROFILE') {
        const items = profileItems.split('\n').map((line) => line.trim()).filter(Boolean).map((line, index) => {
          const [requirementKey, documentTypeKey, processArea, level] = line.split('|').map((part) => part.trim());
          if (!requirementKey || !documentTypeKey || !processArea) throw new Error(`Requirement line ${index + 1} must contain Requirement Key | Document Type Key | Process Area | Level.`);
          const requirementLevel = (level || 'REQUIRED').toUpperCase();
          if (!['REQUIRED', 'CONDITIONAL', 'OPTIONAL'].includes(requirementLevel)) throw new Error(`Requirement line ${index + 1} has invalid level.`);
          return { requirementKey, documentTypeKey, processArea, requirementLevel: requirementLevel as 'REQUIRED' | 'CONDITIONAL' | 'OPTIONAL', sortOrder: index };
        });
        saved = await saveDocumentRequirementProfile(tenantId, { profileCode, profileName, effectiveFrom: profileFrom, effectiveTo: profileTo || null, items }, accessToken);
      } else if (selection.masterKey === 'AUDIT_CONTROL') {
        saved = await saveAuditControl(tenantId, { controlKey, controlName, processArea: controlArea, effectiveFrom: controlFrom, effectiveTo: controlTo || null, evaluatorKey, executionMode, defaultSeverity: severity }, accessToken);
      } else if (selection.masterKey === 'PROJECT_POLICY') {
        const parsed = JSON.parse(policySettings || '{}') as Record<string, unknown>;
        saved = await saveProjectPolicy(tenantId, { effectiveFrom: policyFrom, effectiveTo: policyTo || null, satelliteMonthlyVolumeThreshold: satelliteThreshold ? Number(satelliteThreshold) : null, policySettings: parsed }, accessToken);
      } else {
        saved = await saveBusinessStatusCode(tenantId, { domainKey: statusDomain, statusCode, statusLabel, description: statusDescription || null, effectiveFrom: statusFrom || null, effectiveTo: statusTo || null, isActive: statusActive }, accessToken);
      }
      setState(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : auditCoreErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  async function publishDraft() {
    if (!selection || selection.kind !== 'AUDIT_CORE' || !latestDraft || !tenantId || !accessToken) return;
    setLoading(true);
    setError('');
    try {
      await publishMasterVersion(tenantId, 'AUDIT_CORE', selection.masterKey, latestDraft, accessToken);
      window.location.reload();
    } catch (cause) {
      setError(auditCoreErrorMessage(cause));
      setLoading(false);
    }
  }

  async function downloadDiTemplate() {
    if (!selection || selection.kind !== 'DI' || !tenantId || !accessToken) return;
    setLoading(true);
    setError('');
    try {
      const blob = await downloadMasterTemplate(tenantId, 'DI', selection.masterKey, accessToken);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selection.masterKey.toLowerCase()}-template.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(auditCoreErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  async function uploadDi() {
    if (!selection || selection.kind !== 'DI' || !tenantId || !accessToken || !diFile) return;
    setLoading(true);
    setError('');
    try {
      const imported = await uploadMasterImport(tenantId, 'DI', selection.masterKey, diFile, null, `di-customize-${crypto.randomUUID()}`, accessToken);
      setDiImport(imported);
    } catch (cause) {
      setError(auditCoreErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  async function confirmAndPublishDi() {
    if (!selection || selection.kind !== 'DI' || !tenantId || !accessToken || !diImport) return;
    setLoading(true);
    setError('');
    try {
      const confirmed = await confirmMasterImport(tenantId, diImport.importId, accessToken);
      if (confirmed.confirmedVersionId) {
        await publishMasterVersion(tenantId, 'DI', selection.masterKey, confirmed.confirmedVersionId, accessToken);
      }
      window.location.reload();
    } catch (cause) {
      setError(auditCoreErrorMessage(cause));
      setLoading(false);
    }
  }

  if (!selection) return null;

  return (
    <ModalShell title={selection.label} onClose={() => setSelection(null)}>
      {error && <div className="uc02-message uc02-message--error"><strong>Action Required</strong><span>{error}</span></div>}
      {loading && <div className="uc02-note">Loading…</div>}

      {selection.kind === 'DI' ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="uc02-note"><strong>Verigence default is already effective.</strong> No copy is required. Close this window to continue using the inherited default, or customize below.</div>
          <div className="uc02-version-list"><h4>Effective versions</h4>{versions.length ? versions.map((version) => <div className="uc02-version-row" key={version.versionId}><span><strong>{version.displayName || version.businessKey || version.versionId}</strong><small>{version.lifecycleStatus}</small></span></div>) : <div className="uc02-empty">No effective versions returned.</div>}</div>
          <div className="uc02-card__title"><h3>Customize for this Project</h3><p>Customization creates a Project/Tenant-specific DI version. Published Verigence defaults remain unchanged.</p></div>
          <div className="uc02-actions"><button type="button" className="uc02-button" onClick={() => void downloadDiTemplate()} disabled={loading}>Download Excel Template</button></div>
          <label className="uc02-field"><span>Completed Workbook</span><input style={fieldStyle()} type="file" accept=".xlsx" onChange={(event) => setDiFile(event.target.files?.[0] || null)} /></label>
          <div className="uc02-actions"><button type="button" className="uc02-button uc02-button--primary" disabled={loading || !diFile} onClick={() => void uploadDi()}>Upload &amp; Validate</button>{diImport && <button type="button" className="uc02-button uc02-button--primary" disabled={loading || diImport.status !== 'PREVIEW_READY' || diImport.errorRows > 0} onClick={() => void confirmAndPublishDi()}>Confirm &amp; Publish</button>}</div>
          {diImport && <div className="uc02-note">Validation: {diImport.validRows} valid · {diImport.warningRows} warning · {diImport.errorRows} error row(s).</div>}
        </div>
      ) : (
        <form onSubmit={saveForm} style={{ display: 'grid', gap: 14 }}>
          {selection.masterKey === 'DOCUMENT_REQUIREMENT_PROFILE' && <><label className="uc02-field"><span>Profile Code</span><input style={fieldStyle()} required value={profileCode} onChange={(event) => setProfileCode(event.target.value)} /></label><label className="uc02-field"><span>Profile Name</span><input style={fieldStyle()} required value={profileName} onChange={(event) => setProfileName(event.target.value)} /></label><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><label className="uc02-field"><span>Effective From</span><input style={fieldStyle()} type="date" required value={profileFrom} onChange={(event) => setProfileFrom(event.target.value)} /></label><label className="uc02-field"><span>Effective To</span><input style={fieldStyle()} type="date" value={profileTo} onChange={(event) => setProfileTo(event.target.value)} /></label></div><label className="uc02-field"><span>Required Evidence</span><textarea style={{ ...fieldStyle(), minHeight: 150 }} value={profileItems} onChange={(event) => setProfileItems(event.target.value)} /><small>One per line: Requirement Key | Document Type Key | Process Area | REQUIRED / CONDITIONAL / OPTIONAL</small></label></>}
          {selection.masterKey === 'AUDIT_CONTROL' && <><label className="uc02-field"><span>Control Key</span><input style={fieldStyle()} required value={controlKey} onChange={(event) => setControlKey(event.target.value)} /></label><label className="uc02-field"><span>Control Name</span><input style={fieldStyle()} required value={controlName} onChange={(event) => setControlName(event.target.value)} /></label><label className="uc02-field"><span>Process Area</span><input style={fieldStyle()} required value={controlArea} onChange={(event) => setControlArea(event.target.value)} /></label><label className="uc02-field"><span>Evaluator Key</span><input style={fieldStyle()} required value={evaluatorKey} onChange={(event) => setEvaluatorKey(event.target.value)} /></label><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><label className="uc02-field"><span>Effective From</span><input style={fieldStyle()} type="date" required value={controlFrom} onChange={(event) => setControlFrom(event.target.value)} /></label><label className="uc02-field"><span>Effective To</span><input style={fieldStyle()} type="date" value={controlTo} onChange={(event) => setControlTo(event.target.value)} /></label></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><label className="uc02-field"><span>Execution Mode</span><select style={fieldStyle()} value={executionMode} onChange={(event) => setExecutionMode(event.target.value as typeof executionMode)}><option value="ON_SAVE">On Save</option><option value="NIGHTLY">Nightly</option><option value="ON_DEMAND">On Demand</option></select></label><label className="uc02-field"><span>Default Severity</span><input style={fieldStyle()} value={severity} onChange={(event) => setSeverity(event.target.value)} /></label></div></>}
          {selection.masterKey === 'PROJECT_POLICY' && <><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><label className="uc02-field"><span>Effective From</span><input style={fieldStyle()} type="date" required value={policyFrom} onChange={(event) => setPolicyFrom(event.target.value)} /></label><label className="uc02-field"><span>Effective To</span><input style={fieldStyle()} type="date" value={policyTo} onChange={(event) => setPolicyTo(event.target.value)} /></label></div><label className="uc02-field"><span>Satellite Monthly Volume Threshold</span><input style={fieldStyle()} type="number" min="0" value={satelliteThreshold} onChange={(event) => setSatelliteThreshold(event.target.value)} /></label><label className="uc02-field"><span>Additional Policy Settings (JSON)</span><textarea style={{ ...fieldStyle(), minHeight: 140, fontFamily: 'monospace' }} value={policySettings} onChange={(event) => setPolicySettings(event.target.value)} /></label></>}
          {selection.masterKey === 'BUSINESS_STATUS_CODES' && <><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><label className="uc02-field"><span>Domain</span><input style={fieldStyle()} required value={statusDomain} onChange={(event) => setStatusDomain(event.target.value)} /></label><label className="uc02-field"><span>Status Code</span><input style={fieldStyle()} required value={statusCode} onChange={(event) => setStatusCode(event.target.value)} /></label></div><label className="uc02-field"><span>Status Label</span><input style={fieldStyle()} required value={statusLabel} onChange={(event) => setStatusLabel(event.target.value)} /></label><label className="uc02-field"><span>Description</span><input style={fieldStyle()} value={statusDescription} onChange={(event) => setStatusDescription(event.target.value)} /></label><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><label className="uc02-field"><span>Effective From</span><input style={fieldStyle()} type="date" value={statusFrom} onChange={(event) => setStatusFrom(event.target.value)} /></label><label className="uc02-field"><span>Effective To</span><input style={fieldStyle()} type="date" value={statusTo} onChange={(event) => setStatusTo(event.target.value)} /></label></div><label><input type="checkbox" checked={statusActive} onChange={(event) => setStatusActive(event.target.checked)} /> Active</label>{Array.isArray(state?.data) && state.data.length > 0 && <div className="uc02-note">Existing status codes: {state.data.map((item) => `${item.domainKey}/${item.statusCode}`).join(', ')}</div>}</>}
          <div className="uc02-actions"><button className="uc02-button uc02-button--primary" disabled={loading}>{loading ? 'Saving…' : selection.masterKey === 'BUSINESS_STATUS_CODES' ? 'Save Status Code' : 'Save Draft'}</button>{latestDraft && <button className="uc02-button uc02-button--primary" type="button" disabled={loading} onClick={() => void publishDraft()}>Publish Draft</button>}</div>
          {state?.lifecycleStatus && <div className="uc02-note">Current state: <strong>{state.lifecycleStatus}</strong>{state.versionNo ? ` · Version ${state.versionNo}` : ''}</div>}
        </form>
      )}
    </ModalShell>
  );
}
