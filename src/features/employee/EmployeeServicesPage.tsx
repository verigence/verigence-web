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
  getMyReimbursements,
  getTeamLeave,
  getTeamReimbursements,
  recordAttendance,
  submitReimbursement,
  type LeaveRequest,
} from '../../services/employee-attendance/client';
import { useProjectContextStore } from '../../store/projectContextStore';
import { useSessionStore } from '../../store/sessionStore';
import '../../styles/employee-services.css';

type Tab = 'attendance' | 'leave' | 'reimbursements' | 'payslips' | 'approvals';

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

export default function EmployeeServicesPage() {
  const token = useSessionStore((state) => state.accessToken);
  const sessionRole = useSessionStore((state) => state.role);
  const projectRole = useProjectContextStore((state) => state.selectedProject?.operatingRole);
  const role = projectRole ?? sessionRole;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const native = Capacitor.isNativePlatform();
  const canApproveTeamLeave = role === 'TL' || role === 'PM';

  const [tab, setTab] = useState<Tab>('attendance');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [leaveStart, setLeaveStart] = useState(today());
  const [leaveEnd, setLeaveEnd] = useState(today());
  const [leaveDays, setLeaveDays] = useState(1);
  const [leaveReason, setLeaveReason] = useState('');
  const [expenseDate, setExpenseDate] = useState(today());
  const [expenseCategory, setExpenseCategory] = useState('TRAVEL');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
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
  const reimbursements = useQuery({
    queryKey: ['employee-attendance', 'reimbursements'],
    queryFn: () => getMyReimbursements(token!),
    enabled: Boolean(token && profile.data),
    retry: false,
  });
  const teamReimbursements = useQuery({
    queryKey: ['employee-attendance', 'team-reimbursements'],
    queryFn: () => getTeamReimbursements(token!),
    enabled: Boolean(token && role === 'PM'),
    retry: false,
  });
  const payslips = useQuery({
    queryKey: ['employee-attendance', 'payslips'],
    queryFn: () => getMyPayslips(token!),
    enabled: Boolean(token && profile.data),
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
      });
    },
    onSuccess: async (_, action) => {
      setNotice(action === 'check-in' ? 'Checked in successfully.' : 'Checked out successfully.');
      await refreshEmployee();
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => {
      const selected = leaveTypeId || balances.data?.[0]?.leaveTypeId;
      if (!selected) throw new Error('Select a leave type.');
      return applyLeave(token!, {
        leaveTypeId: selected,
        startDate: leaveStart,
        endDate: leaveEnd,
        requestedDays: leaveDays,
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
      const amount = Number(expenseAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid amount.');
      return submitReimbursement(token!, {
        expenseDate,
        category: expenseCategory,
        amount,
        description: expenseDescription.trim() || undefined,
        receipt: receipt ?? undefined,
        filename: receipt?.name,
      });
    },
    onSuccess: async (claim) => {
      setNotice(
        claim.financeApprovalRequired
          ? 'Claim submitted. HR approval followed by Finance approval is required.'
          : 'Claim submitted for HR approval.',
      );
      setExpenseAmount('');
      setExpenseDescription('');
      setReceipt(null);
      await refreshEmployee();
    },
  });

  const approvalMutation = useMutation({
    mutationFn: ({ item, decision }: { item: LeaveRequest; decision: 'APPROVE' | 'REJECT' }) =>
      decideTeamLeave(token!, item.leaveRequestId, decision),
    onSuccess: refreshEmployee,
  });

  const latest = attendance.data?.[0];
  const todayRecord = latest?.attendanceDate === today() ? latest : undefined;
  const checkedIn = Boolean(todayRecord?.checkInAtUtc);
  const checkedOut = Boolean(todayRecord?.checkOutAtUtc);

  const tabs: Array<{ key: Tab; label: string; visible: boolean }> = [
    { key: 'attendance', label: 'Attendance', visible: true },
    { key: 'leave', label: 'Leave', visible: true },
    { key: 'reimbursements', label: 'Reimbursements', visible: true },
    { key: 'payslips', label: 'Salary & Payslips', visible: true },
    { key: 'approvals', label: 'Pending Approvals', visible: canApproveTeamLeave },
  ];

  return (
    <section className="employee-services">
      <header className="employee-services__header">
        <div>
          <span className="employee-services__eyebrow">Employee Services</span>
          <h1>{tabs.find((item) => item.key === tab)?.label ?? 'Attendance'}</h1>
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

      <nav className="employee-services__tabs" aria-label="Employee services">
        {tabs.filter((item) => item.visible).map((item) => (
          <button
            key={item.key}
            type="button"
            className={tab === item.key ? 'is-active' : ''}
            onClick={() => setTab(item.key)}
          >
            {item.label}
            {item.key === 'approvals' && approvals.data?.length ? (
              <span className="employee-services__badge">{approvals.data.length}</span>
            ) : null}
          </button>
        ))}
      </nav>

      {tab === 'attendance' && (
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
          {attendanceMutation.error && (
            <div className="employee-services__error">{message(attendanceMutation.error)}</div>
          )}

          <h3>Recent attendance</h3>
          <div className="employee-services__table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Check in</th><th>Check out</th><th>Status</th></tr>
              </thead>
              <tbody>
                {(attendance.data ?? []).map((row) => (
                  <tr key={row.attendanceDate}>
                    <td>{row.attendanceDate}</td>
                    <td>{formatDateTime(row.checkInAtUtc)}</td>
                    <td>{formatDateTime(row.checkOutAtUtc)}</td>
                    <td>{row.status.replaceAll('_', ' ')}</td>
                  </tr>
                ))}
                {!attendance.data?.length && <tr><td colSpan={4}>No attendance recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'leave' && (
        <div className="employee-services__panel">
          <h2>Apply leave</h2>
          <div className="employee-services__form-grid">
            <label>
              Leave type
              <select value={leaveTypeId} onChange={(event) => setLeaveTypeId(event.target.value)}>
                <option value="">Select leave</option>
                {(balances.data ?? []).map((item) => (
                  <option key={item.leaveTypeId} value={item.leaveTypeId}>
                    {item.leaveName} · {item.availableDays} available
                  </option>
                ))}
              </select>
            </label>
            <label>From<input type="date" value={leaveStart} onChange={(event) => setLeaveStart(event.target.value)} /></label>
            <label>To<input type="date" value={leaveEnd} onChange={(event) => setLeaveEnd(event.target.value)} /></label>
            <label>Days<input type="number" min="0.5" step="0.5" value={leaveDays} onChange={(event) => setLeaveDays(Number(event.target.value))} /></label>
            <label className="employee-services__span">Reason<textarea value={leaveReason} onChange={(event) => setLeaveReason(event.target.value)} /></label>
          </div>
          <div className="employee-services__actions">
            <button type="button" disabled={leaveMutation.isPending || !profile.data} onClick={() => leaveMutation.mutate()}>
              {leaveMutation.isPending ? 'Submitting…' : 'Submit Leave'}
            </button>
          </div>
          {leaveMutation.error && <div className="employee-services__error">{message(leaveMutation.error)}</div>}

          <h3>My requests</h3>
          <div className="employee-services__table-wrap">
            <table>
              <thead><tr><th>Leave</th><th>Dates</th><th>Days</th><th>Status</th></tr></thead>
              <tbody>
                {(leave.data ?? []).map((item) => (
                  <tr key={item.leaveRequestId}>
                    <td>{item.leaveTypeName}</td>
                    <td>{item.startDate} → {item.endDate}</td>
                    <td>{item.requestedDays}</td>
                    <td>{item.status.replaceAll('_', ' ')}</td>
                  </tr>
                ))}
                {!leave.data?.length && <tr><td colSpan={4}>No leave requests yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'reimbursements' && (
        <div className="employee-services__panel">
          <h2>New reimbursement</h2>
          <div className="employee-services__form-grid">
            <label>Date<input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} /></label>
            <label>
              Category
              <select value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)}>
                <option value="TRAVEL">Travel</option>
                <option value="FOOD">Food</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label>Amount (₹)<input type="number" min="0.01" step="0.01" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} /></label>
            <label>Receipt<input type="file" accept="image/*,application/pdf" onChange={(event) => setReceipt(event.target.files?.[0] ?? null)} /></label>
            <label className="employee-services__span">Description<textarea value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} /></label>
          </div>
          <div className="employee-services__actions">
            <button type="button" disabled={reimbursementMutation.isPending || !profile.data} onClick={() => reimbursementMutation.mutate()}>
              {reimbursementMutation.isPending ? 'Submitting…' : 'Submit Claim'}
            </button>
          </div>
          {reimbursementMutation.error && <div className="employee-services__error">{message(reimbursementMutation.error)}</div>}

          {role === 'PM' && (
            <>
              <h3>Team reimbursements</h3>
              <p>Read-only view for employees assigned to you. Approval remains with HR/Finance.</p>
              <div className="employee-services__table-wrap">
                <table>
                  <thead><tr><th>Employee</th><th>Date</th><th>Category</th><th>Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    {(teamReimbursements.data ?? []).map((item) => (
                      <tr key={item.claimId}>
                        <td>{item.employeeName}</td>
                        <td>{item.expenseDate}</td>
                        <td>{item.category}</td>
                        <td>{money(item.amount)}</td>
                        <td>{item.status.replaceAll('_', ' ')}</td>
                      </tr>
                    ))}
                    {!teamReimbursements.data?.length && <tr><td colSpan={5}>No team reimbursement claims.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h3>My claims</h3>
          <div className="employee-services__table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {(reimbursements.data ?? []).map((item) => (
                  <tr key={item.claimId}>
                    <td>{item.expenseDate}</td>
                    <td>{item.category}</td>
                    <td>{money(item.amount)}</td>
                    <td>{item.status.replaceAll('_', ' ')}</td>
                  </tr>
                ))}
                {!reimbursements.data?.length && <tr><td colSpan={4}>No reimbursement claims yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'payslips' && (
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

      {tab === 'approvals' && canApproveTeamLeave && (
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
