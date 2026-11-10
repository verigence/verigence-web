import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { cancelCorrection, listMyCorrections } from '../../../services/hr/attendanceCalendar';
import { hrErrorMessage } from '../../../services/hr/client';
import { useSessionStore } from '../../../store/sessionStore';
import { attendanceKeys } from './attendanceQueries';
import { formatTimeIst, formatWorkDate } from './attendanceFormat';
import { correctionKindLabels, correctionLabels } from './calendarFormat';

const tone: Record<string, string> = { PENDING: 'warm-gray', APPROVED: 'green', REJECTED: 'red', CANCELLED: 'cool-gray' };

/** The employee's own correction requests, newest day first; a waiting one can be withdrawn. */
export default function MyCorrections() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const client = useQueryClient();
  const list = useQuery({
    queryKey: attendanceKeys.corrections,
    queryFn: () => listMyCorrections(accessToken!),
    enabled: Boolean(accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => cancelCorrection(accessToken!, id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: attendanceKeys.corrections });
      void client.invalidateQueries({ queryKey: ['hr', 'attendance', 'calendar'] });
    },
  });

  if (list.isLoading) return <div className="uc01-admin-state">Loading your requests…</div>;
  if (list.isError) {
    return (
      <div className="uc01-admin-state uc01-admin-state--error" role="alert">
        <strong>Your requests could not be loaded.</strong>
        <span>{hrErrorMessage(list.error)}</span>
      </div>
    );
  }
  const items = list.data ?? [];
  if (items.length === 0) {
    return <p className="hr-att-hint">No correction requests. Pick a day on the calendar to ask for one.</p>;
  }
  return (
    <>
      {withdraw.isError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{hrErrorMessage(withdraw.error)}</div>}
      <ul className="hr-cal-requests">
        {items.map((c) => (
          <li key={c.correctionId}>
            <div>
              <strong>{formatWorkDate(c.workDate)}</strong>
              <small>
                {correctionKindLabels[c.requested]}
                {c.requested === 'CHECK_OUT' && c.checkOutAt ? ` at ${formatTimeIst(c.checkOutAt)}` : ''} · {c.reason}
              </small>
              {c.decisionNote && <small>Note: {c.decisionNote}</small>}
            </div>
            <span className={`hr-tag hr-tag--${tone[c.status]}`}>{correctionLabels[c.status]}</span>
            {c.status === 'PENDING' && (
              <button
                type="button"
                className="uc01-admin-button uc01-admin-button--compact"
                onClick={() => withdraw.mutate(c.correctionId)}
                disabled={withdraw.isPending}
              >
                Withdraw
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
