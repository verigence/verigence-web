import { useState } from 'react';

import PageHeader from '../../components/PageHeader';
import AttendancePanel, { useAttendanceApprovals } from '../../features/hr/approvals/AttendancePanel';
import ClaimsPanel, { useClaimApprovals } from '../../features/hr/approvals/ClaimsPanel';
import LeavePanel, { useLeaveApprovals } from '../../features/hr/approvals/LeavePanel';
import { useHrAccess } from '../../features/hr/hrQueries';
import '../../styles/hr-approvals.css';

type Tab = 'attendance' | 'leave' | 'claims';

/**
 * What is waiting for this person. The server decides who sees and who may decide each item, so
 * every tab is offered and the server returns an empty list where nothing applies. The three
 * lists load once when the page opens (no polling); a decision refreshes only its own list.
 */
export default function HrApprovalsPage() {
  const access = useHrAccess();
  const [tab, setTab] = useState<Tab>('attendance');
  const attendance = useAttendanceApprovals();
  const leave = useLeaveApprovals();
  const claims = useClaimApprovals();

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!access.available) {
    return (
      <section className="uc01-admin-page" aria-label="Approvals">
        <PageHeader eyebrow="HR" title="Approvals" />
        <div className="uc01-admin-state uc01-admin-state--error">
          <strong>HR is not available to you.</strong>
          <span>Ask an administrator for access if you need to approve requests.</span>
        </div>
      </section>
    );
  }

  const countOf = (q: { data?: unknown[]; isError: boolean }) => (q.data && !q.isError ? q.data.length : null);
  const tabs: Array<{ key: Tab; label: string; count: number | null }> = [
    { key: 'attendance', label: 'Attendance', count: countOf(attendance) },
    { key: 'leave', label: 'Leave', count: countOf(leave) },
    { key: 'claims', label: 'Claims', count: countOf(claims) },
  ];

  return (
    <section className="uc01-admin-page hr-page hr-appr-page" aria-label="Approvals">
      <PageHeader
        eyebrow="HR"
        title="Approvals"
        description="Requests waiting for your decision. You only see what you are allowed to decide."
      />
      <div className="hr-tabs" role="tablist" aria-label="Approval types">
        {tabs.map((t) => (
          <button
            key={t.key}
            id={`hr-appr-tab-${t.key}`}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            aria-controls={`hr-appr-panel-${t.key}`}
            className={`hr-tab${tab === t.key ? ' is-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.count !== null && t.count > 0 && <span className="hr-appr-badge">{t.count}</span>}
          </button>
        ))}
      </div>
      <div id={`hr-appr-panel-${tab}`} role="tabpanel" aria-labelledby={`hr-appr-tab-${tab}`}>
        {tab === 'attendance' && <AttendancePanel query={attendance} />}
        {tab === 'leave' && <LeavePanel query={leave} />}
        {tab === 'claims' && <ClaimsPanel query={claims} />}
      </div>
    </section>
  );
}
