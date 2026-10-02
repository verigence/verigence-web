import { Capacitor } from '@capacitor/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { captureEvidencePhoto } from '../../services/device/camera';
import { getCurrentLocation } from '../../services/device/location';
import {
  applyLeave,
  decideTeamLeave,
  getAdminCapabilities,
  getLeaveBalances,
  getMyAttendance,
  getMyLeave,
  getMyPayslips,
  getMyProfile,
  getMyReimbursementClaims,
  getTeamAttendance,
  getTeamLeave,
  getTeamReimbursementClaims,
  recordAttendance,
  submitReimbursementClaim,
  EmployeeAttendanceHttpError,
  type LeaveRequest,
  type ReimbursementClaimLineInput,
} from '../../services/employee-attendance/client';
import { useProjectContextStore } from '../../store/projectContextStore';
import { useSessionStore } from '../../store/sessionStore';
import '../../styles/employee-services.css';

export type EmployeeSection = 'attendance' | 'leave' | 'reimbursements' | 'payslips';

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Employee Attendance is temporarily unavailable.';
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function money(value: string | number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value));
}

type ExpenseLineDraft = Omit<ReimbursementClaimLineInput, 'claimedAmount' | 'distanceKm'> & {
  key: string;
  claimedAmount: string;
  distanceKm: string;
};

function newExpenseLine(): ExpenseLineDraft {
  return {
    key: crypto.randomUUID(),
    expenseDate: today(),
    category: 'TRAVEL',
    claimedAmount: '',
    vendorName: '',
    description: '',
    travelFrom: '',
    travelTo: '',
    transportMode: 'CAB',
    distanceKm: '',
    ticketReference: '',
    mealType: 'LUNCH',
  };
}

