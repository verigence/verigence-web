import type { UseQueryResult } from '@tanstack/react-query';

import type { AttendanceMonth } from '../../../services/hr/attendance';
import { hrErrorMessage } from '../../../services/hr/client';
import DayList from './DayList';
import { formatMonth } from './attendanceFormat';

interface Props {
  month: string;
  query: UseQueryResult<AttendanceMonth>;
  viewer: 'self' | 'other';
}

/** A month of days with its loading, error and empty states. */
export default function MonthPanel({ month, query, viewer }: Props) {
  if (query.isLoading) return <div className="uc01-admin-state">Loading attendance…</div>;
  if (query.isError) {
    return (
      <div className="uc01-admin-state uc01-admin-state--error" role="alert">
        <strong>Attendance could not be loaded.</strong>
        <span>{hrErrorMessage(query.error)}</span>
        <button type="button" className="uc01-admin-button" onClick={() => query.refetch()}>Try again</button>
      </div>
    );
  }
  return <DayList days={query.data?.days ?? []} viewer={viewer} monthLabel={formatMonth(month)} />;
}
