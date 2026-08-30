import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import '../features/attendance/attendance.css';
import {
  AttendanceHttpError,
  checkInAttendance,
  checkOutAttendance,
  correctAttendance,
  getAttendanceHistory,
  getAttendanceOverview,
  getAttendancePolicy,
  getTodayAttendance,
  updateAttendancePolicy,
  type AttendanceCorrectionBody,
  type AttendanceOverviewItem,
  type AttendancePolicy,
} from '../services/attendance/client';
import { getCurrentLocation } from '../services/device/location';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

type AttendanceAction = 'CHECK_IN' | 'CHECK_OUT';

const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  CHECKED_IN: 'Checked in',
  CHECKED_IN_EXCEPTION: 'Submitted',
  CHECKED_OUT: 'Completed',
  CHECKED_OUT_EXCEPTION: 'Submitted',
  CORRECTED: 'Corrected',
  NOT_CHECKED_IN: 'Not checked in',
};

const LOCATION_RESULT_LABELS: Record<string, string> = {
  LOCATION_CAPTURED: 'Location recorded',
  WITHIN_GEOFENCE: 'At assigned work location',
  OUTSIDE_GEOFENCE_EXCEPTION: 'Different work location — submitted for review',
  GEOFENCE_UNVERIFIABLE_EXCEPTION: 'Assigned work location could not be verified — submitted for review',
  OUTSIDE_GEOFENCE: 'Different work location',
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Attendance is temporarily unavailable. Your normal Verigence work is not affected.';
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function dateForTimezone(timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function localInputValue(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fallbackLabel(value: string): string {
  return value.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}

function statusLabel(status: string): string {
  return ATTENDANCE_STATUS_LABELS[status] ?? fallbackLabel(status);
}

function locationResultLabel(result: string): string {
  return LOCATION_RESULT_LABELS[result] ?? fallbackLabel(result);
}

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const selectedProject = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const tenantId = selectedProject?.tenantId ?? '';
  const timezone = selectedProject?.timezoneName || 'Asia/Kolkata';
  const todayDate = dateForTimezone(timezone);
  const [overviewDate, setOverviewDate] = useState(() => todayDate);
  const [exceptionAction, setExceptionAction] = useState<AttendanceAction | null>(null);
  const [exceptionReason, setExceptionReason] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [correctionTarget, setCorrectionTarget] = useState<AttendanceOverviewItem | null>(null);
  const [correctionIn, setCorrectionIn] = useState('');
  const [correctionOut, setCorrectionOut] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [policyDraft, setPolicyDraft] = useState<Omit<AttendancePolicy, 'tenantId'> | null>(null);

  const todayQuery = useQuery({
    queryKey: ['attendance', 'today', tenantId],
    queryFn: () => getTodayAttendance(tenantId, accessToken!),
    enabled: Boolean(tenantId && accessToken),
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const historyQuery = useQuery({
    queryKey: ['attendance', 'history', tenantId],
    queryFn: () => getAttendanceHistory(tenantId, accessToken!, 31),
    enabled: Boolean(tenantId && accessToken),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const overviewQuery = useQuery({
    queryKey: ['attendance', 'overview', tenantId, overviewDate],
    queryFn: () => getAttendanceOverview(tenantId, accessToken!, overviewDate),
    enabled: Boolean(tenantId && accessToken && overviewDate),
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const policyAdminQuery = useQuery({
    queryKey: ['attendance', 'policy-admin', tenantId],
    queryFn: () => getAttendancePolicy(tenantId, accessToken!),
    enabled: Boolean(tenantId && accessToken),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const policy = policyAdminQuery.data;
    if (!policy) return;
    setPolicyDraft({
      timezoneIana: policy.timezoneIana,
      expectedStartLocal: policy.expectedStartLocal,
      checkinReminderLocal: policy.checkinReminderLocal,
      expectedEndLocal: policy.expectedEndLocal,
      checkoutReminderLocal: policy.checkoutReminderLocal,
      pcGeofenceRadiusMeters: policy.pcGeofenceRadiusMeters,
      maxLocationAccuracyMeters: policy.maxLocationAccuracyMeters,
      maxLocationAgeSeconds: policy.maxLocationAgeSeconds,
      geofenceExceptionAllowed: policy.geofenceExceptionAllowed,
    });
  }, [policyAdminQuery.data]);

  const refreshAttendance = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['attendance', 'today', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['attendance', 'history', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['attendance', 'overview', tenantId] }),
    ]);
  };

  const actionMutation = useMutation({
    mutationFn: async ({ action, reason }: { action: AttendanceAction; reason?: string }) => {
      const position = await getCurrentLocation();
      if (position.accuracy === null || !Number.isFinite(position.accuracy)) {
        throw new Error('Location accuracy is unavailable. Please retry location capture.');
      }
      const body = {
        location: {
          latitude: position.latitude,
          longitude: position.longitude,
          accuracyMeters: position.accuracy,
          capturedAt: new Date().toISOString(),
        },
        exceptionReason: reason?.trim() || undefined,
      };
      return action === 'CHECK_IN'
        ? checkInAttendance(tenantId, accessToken!, body)
        : checkOutAttendance(tenantId, accessToken!, body);
    },
    onSuccess: async (result) => {
      setExceptionAction(null);
      setExceptionReason('');
      setActionNotice(
        result.exceptionRecorded
          ? 'Attendance recorded with a different-location remark for later review.'
          : result.geofenceRequired
            ? 'Attendance recorded at the assigned work location.'
            : 'Attendance recorded with current location evidence.',
      );
      await refreshAttendance();
    },
    onError: (error, variables) => {
      setActionNotice('');
      if (error instanceof AttendanceHttpError && error.code === 'GEOFENCE_EXCEPTION_REASON_REQUIRED') {
        setExceptionAction(variables.action);
      }
    },
  });

  const policyMutation = useMutation({
    mutationFn: (policy: Omit<AttendancePolicy, 'tenantId'>) =>
      updateAttendancePolicy(tenantId, accessToken!, policy),
    onSuccess: async (policy) => {
      setPolicyDraft({
        timezoneIana: policy.timezoneIana,
        expectedStartLocal: policy.expectedStartLocal,
        checkinReminderLocal: policy.checkinReminderLocal,
        expectedEndLocal: policy.expectedEndLocal,
        checkoutReminderLocal: policy.checkoutReminderLocal,
        pcGeofenceRadiusMeters: policy.pcGeofenceRadiusMeters,
        maxLocationAccuracyMeters: policy.maxLocationAccuracyMeters,
        maxLocationAgeSeconds: policy.maxLocationAgeSeconds,
        geofenceExceptionAllowed: policy.geofenceExceptionAllowed,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance', 'policy-admin', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['attendance', 'today', tenantId] }),
      ]);
    },
  });

  const correctionMutation = useMutation({
    mutationFn: ({ attendanceId, body }: { attendanceId: string; body: AttendanceCorrectionBody }) =>
      correctAttendance(tenantId, accessToken!, attendanceId, body),
    onSuccess: async () => {
      setCorrectionTarget(null);
      setCorrectionIn('');
      setCorrectionOut('');
      setCorrectionReason('');
      await refreshAttendance();
    },
  });

  const today = todayQuery.data?.attendance;
  const isCheckedIn = Boolean(today);
  const isCheckedOut = Boolean(today?.checkOutAt);
  const overviewDenied = overviewQuery.error instanceof AttendanceHttpError && overviewQuery.error.status === 403;
  const isHrAdmin = policyAdminQuery.isSuccess;
  const ownError = todayQuery.error || historyQuery.error;

  const overviewItems = useMemo(
    () => overviewQuery.data?.items ?? [],
    [overviewQuery.data?.items],
  );

  const openCorrection = (item: AttendanceOverviewItem) => {
    if (!item.attendance) return;
    setCorrectionTarget(item);
    setCorrectionIn(localInputValue(item.attendance.checkInAt));
    setCorrectionOut(localInputValue(item.attendance.checkOutAt));
    setCorrectionReason('');
  };

  if (!tenantId || !accessToken) {
    return <section className="attendance-page"><div className="attendance-error">Attendance needs an active Verigence workspace.</div></section>;
  }

  return (
    <section className="attendance-page">
      <div className="attendance-page__head">
        <div>
          <h1>Attendance</h1>
          <p>Check in and out with fresh location evidence. Attendance operates independently from your normal Verigence work.</p>
        </div>
        <div className="attendance-date-control">
          <label>
            Reporting date
            <input
              type="date"
              min={todayDate}
              value={overviewDate}
              onChange={(event) => setOverviewDate(event.target.value)}
            />
          </label>
        </div>
      </div>

      {ownError && <div className="attendance-error">{errorMessage(ownError)} Your other Verigence workflows remain available.</div>}
      {actionNotice && <div className="attendance-notice">{actionNotice}</div>}
      {actionMutation.error && !exceptionAction && <div className="attendance-error">{errorMessage(actionMutation.error)}</div>}

      <div className="attendance-grid">
        <article className="attendance-card">
          <div className="attendance-status">
            <div>
              <h2>Today</h2>
              <p>{isCheckedIn ? `Checked in ${formatDateTime(today?.checkInAt)}` : 'Not checked in yet'}</p>
            </div>
            <span className={`attendance-status__badge${isCheckedIn ? ' attendance-status__badge--good' : ' attendance-status__badge--warn'}`}>
              {isCheckedOut ? 'Completed' : isCheckedIn ? 'Working' : 'Not checked in'}
            </span>
          </div>

          {today && (
            <p className="attendance-muted">
              Location result: {locationResultLabel(today.checkInResult)}
              {today.checkOutAt ? ` · Check out ${formatDateTime(today.checkOutAt)}` : ''}
            </p>
          )}

          <div className="attendance-actions" style={{ marginTop: 14 }}>
            {!isCheckedIn && (
              <button
                type="button"
                className="attendance-button"
                disabled={actionMutation.isPending}
                onClick={() => actionMutation.mutate({ action: 'CHECK_IN' })}
              >
                {actionMutation.isPending ? 'Capturing location…' : 'Check In'}
              </button>
            )}
            {isCheckedIn && !isCheckedOut && (
              <button
                type="button"
                className="attendance-button"
                disabled={actionMutation.isPending}
                onClick={() => actionMutation.mutate({ action: 'CHECK_OUT' })}
              >
                {actionMutation.isPending ? 'Capturing location…' : 'Check Out'}
              </button>
            )}
          </div>

          {exceptionAction && (
            <div className="attendance-exception">
              <div className="attendance-notice">Your current location is different from, or cannot be verified against, your assigned work location. Tell us why you are working from this location today. Attendance will still be recorded and flagged for later review.</div>
              <textarea
                value={exceptionReason}
                onChange={(event) => setExceptionReason(event.target.value)}
                placeholder="For example: working from home, customer visit, manager instruction"
              />
              <div className="attendance-actions">
                <button
                  type="button"
                  className="attendance-button"
                  disabled={exceptionReason.trim().length < 3 || actionMutation.isPending}
                  onClick={() => actionMutation.mutate({ action: exceptionAction, reason: exceptionReason })}
                >
                  Record attendance
                </button>
                <button type="button" className="attendance-button attendance-button--secondary" onClick={() => setExceptionAction(null)}>Cancel</button>
              </div>
            </div>
          )}
        </article>

        <article className="attendance-card">
          <h2>Working policy</h2>
          {todayQuery.data ? (
            <>
              <p>{todayQuery.data.policy.timezoneIana}</p>
              <div className="attendance-metrics">
                <div className="attendance-metric"><strong>{todayQuery.data.policy.expectedStartLocal.slice(0, 5)}</strong><span>Expected start</span></div>
                <div className="attendance-metric"><strong>{todayQuery.data.policy.expectedEndLocal.slice(0, 5)}</strong><span>Expected end</span></div>
              </div>
            </>
          ) : <p>Loading attendance policy…</p>}
        </article>

        {!overviewDenied && (
          <article className="attendance-card attendance-card--wide">
            <h2>Employee attendance</h2>
            <p>Organization-wide view is read-only for PM and Executive. HRAdmin can also correct attendance.</p>
            {overviewQuery.isLoading && <p>Loading employee attendance…</p>}
            {overviewQuery.error && <div className="attendance-error">{errorMessage(overviewQuery.error)}</div>}
            {overviewQuery.data && (
              <>
                <div className="attendance-metrics">
                  <div className="attendance-metric"><strong>{overviewQuery.data.totalEmployees}</strong><span>Employees</span></div>
                  <div className="attendance-metric"><strong>{overviewQuery.data.checkedIn}</strong><span>Checked in</span></div>
                  <div className="attendance-metric"><strong>{overviewQuery.data.checkedOut}</strong><span>Checked out</span></div>
                  <div className="attendance-metric"><strong>{overviewQuery.data.notCheckedIn}</strong><span>Not checked in</span></div>
                  <div className="attendance-metric"><strong>{overviewQuery.data.exceptions}</strong><span>Submitted for review</span></div>
                </div>
                <div className="attendance-table-wrap">
                  <table className="attendance-table">
                    <thead><tr><th>Employee</th><th>Role</th><th>Check in</th><th>Check out</th><th>Status</th><th>Location confirmed</th><th>Remarks</th>{isHrAdmin && <th>HR action</th>}</tr></thead>
                    <tbody>
                      {overviewItems.map((item) => (
                        <tr key={item.userId}>
                          <td><strong>{item.displayName}</strong>{item.primaryEmail && <div className="attendance-muted">{item.primaryEmail}</div>}</td>
                          <td>{item.roleKey || '—'}</td>
                          <td>{formatDateTime(item.attendance?.checkInAt)}</td>
                          <td>{formatDateTime(item.attendance?.checkOutAt)}</td>
                          <td>{statusLabel(item.status)}</td>
                          <td>
                            {item.checkInLocationConfirmation ? (
                              <><strong>In: {item.checkInLocationConfirmation.employeeConfirmed ? 'Yes' : 'No'}</strong><div className="attendance-muted">{item.checkInLocationConfirmation.displayAddress}</div></>
                            ) : '—'}
                            {item.checkOutLocationConfirmation && (
                              <div style={{ marginTop: 6 }}><strong>Out: {item.checkOutLocationConfirmation.employeeConfirmed ? 'Yes' : 'No'}</strong><div className="attendance-muted">{item.checkOutLocationConfirmation.displayAddress}</div></div>
                            )}
                          </td>
                          <td>
                            {item.checkInLocationConfirmation?.remarks ? <div><strong>In:</strong> {item.checkInLocationConfirmation.remarks}</div> : '—'}
                            {item.checkOutLocationConfirmation?.remarks && <div style={{ marginTop: 6 }}><strong>Out:</strong> {item.checkOutLocationConfirmation.remarks}</div>}
                          </td>
                          {isHrAdmin && <td>{item.attendance ? <button type="button" className="attendance-button attendance-button--secondary" onClick={() => openCorrection(item)}>Correct</button> : '—'}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </article>
        )}

        <article className="attendance-card attendance-card--wide">
          <h2>My recent attendance</h2>
          {historyQuery.isLoading && <p>Loading history…</p>}
          {historyQuery.data && (
            <div className="attendance-table-wrap">
              <table className="attendance-table">
                <thead><tr><th>Date</th><th>Check in</th><th>Check out</th><th>Status</th><th>Location result</th></tr></thead>
                <tbody>
                  {historyQuery.data.items.map((record) => (
                    <tr key={record.attendanceId}>
                      <td>{record.attendanceDate}</td>
                      <td>{formatDateTime(record.checkInAt)}</td>
                      <td>{formatDateTime(record.checkOutAt)}</td>
                      <td>{statusLabel(record.status)}</td>
                      <td>{locationResultLabel(record.checkInResult)}</td>
                    </tr>
                  ))}
                  {historyQuery.data.items.length === 0 && <tr><td colSpan={5}>No attendance has been recorded yet.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </article>

        {isHrAdmin && policyDraft && (
          <article className="attendance-card attendance-card--wide">
            <h2>HR attendance policy</h2>
            <p>Working hours and reminders are runtime configuration. Saving them here does not require a Web or Attendance build.</p>
            <div className="attendance-policy-grid">
              <label>Timezone<input value={policyDraft.timezoneIana} onChange={(event) => setPolicyDraft({ ...policyDraft, timezoneIana: event.target.value })} /></label>
              <label>Check-in reminder<input type="time" value={policyDraft.checkinReminderLocal.slice(0, 5)} onChange={(event) => setPolicyDraft({ ...policyDraft, checkinReminderLocal: `${event.target.value}:00` })} /></label>
              <label>Expected start<input type="time" value={policyDraft.expectedStartLocal.slice(0, 5)} onChange={(event) => setPolicyDraft({ ...policyDraft, expectedStartLocal: `${event.target.value}:00` })} /></label>
              <label>Checkout reminder<input type="time" value={policyDraft.checkoutReminderLocal.slice(0, 5)} onChange={(event) => setPolicyDraft({ ...policyDraft, checkoutReminderLocal: `${event.target.value}:00` })} /></label>
              <label>Expected end<input type="time" value={policyDraft.expectedEndLocal.slice(0, 5)} onChange={(event) => setPolicyDraft({ ...policyDraft, expectedEndLocal: `${event.target.value}:00` })} /></label>
              <label>Maximum location age (seconds)<input type="number" min={10} max={900} value={policyDraft.maxLocationAgeSeconds} onChange={(event) => setPolicyDraft({ ...policyDraft, maxLocationAgeSeconds: Number(event.target.value) })} /></label>
            </div>
            {policyMutation.error && <div className="attendance-error" style={{ marginTop: 12 }}>{errorMessage(policyMutation.error)}</div>}
            <div className="attendance-actions" style={{ marginTop: 14 }}>
              <button type="button" className="attendance-button" disabled={policyMutation.isPending} onClick={() => policyMutation.mutate(policyDraft)}>{policyMutation.isPending ? 'Saving…' : 'Save policy'}</button>
            </div>
          </article>
        )}

        {correctionTarget?.attendance && (
          <article className="attendance-card attendance-card--wide">
            <h2>Correct attendance · {correctionTarget.displayName}</h2>
            <p>Every correction requires a reason and is retained in Attendance history.</p>
            <div className="attendance-correction">
              <label>Check in<input type="datetime-local" value={correctionIn} onChange={(event) => setCorrectionIn(event.target.value)} /></label>
              <label>Check out<input type="datetime-local" value={correctionOut} onChange={(event) => setCorrectionOut(event.target.value)} /></label>
              <label style={{ gridColumn: '1 / -1' }}>Reason<input value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="Reason for correction" /></label>
            </div>
            {correctionMutation.error && <div className="attendance-error" style={{ marginTop: 12 }}>{errorMessage(correctionMutation.error)}</div>}
            <div className="attendance-actions" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="attendance-button"
                disabled={correctionReason.trim().length < 3 || correctionMutation.isPending}
                onClick={() => correctionMutation.mutate({
                  attendanceId: correctionTarget.attendance!.attendanceId,
                  body: {
                    checkInAt: correctionIn ? new Date(correctionIn).toISOString() : undefined,
                    checkOutAt: correctionOut ? new Date(correctionOut).toISOString() : undefined,
                    reason: correctionReason.trim(),
                  },
                })}
              >
                {correctionMutation.isPending ? 'Saving…' : 'Save correction'}
              </button>
              <button type="button" className="attendance-button attendance-button--secondary" onClick={() => setCorrectionTarget(null)}>Cancel</button>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}