export default function EmployeeServicesPage({ section }: { section: EmployeeSection }) {
  const token = useSessionStore((state) => state.accessToken);
  const sessionRole = useSessionStore((state) => state.role);
  const projectRole = useProjectContextStore((state) => state.selectedProject?.operatingRole);
  const role = projectRole ?? sessionRole;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const native = Capacitor.isNativePlatform();
  const canApproveTeamLeave = role === 'TL' || role === 'PM';

  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [leaveStart, setLeaveStart] = useState(today());
  const [leaveEnd, setLeaveEnd] = useState(today());
  const [leaveDayMode, setLeaveDayMode] = useState<'FULL_DAY' | 'HALF_DAY'>('FULL_DAY');
  const [leaveHalfDaySession, setLeaveHalfDaySession] = useState<'FIRST_HALF' | 'SECOND_HALF'>('FIRST_HALF');
  const [leaveReason, setLeaveReason] = useState('');
  const [attendanceExceptionAction, setAttendanceExceptionAction] = useState<'check-in' | 'check-out' | null>(null);
  const [attendanceExceptionReason, setAttendanceExceptionReason] = useState('');
  const [claimPurpose, setClaimPurpose] = useState('');
  const [expenseLines, setExpenseLines] = useState<ExpenseLineDraft[]>([newExpenseLine()]);
  const [notice, setNotice] = useState('');

  const profile = useQuery({
    queryKey: ['employee-attendance', 'profile'],
    queryFn: () => getMyProfile(token!),
    enabled: Boolean(token),
    retry: false,
  });
  const attendance = useQuery({
    queryKey: ['employee-attendance', 'attendance'],
    queryFn: () => getMyAttendance(token!),
    enabled: Boolean(token && profile.data),
    retry: false,
  });
  const balances = useQuery({
    queryKey: ['employee-attendance', 'leave-balances'],
    queryFn: () => getLeaveBalances(token!),
    enabled: Boolean(token && profile.data),
    retry: false,
  });
  const leave = useQuery({
    queryKey: ['employee-attendance', 'leave'],
    queryFn: () => getMyLeave(token!),
    enabled: Boolean(token && profile.data),
    retry: false,
  });
  const reimbursementClaims = useQuery({
    queryKey: ['employee-attendance', 'reimbursements'],
    queryFn: () => getMyReimbursementClaims(token!),
    enabled: Boolean(token && profile.data),
    retry: false,
  });
  const teamReimbursementClaims = useQuery({
    queryKey: ['employee-attendance', 'team-reimbursements'],
    queryFn: () => getTeamReimbursementClaims(token!),
    enabled: Boolean(token && role === 'PM'),
    retry: false,
  });
  const payslips = useQuery({
    queryKey: ['employee-attendance', 'payslips'],
    queryFn: () => getMyPayslips(token!),
    enabled: Boolean(token && profile.data),
    retry: false,
  });
  const teamAttendance = useQuery({
    queryKey: ['employee-attendance', 'team-attendance', today()],
    queryFn: () => getTeamAttendance(token!, today()),
    enabled: Boolean(token && canApproveTeamLeave),
    retry: false,
  });
  const approvals = useQuery({
    queryKey: ['employee-attendance', 'team-leave'],
    queryFn: () => getTeamLeave(token!),
    enabled: Boolean(token && canApproveTeamLeave),
    retry: false,
  });
  const capabilities = useQuery({
    queryKey: ['employee-attendance', 'admin-capabilities'],
    queryFn: () => getAdminCapabilities(token!),
    enabled: Boolean(token && !native),
    retry: false,
    staleTime: 60_000,
  });

  const hasAdministration = useMemo(() => {
    const value = capabilities.data;
    return Boolean(value && Object.values(value).some(Boolean));
  }, [capabilities.data]);

  const refreshEmployee = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['employee-attendance', 'attendance'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-attendance', 'leave'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-attendance', 'leave-balances'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-attendance', 'reimbursements'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-attendance', 'team-leave'] }),
    ]);
  };

  const attendanceMutation = useMutation({
    mutationFn: async (action: 'check-in' | 'check-out') => {
      if (!native) throw new Error('Check-in and check-out are available in the mobile app.');
      const [position, photo] = await Promise.all([
        getCurrentLocation(),
        captureEvidencePhoto(),
      ]);
      if (position.accuracy === null) throw new Error('Location accuracy is unavailable.');
      if (!photo.webPath) throw new Error('Live camera photo could not be read.');
      const photoResponse = await fetch(photo.webPath);
      const blob = await photoResponse.blob();
      return recordAttendance(token!, action, {
        latitude: position.latitude,
        longitude: position.longitude,
        accuracyMeters: position.accuracy,
        capturedAt: new Date().toISOString(),
        photo: blob,
        filename: `attendance.${photo.format || 'jpeg'}`,
        exceptionReason: attendanceExceptionAction === action
          ? attendanceExceptionReason.trim() || undefined
          : undefined,
      });
    },
    onSuccess: async (result, action) => {
      setNotice(
        result.hrReviewRequired
          ? `${action === 'check-in' ? 'Check-in' : 'Check-out'} recorded and sent to HR for review.`
          : action === 'check-in'
            ? 'Checked in successfully.'
            : 'Checked out successfully.',
      );
      setAttendanceExceptionAction(null);
      setAttendanceExceptionReason('');
      await refreshEmployee();
    },
    onError: (error, action) => {
      if (
        error instanceof EmployeeAttendanceHttpError
        && error.code === 'GEOFENCE_EXCEPTION_REASON_REQUIRED'
      ) {
        setAttendanceExceptionAction(action);
      }
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => {
      const selected = leaveTypeId || balances.data?.[0]?.leaveTypeId;
      if (!selected) throw new Error('Select a leave type.');
      return applyLeave(token!, {
        leaveTypeId: selected,
        startDate: leaveStart,
        endDate: leaveDayMode === 'HALF_DAY' ? leaveStart : leaveEnd,
        dayMode: leaveDayMode,
        halfDaySession: leaveDayMode === 'HALF_DAY' ? leaveHalfDaySession : undefined,
        reason: leaveReason.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setNotice('Leave request submitted for TL/PMO approval.');
      setLeaveReason('');
      await refreshEmployee();
    },
  });

  const reimbursementMutation = useMutation({
    mutationFn: () => {
      if (!claimPurpose.trim()) throw new Error('Enter the purpose of the claim.');
      const lines = expenseLines.map((line, index) => {
        const claimedAmount = Number(line.claimedAmount);
        if (!Number.isFinite(claimedAmount) || claimedAmount <= 0) {
          throw new Error(`Enter a valid amount for expense line ${index + 1}.`);
        }
        const distanceKm = line.distanceKm ? Number(line.distanceKm) : undefined;
        return {
          expenseDate: line.expenseDate,
          category: line.category,
          claimedAmount,
          vendorName: line.vendorName?.trim() || undefined,
          description: line.description?.trim() || undefined,
          receipt: line.receipt,
          travelFrom: line.travelFrom?.trim() || undefined,
          travelTo: line.travelTo?.trim() || undefined,
          transportMode: line.transportMode,
          distanceKm: Number.isFinite(distanceKm) ? distanceKm : undefined,
          ticketReference: line.ticketReference?.trim() || undefined,
          mealType: line.mealType,
        } satisfies ReimbursementClaimLineInput;
      });
      return submitReimbursementClaim(token!, {
        purpose: claimPurpose.trim(),
        lines,
      });
    },
    onSuccess: async (claim) => {
      setNotice(
        claim.financeApprovalRequired
          ? 'Claim submitted for HR review. Finance review will follow where required.'
          : 'Claim submitted for HR review.',
      );
      setClaimPurpose('');
      setExpenseLines([newExpenseLine()]);
      await refreshEmployee();
    },
  });

  const approvalMutation = useMutation({
    mutationFn: ({ item, decision }: { item: LeaveRequest; decision: 'APPROVE' | 'REJECT' }) =>
      decideTeamLeave(token!, item.leaveRequestId, decision),
    onSuccess: refreshEmployee,
  });

  const selectedLeaveBalance = balances.data?.find((item) => item.leaveTypeId === leaveTypeId)
    ?? balances.data?.[0];

  const latest = attendance.data?.[0];
  const todayRecord = latest?.attendanceDate === today() ? latest : undefined;
  const checkedIn = Boolean(todayRecord?.checkInAtUtc);
  const checkedOut = Boolean(todayRecord?.checkOutAtUtc);

  return (
    <section className="employee-services">
      <header className="employee-services__header">
        <div>
          <span className="employee-services__eyebrow">Employee Services</span>
          <h1>{section === 'attendance' ? 'Attendance' : section === 'leave' ? 'Leave' : section === 'reimbursements' ? 'Reimbursements' : 'Salary & Payslips'}</h1>
          <p>
            {profile.data
              ? `${profile.data.displayName} · ${profile.data.employeeCode}${profile.data.workLocationName ? ` · ${profile.data.workLocationName}` : ''}`
              : 'Attendance, leave, expenses and payslips operate independently from project work.'}
          </p>
        </div>
        {!native && hasAdministration && (
          <button
            type="button"
            className="employee-services__admin-link"
            onClick={() => navigate('/admin/employees')}
          >
            Administration
          </button>
        )}
      </header>

      {notice && <div className="employee-services__notice">{notice}</div>}
      {profile.error && (
        <div className="employee-services__error">
          {message(profile.error)}
          {hasAdministration ? ' You can still open Employee Administration.' : ''}
        </div>
      )}



      {section === 'attendance' && (
        <div className="employee-services__panel">
          <div className="employee-services__panel-head">
            <div>
              <h2>Today</h2>
              <p>
                {checkedOut
                  ? `Completed · ${formatDateTime(todayRecord?.checkOutAtUtc)}`
                  : checkedIn
                    ? `Checked in · ${formatDateTime(todayRecord?.checkInAtUtc)}`
                    : 'Not checked in'}
              </p>
            </div>
            <span className="employee-services__status">
              {checkedOut ? 'Completed' : checkedIn ? 'Working' : 'Not checked in'}
            </span>
          </div>

          {native ? (
            <div className="employee-services__actions">
              {!checkedIn && (
                <button
                  type="button"
                  disabled={attendanceMutation.isPending || !profile.data}
                  onClick={() => attendanceMutation.mutate('check-in')}
                >
                  {attendanceMutation.isPending ? 'Capturing…' : 'Check In'}
                </button>
              )}
              {checkedIn && !checkedOut && (
                <button
                  type="button"
                  disabled={attendanceMutation.isPending}
                  onClick={() => attendanceMutation.mutate('check-out')}
                >
                  {attendanceMutation.isPending ? 'Capturing…' : 'Check Out'}
                </button>
              )}
            </div>
          ) : (
            <div className="employee-services__hint">
              Check-in/out is performed from the mobile app using live camera + GPS.
            </div>
          )}
          {attendanceExceptionAction && (
            <div className="employee-attendance__exception">
              <strong>Different work location detected</strong>
              <p>Your attendance can still be recorded, but HR must review the exception. Explain why you are outside the assigned geofence.</p>
              <label>
                Reason for different location
                <textarea
                  value={attendanceExceptionReason}
                  maxLength={2000}
                  placeholder="e.g. Client visit, field audit, dealership visit…"
                  onChange={(event) => setAttendanceExceptionReason(event.target.value)}
                />
              </label>
              <div className="employee-services__actions">
                <button
                  type="button"
                  disabled={attendanceMutation.isPending || !attendanceExceptionReason.trim()}
                  onClick={() => attendanceMutation.mutate(attendanceExceptionAction)}
                >
                  {attendanceMutation.isPending ? 'Capturing…' : `Submit & ${attendanceExceptionAction === 'check-in' ? 'Check In' : 'Check Out'}`}
                </button>
                <button
                  type="button"
                  className="is-secondary"
                  onClick={() => {
                    setAttendanceExceptionAction(null);
                    setAttendanceExceptionReason('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {attendanceMutation.error && !attendanceExceptionAction && (
            <div className="employee-services__error">{message(attendanceMutation.error)}</div>
          )}

          {canApproveTeamLeave && (
            <>
              <h3>Team attendance</h3>
              <p>Today only. Employees explicitly assigned to you are shown.</p>
              <div className="employee-services__table-wrap">
                <table>
                  <thead><tr><th>Employee</th><th>Check in</th><th>Check out</th><th>Status</th><th>HR Review</th></tr></thead>
                  <tbody>
                    {(teamAttendance.data ?? []).map((row) => (
                      <tr key={row.employeeId}>
                        <td>{row.employeeName}</td>
                        <td>{formatDateTime(row.checkInAtUtc)}</td>
                        <td>{formatDateTime(row.checkOutAtUtc)}</td>
                        <td>{row.status.replaceAll('_', ' ')}</td>
                        <td>{row.hrReviewStatus.replaceAll('_', ' ')}</td>
                      </tr>
                    ))}
                    {!teamAttendance.data?.length && <tr><td colSpan={5}>No assigned employees.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h3>Recent attendance</h3>
          <div className="employee-services__table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Check in</th><th>Check out</th><th>Status</th><th>HR Review</th></tr>
              </thead>
              <tbody>
                {(attendance.data ?? []).map((row) => (
                  <tr key={row.attendanceDate}>
                    <td>{row.attendanceDate}</td>
                    <td>{formatDateTime(row.checkInAtUtc)}</td>
                    <td>{formatDateTime(row.checkOutAtUtc)}</td>
                    <td>{row.status.replaceAll('_', ' ')}</td>
                    <td>{row.hrReviewStatus.replaceAll('_', ' ')}</td>
                  </tr>
                ))}
                {!attendance.data?.length && <tr><td colSpan={5}>No attendance recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === 'leave' && (
        <div className="employee-services__panel employee-leave">
          <div className="employee-services__panel-head">
            <div>
              <h2>Apply leave</h2>
              <p>Working days are calculated by the system using weekly offs and configured holidays.</p>
            </div>
            {selectedLeaveBalance && (
              <span className="employee-services__status">
                {selectedLeaveBalance.availableDays} days available
              </span>
            )}
          </div>

          <div className="employee-services__form-grid">
            <label>
              Leave type
              <select
                value={leaveTypeId}
                onChange={(event) => {
                  setLeaveTypeId(event.target.value);
                  const balance = balances.data?.find((item) => item.leaveTypeId === event.target.value);
                  if (balance && !balance.allowHalfDay) setLeaveDayMode('FULL_DAY');
                }}
              >
                <option value="">Select leave</option>
                {(balances.data ?? []).map((item) => (
                  <option key={item.leaveTypeId} value={item.leaveTypeId}>
                    {item.leaveName} · {item.availableDays} available
                  </option>
                ))}
              </select>
            </label>

            <label>
              Duration
              <select
                value={leaveDayMode}
                onChange={(event) => setLeaveDayMode(event.target.value as 'FULL_DAY' | 'HALF_DAY')}
              >
                <option value="FULL_DAY">Full day(s)</option>
                {selectedLeaveBalance?.allowHalfDay && <option value="HALF_DAY">Half day</option>}
              </select>
            </label>

            <label>
              From
              <input
                type="date"
                value={leaveStart}
                onChange={(event) => {
                  setLeaveStart(event.target.value);
                  if (leaveDayMode === 'HALF_DAY') setLeaveEnd(event.target.value);
                }}
              />
            </label>

            {leaveDayMode === 'FULL_DAY' ? (
              <label>
                To
                <input
                  type="date"
                  min={leaveStart}
                  value={leaveEnd}
                  onChange={(event) => setLeaveEnd(event.target.value)}
                />
              </label>
            ) : (
              <label>
                Half-day session
                <select value={leaveHalfDaySession} onChange={(event) => setLeaveHalfDaySession(event.target.value as 'FIRST_HALF' | 'SECOND_HALF')}>
                  <option value="FIRST_HALF">First half</option>
                  <option value="SECOND_HALF">Second half</option>
                </select>
              </label>
            )}

            <label className="employee-services__span">
              Reason
              <textarea
                value={leaveReason}
                maxLength={2000}
                placeholder="Reason for leave"
                onChange={(event) => setLeaveReason(event.target.value)}
              />
            </label>
          </div>

          <div className="employee-services__hint">
            Final leave days are calculated after excluding configured weekly offs and holidays.
          </div>

          <div className="employee-services__actions">
            <button type="button" disabled={leaveMutation.isPending || !profile.data} onClick={() => leaveMutation.mutate()}>
              {leaveMutation.isPending ? 'Submitting…' : 'Submit Leave Request'}
            </button>
          </div>
          {leaveMutation.error && <div className="employee-services__error">{message(leaveMutation.error)}</div>}

          {canApproveTeamLeave && (
            <>
              <h3>Pending approvals</h3>
              <div className="employee-services__approval-list">
                {(approvals.data ?? []).map((item) => (
                  <article key={item.leaveRequestId}>
                    <div>
                      <strong>{item.employeeName}</strong>
                      <span>
                        {item.leaveTypeName} · {item.startDate}
                        {item.endDate !== item.startDate ? ` → ${item.endDate}` : ''}
                        {' · '}{item.calculatedDays} day(s)
                      </span>
                      {item.reason && <small>{item.reason}</small>}
                    </div>
                    <div>
                      <button type="button" disabled={approvalMutation.isPending} onClick={() => approvalMutation.mutate({ item, decision: 'APPROVE' })}>Approve</button>
                      <button type="button" className="is-secondary" disabled={approvalMutation.isPending} onClick={() => approvalMutation.mutate({ item, decision: 'REJECT' })}>Reject</button>
                    </div>
                  </article>
                ))}
                {!approvals.data?.length && <p>No leave requests are waiting for your approval.</p>}
              </div>
            </>
          )}

          <h3>My requests</h3>
          <div className="employee-leave__request-list">
            {(leave.data ?? []).map((item) => (
              <article className="employee-leave__request" key={item.leaveRequestId}>
                <div>
                  <strong>{item.leaveTypeName}</strong>
                  <span>
                    {item.startDate}{item.endDate !== item.startDate ? ` → ${item.endDate}` : ''}
                    {' · '}{item.dayMode === 'HALF_DAY' ? item.halfDaySession?.replaceAll('_', ' ') : `${item.calculatedDays} day(s)`}
                  </span>
                  {item.reason && <small>{item.reason}</small>}
                </div>
                <div>
                  <strong>{item.approvalOutcome?.replaceAll('_', ' ') ?? item.status.replaceAll('_', ' ')}</strong>
                  <span>
                    {item.approvedDays != null
                      ? `${item.approvedDays} approved`
                      : `${item.calculatedDays} requested`}
                  </span>
                </div>
              </article>
            ))}
            {!leave.data?.length && <p>No leave requests yet.</p>}
          </div>
        </div>
      )}

      {section === 'reimbursements' && (
        <div className="employee-services__panel employee-expense">
          <div className="employee-services__panel-head">
            <div>
              <h2>Create expense claim</h2>
              <p>Add each expense separately. Receipts, travel details and review decisions remain attached to the individual line.</p>
            </div>
            <span className="employee-services__status">
              {expenseLines.length} line{expenseLines.length === 1 ? '' : 's'} · {money(expenseLines.reduce((sum, line) => sum + (Number(line.claimedAmount) || 0), 0))}
            </span>
          </div>

          <div className="employee-services__form-grid">
            <label className="employee-services__span">
              Claim purpose
              <input
                value={claimPurpose}
                maxLength={240}
                placeholder="e.g. Client visit – Bhubaneswar"
                onChange={(event) => setClaimPurpose(event.target.value)}
              />
            </label>
          </div>

          <div className="employee-expense__lines">
            {expenseLines.map((line, index) => (
              <article className="employee-expense__line" key={line.key}>
                <div className="employee-expense__line-head">
                  <div>
                    <span className="employee-services__eyebrow">Expense line {index + 1}</span>
                    <strong>{line.category.replaceAll('_', ' ')}</strong>
                  </div>
                  {expenseLines.length > 1 && (
                    <button
                      type="button"
                      className="employee-admin-button"
                      onClick={() => setExpenseLines((items) => items.filter((item) => item.key !== line.key))}
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="employee-services__form-grid">
                  <label>
                    Expense date
                    <input
                      type="date"
                      value={line.expenseDate}
                      onChange={(event) => setExpenseLines((items) => items.map((item) => item.key === line.key ? { ...item, expenseDate: event.target.value } : item))}
                    />
                  </label>
                  <label>
                    Category
                    <select
                      value={line.category}
                      onChange={(event) => setExpenseLines((items) => items.map((item) => item.key === line.key ? { ...item, category: event.target.value as ExpenseLineDraft['category'] } : item))}
                    >
                      <option value="TRAVEL">Travel</option>
                      <option value="LOCAL_CONVEYANCE">Local conveyance</option>
                      <option value="FOOD">Food</option>
                      <option value="LODGING">Lodging</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </label>
                  <label>
                    Claimed amount (₹)
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={line.claimedAmount}
                      onChange={(event) => setExpenseLines((items) => items.map((item) => item.key === line.key ? { ...item, claimedAmount: event.target.value } : item))}
                    />
                  </label>
                  <label>
                    Vendor / merchant
                    <input
                      value={line.vendorName ?? ''}
                      onChange={(event) => setExpenseLines((items) => items.map((item) => item.key === line.key ? { ...item, vendorName: event.target.value } : item))}
                    />
                  </label>

                  {(line.category === 'TRAVEL' || line.category === 'LOCAL_CONVEYANCE') && (
                    <>
                      <label>
                        From
                        <input value={line.travelFrom ?? ''} onChange={(event) => setExpenseLines((items) => items.map((item) => item.key === line.key ? { ...item, travelFrom: event.target.value } : item))} />
                      </label>
                      <label>
                        To
                        <input value={line.travelTo ?? ''} onChange={(event) => setExpenseLines((items) => items.map((item) => item.key === line.key ? { ...item, travelTo: event.target.value } : item))} />
                      </label>
                      <label>
                        Mode of transport
                        <select value={line.transportMode ?? 'CAB'} onChange={(event) => setExpenseLines((items) => items.map((item) => item.key === line.key ? { ...item, transportMode: event.target.value as ExpenseLineDraft['transportMode'] } : item))}>
                          <option value="AIR">Air</option>
                          <option value="RAIL">Rail</option>
                          <option value="CAB">Cab / Taxi</option>
                          <option value="AUTO">Auto</option>
                          <option value="BUS">Bus</option>
                          <option value="METRO">Metro</option>
                          <option value="PERSONAL_CAR">Personal car</option>
                          <option value="PERSONAL_BIKE">Personal bike</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </label>
                      <label>
                        Distance (km)
                        <input type="number" min="0" step="0.1" value={line.distanceKm} onChange={(event) => setExpenseLines((items) => items.map((item) => item.key === line.key ? { ...item, distanceKm: event.target.value } : item))} />
                      </label>
                      <label>
                        Ticket / booking reference
                        <input value={line.ticketReference ?? ''} onChange={(event) => setExpenseLines((items) => items.map((item) => item.key === line.key ? { ...item, ticketReference: event.target.value } : item))} />
                      </label>
                    </>
                  )}

                  {line.category === 'FOOD' && (
                    <label>
                      Meal type
                      <select value={line.mealType ?? 'LUNCH'} onChange={(event) => setExpenseLines((items) => items.map((item) => item.key === line.key ? { ...item, mealType: event.target.value as ExpenseLineDraft['mealType'] } : item))}>
                        <option value="BREAKFAST">Breakfast</option>
                        <option value="LUNCH">Lunch</option>
                        <option value="DINNER">Dinner</option>
                        <option value="SNACKS">Snacks</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </label>
                  )}

                  <label>
                    Receipt
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(event) => setExpenseLines((items) => items.map((item) => item.key === line.key ? { ...item, receipt: event.target.files?.[0] } : item))}
                    />
                  </label>
                  <label className="employee-services__span">
                    Description / business justification
                    <textarea value={line.description ?? ''} onChange={(event) => setExpenseLines((items) => items.map((item) => item.key === line.key ? { ...item, description: event.target.value } : item))} />
                  </label>
                </div>
              </article>
            ))}
          </div>

          <div className="employee-services__actions">
            <button type="button" className="is-secondary" onClick={() => setExpenseLines((items) => [...items, newExpenseLine()])}>+ Add Expense Line</button>
            <button type="button" disabled={reimbursementMutation.isPending || !profile.data} onClick={() => reimbursementMutation.mutate()}>
              {reimbursementMutation.isPending ? 'Submitting…' : 'Submit Claim'}
            </button>
          </div>
          {reimbursementMutation.error && <div className="employee-services__error">{message(reimbursementMutation.error)}</div>}

          {role === 'PM' && (
            <>
              <h3>Team expense claims</h3>
              <p>Read-only visibility for employees assigned to you.</p>
              <div className="employee-expense__claim-list">
                {(teamReimbursementClaims.data ?? []).map((claim) => (
                  <article className="employee-expense__claim" key={claim.claimId}>
                    <div className="employee-expense__claim-head">
                      <div><strong>{claim.employeeName} · {claim.claimNumber}</strong><span>{claim.purpose}</span></div>
                      <div><strong>{money(claim.claimedTotal)}</strong><span>{claim.approvalOutcome?.replaceAll('_', ' ') ?? claim.status.replaceAll('_', ' ')}</span></div>
                    </div>
                    <small>{claim.lines.length} expense line{claim.lines.length === 1 ? '' : 's'} · Payment: {claim.paymentStatus?.replaceAll('_', ' ') ?? '—'}</small>
                  </article>
                ))}
                {!teamReimbursementClaims.data?.length && <p>No team expense claims.</p>}
              </div>
            </>
          )}

          <h3>My expense claims</h3>
          <div className="employee-expense__claim-list">
            {(reimbursementClaims.data ?? []).map((claim) => (
              <article className="employee-expense__claim" key={claim.claimId}>
                <div className="employee-expense__claim-head">
                  <div>
                    <strong>{claim.claimNumber}</strong>
                    <span>{claim.purpose} · {new Date(claim.submittedAtUtc).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <strong>{money(claim.claimedTotal)}</strong>
                    <span>{claim.approvalOutcome?.replaceAll('_', ' ') ?? claim.status.replaceAll('_', ' ')}</span>
                  </div>
                </div>
                <div className="employee-admin-summary employee-expense__summary">
                  <div><strong>{money(claim.claimedTotal)}</strong><span>Claimed</span></div>
                  <div><strong>{claim.approvedTotal != null ? money(claim.approvedTotal) : '—'}</strong><span>Approved</span></div>
                  <div><strong>{money(claim.adjustedTotal)}</strong><span>Adjusted / Rejected</span></div>
                  <div><strong>{claim.paymentStatus?.replaceAll('_', ' ') ?? '—'}</strong><span>Payment</span></div>
                </div>
                <div className="employee-expense__line-list">
                  {claim.lines.map((item) => (
                    <div className="employee-expense__history-line" key={item.reimbursementItemId}>
                      <div>
                        <strong>#{item.lineNumber} · {item.category.replaceAll('_', ' ')}</strong>
                        <span>{item.expenseDate}{item.vendorName ? ` · ${item.vendorName}` : ''}</span>
                        {(item.travelFrom || item.travelTo) && <small>{item.travelFrom ?? '—'} → {item.travelTo ?? '—'}{item.transportMode ? ` · ${item.transportMode.replaceAll('_', ' ')}` : ''}</small>}
                      </div>
                      <div>
                        <strong>{money(item.claimedAmount)}</strong>
                        <span>{item.approvedAmount != null ? `Approved ${money(item.approvedAmount)}` : item.lineStatus.replaceAll('_', ' ')}</span>
                        {item.receiptUrl && <a href={item.receiptUrl} target="_blank" rel="noreferrer">Receipt</a>}
                      </div>
                      {item.reviews.length > 0 && (
                        <div className="employee-expense__reviews">
                          {item.reviews.map((review) => (
                            <small key={`${review.stage}-${review.decidedAtUtc}`}>
                              {review.stage}: {review.decision} · {money(review.approvedAmount)}{review.comment ? ` · ${review.comment}` : ''}
                            </small>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {claim.paymentStatus === 'PROCESSED' && (
                  <div className="employee-services__notice">
                    Payment processed {formatDateTime(claim.paidAtUtc)} · {claim.paidAmount != null ? money(claim.paidAmount) : '—'} · {claim.paymentReference ?? 'No reference'}
                  </div>
                )}
              </article>
            ))}
            {!reimbursementClaims.data?.length && <p>No expense claims yet.</p>}
          </div>
        </div>
      )}

      {section === 'payslips' && (
        <div className="employee-services__panel">
          <h2>Salary & Payslips</h2>
          <div className="employee-services__table-wrap">
            <table>
              <thead><tr><th>Month</th><th>Net salary</th><th>Payslip</th></tr></thead>
              <tbody>
                {(payslips.data ?? []).map((item) => (
                  <tr key={item.payslipId}>
                    <td>{new Date(item.payrollMonth).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</td>
                    <td>{money(item.netAmount)}</td>
                    <td><a href={item.downloadUrl} target="_blank" rel="noreferrer">Download PDF</a></td>
                  </tr>
                ))}
                {!payslips.data?.length && <tr><td colSpan={3}>No finalized payslips yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === 'leave' && canApproveTeamLeave && (
        <div className="employee-services__panel">
          <h2>Pending leave approvals</h2>
          <p>Only employees explicitly assigned to you are shown here.</p>
          <div className="employee-services__approval-list">
            {(approvals.data ?? []).map((item) => (
              <article key={item.leaveRequestId}>
                <div>
                  <strong>{item.employeeName}</strong>
                  <span>{item.leaveTypeName} · {item.startDate} → {item.endDate} · {item.requestedDays} day(s)</span>
                  {item.reason && <small>{item.reason}</small>}
                </div>
                <div>
                  <button type="button" disabled={approvalMutation.isPending} onClick={() => approvalMutation.mutate({ item, decision: 'APPROVE' })}>Approve</button>
                  <button type="button" className="is-secondary" disabled={approvalMutation.isPending} onClick={() => approvalMutation.mutate({ item, decision: 'REJECT' })}>Reject</button>
                </div>
              </article>
            ))}
            {!approvals.data?.length && <p>No leave requests are waiting for your approval.</p>}
          </div>
          {approvalMutation.error && <div className="employee-services__error">{message(approvalMutation.error)}</div>}
        </div>
      )}
    </section>
  );
}
