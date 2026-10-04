import { useQuery } from '@tanstack/react-query';

import { getUserProjectAssignments } from '../../services/audit-core/userProjectAssignments';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/**
 * In Role Mapping: a person already tagged to another project is flagged, and where they worked before is
 * listed. Informational only; mapping is never blocked. It shows nothing when the lookup is not allowed
 * (only SuperAdmin may read it) or fails, so the editor works exactly as before.
 */
export default function OtherProjectsNotice({ userId, tenantId, accessToken }: { userId: string; tenantId: string | null; accessToken?: string }) {
  const lookup = useQuery({
    queryKey: ['other-projects', userId],
    queryFn: () => getUserProjectAssignments(userId, accessToken),
    enabled: Boolean(userId && accessToken),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
  const elsewhere = (lookup.data?.assignments ?? []).filter((line) => line.tenantId !== tenantId);
  const now = elsewhere.filter((line) => line.current);
  const before = elsewhere.filter((line) => !line.current);
  if (now.length === 0 && before.length === 0) return null;
  const where = (line: (typeof elsewhere)[number]) =>
    `${line.projectName} · ${line.roleCode}${line.outletName ? ` · ${line.outletName}` : ''}`;
  return (
    <div className="uc02-scope" aria-live="polite">
      {now.length > 0 && (
        <div className="uc02-note" role="status" style={{ borderColor: '#f79009' }}>
          <strong>Already tagged to another project</strong>
          {now.map((line, index) => (
            <div key={`now-${index}`}>{where(line)} · since {day(line.since)}</div>
          ))}
          <small>You can still map this person here. Check that they are meant to work on both.</small>
        </div>
      )}
      {before.length > 0 && (
        <small>
          Worked before:{' '}
          {before.map((line) => `${where(line)} (${day(line.since)}${line.until ? ` – ${day(line.until)}` : ''})`).join('; ')}
        </small>
      )}
    </div>
  );
}
