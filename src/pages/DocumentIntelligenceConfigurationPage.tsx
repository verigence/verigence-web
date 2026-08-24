import { useEffect, useMemo, useState } from 'react';

import PageHeader from '../components/PageHeader';
import { listProjects, type ProjectSelection } from '../services/audit-core/uc02Admin';
import {
  approveConfigurationProposal,
  createConfigurationProposal,
  getConfigurationProposal,
  listConfigurationProposals,
  publishConfigurationProposal,
  retireConfigurationProposal,
  testConfigurationProposal,
  updateConfigurationProposal,
  type ConfigurationField,
  type ConfigurationProposal,
  type ConfigurationProposalBody,
} from '../services/di/configuration';
import { useSessionStore } from '../store/sessionStore';

const DATA_TYPES: ConfigurationField['dataType'][] = [
  'STRING', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'DATETIME',
  'CURRENCY', 'IDENTIFIER', 'PHONE', 'EMAIL', 'JSON',
];
const FORM_TYPES: ConfigurationProposalBody['physicalFormType'][] = ['PRINTABLE', 'HANDWRITTEN', 'GOVT_ID', 'ADDITIONAL'];

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error.';
}

function toCsv(values: string[]): string {
  return values.join(', ');
}

function fromCsv(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function printable(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

export default function DocumentIntelligenceConfigurationPage() {
  const accessToken = useSessionStore((state) => state.accessToken) ?? '';
  const [projects, setProjects] = useState<ProjectSelection[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [proposals, setProposals] = useState<ConfigurationProposal[]>([]);
  const [active, setActive] = useState<ConfigurationProposal | null>(null);
  const [draft, setDraft] = useState<ConfigurationProposalBody | null>(null);
  const [sample, setSample] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const currentProject = useMemo(() => projects.find((project) => project.tenantId === tenantId), [projects, tenantId]);

  const refreshList = async (targetTenant = tenantId) => {
    if (!targetTenant || !accessToken) return;
    const rows = await listConfigurationProposals(targetTenant, accessToken);
    setProposals(rows);
  };

  useEffect(() => {
    let activeRequest = true;
    if (!accessToken) return undefined;
    void listProjects(accessToken)
      .then((rows) => {
        if (!activeRequest) return;
        setProjects(rows);
        setTenantId((current) => current || rows[0]?.tenantId || '');
      })
      .catch((cause) => { if (activeRequest) setError(message(cause)); });
    return () => { activeRequest = false; };
  }, [accessToken]);

  useEffect(() => {
    let activeRequest = true;
    setActive(null);
    setDraft(null);
    setProposals([]);
    if (!tenantId || !accessToken) return undefined;
    void listConfigurationProposals(tenantId, accessToken)
      .then((rows) => { if (activeRequest) setProposals(rows); })
      .catch((cause) => { if (activeRequest) setError(message(cause)); });
    return () => { activeRequest = false; };
  }, [tenantId, accessToken]);

  const adopt = (proposal: ConfigurationProposal) => {
    setActive(proposal);
    setDraft(proposal.proposal ? structuredClone(proposal.proposal) : null);
    setError('');
  };

  const openProposal = async (proposalId: string) => {
    if (!tenantId) return;
    setBusy(`open:${proposalId}`);
    setError('');
    try {
      adopt(await getConfigurationProposal(tenantId, proposalId, accessToken));
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy('');
    }
  };

  const generate = async () => {
    if (!tenantId || !sample) return;
    setBusy('generate');
    setError('');
    try {
      const proposal = await createConfigurationProposal(tenantId, accessToken, sample, displayName, description);
      adopt(proposal);
      await refreshList(tenantId);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy('');
    }
  };

  const save = async (): Promise<ConfigurationProposal | null> => {
    if (!tenantId || !active || !draft) return null;
    setBusy('save');
    setError('');
    try {
      const saved = await updateConfigurationProposal(tenantId, active.proposalId, accessToken, draft);
      adopt(saved);
      await refreshList(tenantId);
      return saved;
    } catch (cause) {
      setError(message(cause));
      return null;
    } finally {
      setBusy('');
    }
  };

  const runTest = async () => {
    if (!tenantId || !active || !draft) return;
    setBusy('test');
    setError('');
    try {
      // Persist the exact editor contents first. The API intentionally invalidates
      // stale test evidence when a proposal is edited.
      const saved = await updateConfigurationProposal(tenantId, active.proposalId, accessToken, draft);
      const tested = await testConfigurationProposal(tenantId, saved.proposalId, accessToken);
      adopt(tested);
      await refreshList(tenantId);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy('');
    }
  };

  const transition = async (action: 'approve' | 'publish' | 'retire') => {
    if (!tenantId || !active) return;
    setBusy(action);
    setError('');
    try {
      const updated = action === 'approve'
        ? await approveConfigurationProposal(tenantId, active.proposalId, accessToken)
        : action === 'publish'
          ? await publishConfigurationProposal(tenantId, active.proposalId, accessToken)
          : await retireConfigurationProposal(tenantId, active.proposalId, accessToken);
      adopt(updated);
      await refreshList(tenantId);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy('');
    }
  };

  const patchDraft = (patch: Partial<ConfigurationProposalBody>) => {
    setDraft((current) => current ? { ...current, ...patch } : current);
  };

  const patchField = (index: number, patch: Partial<ConfigurationField>) => {
    setDraft((current) => {
      if (!current) return current;
      return { ...current, fields: current.fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field) };
    });
  };

  const removeField = (index: number) => {
    setDraft((current) => current ? { ...current, fields: current.fields.filter((_, fieldIndex) => fieldIndex !== index) } : current);
  };

  const addField = () => {
    setDraft((current) => current ? {
      ...current,
      fields: [...current.fields, {
        fieldKey: 'new_field',
        displayName: 'New Field',
        dataType: 'STRING',
        required: false,
        evidenceLabels: ['Visible label required'],
        aliases: [],
        extractionInstruction: 'Extract only when explicitly visible; otherwise return null. Never infer, calculate, reconstruct, or guess.',
        scoreIncluded: false,
        scoreWeight: 0,
        derived: false,
      }],
    } : current);
  };

  const editable = Boolean(active && draft && ['PROPOSED', 'DRAFT', 'TESTED'].includes(active.status));
  const testFields = active?.latestTestResult?.fields ?? [];

  return (
    <section className="di-config-page screen-stack">
      <PageHeader
        eyebrow="Administration"
        title="Document Intelligence Configuration"
        description="Create tenant extraction profiles from representative samples. Gemini proposes; DI validates; an administrator reviews, tests, approves and publishes."
      />

      <div className="di-config-notice">
        <strong>No-hallucination authoring policy</strong>
        <span>AI proposals are untrusted. Every proposed field requires visible evidence anchors. Derived/calculated fields are rejected, and publishing is a separate administrator action.</span>
      </div>

      {error && <div className="di-config-error" role="alert"><strong>Action failed</strong><span>{error}</span></div>}

      <div className="di-config-grid di-config-grid--top">
        <section className="di-config-panel">
          <header><span className="eyebrow">Scope</span><h2>1. Select Project / Tenant</h2></header>
          <label>Project
            <select value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
              <option value="">Select a Project</option>
              {projects.map((project) => <option key={project.tenantId} value={project.tenantId}>{project.projectName} · {project.projectCode}</option>)}
            </select>
          </label>
          {currentProject && <p className="di-config-meta">Tenant: <code>{currentProject.tenantId}</code></p>}
          <p className="di-config-help">Current DI configuration supports tenant scope. Project-specific profile precedence is not invented by this screen.</p>
        </section>

        <section className="di-config-panel">
          <header><span className="eyebrow">Create from sample</span><h2>2. Generate Proposal</h2></header>
          <label>Optional document name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="e.g. No Dues Certificate" /></label>
          <label>Optional business context<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} placeholder="What does this document evidence?" /></label>
          <label>Representative sample<input type="file" accept="image/*,.pdf" onChange={(event) => setSample(event.target.files?.[0] ?? null)} /></label>
          <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={!tenantId || !sample || Boolean(busy)} onClick={generate}>
            {busy === 'generate' ? 'Generating with DI / Gemini…' : 'Generate schema proposal'}
          </button>
          <p className="di-config-help">The browser sends the sample to DI only. DI calls Gemini server-side; no Gemini credential is exposed here.</p>
        </section>
      </div>

      <section className="di-config-panel">
        <header className="di-config-panel__split"><div><span className="eyebrow">Proposal history</span><h2>Recent proposals</h2></div><button type="button" className="uc01-admin-button" disabled={!tenantId || Boolean(busy)} onClick={() => void refreshList()}>Refresh</button></header>
        {proposals.length === 0 ? <p className="di-config-empty">No proposals for the selected tenant yet.</p> : (
          <div className="di-config-proposals">
            {proposals.map((proposal) => (
              <button type="button" key={proposal.proposalId} className={`di-config-proposal${active?.proposalId === proposal.proposalId ? ' is-active' : ''}`} onClick={() => void openProposal(proposal.proposalId)}>
                <span><strong>{proposal.displayName}</strong><small>{proposal.documentTypeKey}</small></span>
                <span className={`di-config-status di-config-status--${proposal.status.toLowerCase()}`}>{proposal.status}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {active && draft && (
        <section className="di-config-panel di-config-editor">
          <header className="di-config-panel__split">
            <div><span className="eyebrow">Admin review</span><h2>3. Review Extraction Profile Proposal</h2><p>Proposal {active.proposalId}</p></div>
            <div className="di-config-state-stack"><span className={`di-config-status di-config-status--${active.status.toLowerCase()}`}>{active.status}</span><small>{active.generatedByModel || 'model unavailable'} · {active.promptTokens ?? 0} in / {active.responseTokens ?? 0} out tokens</small></div>
          </header>

          <div className="di-config-grid">
            <label>Document type key<input disabled={!editable} value={draft.documentTypeKey} onChange={(event) => patchDraft({ documentTypeKey: event.target.value })} /></label>
            <label>Display name<input disabled={!editable} value={draft.displayName} onChange={(event) => patchDraft({ displayName: event.target.value })} /></label>
            <label>Physical form type<select disabled={!editable} value={draft.physicalFormType} onChange={(event) => patchDraft({ physicalFormType: event.target.value as ConfigurationProposalBody['physicalFormType'] })}>{FORM_TYPES.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Description<textarea disabled={!editable} value={draft.description ?? ''} onChange={(event) => patchDraft({ description: event.target.value })} rows={2} /></label>
          </div>

          {draft.warnings.length > 0 && <div className="di-config-warnings"><strong>Gemini warnings for admin review</strong>{draft.warnings.map((warning) => <span key={warning}>• {warning}</span>)}</div>}

          <div className="di-config-table-wrap">
            <table className="di-config-table">
              <thead><tr><th>Canonical field key</th><th>Display name</th><th>Type</th><th>Visible evidence labels</th><th>Required</th><th>Extraction instruction</th><th /></tr></thead>
              <tbody>
                {draft.fields.map((field, index) => (
                  <tr key={`${field.fieldKey}-${index}`}>
                    <td><input disabled={!editable} value={field.fieldKey} onChange={(event) => patchField(index, { fieldKey: event.target.value })} /></td>
                    <td><input disabled={!editable} value={field.displayName} onChange={(event) => patchField(index, { displayName: event.target.value })} /></td>
                    <td><select disabled={!editable} value={field.dataType} onChange={(event) => patchField(index, { dataType: event.target.value as ConfigurationField['dataType'] })}>{DATA_TYPES.map((value) => <option key={value}>{value}</option>)}</select></td>
                    <td><textarea disabled={!editable} rows={2} value={toCsv(field.evidenceLabels)} onChange={(event) => patchField(index, { evidenceLabels: fromCsv(event.target.value) })} /></td>
                    <td className="di-config-checkbox"><input disabled={!editable} type="checkbox" checked={field.required} onChange={(event) => patchField(index, { required: event.target.checked, scoreIncluded: event.target.checked, scoreWeight: event.target.checked ? 1 : 0 })} /></td>
                    <td><textarea disabled={!editable} rows={3} value={field.extractionInstruction} onChange={(event) => patchField(index, { extractionInstruction: event.target.value })} /></td>
                    <td>{editable && <button type="button" className="di-config-remove" onClick={() => removeField(index)} aria-label={`Remove ${field.displayName}`}>×</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {editable && <button type="button" className="uc01-admin-button" onClick={addField}>Add field</button>}

          <div className="di-config-actions">
            <button type="button" className="uc01-admin-button" disabled={!editable || Boolean(busy)} onClick={() => void save()}>{busy === 'save' ? 'Saving…' : 'Save Draft'}</button>
            <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={!editable || draft.fields.length === 0 || Boolean(busy)} onClick={runTest}>{busy === 'test' ? 'Testing extraction…' : 'Test Extraction'}</button>
            <button type="button" className="uc01-admin-button" disabled={active.status !== 'TESTED' || Boolean(busy)} onClick={() => void transition('approve')}>{busy === 'approve' ? 'Approving…' : 'Approve → create DRAFT profile'}</button>
            <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={active.status !== 'APPROVED' || Boolean(busy)} onClick={() => void transition('publish')}>{busy === 'publish' ? 'Publishing…' : 'Publish Profile'}</button>
            <button type="button" className="uc01-admin-button" disabled={active.status !== 'PUBLISHED' || Boolean(busy)} onClick={() => void transition('retire')}>{busy === 'retire' ? 'Retiring…' : 'Retire Profile'}</button>
          </div>

          {active.status === 'APPROVED' && <p className="di-config-help"><strong>Approved is not published.</strong> DI has materialised profile <code>{active.materializedProfileId}</code> in DRAFT state. Publish is a separate permissioned action.</p>}
        </section>
      )}

      {active?.latestTestResult && (
        <section className="di-config-panel">
          <header><span className="eyebrow">Preview only</span><h2>4. Test Extraction Result</h2><p>This result is authoring evidence only and is not persisted as a customer Document/Field record.</p></header>
          <div className="di-config-table-wrap"><table className="di-config-table"><thead><tr><th>Field</th><th>Value from sample</th><th>Status</th><th>Confidence</th></tr></thead><tbody>
            {testFields.map((field) => <tr key={field.fieldKey}><td><code>{field.fieldKey}</code></td><td>{printable(field.value)}</td><td>{field.foundStatus}</td><td>{field.confidence === null ? '—' : `${field.confidence.toFixed(2)}%`}</td></tr>)}
          </tbody></table></div>
        </section>
      )}
    </section>
  );
}
