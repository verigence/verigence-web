import { Capacitor } from '@capacitor/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  applyEmployeeImport,
  calculatePayroll,
  createHoliday,
  createLeaveType,
  createWorkLocation,
  decideHrAttendanceReview,
  decideHrLeave,
  downloadAttendanceReport,
  downloadEmployeeTemplate,
  downloadPayrollReport,
  finalizePayroll,
  getAdminCapabilities,
  getHolidays,
  getHrAttendanceReviewQueue,
  getHrLeaveQueue,
  getLeaveTypes,
  getModuleConfig,
  getPayrollItems,
  getReimbursementClaimQueue,
  getReimbursementPaymentQueue,
  getWorkLocations,
  listAdminEmployees,
  previewEmployeeImport,
  reviewReimbursementClaim,
  updateModuleConfig,
  updateReimbursementPayment,
  type BulkImport,
  type LeaveRequest,
  type PayrollSummary,
  type ReimbursementClaim,
} from '../../services/employee-attendance/client';
import { useSessionStore } from '../../store/sessionStore';
import '../../styles/employee-services.css';

type Section = 'employees' | 'attendance' | 'leave' | 'reimbursements' | 'payroll' | 'reports' | 'config';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Employee Administration is temporarily unavailable.';
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function monthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function weekStart(): string {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function money(value: string | number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value));
}

type ExpenseReviewDraft = {
  decision: 'APPROVE' | 'ADJUST' | 'REJECT';
  approvedAmount: string;
  comment: string;
};

