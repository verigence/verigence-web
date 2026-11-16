import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import PageHeader from '../../components/PageHeader';
import SectionCard from '../../components/SectionCard';
import { getMyCalendar, listMyCorrections } from '../../services/hr/attendanceCalendar';
import { hrErrorMessage } from '../../services/hr/client';
import {
  applyLeave,
  cancelLeave,
  getMyLeaveBalance,
  getMyLeaveEarning,
  getMyLeaveRequests,
  type LeaveApplyInput,
  type LeaveRequest,
} from '../../services/hr/leave';
import { useSessionStore } from '../../store/sessionStore';
import { useHrAccess } from '../../features/hr/hrQueries';
import CorrectionDialog from '../../features/hr/attendance/CorrectionDialog';
import MyCorrections from '../../features/hr/attendance/MyCorrections';
import { attendanceKeys } from '../../features/hr/attendance/attendanceQueries';
import { currentMonthIst, formatWorkDate, hhmmIst, todayIst } from '../../features/hr/attendance/attendanceFormat';
import { canRequestCorrection, correctionAskFor, dayLabel, type CorrectionAsk } from '../../features/hr/attendance/calendarFormat';
import ApplyLeaveForm from '../../features/hr/leave/ApplyLeaveForm';
import CancelLeaveDialog from '../../features/hr/leave/CancelLeaveDialog';
import LeaveRequestList from '../../features/hr/leave/LeaveRequestList';
import {
  availableByType,
  formatDays,
  istToday,
  leaveErrorMessage,
  leaveTypeLabels,
  waitingFor,
} from '../../features/hr/leave/leaveLogic';
import { leaveKeys } from '../../features/hr/leave/leaveQueries';
import '../../styles/hr-attendance.css';
import '../../styles/hr-calendar.css';
import '../../styles/hr-leave.css';

type Tab = 'raise' | 'mine';
type Kind = 'LEAVE' | 'ATTENDANCE';

/**
 * My Requests (product owner, 16 Nov 2026): one place for an employee to raise a leave request or an
 * attendance correction (a full or half day, or a check-in / check-out time or location), and to
 * follow both. Leave balances and how leave is earned stay on the Leave page; the calendar on
 * Attendance.
 */
