import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getEmployeeAttendance, type AttendanceEvent, type AttendanceException, type AttendanceSide } from '../../../services/hr/attendance';
import type { DailyRow } from '../../../services/hr/attendanceReports';
import { decideAttendance } from '../../../services/hr/approvals';
import { hrErrorMessage } from '../../../services/hr/client';
import { useSessionStore } from '../../../store/sessionStore';
import DecisionButtons from '../approvals/DecisionButtons';
import DecisionDialog from '../approvals/DecisionDialog';
import { useDecisionFlow } from '../approvals/useDecisionFlow';
import DialogShell from './DialogShell';
import { faceScoreText } from './dailyAttendance';
import { attendanceKeys, useAttendancePhoto, useObjectUrl } from './attendanceQueries';
import {
  exceptionLabel,
  exceptionStatusLabels,
  exceptionStatusTone,
  flagLabel,
  formatDistance,
  formatTimeIst,
  formatWorkDate,
} from './attendanceFormat';

function Picture({ attendanceId, event, label }: { attendanceId: string; event: AttendanceEvent; label: string }) {
  const photo = useAttendancePhoto(attendanceId, event, true);
  const url = useObjectUrl(photo.data);
  if (photo.isError) return <div className="uc01-admin-state uc01-admin-state--error" role="alert">The photo could not be loaded. {hrErrorMessage(photo.error)}</div>;
  if (!url) return <div className="uc01-admin-state">Loading the photo…</div>;
  return <img className="hr-att-photo-full hr-daily-detail__photo" src={url} alt={`${label} photo with time and place printed on it`} />;
}

function Side({ label, event, side, attendanceId, face }: { label: string; event: AttendanceEvent; side: AttendanceSide | null; attendanceId: string; face?: string | null }) {
  if (!side) return <div className="hr-att-side"><span className="hr-att-side__label">{label}</span><span className="hr-att-side__none">Not recorded</span></div>;
  const far = formatDistance(side.distanceM);
  return (
    <div className="hr-att-side">
      <span className="hr-att-side__label">{label}</span>
      <strong className="hr-att-side__time">{formatTimeIst(side.at)}</strong>
      {side.hasPhoto && <Picture attendanceId={attendanceId} event={event} label={label} />}
      {(side.outletName || far) && <span className="hr-att-side__meta">{[side.outletName, far ? `${far} from the outlet` : null].filter(Boolean).join(' · ')}</span>}
      {side.address ? <span className="hr-att-side__address">{side.address}</span> : <span className="hr-att-side__address">No address found for this location.</span>}
      {face && <span className="hr-att-side__meta">{face}</span>}
      {side.flags.length > 0 && <span className="hr-flags">{side.flags.map((f) => <span key={f} className="hr-flag">{flagLabel(f)}</span>)}</span>}
    </div>
  );
}

interface Props { row: DailyRow; onClose: () => void }

/** HR opens one person's day: the photos, where they were, what they wrote, and a decision on anything waiting. */
export default function DailyDetailDialog({ row, onClose }: Props) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const month = row.workDate.slice(0, 7);
  const listKey = attendanceKeys.employee(row.employeeId, month);
  const query = useQuery({
    queryKey: listKey,
    queryFn: () => getEmployeeAttendance(accessToken!, row.employeeId, month),
    enabled: Boolean(accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const flow = useDecisionFlow<AttendanceException>({
    listKey,
    send: async (item, decision, note) => {
      await decideAttendance(accessToken!, item.exceptionId, { decision: decision === 'APPROVE' ? 'APPROVE' : 'REJECT', ...(note ? { note } : {}) });
      void queryClient.invalidateQueries({ queryKey: ['hr', 'attendance', 'daily'] });
    },
    describe: (x) => `${row.employeeName}’s ${exceptionLabel(x.kind).toLowerCase()}`,
  });
  const day = query.data?.days.find((d) => d.workDate === row.workDate);
  const caption = `${row.employeeName}, ${formatWorkDate(row.workDate)}`;

  return (
    <DialogShell title={row.employeeName} eyebrow={`${row.employeeCode} · ${formatWorkDate(row.workDate)}`} onClose={onClose} locked={flow.busy} wide>
      {query.isLoading && <div className="uc01-admin-state">Loading…</div>}
      {query.isError && <div className="uc01-admin-state uc01-admin-state--error" role="alert"><strong>The day could not be loaded.</strong><span>{hrErrorMessage(query.error)}</span></div>}
      {query.data && !day && <div className="uc01-admin-state">No check-in was recorded on this day.</div>}
      {day && (
        <>
          <p className="hr-att-hint">Opening the photos is recorded in the history.</p>
          <div className="hr-att-day__sides">
            <Side label="Check-in" event="CHECK_IN" side={day.checkIn} attendanceId={day.attendanceId} face={faceScoreText(row.checkInFaceScore, row.checkInFaceRef)} />
            <Side label="Check-out" event="CHECK_OUT" side={day.checkOut} attendanceId={day.attendanceId} face={faceScoreText(row.checkOutFaceScore, row.checkOutFaceRef)} />
          </div>
          {flow.notice && <div className={`uc01-admin-message uc01-admin-message--${flow.notice.tone === 'success' ? 'success' : 'error'}`} role="status">{flow.notice.text}</div>}
          {day.exceptions.length > 0 && (
            <ul className="hr-att-exceptions" aria-label={`Approvals for ${caption}`}>
              {day.exceptions.map((x) => (
                <li key={x.exceptionId}>
                  <div className="hr-att-exceptions__row">
                    <span>{exceptionLabel(x.kind)}</span>
                    <span className={`uc01-admin-status uc01-admin-status--${exceptionStatusTone[x.status]}`}>{exceptionStatusLabels[x.status]}</span>
                  </div>
                  {x.reason ? <small>Reason given: {x.reason}</small> : <small>No reason given.</small>}
                  {x.decisionNote && <small>Decision note: {x.decisionNote}</small>}
                  {x.status === 'PENDING' && <DecisionButtons subject={`${caption}, ${exceptionLabel(x.kind).toLowerCase()}`} disabled={flow.busy} onDecide={(d) => flow.open(x, d)} />}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="uc01-admin-dialog__actions">
        <button type="button" className="uc01-admin-button" onClick={onClose} disabled={flow.busy}>Close</button>
      </div>
      {flow.target && (
        <DecisionDialog
          decision={flow.target.decision}
          summary={`${exceptionLabel(flow.target.item.kind)} on ${formatWorkDate(row.workDate)}, for ${row.employeeName}.`}
          busy={flow.busy}
          error={flow.error}
          onConfirm={flow.confirm}
          onCancel={flow.cancel}
        />
      )}
    </DialogShell>
  );
}
