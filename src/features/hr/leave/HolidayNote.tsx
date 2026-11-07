import { useQuery } from '@tanstack/react-query';

import { getHolidays } from '../../../services/hr/leave';
import { useSessionStore } from '../../../store/sessionStore';
import { formatDate } from '../hrLabels';
import { dayPartWords, holidayNoteParts } from './leaveLogic';
import { leaveKeys } from './leaveQueries';

interface Props {
  fromDate: string;
  toDate: string;
  /** Half-day leave chosen: says so when the date is already a half-day holiday. */
  halfDay?: boolean;
}

/**
 * Says which holidays fall inside the chosen dates. The service lists only the holidays that apply
 * to this person (company-wide, or for their project or outlet). Declared full days are not counted
 * as leave days, a declared half-day holiday counts half, and tentative ones are only proposals, so
 * they still count until HR declares them. If the holiday list cannot be loaded this stays silent:
 * the server decides the days either way.
 */
export default function HolidayNote({ fromDate, toDate, halfDay = false }: Props) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const year = Number(fromDate.slice(0, 4));
  const valid = Number.isInteger(year) && year >= 2020 && year <= 2100;
  const query = useQuery({
    queryKey: leaveKeys.holidays(year),
    queryFn: () => getHolidays(accessToken!, year),
    enabled: Boolean(accessToken) && valid,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });
  if (!valid || !query.data) return null;
  const { full, half, tentative, halfDayClash } = holidayNoteParts(query.data.items, fromDate, toDate, halfDay);
  if (full.length + half.length + tentative.length === 0) return null;
  const named = (h: { date: string; name: string; dayPart?: 'FULL_DAY' | 'MORNING' | 'AFTERNOON' }) => {
    const part = dayPartWords(h.dayPart);
    return `${formatDate(h.date)} ${h.name}${part ? ` (${part})` : ''}`;
  };
  return (
    <div className="hr-leave-holidays" role="note">
      {full.length > 0 && (
        <p>
          <strong>Holidays in these dates (not counted as leave):</strong> {full.map(named).join(', ')}.
        </p>
      )}
      {half.length > 0 && (
        <p>
          <strong>Half-day holidays in these dates (a day of leave counts half):</strong> {half.map(named).join(', ')}.
        </p>
      )}
      {halfDayClash && (
        <p className="hr-leave-holidays__tentative">
          <strong>Half-day leave is not possible on {formatDate(halfDayClash.date)}:</strong> the {dayPartWords(halfDayClash.dayPart).replace(' off', '')} is
          already a holiday. Apply for a full day instead; it counts as half a day of leave.
        </p>
      )}
      {tentative.length > 0 && (
        <p className="hr-leave-holidays__tentative">
          <strong>Tentative holidays (not final):</strong> {tentative.map(named).join(', ')}.{' '}
          {query.data.note} Until HR declares them they count as working days.
        </p>
      )}
    </div>
  );
}