export default function HrMyRequestsPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useHrAccess();
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>('raise');
  const [kind, setKind] = useState<Kind>('LEAVE');
  const [notice, setNotice] = useState('');
  const [applyError, setApplyError] = useState('');
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null);
  const [correctionDate, setCorrectionDate] = useState('');
  const [correcting, setCorrecting] = useState<CorrectionAsk | null>(null);
  const enabled = Boolean(accessToken) && access.isEmployee;
  const year = Number(istToday().slice(0, 4));
  const today = todayIst();
  const month = currentMonthIst();

  const balance = useQuery({
    queryKey: leaveKeys.myBalance(year),
    queryFn: () => getMyLeaveBalance(accessToken!, year),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const earning = useQuery({
    queryKey: leaveKeys.myEarning,
    queryFn: () => getMyLeaveEarning(accessToken!),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const leaveRequests = useQuery({
    queryKey: leaveKeys.myRequests,
    queryFn: () => getMyLeaveRequests(accessToken!),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const corrections = useQuery({
    queryKey: attendanceKeys.corrections,
    queryFn: () => listMyCorrections(accessToken!),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
  // The month so far, to know what each day had (check-in, check-out, location) before asking.
  const calendar = useQuery({
    queryKey: attendanceKeys.calendar(month),
    queryFn: () => getMyCalendar(accessToken!, month),
    enabled: enabled && kind === 'ATTENDANCE',
    retry: false,
    refetchOnWindowFocus: false,
  });

  const refreshLeave = () => {
    void client.invalidateQueries({ queryKey: ['hr', 'leave', 'my-balance'] });
    void client.invalidateQueries({ queryKey: leaveKeys.myRequests });
    void client.invalidateQueries({ queryKey: leaveKeys.myEarning });
    void client.invalidateQueries({ queryKey: leaveKeys.myAbsences });
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
      setTab('mine');
      refreshLeave();
    },
    onError: (error) => {
      setNotice('');
      setApplyError(leaveErrorMessage(error));
      refreshLeave();
    },
  });

  const cancel = useMutation({
    mutationFn: (requestId: string) => cancelLeave(accessToken!, requestId),
    onSuccess: () => {
      setCancelling(null);
      setNotice('Your leave request was cancelled.');
      refreshLeave();
    },
    onError: () => refreshLeave(),
  });

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!access.isEmployee) {
    return (
      <section className="uc01-admin-page" aria-label="My Requests">
        <PageHeader eyebrow="HR" title="My Requests" />
        <div className="uc01-admin-state uc01-admin-state--error">
          <strong>No employee record is linked to your login.</strong>
          <span>Ask HR to link your login to your employee record to raise requests.</span>
        </div>
      </section>
    );
  }

  const waiting =
    (leaveRequests.data?.items.filter((r) => r.status === 'PENDING').length ?? 0)
    + (corrections.data?.filter((c) => c.status === 'PENDING').length ?? 0);
  const days = calendar.data?.weeks.flatMap((w) => w.days) ?? [];
  const chosenDay = correctionDate ? days.find((d) => d.date === correctionDate) ?? null : null;
  const closed = calendar.data ? hhmmIst(new Date()) >= calendar.data.absentAfter : false;
  const dayOk = chosenDay ? canRequestCorrection(chosenDay, today, closed) : false;

  return (
    <section className="uc01-admin-page hr-page hr-leave-page" aria-label="My Requests">
      <PageHeader
        eyebrow="HR"
        title="My Requests"
        description="Raise a leave request or an attendance correction, and see where each request stands."
      />

      <div className="hr-tabs" role="tablist" aria-label="My Requests sections">
        <button type="button" role="tab" id="req-tab-raise" aria-selected={tab === 'raise'} aria-controls="req-panel" className={`hr-tab${tab === 'raise' ? ' is-active' : ''}`} onClick={() => setTab('raise')}>
          Raise a request
        </button>
        <button type="button" role="tab" id="req-tab-mine" aria-selected={tab === 'mine'} aria-controls="req-panel" className={`hr-tab${tab === 'mine' ? ' is-active' : ''}`} onClick={() => setTab('mine')}>
          My requests{waiting > 0 ? ` (${waiting} waiting)` : ''}
        </button>
      </div>

      {notice && (
        <div className="uc01-admin-message uc01-admin-message--success" role="status">
          <span>{notice}</span>{' '}
          <button type="button" className="uc01-admin-button uc01-admin-button--compact" onClick={() => setNotice('')}>Dismiss</button>
        </div>
      )}

      <div id="req-panel" role="tabpanel" aria-labelledby={tab === 'raise' ? 'req-tab-raise' : 'req-tab-mine'}>
        {tab === 'raise' && (
          <SectionCard title="Raise a request">
            <fieldset className="hr-cal-form__choice hr-req-kind">
              <legend>What do you need?</legend>
              <label className={`hr-cal-radio${kind === 'LEAVE' ? ' is-checked' : ''}`}>
                <input type="radio" name="request-kind" checked={kind === 'LEAVE'} onChange={() => setKind('LEAVE')} />
                <span>Leave</span>
              </label>
              <label className={`hr-cal-radio${kind === 'ATTENDANCE' ? ' is-checked' : ''}`}>
                <input type="radio" name="request-kind" checked={kind === 'ATTENDANCE'} onChange={() => setKind('ATTENDANCE')} />
                <span>Attendance correction</span>
              </label>
            </fieldset>

            {kind === 'LEAVE' && (
              <>
                {balance.isError && (
                  <div className="uc01-admin-message uc01-admin-message--error" role="alert">
                    Your leave balance could not be loaded: {leaveErrorMessage(balance.error)}
                  </div>
                )}
                <ApplyLeaveForm
                  earning={earning.data}
                  available={availableByType(balance.data)}
                  busy={apply.isPending}
                  serverError={applyError}
                  onEdit={() => { if (applyError) setApplyError(''); }}
                  onSubmit={(payload) => { setNotice(''); setApplyError(''); apply.mutate(payload); }}
                />
              </>
            )}

            {kind === 'ATTENDANCE' && (
              <div className="hr-cal-form">
                <p className="hr-att-hint">
                  Pick a day of this month. A day you checked in can have its check-in time, check-out time or location corrected; an
                  absent day, a half day or a day without a check-out can be asked to count as a full or half day.
                </p>
                <label className="hr-cal-form__field">
                  <span>Day</span>
                  <input
                    type="date"
                    value={correctionDate}
                    min={`${month}-01`}
                    max={today}
                    onChange={(e) => setCorrectionDate(e.target.value)}
                  />
                </label>
                {calendar.isLoading && correctionDate && <div className="uc01-admin-state">Loading the day…</div>}
                {calendar.isError && (
                  <div className="uc01-admin-message uc01-admin-message--error" role="alert">{hrErrorMessage(calendar.error)}</div>
                )}
                {chosenDay && (
                  <p className="hr-att-hint">
                    {formatWorkDate(chosenDay.date)}: {dayLabel(chosenDay) || 'nothing recorded yet'}.
                    {!dayOk && ' This day cannot be corrected: it is a day off, already has a request waiting or approved, or is not yet over.'}
                  </p>
                )}
                <div className="hr-actions hr-actions--form">
                  <button
                    type="button"
                    className="uc01-admin-button uc01-admin-button--primary"
                    disabled={!chosenDay || !dayOk}
                    onClick={() => chosenDay && setCorrecting(correctionAskFor(chosenDay, today))}
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}
          </SectionCard>
        )}

        {tab === 'mine' && (
          <>
            <SectionCard title="Leave" description="Only a waiting request can be cancelled; to take back an approved one, ask HR.">
              {leaveRequests.isLoading && <div className="uc01-admin-state">Loading your leave requests…</div>}
              {leaveRequests.isError && (
                <div className="uc01-admin-state uc01-admin-state--error" role="alert">
                  <strong>Your leave requests could not be loaded.</strong>
                  <span>{leaveErrorMessage(leaveRequests.error)}</span>
                </div>
              )}
              {leaveRequests.data && (
                <LeaveRequestList
                  requests={leaveRequests.data.items}
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
            <SectionCard title="Attendance corrections" description="A waiting request can be withdrawn.">
              <MyCorrections />
            </SectionCard>
          </>
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

      {correcting && (
        <CorrectionDialog
          workDate={correcting.date}
          missesCheckOut={correcting.missesCheckOut}
          isToday={correcting.date === today}
          ask={correcting}
          onClose={() => setCorrecting(null)}
          onDone={(message) => { setCorrecting(null); setCorrectionDate(''); setNotice(message); setTab('mine'); }}
        />
      )}
    </section>
  );
}
