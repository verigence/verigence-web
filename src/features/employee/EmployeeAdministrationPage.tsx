import { Capacitor } from '@capacitor/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  applyEmployeeImport,
  calculatePayroll,
  createHoliday,
  createLeaveType,
  createWorkLocation,
  decideHrLeave,
  decideReimbursement,
  downloadAttendanceReport,
  downloadEmployeeTemplate,
  downloadPayrollReport,
  finalizePayroll,
  getAdminCapabilities,
  getHolidays,
  getHrLeaveQueue,
  getLeaveTypes,
  getModuleConfig,
  getPayrollItems,
  getReimbursementQueue,
  getWorkLocations,
  listAdminEmployees,
  previewEmployeeImport,
  updateModuleConfig,
  type BulkImport,
  type PayrollSummary,
} from '../../services/employee-attendance/client';
import { useSessionStore } from '../../store/sessionStore';
import '../../styles/employee-services.css';

type Section = 'employees' | 'leave' | 'reimbursements' | 'payroll' | 'reports' | 'config';

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

export default function EmployeeAdministrationPage() {
  const native = Capacitor.isNativePlatform();
  const token = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [section, setSection] = useState<Section>('employees');
  const [importPlan, setImportPlan] = useState<BulkImport | null>(null);
  const [reimbursementStage, setReimbursementStage] = useState<'HR' | 'FINANCE'>('HR');
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
    if (value.leaveHrApprove) items.push('leave');
    if (value.reimbursementHrApprove || value.reimbursementFinanceApprove) items.push('reimbursements');
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

  const hrLeave = useQuery({
    queryKey: ['employee-attendance', 'admin-leave'],
    queryFn: () => getHrLeaveQueue(token!),
    enabled: Boolean(token && capabilities.data?.leaveHrApprove),
    retry: false,
  });

  const reimbursementQueue = useQuery({
    queryKey: ['employee-attendance', 'admin-reimbursements', reimbursementStage],
    queryFn: () => getReimbursementQueue(token!, reimbursementStage),
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
      queryClient.invalidateQueries({ queryKey: ['employee-attendance', 'admin-leave'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-attendance', 'admin-reimbursements'] }),
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
  const leaveMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVE' | 'REJECT' }) =>
      decideHrLeave(token!, id, decision),
    onSuccess: refreshAdmin,
  });
  const reimbursementMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVE' | 'REJECT' }) =>
      decideReimbursement(token!, id, reimbursementStage, decision),
    onSuccess: refreshAdmin,
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
    }),
    onSuccess: async () => {
      setLeaveCode('');
      setLeaveName('');
      setLeaveEntitlement('0');
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

      {section === 'leave' && capabilities.data?.leaveHrApprove && (
        <div className="employee-services__panel">
          <h2>HR leave validation</h2>
          <p>Requests reach HR only after TL or PMO approval.</p>
          <div className="employee-services__approval-list">
            {(hrLeave.data ?? []).map((item) => (
              <article key={item.leaveRequestId}>
                <div><strong>{item.employeeName}</strong><span>{item.leaveTypeName} · {item.startDate} → {item.endDate} · {item.requestedDays} day(s)</span>{item.reason && <small>{item.reason}</small>}</div>
                <div>
                  <button type="button" disabled={leaveMutation.isPending} onClick={() => leaveMutation.mutate({ id: item.leaveRequestId, decision: 'APPROVE' })}>Validate</button>
                  <button type="button" className="is-secondary" disabled={leaveMutation.isPending} onClick={() => leaveMutation.mutate({ id: item.leaveRequestId, decision: 'REJECT' })}>Reject</button>
                </div>
              </article>
            ))}
            {!hrLeave.data?.length && <p>No leave requests are waiting for HR.</p>}
          </div>
        </div>
      )}

      {section === 'reimbursements' && (
        <div className="employee-services__panel">
          <div className="employee-services__panel-head">
            <div><h2>Reimbursement approvals</h2><p>Finance sees only claims that crossed the monthly threshold and were approved by HR.</p></div>
            {capabilities.data?.reimbursementHrApprove && capabilities.data?.reimbursementFinanceApprove && (
              <div className="employee-admin-toolbar">
                <button className="employee-admin-button" type="button" onClick={() => setReimbursementStage('HR')}>HR Queue</button>
                <button className="employee-admin-button" type="button" onClick={() => setReimbursementStage('FINANCE')}>Finance Queue</button>
              </div>
            )}
          </div>
          <div className="employee-services__table-wrap">
            <table>
              <thead><tr><th>Employee</th><th>Date</th><th>Category</th><th>Amount</th><th>Action</th></tr></thead>
              <tbody>
                {(reimbursementQueue.data ?? []).map((item) => (
                  <tr key={item.claimId}>
                    <td>{item.employeeName}</td><td>{item.expenseDate}</td><td>{item.category}</td><td>{money(item.amount)}</td>
                    <td><div className="employee-admin-toolbar"><button className="employee-admin-button is-primary" type="button" onClick={() => reimbursementMutation.mutate({ id: item.claimId, decision: 'APPROVE' })}>Approve</button><button className="employee-admin-button" type="button" onClick={() => reimbursementMutation.mutate({ id: item.claimId, decision: 'REJECT' })}>Reject</button></div></td>
                  </tr>
                ))}
                {!reimbursementQueue.data?.length && <tr><td colSpan={5}>No {reimbursementStage.toLowerCase()} approvals are pending.</td></tr>}
              </tbody>
            </table>
          </div>
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

          <h3>Leave types</h3>
          <div className="employee-admin-form">
            <label>Code<input value={leaveCode} onChange={(event) => setLeaveCode(event.target.value)} /></label>
            <label>Name<input value={leaveName} onChange={(event) => setLeaveName(event.target.value)} /></label>
            <label>Annual entitlement<input type="number" min="0" step="0.5" value={leaveEntitlement} onChange={(event) => setLeaveEntitlement(event.target.value)} /></label>
            <label><span>Paid leave</span><input type="checkbox" checked={leavePaid} onChange={(event) => setLeavePaid(event.target.checked)} /></label>
            <label><span>Allow half day</span><input type="checkbox" checked={leaveHalfDay} onChange={(event) => setLeaveHalfDay(event.target.checked)} /></label>
          </div>
          <div className="employee-services__actions"><button type="button" onClick={() => leaveTypeMutation.mutate()}>Add Leave Type</button></div>
          <div className="employee-services__table-wrap"><table><thead><tr><th>Code</th><th>Leave</th><th>Entitlement</th><th>Half day</th></tr></thead><tbody>{(leaveTypes.data ?? []).map((item) => <tr key={String(item.leaveTypeId)}><td>{String(item.leaveCode)}</td><td>{String(item.leaveName)}</td><td>{String(item.defaultEntitlementDays)}</td><td>{item.allowHalfDay ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div>

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
