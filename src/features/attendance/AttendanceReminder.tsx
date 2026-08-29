import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { getTodayAttendance } from '../../services/attendance/client';
import { useProjectContextStore } from '../../store/projectContextStore';
import { useSessionStore } from '../../store/sessionStore';
import './attendance.css';

function formatTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
}

export default function AttendanceReminder() {
  const navigate = useNavigate();
  const selectedProject = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const tenantId = selectedProject?.tenantId;

  const query = useQuery({
    queryKey: ['attendance', 'today', tenantId],
    queryFn: () => getTodayAttendance(tenantId!, accessToken!),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (!query.data) return null;

  const attendance = query.data.attendance;
  let title = 'Attendance';
  let detail = 'Open attendance';
  let tone = '';

  if (query.data.reminder === 'CHECK_IN') {
    title = 'Check in reminder';
    detail = 'You have not checked in today';
    tone = ' attendance-shell-entry--reminder';
  } else if (query.data.reminder === 'CHECK_OUT') {
    title = 'Check out reminder';
    detail = attendance ? `Checked in ${formatTime(attendance.checkInAt)}` : 'Please complete attendance';
    tone = ' attendance-shell-entry--reminder';
  } else if (attendance?.checkOutAt) {
    title = 'Attendance complete';
    detail = `${formatTime(attendance.checkInAt)} – ${formatTime(attendance.checkOutAt)}`;
    tone = ' attendance-shell-entry--active';
  } else if (attendance) {
    title = 'Checked in';
    detail = `Since ${formatTime(attendance.checkInAt)}`;
    tone = ' attendance-shell-entry--active';
  }

  return (
    <button
      type="button"
      className={`attendance-shell-entry${tone}`}
      onClick={() => navigate('/attendance')}
      aria-label={`${title}. ${detail}. Open attendance.`}
    >
      <span className="attendance-shell-entry__dot" aria-hidden="true" />
      <span className="attendance-shell-entry__copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
    </button>
  );
}
