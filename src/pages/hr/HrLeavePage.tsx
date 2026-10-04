import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '../../components/PageHeader';
import SectionCard from '../../components/SectionCard';
import {
  applyLeave,
  cancelLeave,
  getMyLeaveBalance,
  getMyLeaveRequests,
  type LeaveApplyInput,
  type LeaveRequest,
} from '../../services/hr/leave';
import { useSessionStore } from '../../store/sessionStore';
import { useHrAccess } from '../../features/hr/hrQueries';
import ApplyLeaveForm from '../../features/hr/leave/ApplyLeaveForm';
import BalanceCards from '../../features/hr/leave/BalanceCards';
import CancelLeaveDialog from '../../features/hr/leave/CancelLeaveDialog';
import LeaveRequestList from '../../features/hr/leave/LeaveRequestList';
import { formatDays, istToday, leaveErrorMessage, leaveTypeLabels, waitingFor } from '../../features/hr/leave/leaveLogic';
import { leaveKeys, yearChoices } from '../../features/hr/leave/leaveQueries';
import '../../styles/hr-leave.css';

type Tab = 'apply' | 'requests';

export default function HrLeavePage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useHrAccess();
  const queryClient = useQueryClient();
  const currentYear = Number(istToday().slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [tab, setTab] = useState<Tab>('apply');
  const [notice, setNotice] = useState('');
  const [applyError, setApplyError] = useState('');
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null);

  const enabled = Boolean(accessToken) && access.isEmployee;
  const balance = useQuery({
    queryKey: leaveKeys.myBalance(year),
    queryFn: () => getMyLeaveBalance(accessToken!, year),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const requests = useQuery({
    queryKey: leaveKeys.myRequests,
    queryFn: () => getMyLeaveRequests(accessToken!),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['hr', 'leave', 'my-balance'] });
    void queryClient.invalidateQueries({ queryKey: leaveKeys.myRequests });
  };

  const apply = useMutation({
    mutationFn: (payload: LeaveApplyInput) => applyLeave(accessToken!, payload),
    onSuccess: (created) => {
      setApplyError('');
      const what = `${leaveTypeLabels[created.leaveType]}, ${formatDays(created.days).toLowerCase()}`;
      setNotice(
        created.status === 'APPROVED'
          ? `Your leave is recorded: ${what}.`
          : `Your leave request is submitted: ${what}. ${waitingFor(created.approverRule, true)}.`,
      );
      setTab('requests');
      refresh();
    },
    onError: (error) => {
      setNotice('');
      setApplyError(leaveErrorMessage(error));
      // The balance or an overlapping request may have changed since the page loaded.
      refresh();
    },
  });

  const cancel = useMutation({
    mutationFn: (requestId: string) => cancelLeave(accessToken!, requestId),
    onSuccess: () => {
      setCancelling(null);
      setNotice('Your leave request was cancelled.');
      refresh();
    },
    onError: () => refresh(),
  });

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!access.isEmployee) {
    return (
      <section className="uc01-admin-page" aria-label="My leave">
        <PageHeader eyebrow="HR" title="My leave" />
        <div className="uc01-admin-state uc01-admin-state--error">
          <strong>No employee record is linked to your login.</strong>
          <span>Ask HR to link your login to your employee record to apply for leave.</span>
        </div>
      </section>
    );
  }

  const pendingCount = requests.data?.items.filter((r) => r.status === 'PENDING').length ?? 0;

  return (
    <section className="uc01-admin-page hr-page hr-leave-page" aria-label="My leave">
      <PageHeader eyebrow="HR" title="My leave" description="Your Sick and Earned leave balance, applying for leave, and the status of your requests." />

      <SectionCard
        title="Balance"
        action={(
          <label className="uc01-admin-filter hr-leave-year">
            <span>Year</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearChoices(currentYear).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        )}
      >
        {balance.isLoading && <div className="uc01-admin-state">Loading your balance…</div>}
        {balance.isError && (
          <div className="uc01-admin-state uc01-admin-state--error" role="alert">
            <strong>Your balance could not be loaded.</strong>
            <span>{leaveErrorMessage(balance.error)}</span>
            <button type="button" className="uc01-admin-button" onClick={() => balance.refetch()}>Try again</button>
          </div>
        )}
        {balance.data && (
          <>
            <BalanceCards types={balance.data.types} year={balance.data.year} />
            <p className="hr-field__hint hr-leave-balance-note">
              Available is what you can still apply for: your balance less requests waiting for a decision.
            </p>
          </>
        )}
      </SectionCard>

      <div className="hr-tabs" role="tablist" aria-label="Leave sections">
        <button type="button" role="tab" id="leave-tab-apply" aria-selected={tab === 'apply'} aria-controls="leave-panel" className={`hr-tab${tab === 'apply' ? ' is-active' : ''}`} onClick={() => setTab('apply')}>
          Apply for leave
        </button>
        <button type="button" role="tab" id="leave-tab-requests" aria-selected={tab === 'requests'} aria-controls="leave-panel" className={`hr-tab${tab === 'requests' ? ' is-active' : ''}`} onClick={() => setTab('requests')}>
          My requests{pendingCount > 0 ? ` (${pendingCount} pending)` : ''}
        </button>
      </div>

      {notice && <div className="uc01-admin-message uc01-admin-message--success" role="status">{notice}</div>}

      <div id="leave-panel" role="tabpanel" aria-labelledby={tab === 'apply' ? 'leave-tab-apply' : 'leave-tab-requests'}>
        {tab === 'apply' && (
          <SectionCard title="Apply for leave">
            <ApplyLeaveForm
              busy={apply.isPending}
              serverError={applyError}
              onEdit={() => { if (applyError) setApplyError(''); }}
              onSubmit={(payload) => { setNotice(''); setApplyError(''); apply.mutate(payload); }}
            />
          </SectionCard>
        )}
        {tab === 'requests' && (
          <SectionCard title="My requests" description="Your latest 100 requests, newest first. Only a pending request can be cancelled; to take back an approved one, ask HR.">
            {requests.isLoading && <div className="uc01-admin-state">Loading your requests…</div>}
            {requests.isError && (
              <div className="uc01-admin-state uc01-admin-state--error" role="alert">
                <strong>Your requests could not be loaded.</strong>
                <span>{leaveErrorMessage(requests.error)}</span>
                <button type="button" className="uc01-admin-button" onClick={() => requests.refetch()}>Try again</button>
              </div>
            )}
            {requests.data && (
              <LeaveRequestList
                requests={requests.data.items}
                own
                emptyText="You have not applied for any leave yet."
                actions={(r) => r.status === 'PENDING' ? (
                  <button type="button" className="uc01-admin-button uc01-admin-button--danger" onClick={() => { cancel.reset(); setCancelling(r); }}>
                    Cancel request
                  </button>
                ) : null}
              />
            )}
          </SectionCard>
        )}
      </div>

      {cancelling && (
        <CancelLeaveDialog
          request={cancelling}
          busy={cancel.isPending}
          error={cancel.isError ? leaveErrorMessage(cancel.error) : ''}
          onConfirm={() => { if (!cancel.isPending) cancel.mutate(cancelling.requestId); }}
          onClose={() => setCancelling(null)}
        />
      )}
    </section>
  );
}
