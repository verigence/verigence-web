import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import PageHeader from '../components/PageHeader';
import { getRuleCatalog, type Uc03RuleCatalogEntry } from '../services/audit-core/uc03Audit';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-rule-catalog.css';

const EXECUTOR_FILTERS: { key: 'ALL' | Uc03RuleCatalogEntry['executor']; label: string }[] = [
  { key: 'ALL', label: 'All rules' },
  { key: 'AUDIT_CORE', label: 'Audit Core' },
  { key: 'RULE_ENGINE', label: 'Rule Engine' },
];

const CLASS_LABEL: Record<string, string> = {
  VIOLATION: 'Violation',
  DOCUMENT_GAP: 'Missing document',
  DATA_GAP: 'Missing data',
};

function severityRank(severity: string | null): number {
  const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
  const index = order.indexOf((severity || '').toUpperCase());
  return index === -1 ? order.length : index;
}

function friendlyEvent(event: string): string {
  return event.replaceAll('_', ' ').toLowerCase().replace(/^./, (ch) => ch.toUpperCase());
}

function friendlyAction(action: string): string {
  return action.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function RuleRow({ rule }: { rule: Uc03RuleCatalogEntry }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className={`rc-rule${rule.enabled ? '' : ' rc-rule--disabled'}`}>
      <button type="button" className="rc-rule__head" onClick={() => setExpanded((v) => !v)}>
        <span className={`rc-sev rc-sev--${(rule.defaultSeverity || 'info').toLowerCase()}`} aria-hidden />
        <span className="rc-rule__code">{rule.ruleCode}</span>
        <span className="rc-rule__title">{rule.title}</span>
        <span className={`rc-executor rc-executor--${rule.executor.toLowerCase()}`}>
          {rule.executor === 'AUDIT_CORE' ? 'Audit Core' : 'Rule Engine'}
        </span>
        {rule.findingClass && (
          <span className={`rc-class rc-class--${rule.findingClass.toLowerCase()}`}>
            {CLASS_LABEL[rule.findingClass] || rule.findingClass}
          </span>
        )}
        {!rule.enabled && <span className="rc-parked">Parked</span>}
        <span className="rc-chevron" aria-hidden>{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="rc-rule__body">
          {rule.description && <p className="rc-rule__desc">{rule.description}</p>}
          <dl className="rc-rule__meta">
            <div>
              <dt>Trigger event{rule.triggerEvents.length === 1 ? '' : 's'}</dt>
              <dd>
                {rule.triggerEvents.length
                  ? rule.triggerEvents.map(friendlyEvent).join(', ')
                  : <span className="rc-muted">None configured</span>}
              </dd>
            </div>
            <div>
              <dt>Rerun policy</dt>
              <dd>{rule.rerunPolicy === 'ONCE' ? 'Once per journey' : 'Re-evaluated every trigger'}</dd>
            </div>
            <div>
              <dt>Owner / resolution</dt>
              <dd>
                {rule.defaultOwnerRole || '—'}
                {rule.resolutionMode ? ` · ${rule.resolutionMode === 'ADJUDICATED' ? 'Adjudicated (Confirm Breach / Mark False Positive)' : 'Self-serve'}` : ''}
              </dd>
            </div>
            <div>
              <dt>Blocks stage completion</dt>
              <dd>{rule.blockingCompletion ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt>Actions on failure</dt>
              <dd>
                {rule.boundActions.length
                  ? rule.boundActions.map(friendlyAction).join(', ')
                  : <span className="rc-muted">None</span>}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </li>
  );
}

export default function RuleCatalogPage() {
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [search, setSearch] = useState('');
  const [executorFilter, setExecutorFilter] = useState<'ALL' | Uc03RuleCatalogEntry['executor']>('ALL');

  const enabled = Boolean(project?.tenantId && accessToken);
  const query = useQuery({
    queryKey: ['uc03-rule-catalog', project?.tenantId],
    queryFn: () => getRuleCatalog(project!.tenantId, accessToken),
    enabled,
  });

  const filteredGroups = useMemo(() => {
    const groups = query.data?.groups ?? [];
    const term = search.trim().toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        rules: [...group.rules]
          .filter((rule) => executorFilter === 'ALL' || rule.executor === executorFilter)
          .filter((rule) =>
            !term
            || rule.ruleCode.toLowerCase().includes(term)
            || rule.title.toLowerCase().includes(term)
            || (rule.description || '').toLowerCase().includes(term),
          )
          .sort((a, b) => severityRank(a.defaultSeverity) - severityRank(b.defaultSeverity)),
      }))
      .filter((group) => group.rules.length > 0);
  }, [query.data, search, executorFilter]);

  const totalRules = query.data?.groups.reduce((sum, g) => sum + g.rules.length, 0) ?? 0;
  const enabledRules = query.data?.groups.reduce(
    (sum, g) => sum + g.rules.filter((r) => r.enabled).length, 0,
  ) ?? 0;
  const shownRules = filteredGroups.reduce((sum, g) => sum + g.rules.length, 0);

  return (
    <div className="rc-page">
      <PageHeader
        eyebrow="Assurance"
        title="Rule Catalog"
        description="Every audit rule in one place -- what it checks, when it runs, what happens when it fails."
      />

      {!project?.tenantId ? (
        <p className="rc-empty">Select a Project to view its rule catalog.</p>
      ) : query.isLoading ? (
        <p className="rc-empty">Loading rule catalog…</p>
      ) : query.isError ? (
        <p className="rc-empty rc-empty--error">
          Could not load the rule catalog. {(query.error as Error)?.message}
        </p>
      ) : (
        <>
          {query.data && !query.data.ruleEngineReachable && (
            <div className="rc-banner">
              The Rule Engine's own catalog is temporarily unreachable — showing Audit Core rules
              only. Declarative rules will reappear once it's back.
            </div>
          )}

          <div className="rc-toolbar">
            <input
              type="search"
              className="rc-search"
              placeholder="Search by rule code, title or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="rc-filters">
              {EXECUTOR_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`rc-filter${executorFilter === f.key ? ' rc-filter--active' : ''}`}
                  onClick={() => setExecutorFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <span className="rc-count">
              {shownRules} of {totalRules} rules shown · {enabledRules} enabled
            </span>
          </div>

          {filteredGroups.length === 0 ? (
            <p className="rc-empty">No rules match this filter.</p>
          ) : (
            filteredGroups.map((group) => (
              <section key={group.category} className="rc-group">
                <h2 className="rc-group__title">
                  {group.category}
                  <span className="rc-group__count">{group.rules.length}</span>
                </h2>
                <ul className="rc-rule-list">
                  {group.rules.map((rule) => (
                    <RuleRow key={rule.ruleCode} rule={rule} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}
