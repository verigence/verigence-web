import { useQuery } from '@tanstack/react-query';

import { getHolidays } from '../../../services/hr/leave';
import { useSessionStore } from '../../../store/sessionStore';
import { formatDate } from '../hrLabels';
import { leaveKeys } from './leaveQueries';

interface Props {
  fromDate: string;
  toDate: string;
}

/**
 * Says which holidays fall inside the chosen dates. Declared ones are not counted as leave days;
 * tentative ones are only proposals, so they still count until HR declares them. If the holiday
 * list cannot be loaded this stays silent: the server decides the days either way.
 */
export default function HolidayNote({ fromDate, toDate }: Props) {
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
  const end = toDate && toDate >= fromDate ? toDate : fromDate;
  const inside = query.data.items.filter((h) => h.date >= fromDate && h.date <= end);
  const declared = inside.filter((h) => h.status === 'DECLARED');
  const tentative = inside.filter((h) => h.status === 'TENTATIVE');
  if (inside.length === 0) return null;
  return (
    <div className="hr-leave-holidays" role="note">
      {declared.length > 0 && (
        <p>
          <strong>Holidays in these dates (not counted as leave):</strong>{' '}
          {declared.map((h) => `${formatDate(h.date)} ${h.name}`).join(', ')}.
        </p>
      )}
      {tentative.length > 0 && (
        <p className="hr-leave-holidays__tentative">
          <strong>Tentative holidays (not final):</strong>{' '}
          {tentative.map((h) => `${formatDate(h.date)} ${h.name}`).join(', ')}.{' '}
          {query.data.note} Until HR declares them they count as working days.
        </p>
      )}
    </div>
  );
}
