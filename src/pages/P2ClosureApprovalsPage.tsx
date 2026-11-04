import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import ClosureDecisionPanel from '../features/uc03-p2/review/ClosureDecisionPanel';
import {
  ACCEPTANCE_LABEL,
  listClosures,
  type ClosureAcceptance,
} from '../services/audit-core/reviewerClosure';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const TABS: ClosureAcceptance[] = ['PENDING', 'AUTO_ACCEPTED', 'ACCEPTED', 'REJECTED'];

function when(value?: string | null) {
  return value ? new Date(value).toLocaleString('en-IN') : '—';
}

/**
 * Closure approvals (product owner 2026-11-04): the Reviewer's journey
 * closures in the outlets the person covers. A Team Lead decides the pending
 * ones; TL, PM and Executive see the ones accepted automatically after 96 hours.
 */
export default function P2ClosureApprovalsPage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const operatingRole = useProjectContextStore((s) => s.selectedProject?.operatingRole);
  const accessToken = useSessionStore((s) => s.accessToken);
  const [tab, setTab] = useState<ClosureAcceptance>('PENDING');
  const [open, setOpen] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const canDecide = operatingRole === 'TL' || operatingRole === 'PM';
  const query = useQuery({
    queryKey: ['p2-closures', tenantId, tab],
    queryFn: () => listClosures(tenantId!, tab, accessToken),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 10_000,
  });
  const rows = query.data?.closures ?? [];

  return (
    <div className="screen-stack p2w">
      <PageHeader eyebrow="DealGuard" title="Closure approvals"
        description="Journeys the Reviewer closed. The Team Lead accepts each closure or rejects specific items; one not decided within 96 hours is accepted automatically." />
      <div className="p2w-segment" role="tablist" aria-label="Closure status">
        {TABS.map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''}
            onClick={() => { setTab(key); setOpen(undefined); }}>
            {ACCEPTANCE_LABEL[key]}{query.data ? <b>{query.data.counts[key] ?? 0}</b> : null}
          </button>
        ))}
      </div>
      {notice ? <div className="p2w-alert p2w-alert--success" role="status">{notice}</div> : null}
      {query.isLoading ? <SectionCard><p>Reading closures…</p></SectionCard> : null}
      {query.isError ? <SectionCard><div className="form-alert form-alert--error">Closures could not be read.</div></SectionCard> : null}
      {query.data && !rows.length ? <SectionCard><p className="p2w-muted">None in the outlets you cover.</p></SectionCard> : null}
      {rows.map((row) => (
        <SectionCard key={row.closureId}>
          <div className="p2w-row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <Link to={`/p2/journeys/${row.journeyId}/compliance-report`}><strong>{row.journeyReference || row.journeyId}</strong></Link>
              <div className="p2w-muted">{row.customerName || '—'} · {row.outletName || '—'}</div>
              <div className="p2w-muted">
                Closed {when(row.closedAtUtc)} · {row.itemCount} item{row.itemCount === 1 ? '' : 's'} answered
                {row.acceptanceStatus === 'PENDING' ? ` · auto-approves ${when(row.acceptanceDueUtc)}` : ''}
                {row.acceptanceStatus === 'AUTO_ACCEPTED' ? ` · auto-approved ${when(row.decidedAtUtc)}` : ''}
                {row.acceptanceStatus === 'ACCEPTED' || row.acceptanceStatus === 'REJECTED'
                  ? ` · ${row.decidedRole ?? ''} ${when(row.decidedAtUtc)}` : ''}
              </div>
            </div>
            <button type="button" className="p2w-button p2w-button--secondary"
              onClick={() => setOpen(open === row.closureId ? undefined : row.closureId)}>
              {open === row.closureId ? 'Hide' : row.acceptanceStatus === 'PENDING' && canDecide ? 'Decide' : 'View items'}
            </button>
          </div>
          {open === row.closureId ? (
            row.acceptanceStatus === 'PENDING' && canDecide && row.journeyId ? (
              <ClosureDecisionPanel tenantId={tenantId!} journeyId={row.journeyId} closureId={row.closureId}
                items={row.items} comment={row.comment} autoAcceptAtUtc={row.acceptanceDueUtc} accessToken={accessToken}
                onDone={(message) => { setNotice(message); setOpen(undefined); }} />
            ) : (
              <ul className="j360-controls" style={{ marginTop: 8 }}>
                <li><span className="j360-controls__body">Reviewer: “{row.comment}”</span></li>
                {row.items.map((item) => {
                  const rejected = row.rejections.find((r) => r.key === item.key);
                  return (
                    <li key={item.key}>
                      <span className="j360-controls__body"><strong>{item.label}</strong><span>{item.answer}</span>
                        {rejected ? <span className="p2w-tone p2w-tone--danger">Rejected: {rejected.reason}</span> : null}</span>
                    </li>
                  );
                })}
              </ul>
            )
          ) : null}
        </SectionCard>
      ))}
    </div>
  );
}
