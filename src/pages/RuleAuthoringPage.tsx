import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import { AuditCoreHttpError } from '../services/audit-core/client';
import { createDeclarativeRule, type Uc03DeclarativeRuleDraft } from '../services/audit-core/uc03Audit';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-rule-catalog.css';
import '../styles/uc03-rule-authoring.css';

// The rule-engine's own DB CHECK constraints (audit.audit_rules, migration
// 0001) -- mirrored here so a bad value is caught before the round trip,
// not just relayed back from the 400 the backend already validates.
const AUDIT_SCOPES = ['WITHIN_CASE', 'CROSS_CASE'] as const;
const COMPARATORS = [
  'ABS_DIFF_GT', 'NOT_EQ', 'GT', 'LT', 'EQ', 'DATE_BEFORE',
  'DATE_DIFF_GT', 'RATIO_LT', 'FIELD_EMPTY', 'CROSS_DOC_SUM_GT',
] as const;
const SEVERITIES = ['CRITICAL', 'WARNING', 'INFO'] as const;
const AGGREGATIONS = ['SINGLE', 'SUM', 'MAX', 'MIN', 'COUNT'] as const;
const PHASES = ['BOOKING', 'DELIVERY', 'FINANCE', 'EXCHANGE', 'CORPORATE', 'FULL'] as const;

// Categories already in use by the rule-engine's 85-rule seed catalog --
// offered as suggestions via a datalist, not a closed enum (category has
// no DB CHECK -- a new one is a legitimate choice, just an uncommon one).
const KNOWN_CATEGORIES = [
  'PRICE', 'DISCOUNT', 'VEHICLE', 'DATE', 'KYC', 'COMPLETENESS', 'PROCESS',
  'CORPORATE', 'EXCHANGE', 'INSURANCE', 'NDC', 'RTO', 'DEBIT_NOTE',
  'THIRD_PARTY', 'ACCESSORY', 'TALLY_DMS', 'CROSS_CASE',
];

const COMPARATOR_HINT: Record<string, string> = {
  ABS_DIFF_GT: 'Fails when |left − right| is greater than the threshold.',
  NOT_EQ: 'Fails when the two values differ (case/salutation-insensitive text match).',
  GT: 'Fails when left is greater than right plus the threshold.',
  LT: 'Fails when left is less than right minus the threshold.',
  EQ: 'Fails when |left − right| is greater than the threshold (i.e. they should match).',
  DATE_BEFORE: 'Fails when the left date is before the right date.',
  DATE_DIFF_GT: 'Fails when the gap between the two dates exceeds the threshold, in days.',
  RATIO_LT: 'Fails when left ÷ right is less than the threshold.',
  FIELD_EMPTY: 'Fails when the left field is missing or blank. Right side and threshold are ignored.',
  CROSS_DOC_SUM_GT: 'Fails when a summed cross-document value exceeds the threshold.',
};

function emptyDraft(): Uc03DeclarativeRuleDraft {
  return {
    ruleCode: '',
    category: '',
    auditScope: 'WITHIN_CASE',
    phases: ['FULL'],
    leftAggregation: 'SINGLE',
    rightAggregation: 'SINGLE',
    comparator: 'GT',
    threshold: 0,
    severity: 'WARNING',
    findingMessage: '',
    requiresBothDocs: false,
    enabled: true,
  };
}

