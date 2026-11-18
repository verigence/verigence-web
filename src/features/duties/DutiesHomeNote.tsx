import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { getMyDay } from '../../services/audit-core/duties';
import { dutiesKeys } from './useMyDuties';

/**
 * PC Home: how today's duties stand in this dealership, with the way to the list on the Attendance
 * screen (product owner 2026-11-18). Says nothing when duties are off, all done, or cannot be read.
 */
export default function DutiesHomeNote({ tenantId, accessToken }: { tenantId: string; accessToken?: string }) {
  const day = useQuery({
    queryKey: dutiesKeys.myDay(tenantId),
    queryFn: () => getMyDay(tenantId, accessToken),
    enabled: Boolean(tenantId && accessToken),
    retry: false,
    staleTime: 30_000,
  });
  const counts = day.data?.enabled && day.data.applies ? day.data.counts : undefined;
  if (!counts || counts.total === 0) return null;
  const left = counts.pending;
  return (
    <div className={`p2w-alert${left ? '' : ' p2w-alert--success'}`} role="status">
      {left
        ? `My duties today: ${left} of ${counts.total} still to do${counts.mandatoryPending ? ` (${counts.mandatoryPending} mandatory)` : ''}.`
        : `My duties today: all ${counts.total} done.`}
      {' '}<Link to="/hr/attendance">Open my duties</Link>
    </div>
  );
}
