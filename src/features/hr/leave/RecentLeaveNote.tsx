import { useQuery } from '@tanstack/react-query';

import { getMyRecentLeave } from '../../../services/hr/leave';
import { useSessionStore } from '../../../store/sessionStore';
import { recentLeaveText } from './leaveLogic';
import { leaveKeys } from './leaveQueries';

/**
 * While applying: the paid and unpaid leave approved in the 6 weeks before the chosen from date,
 * as the approver will see it with the request (product owner, 7 Nov 2026). Silent if it cannot be
 * loaded; the request does not depend on it.
 */
export default function RecentLeaveNote({ fromDate }: { fromDate: string }) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(fromDate);
  const query = useQuery({
    queryKey: leaveKeys.recent(fromDate),
    queryFn: () => getMyRecentLeave(accessToken!, fromDate),
    enabled: Boolean(accessToken) && valid,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
  if (!valid || !query.data) return null;
  return (
    <p className="hr-field__hint" role="note">
      {recentLeaveText(query.data)} Your approver sees this with your request.
    </p>
  );
}