export default function RuleAuthoringPage() {
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);

  const [draft, setDraft] = useState<Uc03DeclarativeRuleDraft>(emptyDraft());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<string>();

  const set = <K extends keyof Uc03DeclarativeRuleDraft>(key: K, value: Uc03DeclarativeRuleDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const togglePhase = (phase: string) => {
    setDraft((d) => {
      const has = d.phases.includes(phase);
      const phases = has ? d.phases.filter((p) => p !== phase) : [...d.phases, phase];
      return { ...d, phases };
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!project?.tenantId) return;
    setSubmitting(true);
    setError(undefined);
    setCreated(undefined);
    try {
      const payload: Uc03DeclarativeRuleDraft = {
        ...draft,
        ruleCode: draft.ruleCode.trim().toUpperCase(),
        category: draft.category.trim(),
        findingMessage: draft.findingMessage.trim(),
        conditionExpression: draft.conditionExpression?.trim() || undefined,
        leftDocType: draft.leftDocType?.trim() || undefined,
        leftFieldKey: draft.leftFieldKey?.trim() || undefined,
        rightDocType: draft.rightDocType?.trim() || undefined,
        rightFieldKey: draft.rightFieldKey?.trim() || undefined,
        rightConfigKey: draft.rightConfigKey?.trim() || undefined,
      };
      const result = await createDeclarativeRule(project.tenantId, payload, accessToken);
      setCreated(result.ruleCode);
      setDraft(emptyDraft());
    } catch (err) {
      setError(err instanceof AuditCoreHttpError ? err.message : 'Could not create the rule. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!project?.tenantId) {
    return (
      <div className="rc-page">
        <PageHeader eyebrow="Assurance" title="Author a Rule" />
        <p className="rc-empty">Select a Project to author a rule.</p>
      </div>
    );
  }

  return (
    <div className="rc-page ra-page">
      <PageHeader
        eyebrow="Assurance"
        title="Author a Declarative Rule"
        description="Add a new comparator/threshold rule to the Rule Engine's 85-rule catalog. Bespoke Audit Core checks always need a code deploy -- this form is for declarative rules only."
        actions={<Link to="/rule-catalog" className="ra-back">← Rule Catalog</Link>}
      />

      {created && (
        <div className="ra-banner ra-banner--success" role="status">
          Rule <strong>{created}</strong> created. It's live immediately and will appear on the{' '}
          <Link to="/rule-catalog">Rule Catalog</Link> right away.
        </div>
      )}
      {error && (
        <div className="ra-banner ra-banner--error" role="alert">{error}</div>
      )}

      <form className="ra-form" onSubmit={(e) => void handleSubmit(e)}>
        <section className="ra-section">
          <h2>Identity</h2>
          <div className="ra-grid">
            <label className="ra-field">
              <span>Rule code</span>
              <input
                type="text"
                required
                value={draft.ruleCode}
                onChange={(e) => set('ruleCode', e.target.value)}
                placeholder="e.g. EX_SHOWROOM_PRICE_DEVIATION"
              />
            </label>
            <label className="ra-field">
              <span>Category</span>
              <input
                type="text"
                required
                list="ra-category-options"
                value={draft.category}
                onChange={(e) => set('category', e.target.value)}
                placeholder="e.g. PRICE"
              />
              <datalist id="ra-category-options">
                {KNOWN_CATEGORIES.map((c) => <option key={c} value={c} />)}
              </datalist>
            </label>
            <label className="ra-field">
              <span>Audit scope</span>
              <select value={draft.auditScope} onChange={(e) => set('auditScope', e.target.value as typeof draft.auditScope)}>
                {AUDIT_SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="ra-field ra-field--checkbox">
              <input type="checkbox" checked={draft.enabled} onChange={(e) => set('enabled', e.target.checked)} />
              <span>Enabled immediately</span>
            </label>
          </div>

          <fieldset className="ra-phases">
            <legend>Phases this rule runs in</legend>
            {PHASES.map((phase) => (
              <label key={phase} className="ra-phase-chip">
                <input
                  type="checkbox"
                  checked={draft.phases.includes(phase)}
                  onChange={() => togglePhase(phase)}
                />
                <span>{phase}</span>
              </label>
            ))}
            <p className="ra-hint">FULL runs in every phase; pick specific phases only when this check applies narrowly.</p>
          </fieldset>
        </section>

        <section className="ra-section">
          <h2>Comparison</h2>
          <div className="ra-grid">
            <label className="ra-field">
              <span>Comparator</span>
              <select value={draft.comparator} onChange={(e) => set('comparator', e.target.value)}>
                {COMPARATORS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="ra-field">
              <span>Threshold</span>
              <input
                type="number"
                step="any"
                value={draft.threshold}
                onChange={(e) => set('threshold', Number(e.target.value))}
              />
            </label>
            <label className="ra-field">
              <span>Severity</span>
              <select value={draft.severity} onChange={(e) => set('severity', e.target.value as typeof draft.severity)}>
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <p className="ra-hint">{COMPARATOR_HINT[draft.comparator]}</p>

          <div className="ra-operand-grid">
            <div className="ra-operand">
              <h3>Left operand</h3>
              <label className="ra-field">
                <span>Document type</span>
                <input type="text" value={draft.leftDocType || ''} onChange={(e) => set('leftDocType', e.target.value)} placeholder="e.g. tax_invoice_dms" />
              </label>
              <label className="ra-field">
                <span>Field key</span>
                <input type="text" value={draft.leftFieldKey || ''} onChange={(e) => set('leftFieldKey', e.target.value)} placeholder="e.g. ex_showroom_price" />
              </label>
              <label className="ra-field">
                <span>Aggregation</span>
                <select value={draft.leftAggregation} onChange={(e) => set('leftAggregation', e.target.value as typeof draft.leftAggregation)}>
                  {AGGREGATIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
            </div>
            <div className="ra-operand">
              <h3>Right operand</h3>
              <label className="ra-field">
                <span>Document type</span>
                <input type="text" value={draft.rightDocType || ''} onChange={(e) => set('rightDocType', e.target.value)} placeholder="e.g. booking_form" />
              </label>
              <label className="ra-field">
                <span>Field key</span>
                <input type="text" value={draft.rightFieldKey || ''} onChange={(e) => set('rightFieldKey', e.target.value)} placeholder="e.g. ex_showroom_price" />
              </label>
              <label className="ra-field">
                <span>Aggregation</span>
                <select value={draft.rightAggregation} onChange={(e) => set('rightAggregation', e.target.value as typeof draft.rightAggregation)}>
                  {AGGREGATIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <label className="ra-field">
                <span>Config key (optional)</span>
                <input type="text" value={draft.rightConfigKey || ''} onChange={(e) => set('rightConfigKey', e.target.value)} placeholder="for a tenant-configured constant instead of a document field" />
              </label>
            </div>
          </div>
          <label className="ra-field ra-field--checkbox">
            <input type="checkbox" checked={draft.requiresBothDocs} onChange={(e) => set('requiresBothDocs', e.target.checked)} />
            <span>Both documents must be present to evaluate (otherwise SKIPPED)</span>
          </label>
        </section>

        <section className="ra-section">
          <h2>Precondition</h2>
          <label className="ra-field ra-field--wide">
            <span>Condition expression (optional)</span>
            <textarea
              rows={2}
              value={draft.conditionExpression || ''}
              onChange={(e) => set('conditionExpression', e.target.value)}
              placeholder="e.g. doc_present:gate_pass AND doc_absent:insurance_cover_note"
            />
          </label>
          <p className="ra-hint">
            Only <code>doc_present:&lt;type&gt;</code>, <code>doc_absent:&lt;type&gt;</code>, or{' '}
            <code>field_gt:&lt;type&gt;.&lt;field&gt;:&lt;threshold&gt;</code> atoms, joined by a single{' '}
            <code>AND</code> or <code>OR</code> (not both). Leave blank to always evaluate this rule.
          </p>
        </section>

        <section className="ra-section">
          <h2>Finding</h2>
          <label className="ra-field ra-field--wide">
            <span>Finding message</span>
            <textarea
              rows={2}
              required
              value={draft.findingMessage}
              onChange={(e) => set('findingMessage', e.target.value)}
              placeholder="e.g. Ex-showroom price differs from the OEM price list by {diff}"
            />
          </label>
        </section>

        <div className="ra-actions">
          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Rule'}
          </button>
        </div>
      </form>
    </div>
  );
}