export default function EmployeeAdministrationPage() {
  const native = Capacitor.isNativePlatform();
  const token = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [section, setSection] = useState<Section>('employees');
  const [importPlan, setImportPlan] = useState<BulkImport | null>(null);
  const [attendanceReviewDrafts, setAttendanceReviewDrafts] = useState<Record<string, {
    decision: 'APPROVE' | 'ADJUST' | 'REJECT';
    presentFraction: string;
    comment: string;
  }>>({});
  const [leaveReviewDrafts, setLeaveReviewDrafts] = useState<Record<string, {
    decision: 'APPROVE' | 'ADJUST' | 'REJECT';
    approvedDays: string;
    comment: string;
  }>>({});
  const [reimbursementStage, setReimbursementStage] = useState<'HR' | 'FINANCE'>('HR');
  const [expenseReviewDrafts, setExpenseReviewDrafts] = useState<Record<string, Record<string, ExpenseReviewDraft>>>({});
  const [reimbursementView, setReimbursementView] = useState<'APPROVALS' | 'PAYMENTS'>('APPROVALS');
  const [paymentQueueStatus, setPaymentQueueStatus] = useState<'PENDING_PAYMENT' | 'PROCESSED'>('PENDING_PAYMENT');
  const [paymentClaimId, setPaymentClaimId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('BANK_TRANSFER');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentPaidAt, setPaymentPaidAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [paymentComment, setPaymentComment] = useState('');
  const [payrollMonth, setPayrollMonth] = useState(monthStart());
  const [payroll, setPayroll] = useState<PayrollSummary | null>(null);
  const [reportStart, setReportStart] = useState(weekStart());
  const [reportEnd, setReportEnd] = useState(today());
  const [threshold, setThreshold] = useState('3000');
  const [workingDays, setWorkingDays] = useState('6');
  const [weeklyOffs, setWeeklyOffs] = useState('7');
  const [locationCode, setLocationCode] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [locationLat, setLocationLat] = useState('');
  const [locationLng, setLocationLng] = useState('');
  const [locationRadius, setLocationRadius] = useState('500');
  const [leaveCode, setLeaveCode] = useState('');
  const [leaveName, setLeaveName] = useState('');
  const [leaveEntitlement, setLeaveEntitlement] = useState('0');
  const [leavePaid, setLeavePaid] = useState(true);
  const [leaveHalfDay, setLeaveHalfDay] = useState(true);
  const [leaveMinNoticeDays, setLeaveMinNoticeDays] = useState('0');
  const [leaveMaxConsecutiveDays, setLeaveMaxConsecutiveDays] = useState('');
  const [leaveRequiresReason, setLeaveRequiresReason] = useState(true);
  const [leaveAllowNegativeBalance, setLeaveAllowNegativeBalance] = useState(false);
  const [holidayDate, setHolidayDate] = useState(today());
  const [holidayName, setHolidayName] = useState('');

  const capabilities = useQuery({
    queryKey: ['employee-attendance', 'admin-capabilities'],
    queryFn: () => getAdminCapabilities(token!),
    enabled: Boolean(token && !native),
    retry: false,
  });

  const visibleSections = useMemo(() => {
    const value = capabilities.data;
    if (!value) return [] as Section[];
    const items: Section[] = [];
    if (value.employeeManage) items.push('employees');
    if (value.attendanceReview) items.push('attendance');
    if (value.leaveHrApprove) items.push('leave');
    if (value.reimbursementHrApprove || value.reimbursementFinanceApprove || value.reimbursementPaymentManage) items.push('reimbursements');
    if (value.payrollManage) items.push('payroll');
    if (value.reportRead) items.push('reports');
    if (value.configManage) items.push('config');
    return items;
  }, [capabilities.data]);

  useEffect(() => {
    if (visibleSections.length && !visibleSections.includes(section)) setSection(visibleSections[0]);
  }, [section, visibleSections]);

  useEffect(() => {
    if (!capabilities.data?.reimbursementHrApprove && capabilities.data?.reimbursementFinanceApprove) {
      setReimbursementStage('FINANCE');
    }
  }, [capabilities.data]);

  const employees = useQuery({
    queryKey: ['employee-attendance', 'admin-employees'],
    queryFn: () => listAdminEmployees(token!),
    enabled: Boolean(token && capabilities.data?.employeeManage),
    retry: false,
  });

  const hrAttendance = useQuery({
    queryKey: ['employee-attendance', 'admin-attendance-review'],
    queryFn: () => getHrAttendanceReviewQueue(token!),
    enabled: Boolean(token && capabilities.data?.attendanceReview),
    retry: false,
  });

  const hrLeave = useQuery({
    queryKey: ['employee-attendance', 'admin-leave'],
    queryFn: () => getHrLeaveQueue(token!),
    enabled: Boolean(token && capabilities.data?.leaveHrApprove),
    retry: false,
  });

  const reimbursementClaimQueue = useQuery({
    queryKey: ['employee-attendance', 'admin-reimbursement-claims', reimbursementStage],
    queryFn: () => getReimbursementClaimQueue(token!, reimbursementStage),
    enabled: Boolean(
      token
      && (
        reimbursementStage === 'HR'
          ? capabilities.data?.reimbursementHrApprove
          : capabilities.data?.reimbursementFinanceApprove
      )
    ),
    retry: false,
  });

  const reimbursementPayments = useQuery({
    queryKey: ['employee-attendance', 'admin-reimbursement-payments', paymentQueueStatus],
    queryFn: () => getReimbursementPaymentQueue(token!, paymentQueueStatus),
    enabled: Boolean(token && capabilities.data?.reimbursementPaymentManage && reimbursementView === 'PAYMENTS'),
    retry: false,
  });

  const config = useQuery({
    queryKey: ['employee-attendance', 'admin-config'],
    queryFn: () => getModuleConfig(token!),
    enabled: Boolean(token && capabilities.data?.configManage),
    retry: false,
  });

  const locations = useQuery({
    queryKey: ['employee-attendance', 'admin-work-locations'],
    queryFn: () => getWorkLocations(token!),
    enabled: Boolean(token && capabilities.data?.configManage),
    retry: false,
  });

  const leaveTypes = useQuery({
    queryKey: ['employee-attendance', 'admin-leave-types'],
    queryFn: () => getLeaveTypes(token!),
    enabled: Boolean(token && capabilities.data?.configManage),
    retry: false,
  });

  const holidays = useQuery({
    queryKey: ['employee-attendance', 'admin-holidays'],
    queryFn: () => getHolidays(token!),
    enabled: Boolean(token && capabilities.data?.configManage),
    retry: false,
  });

  useEffect(() => {
    if (!config.data) return;
    if (config.data['reimbursement.finance_threshold_inr'] !== undefined) {
      setThreshold(String(config.data['reimbursement.finance_threshold_inr']));
    }
    if (config.data['payroll.working_days_per_week'] !== undefined) {
      setWorkingDays(String(config.data['payroll.working_days_per_week']));
    }
    const offs = config.data['payroll.weekly_off_iso_weekdays'];
    if (Array.isArray(offs)) setWeeklyOffs(offs.join(','));
  }, [config.data]);

  const payrollItems = useQuery({
    queryKey: ['employee-attendance', 'payroll-items', payroll?.payrollRunId],
    queryFn: () => getPayrollItems(token!, payroll!.payrollRunId),
    enabled: Boolean(token && payroll?.payrollRunId),
    retry: false,
  });

  const refreshAdmin = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['employee-attendance', 'admin-employees'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-attendance', 'admin-attendance-review'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-attendance', 'admin-leave'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-attendance', 'admin-reimbursements'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-attendance', 'admin-reimbursement-claims'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-attendance', 'admin-reimbursement-payments'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-attendance', 'admin-config'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-attendance', 'admin-work-locations'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-attendance', 'admin-leave-types'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-attendance', 'admin-holidays'] }),
    ]);
  };

  const previewMutation = useMutation({
    mutationFn: (file: File) => previewEmployeeImport(token!, file),
    onSuccess: setImportPlan,
  });
  const applyImportMutation = useMutation({
    mutationFn: () => applyEmployeeImport(token!, importPlan!.importId),
    onSuccess: async (result) => {
      setImportPlan(result);
      await refreshAdmin();
    },
  });
  const attendanceReviewMutation = useMutation({
    mutationFn: (attendanceDayId: string) => {
      const draft = attendanceReviewDrafts[attendanceDayId] ?? {
        decision: 'APPROVE' as const,
        presentFraction: '1',
        comment: '',
      };
      const presentFraction = draft.decision === 'ADJUST'
        ? Number(draft.presentFraction)
        : undefined;
      if (
        draft.decision === 'ADJUST'
        && (!Number.isFinite(presentFraction) || presentFraction! < 0 || presentFraction! > 1)
      ) {
        throw new Error('Attendance credit must be between 0 and 1.');
      }
      if ((draft.decision === 'ADJUST' || draft.decision === 'REJECT') && !draft.comment.trim()) {
        throw new Error('A reason is required when attendance is adjusted or rejected.');
      }
      return decideHrAttendanceReview(token!, attendanceDayId, {
        decision: draft.decision,
        presentFraction,
        comment: draft.comment.trim() || undefined,
      });
    },
    onSuccess: async (result) => {
      setAttendanceReviewDrafts((current) => {
        const next = { ...current };
        delete next[result.attendanceDayId];
        return next;
      });
      await refreshAdmin();
    },
  });

  const leaveMutation = useMutation({
    mutationFn: (item: LeaveRequest) => {
      const requestedDays = Number(item.calculatedDays ?? item.requestedDays);
      const draft = leaveReviewDrafts[item.leaveRequestId] ?? {
        decision: 'APPROVE' as const,
        approvedDays: String(requestedDays),
        comment: '',
      };
      const approvedDays = draft.decision === 'ADJUST'
        ? Number(draft.approvedDays)
        : undefined;
      if (
        draft.decision === 'ADJUST'
        && (!Number.isFinite(approvedDays) || approvedDays! <= 0 || approvedDays! >= requestedDays)
      ) {
        throw new Error('Adjusted leave days must be greater than zero and lower than requested days.');
      }
      if ((draft.decision === 'ADJUST' || draft.decision === 'REJECT') && !draft.comment.trim()) {
        throw new Error('A reason is required when leave is adjusted or rejected.');
      }
      return decideHrLeave(token!, item.leaveRequestId, {
        decision: draft.decision,
        approvedDays,
        comment: draft.comment.trim() || undefined,
      });
    },
    onSuccess: async (result) => {
      setLeaveReviewDrafts((current) => {
        const next = { ...current };
        delete next[result.leaveRequestId];
        return next;
      });
      await refreshAdmin();
    },
  });
  const reimbursementReviewMutation = useMutation({
    mutationFn: (claim: ReimbursementClaim) => {
      const claimDrafts = expenseReviewDrafts[claim.claimId] ?? {};
      const lineDecisions = claim.lines.map((line) => {
        const baseAmount = reimbursementStage === 'HR'
          ? Number(line.claimedAmount)
          : Number(line.approvedAmount ?? line.claimedAmount);
        const draft = claimDrafts[line.reimbursementItemId] ?? {
          decision: 'APPROVE' as const,
          approvedAmount: String(baseAmount),
          comment: '',
        };
        const approvedAmount = Number(draft.approvedAmount);
        if (!Number.isFinite(approvedAmount) || approvedAmount < 0) {
          throw new Error(`Enter a valid approved amount for line ${line.lineNumber}.`);
        }
        if ((draft.decision === 'ADJUST' || draft.decision === 'REJECT') && !draft.comment.trim()) {
          throw new Error(`Reason is required for line ${line.lineNumber} when adjusting or rejecting.`);
        }
        return {
          reimbursementItemId: line.reimbursementItemId,
          decision: draft.decision,
          approvedAmount,
          comment: draft.comment.trim() || undefined,
        };
      });
      return reviewReimbursementClaim(
        token!,
        claim.claimId,
        reimbursementStage,
        lineDecisions,
      );
    },
    onSuccess: async (claim) => {
      setExpenseReviewDrafts((current) => {
        const next = { ...current };
        delete next[claim.claimId];
        return next;
      });
      await refreshAdmin();
    },
  });

  const paymentMutation = useMutation({
    mutationFn: () => {
      if (!paymentClaimId) throw new Error('Select a reimbursement to pay.');
      const amount = Number(paymentAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid paid amount.');
      if (!paymentReference.trim()) throw new Error('Payment reference is required.');
      return updateReimbursementPayment(token!, paymentClaimId, {
        paidAmount: amount,
        paidAtUtc: new Date(paymentPaidAt).toISOString(),
        paymentMode,
        paymentReference: paymentReference.trim(),
        comment: paymentComment.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setPaymentClaimId(null);
      setPaymentAmount('');
      setPaymentReference('');
      setPaymentComment('');
      await refreshAdmin();
    },
  });

  const payrollMutation = useMutation({
    mutationFn: () => calculatePayroll(token!, payrollMonth),
    onSuccess: (result) => setPayroll(result),
  });
  const finalizeMutation = useMutation({
    mutationFn: () => finalizePayroll(token!, payroll!.payrollRunId),
    onSuccess: async (result) => {
      setPayroll(result);
      await queryClient.invalidateQueries({ queryKey: ['employee-attendance', 'payroll-items'] });
    },
  });
  const configMutation = useMutation({
    mutationFn: async () => {
      await updateModuleConfig(token!, 'reimbursement.finance_threshold_inr', Number(threshold));
      await updateModuleConfig(token!, 'payroll.working_days_per_week', Number(workingDays));
      const offs = weeklyOffs.split(',').map((item) => Number(item.trim())).filter(Number.isFinite);
      return updateModuleConfig(token!, 'payroll.weekly_off_iso_weekdays', offs);
    },
    onSuccess: refreshAdmin,
  });
  const locationMutation = useMutation({
    mutationFn: () => createWorkLocation(token!, {
      locationCode,
      locationName,
      addressText: locationAddress || undefined,
      latitude: Number(locationLat),
      longitude: Number(locationLng),
      geofenceRadiusMeters: Number(locationRadius),
    }),
    onSuccess: async () => {
      setLocationCode('');
      setLocationName('');
      setLocationAddress('');
      setLocationLat('');
      setLocationLng('');
      await refreshAdmin();
    },
  });
  const leaveTypeMutation = useMutation({
    mutationFn: () => createLeaveType(token!, {
      leaveCode,
      leaveName,
      isPaid: leavePaid,
      defaultEntitlementDays: Number(leaveEntitlement),
      allowHalfDay: leaveHalfDay,
      minNoticeDays: Number(leaveMinNoticeDays),
      maxConsecutiveDays: leaveMaxConsecutiveDays ? Number(leaveMaxConsecutiveDays) : undefined,
      requiresReason: leaveRequiresReason,
      allowNegativeBalance: leaveAllowNegativeBalance,
    }),
    onSuccess: async () => {
      setLeaveCode('');
      setLeaveName('');
      setLeaveEntitlement('0');
      setLeaveMinNoticeDays('0');
      setLeaveMaxConsecutiveDays('');
      setLeaveRequiresReason(true);
      setLeaveAllowNegativeBalance(false);
      await refreshAdmin();
    },
  });
  const holidayMutation = useMutation({
    mutationFn: () => createHoliday(token!, {
      holidayDate,
      holidayName,
    }),
    onSuccess: async () => {
      setHolidayName('');
      await refreshAdmin();
    },
  });

  const reviewDraftFor = (claim: ReimbursementClaim, itemId: string, baseAmount: number): ExpenseReviewDraft => (
  expenseReviewDrafts[claim.claimId]?.[itemId] ?? {
    decision: 'APPROVE',
    approvedAmount: String(baseAmount),
    comment: '',
  }
  );

  const updateReviewDraft = (
  claimId: string,
  itemId: string,
  baseAmount: number,
  patch: Partial<ExpenseReviewDraft>,
  ) => {
  setExpenseReviewDrafts((current) => ({
    ...current,
    [claimId]: {
      ...(current[claimId] ?? {}),
      [itemId]: {
        ...(current[claimId]?.[itemId] ?? {
          decision: 'APPROVE',
          approvedAmount: String(baseAmount),
          comment: '',
        }),
        ...patch,
      },
    },
  }));
  };

  if (native) {


  return (
      <section className="employee-services">
        <div className="employee-services__panel">
          <h1>Employee Administration</h1>
          <p>HR and Finance administration is available from Verigence Web only.</p>
        </div>
      </section>
    );
  }

  if (capabilities.isLoading) {
    return <section className="employee-services"><div className="employee-services__panel">Loading Employee Administration…</div></section>;
  }

  if (capabilities.error || visibleSections.length === 0) {
    return (
      <section className="employee-services">
        <div className="employee-services__error">
          {capabilities.error ? errorMessage(capabilities.error) : 'You do not have Employee Administration permissions.'}
        </div>
      </section>
    );
  }

  return (
    <section className="employee-services">
      <header className="employee-services__header">
        <div>
          <span className="employee-services__eyebrow">Administration</span>
          <h1>Employee Management</h1>
          <p>Attendance, onboarding, leave, reimbursements, payroll and reports.</p>
        </div>
      </header>

      <nav className="employee-services__tabs" aria-label="Employee administration">
        {visibleSections.map((item) => (
          <button key={item} type="button" className={section === item ? 'is-active' : ''} onClick={() => setSection(item)}>
            {item === 'employees' ? 'Employees'
              : item === 'attendance' ? 'Attendance Review'
                : item === 'leave' ? 'Leave'
                : item === 'reimbursements' ? 'Reimbursements'
                  : item === 'payroll' ? 'Payroll'
                    : item === 'reports' ? 'Reports'
                      : 'Configuration'}
          </button>
        ))}
      </nav>

      {section === 'employees' && capabilities.data?.employeeManage && (
        <div className="employee-services__panel employee-admin-section">
          <div className="employee-services__panel-head">
            <div><h2>Employee onboarding</h2><p>Excel import is validated and previewed before anything is applied.</p></div>
            <div className="employee-admin-toolbar">
              <button className="employee-admin-button" type="button" onClick={async () => saveBlob(await downloadEmployeeTemplate(token!), 'verigence-employee-onboarding-template.xlsx')}>Download template</button>
              <button className="employee-admin-button is-primary" type="button" onClick={() => fileInput.current?.click()}>Upload Excel</button>
              <input ref={fileInput} hidden type="file" accept=".xlsx" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) previewMutation.mutate(file);
                event.currentTarget.value = '';
              }} />
            </div>
          </div>
          {previewMutation.error && <div className="employee-services__error">{errorMessage(previewMutation.error)}</div>}
          {importPlan && (
            <>
              <div className="employee-admin-summary">
                {(['CREATE', 'UPDATE', 'UNCHANGED', 'ERROR'] as const).map((key) => (
                  <div key={key}><strong>{importPlan.counts[key] ?? 0}</strong><span>{key.toLowerCase()}</span></div>
                ))}
              </div>
              <div className="employee-admin-import-rows">
                {importPlan.rows.map((row) => (
                  <div className="employee-admin-import-row" key={row.rowNumber}>
                    <span>Row {row.rowNumber}</span><strong>{row.employeeCode ?? '—'}</strong><span>{row.action}</span><span>{row.messages.join(' ') || 'Ready'}</span>
                  </div>
                ))}
              </div>
              {importPlan.status !== 'APPLIED' && (
                <div className="employee-services__actions">
                  <button type="button" disabled={(importPlan.counts.ERROR ?? 0) > 0 || applyImportMutation.isPending} onClick={() => applyImportMutation.mutate()}>
                    {applyImportMutation.isPending ? 'Applying…' : 'Apply Import'}
                  </button>
                </div>
              )}
            </>
          )}

          <h3>Employees</h3>
          <div className="employee-services__table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Employee</th><th>Joining</th><th>Location</th><th>Status</th></tr></thead>
              <tbody>
                {(employees.data ?? []).map((employee) => (
                  <tr key={employee.employeeId}>
                    <td>{employee.employeeCode}</td>
                    <td><strong>{employee.displayName}</strong><br /><small>{employee.primaryEmail ?? '—'}</small></td>
                    <td>{employee.joiningDate}</td>
                    <td>{employee.workLocationName ?? '—'}</td>
                    <td>{employee.employmentStatus}</td>
                  </tr>
                ))}
                {!employees.data?.length && <tr><td colSpan={5}>No employees onboarded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === 'attendance' && capabilities.data?.attendanceReview && (
        <div className="employee-services__panel employee-admin-section">
          <div className="employee-services__panel-head">
            <div>
              <h2>Attendance review</h2>
              <p>Review geofence exceptions, late check-ins and early check-outs. Attendance remains counted unless HR adjusts or rejects the credit.</p>
            </div>
            <span className="employee-services__status">{hrAttendance.data?.length ?? 0} pending</span>
          </div>

          <div className="employee-attendance__review-list">
            {(hrAttendance.data ?? []).map((item) => {
              const draft = attendanceReviewDrafts[item.attendanceDayId] ?? {
                decision: 'APPROVE' as const,
                presentFraction: String(item.presentFraction),
                comment: '',
              };
              return (
                <article className="employee-attendance__review-card" key={item.attendanceDayId}>
                  <div className="employee-attendance__review-head">
                    <div>
                      <strong>{item.employeeCode} · {item.employeeName}</strong>
                      <span>{item.attendanceDate} · In {item.checkInAtUtc ? new Date(item.checkInAtUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'} · Out {item.checkOutAtUtc ? new Date(item.checkOutAtUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                    </div>
                    <strong>{Number(item.presentFraction) * 100}% credit</strong>
                  </div>

                  <div className="employee-attendance__flags">
                    {item.flags.map((flag) => (
                      <div key={flag.attendanceFlagId}>
                        <strong>{flag.flagType.replaceAll('_', ' ')}</strong>
                        {flag.flagDetail && <span>{flag.flagDetail}</span>}
                        {flag.employeeReason && <small>Employee reason: {flag.employeeReason}</small>}
                      </div>
                    ))}
                  </div>

                  <div className="employee-admin-form">
                    <label>
                      HR decision
                      <select
                        value={draft.decision}
                        onChange={(event) => {
                          const decision = event.target.value as 'APPROVE' | 'ADJUST' | 'REJECT';
                          setAttendanceReviewDrafts((current) => ({
                            ...current,
                            [item.attendanceDayId]: {
                              ...draft,
                              decision,
                              presentFraction: decision === 'REJECT' ? '0' : draft.presentFraction,
                            },
                          }));
                        }}
                      >
                        <option value="APPROVE">Approve attendance as recorded</option>
                        <option value="ADJUST">Adjust attendance credit</option>
                        <option value="REJECT">Reject attendance credit</option>
                      </select>
                    </label>
                    {draft.decision === 'ADJUST' && (
                      <label>
                        Attendance credit
                        <select
                          value={draft.presentFraction}
                          onChange={(event) => setAttendanceReviewDrafts((current) => ({
                            ...current,
                            [item.attendanceDayId]: { ...draft, presentFraction: event.target.value },
                          }))}
                        >
                          <option value="1">Full day (1.0)</option>
                          <option value="0.5">Half day (0.5)</option>
                          <option value="0">No credit (0.0)</option>
                        </select>
                      </label>
                    )}
                    <label className="span">
                      HR comment
                      <textarea
                        placeholder={draft.decision === 'APPROVE' ? 'Optional' : 'Required'}
                        value={draft.comment}
                        onChange={(event) => setAttendanceReviewDrafts((current) => ({
                          ...current,
                          [item.attendanceDayId]: { ...draft, comment: event.target.value },
                        }))}
                      />
                    </label>
                  </div>
                  <div className="employee-services__actions">
                    <button
                      type="button"
                      disabled={attendanceReviewMutation.isPending}
                      onClick={() => attendanceReviewMutation.mutate(item.attendanceDayId)}
                    >
                      {attendanceReviewMutation.isPending ? 'Saving…' : 'Complete HR Review'}
                    </button>
                  </div>
                </article>
              );
            })}
            {!hrAttendance.data?.length && <p>No attendance exceptions are waiting for HR.</p>}
          </div>
          {attendanceReviewMutation.error && <div className="employee-services__error">{errorMessage(attendanceReviewMutation.error)}</div>}
        </div>
      )}

      {section === 'leave' && capabilities.data?.leaveHrApprove && (
        <div className="employee-services__panel employee-admin-section">
          <div className="employee-services__panel-head">
            <div>
              <h2>HR leave validation</h2>
              <p>Requests reach HR only after TL or PM approval. HR may approve, adjust approved days, or reject with an audit reason.</p>
            </div>
            <span className="employee-services__status">{hrLeave.data?.length ?? 0} pending</span>
          </div>

          <div className="employee-leave__admin-list">
            {(hrLeave.data ?? []).map((item) => {
              const requestedDays = Number(item.calculatedDays ?? item.requestedDays);
              const draft = leaveReviewDrafts[item.leaveRequestId] ?? {
                decision: 'APPROVE' as const,
                approvedDays: String(requestedDays),
                comment: '',
              };
              return (
                <article className="employee-leave__admin-card" key={item.leaveRequestId}>
                  <div className="employee-leave__admin-head">
                    <div>
                      <strong>{item.employeeName} · {item.leaveTypeName}</strong>
                      <span>
                        {item.startDate}{item.endDate !== item.startDate ? ` → ${item.endDate}` : ''}
                        {' · '}{requestedDays} day(s)
                        {item.dayMode === 'HALF_DAY' && item.halfDaySession ? ` · ${item.halfDaySession.replaceAll('_', ' ')}` : ''}
                      </span>
                      {item.reason && <small>{item.reason}</small>}
                    </div>
                    <strong>{requestedDays} requested</strong>
                  </div>

                  <div className="employee-admin-form">
                    <label>
                      HR decision
                      <select
                        value={draft.decision}
                        onChange={(event) => {
                          const decision = event.target.value as 'APPROVE' | 'ADJUST' | 'REJECT';
                          setLeaveReviewDrafts((current) => ({
                            ...current,
                            [item.leaveRequestId]: {
                              ...draft,
                              decision,
                              approvedDays: decision === 'REJECT' ? '0' : decision === 'APPROVE' ? String(requestedDays) : draft.approvedDays,
                            },
                          }));
                        }}
                      >
                        <option value="APPROVE">Approve</option>
                        <option value="ADJUST">Adjust approved days</option>
                        <option value="REJECT">Reject</option>
                      </select>
                    </label>

                    {draft.decision === 'ADJUST' && (
                      <label>
                        Approved days
                        <input
                          type="number"
                          min="0.5"
                          max={Math.max(0.5, requestedDays - 0.5)}
                          step="0.5"
                          value={draft.approvedDays}
                          onChange={(event) => setLeaveReviewDrafts((current) => ({
                            ...current,
                            [item.leaveRequestId]: { ...draft, approvedDays: event.target.value },
                          }))}
                        />
                      </label>
                    )}

                    <label className="span">
                      HR comment
                      <textarea
                        value={draft.comment}
                        placeholder={draft.decision === 'APPROVE' ? 'Optional' : 'Required'}
                        onChange={(event) => setLeaveReviewDrafts((current) => ({
                          ...current,
                          [item.leaveRequestId]: { ...draft, comment: event.target.value },
                        }))}
                      />
                    </label>
                  </div>

                  <div className="employee-services__actions">
                    <button type="button" disabled={leaveMutation.isPending} onClick={() => leaveMutation.mutate(item)}>
                      {leaveMutation.isPending ? 'Saving…' : 'Complete HR Review'}
                    </button>
                  </div>
                </article>
              );
            })}
            {!hrLeave.data?.length && <p>No leave requests are waiting for HR.</p>}
          </div>
          {leaveMutation.error && <div className="employee-services__error">{errorMessage(leaveMutation.error)}</div>}
        </div>
      )}

      {section === 'reimbursements' && (
        <div className="employee-services__panel employee-admin-section">
          <div className="employee-services__panel-head">
            <div>
              <h2>Reimbursements</h2>
              <p>Approval and payment are separate, auditable stages.</p>
            </div>
            <div className="employee-admin-toolbar">
              {(capabilities.data?.reimbursementHrApprove || capabilities.data?.reimbursementFinanceApprove) && (
                <button
                  className={`employee-admin-button ${reimbursementView === 'APPROVALS' ? 'is-primary' : ''}`}
                  type="button"
                  onClick={() => setReimbursementView('APPROVALS')}
                >
                  Approval Queue
                </button>
              )}
              {capabilities.data?.reimbursementPaymentManage && (
                <button
                  className={`employee-admin-button ${reimbursementView === 'PAYMENTS' ? 'is-primary' : ''}`}
                  type="button"
                  onClick={() => setReimbursementView('PAYMENTS')}
                >
                  Payment Queue
                </button>
              )}
            </div>
          </div>

          {reimbursementView === 'APPROVALS' && (
            <>
              <div className="employee-admin-toolbar">
                {capabilities.data?.reimbursementHrApprove && (
                  <button className={`employee-admin-button ${reimbursementStage === 'HR' ? 'is-primary' : ''}`} type="button" onClick={() => setReimbursementStage('HR')}>HR Review</button>
                )}
                {capabilities.data?.reimbursementFinanceApprove && (
                  <button className={`employee-admin-button ${reimbursementStage === 'FINANCE' ? 'is-primary' : ''}`} type="button" onClick={() => setReimbursementStage('FINANCE')}>Finance Review</button>
                )}
              </div>

              <div className="employee-expense__claim-list">
                {(reimbursementClaimQueue.data ?? []).map((claim) => (
                  <article className="employee-expense__claim employee-expense__review" key={claim.claimId}>
                    <div className="employee-expense__claim-head">
                      <div>
                        <strong>{claim.employeeName} · {claim.claimNumber}</strong>
                        <span>{claim.purpose} · {claim.lines.length} line{claim.lines.length === 1 ? '' : 's'}</span>
                      </div>
                      <div>
                        <strong>{money(claim.claimedTotal)}</strong>
                        <span>{reimbursementStage} review</span>
                      </div>
                    </div>

                    <div className="employee-expense__review-lines">
                      {claim.lines.map((line) => {
                        const baseAmount = reimbursementStage === 'HR'
                          ? Number(line.claimedAmount)
                          : Number(line.approvedAmount ?? line.claimedAmount);
                        const draft = reviewDraftFor(claim, line.reimbursementItemId, baseAmount);
                        return (
                          <div className="employee-expense__review-line" key={line.reimbursementItemId}>
                            <div className="employee-expense__review-evidence">
                              <strong>#{line.lineNumber} · {line.category.replaceAll('_', ' ')}</strong>
                              <span>{line.expenseDate} · Claimed {money(line.claimedAmount)}</span>
                              {line.vendorName && <small>{line.vendorName}</small>}
                              {(line.travelFrom || line.travelTo) && <small>{line.travelFrom ?? '—'} → {line.travelTo ?? '—'} · {line.transportMode?.replaceAll('_', ' ') ?? '—'}</small>}
                              {line.description && <small>{line.description}</small>}
                              {line.receiptUrl && <a href={line.receiptUrl} target="_blank" rel="noreferrer">Open receipt</a>}
                            </div>
                            <div className="employee-expense__review-controls">
                              <label>
                                Decision
                                <select
                                  value={draft.decision}
                                  onChange={(event) => {
                                    const decision = event.target.value as ExpenseReviewDraft['decision'];
                                    updateReviewDraft(claim.claimId, line.reimbursementItemId, baseAmount, {
                                      decision,
                                      approvedAmount: decision === 'REJECT' ? '0' : decision === 'APPROVE' ? String(baseAmount) : draft.approvedAmount,
                                    });
                                  }}
                                >
                                  <option value="APPROVE">Approve</option>
                                  <option value="ADJUST">Adjust / Partial</option>
                                  <option value="REJECT">Reject</option>
                                </select>
                              </label>
                              <label>
                                Approved amount (₹)
                                <input
                                  type="number"
                                  min="0"
                                  max={baseAmount}
                                  step="0.01"
                                  disabled={draft.decision !== 'ADJUST'}
                                  value={draft.approvedAmount}
                                  onChange={(event) => updateReviewDraft(claim.claimId, line.reimbursementItemId, baseAmount, { approvedAmount: event.target.value })}
                                />
                              </label>
                              <label className="employee-expense__review-comment">
                                Review reason / comment
                                <textarea
                                  placeholder={draft.decision === 'APPROVE' ? 'Optional' : 'Required'}
                                  value={draft.comment}
                                  onChange={(event) => updateReviewDraft(claim.claimId, line.reimbursementItemId, baseAmount, { comment: event.target.value })}
                                />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="employee-services__actions">
                      <button
                        type="button"
                        disabled={reimbursementReviewMutation.isPending}
                        onClick={() => reimbursementReviewMutation.mutate(claim)}
                      >
                        {reimbursementReviewMutation.isPending ? 'Saving review…' : `Submit ${reimbursementStage} Review`}
                      </button>
                    </div>
                  </article>
                ))}
                {!reimbursementClaimQueue.data?.length && <p>No claims are waiting for {reimbursementStage.toLowerCase()} review.</p>}
              </div>
              {reimbursementReviewMutation.error && <div className="employee-services__error">{errorMessage(reimbursementReviewMutation.error)}</div>}
            </>
          )}

          {reimbursementView === 'PAYMENTS' && capabilities.data?.reimbursementPaymentManage && (
            <>
              <div className="employee-admin-toolbar">
                <label>
                  Payment status
                  <select value={paymentQueueStatus} onChange={(event) => setPaymentQueueStatus(event.target.value as typeof paymentQueueStatus)}>
                    <option value="PENDING_PAYMENT">Pending Payment</option>
                    <option value="PROCESSED">Processed</option>
                  </select>
                </label>
              </div>

              <div className="employee-services__approval-list">
                {(reimbursementPayments.data ?? []).map((item) => (
                  <article key={item.claimId}>
                    <div>
                      <strong>{item.employeeName} · {money(item.amount)}</strong>
                      <span>{item.expenseDate} · {item.category} · {item.paymentStatus ? item.paymentStatus.replaceAll('_', ' ') : '—'}</span>
                      {item.paidAtUtc && <small>Paid {new Date(item.paidAtUtc).toLocaleString()} · {item.paymentReference ?? 'No reference'}</small>}
                    </div>
                    <div>
                      {item.paymentStatus !== 'PROCESSED' && (
                        <button
                          type="button"
                          className="is-secondary"
                          onClick={() => {
                            setPaymentClaimId(item.claimId);
                            setPaymentAmount(String(item.amount));
                            setPaymentReference('');
                            setPaymentComment('');
                            setPaymentPaidAt(new Date().toISOString().slice(0, 16));
                          }}
                        >
                          Mark Processed
                        </button>
                      )}
                    </div>
                  </article>
                ))}
                {!reimbursementPayments.data?.length && <p>No reimbursements in this payment state.</p>}
              </div>

              {paymentClaimId && (
                <div className="employee-admin-payment-form">
                  <h3>Process reimbursement payment</h3>
                  <div className="employee-admin-form">
                    <label>Paid amount (₹)<input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label>
                    <label>Paid date/time<input type="datetime-local" value={paymentPaidAt} onChange={(event) => setPaymentPaidAt(event.target.value)} /></label>
                    <label>
                      Payment mode
                      <select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}>
                        <option value="BANK_TRANSFER">Bank transfer</option>
                        <option value="NEFT">NEFT</option>
                        <option value="IMPS">IMPS</option>
                        <option value="UPI">UPI</option>
                        <option value="CASH">Cash</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </label>
                    <label>Payment reference / UTR<input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /></label>
                    <label className="span">Finance comment<textarea value={paymentComment} onChange={(event) => setPaymentComment(event.target.value)} /></label>
                  </div>
                  <div className="employee-services__actions">
                    <button type="button" disabled={paymentMutation.isPending} onClick={() => paymentMutation.mutate()}>
                      {paymentMutation.isPending ? 'Processing…' : 'Confirm Processed'}
                    </button>
                    <button type="button" className="is-secondary" onClick={() => setPaymentClaimId(null)}>Cancel</button>
                  </div>
                  {paymentMutation.error && <div className="employee-services__error">{errorMessage(paymentMutation.error)}</div>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {section === 'payroll' && capabilities.data?.payrollManage && (
        <div className="employee-services__panel employee-admin-section">
          <div className="employee-services__panel-head">
            <div><h2>Monthly payroll</h2><p>Calculate from attendance, approved leave, holidays and the effective salary structure.</p></div>
            <div className="employee-admin-toolbar">
              <input type="date" value={payrollMonth} onChange={(event) => setPayrollMonth(event.target.value)} />
              <button className="employee-admin-button is-primary" type="button" disabled={payrollMutation.isPending} onClick={() => payrollMutation.mutate()}>Calculate</button>
            </div>
          </div>
          {payrollMutation.error && <div className="employee-services__error">{errorMessage(payrollMutation.error)}</div>}
          {payroll && (
            <>
              <div className="employee-admin-summary">
                <div><strong>{payroll.employeeCount}</strong><span>employees</span></div>
                <div><strong>{money(payroll.totalNetAmount)}</strong><span>net payroll</span></div>
                <div><strong>{payroll.status}</strong><span>status</span></div>
              </div>
              <div className="employee-admin-toolbar">
                {payroll.status !== 'FINALIZED' && <button className="employee-admin-button is-primary" type="button" disabled={finalizeMutation.isPending} onClick={() => finalizeMutation.mutate()}>Finalize & generate payslips</button>}
                <button className="employee-admin-button" type="button" onClick={async () => saveBlob(await downloadPayrollReport(token!, payroll.payrollRunId), `payroll-${payroll.payrollMonth}.xlsx`)}>Download payroll report</button>
              </div>
              <div className="employee-services__table-wrap">
                <table>
                  <thead><tr><th>Employee</th><th>Present</th><th>Paid Leave</th><th>Payable</th><th>Gross</th><th>Net</th></tr></thead>
                  <tbody>
                    {(payrollItems.data ?? []).map((item) => (
                      <tr key={item.payrollItemId}><td>{item.employeeCode} · {item.employeeName}</td><td>{item.presentDays}</td><td>{item.paidLeaveDays}</td><td>{item.payableDays}/{item.scheduledDays}</td><td>{money(item.grossAmount)}</td><td>{money(item.netAmount)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {section === 'reports' && capabilities.data?.reportRead && (
        <div className="employee-services__panel employee-admin-section">
          <h2>Attendance report</h2>
          <p>Download weekly or custom attendance ranges up to 32 days.</p>
          <div className="employee-admin-form">
            <label>Start<input type="date" value={reportStart} onChange={(event) => setReportStart(event.target.value)} /></label>
            <label>End<input type="date" value={reportEnd} onChange={(event) => setReportEnd(event.target.value)} /></label>
          </div>
          <div className="employee-services__actions">
            <button type="button" onClick={async () => saveBlob(await downloadAttendanceReport(token!, reportStart, reportEnd), `attendance-${reportStart}-${reportEnd}.xlsx`)}>Download Attendance Excel</button>
          </div>
        </div>
      )}

      {section === 'config' && capabilities.data?.configManage && (
        <div className="employee-services__panel employee-admin-section">
          <h2>Attendance & payroll configuration</h2>
          <div className="employee-admin-form">
            <label>Finance approval threshold (₹)<input type="number" min="0" value={threshold} onChange={(event) => setThreshold(event.target.value)} /></label>
            <label>Working days / week<input type="number" min="1" max="7" value={workingDays} onChange={(event) => setWorkingDays(event.target.value)} /></label>
            <label className="span">Weekly-off ISO weekdays (1=Mon … 7=Sun)<input value={weeklyOffs} onChange={(event) => setWeeklyOffs(event.target.value)} /></label>
          </div>
          <div className="employee-services__actions"><button type="button" disabled={configMutation.isPending} onClick={() => configMutation.mutate()}>Save Configuration</button></div>

          <h3>Work locations</h3>
          <div className="employee-admin-form">
            <label>Code<input value={locationCode} onChange={(event) => setLocationCode(event.target.value)} /></label>
            <label>Name<input value={locationName} onChange={(event) => setLocationName(event.target.value)} /></label>
            <label className="span">Address<input value={locationAddress} onChange={(event) => setLocationAddress(event.target.value)} /></label>
            <label>Latitude<input type="number" step="any" value={locationLat} onChange={(event) => setLocationLat(event.target.value)} /></label>
            <label>Longitude<input type="number" step="any" value={locationLng} onChange={(event) => setLocationLng(event.target.value)} /></label>
            <label>Geofence (m)<input type="number" min="50" max="5000" value={locationRadius} onChange={(event) => setLocationRadius(event.target.value)} /></label>
          </div>
          <div className="employee-services__actions"><button type="button" onClick={() => locationMutation.mutate()}>Add Work Location</button></div>
          <div className="employee-services__table-wrap"><table><thead><tr><th>Code</th><th>Location</th><th>Radius</th></tr></thead><tbody>{(locations.data ?? []).map((item) => <tr key={String(item.locationId)}><td>{String(item.locationCode)}</td><td>{String(item.locationName)}</td><td>{String(item.geofenceRadiusMeters)} m</td></tr>)}</tbody></table></div>

          <h3>Leave types & policy</h3>
          <div className="employee-admin-form">
            <label>Code<input value={leaveCode} onChange={(event) => setLeaveCode(event.target.value)} /></label>
            <label>Name<input value={leaveName} onChange={(event) => setLeaveName(event.target.value)} /></label>
            <label>Annual entitlement<input type="number" min="0" step="0.5" value={leaveEntitlement} onChange={(event) => setLeaveEntitlement(event.target.value)} /></label>
            <label>Minimum notice (days)<input type="number" min="0" max="365" value={leaveMinNoticeDays} onChange={(event) => setLeaveMinNoticeDays(event.target.value)} /></label>
            <label>Maximum days / request<input type="number" min="0.5" step="0.5" value={leaveMaxConsecutiveDays} placeholder="No limit" onChange={(event) => setLeaveMaxConsecutiveDays(event.target.value)} /></label>
            <label><span>Paid leave</span><input type="checkbox" checked={leavePaid} onChange={(event) => setLeavePaid(event.target.checked)} /></label>
            <label><span>Allow half day</span><input type="checkbox" checked={leaveHalfDay} onChange={(event) => setLeaveHalfDay(event.target.checked)} /></label>
            <label><span>Reason mandatory</span><input type="checkbox" checked={leaveRequiresReason} onChange={(event) => setLeaveRequiresReason(event.target.checked)} /></label>
            <label><span>Allow negative balance</span><input type="checkbox" checked={leaveAllowNegativeBalance} onChange={(event) => setLeaveAllowNegativeBalance(event.target.checked)} /></label>
          </div>
          <div className="employee-services__actions"><button type="button" disabled={leaveTypeMutation.isPending} onClick={() => leaveTypeMutation.mutate()}>{leaveTypeMutation.isPending ? 'Saving…' : 'Add Leave Type'}</button></div>
          {leaveTypeMutation.error && <div className="employee-services__error">{errorMessage(leaveTypeMutation.error)}</div>}
          <div className="employee-services__table-wrap">
            <table>
              <thead><tr><th>Code</th><th>Leave</th><th>Entitlement</th><th>Half day</th><th>Notice</th><th>Max/request</th><th>Reason</th></tr></thead>
              <tbody>
                {(leaveTypes.data ?? []).map((item) => (
                  <tr key={item.leaveTypeId}>
                    <td>{item.leaveCode}</td>
                    <td>{item.leaveName}</td>
                    <td>{String(item.defaultEntitlementDays)}</td>
                    <td>{item.allowHalfDay ? 'Yes' : 'No'}</td>
                    <td>{item.minNoticeDays} day(s)</td>
                    <td>{item.maxConsecutiveDays ?? 'No limit'}</td>
                    <td>{item.requiresReason ? 'Required' : 'Optional'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Holidays</h3>
          <div className="employee-admin-form">
            <label>Date<input type="date" value={holidayDate} onChange={(event) => setHolidayDate(event.target.value)} /></label>
            <label>Name<input value={holidayName} onChange={(event) => setHolidayName(event.target.value)} /></label>
          </div>
          <div className="employee-services__actions"><button type="button" onClick={() => holidayMutation.mutate()}>Add Holiday</button></div>
          <div className="employee-services__table-wrap"><table><thead><tr><th>Date</th><th>Holiday</th></tr></thead><tbody>{(holidays.data ?? []).map((item) => <tr key={String(item.holidayId)}><td>{String(item.holidayDate)}</td><td>{String(item.holidayName)}</td></tr>)}</tbody></table></div>
        </div>
      )}
    </section>
  );
}
