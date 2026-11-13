import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { getP2DailyProcessingReport } from '../../../services/audit-core/uc03P2';
import { DeliveryFilesClosedCard, WorkDoneCard } from './DailyProcessingSections';

/**
 * One day's work done on tasks and delivery files closed (product owner 2026-11-13: the two pieces of
 * the Daily processing tab he keeps). Reads only those two from Audit Core (?part=work): the uploads,
 * files, task status and failures of the full report are Performance's now.
 */
export default function DailyWorkReport({ tenantId, accessToken, day, fallbackTimezone }: {
  tenantId: string; accessToken: string | undefined; day: string; fallbackTimezone?: string | null;
}) {
  const report = useQuery({
    queryKey: ['p2-daily-work', tenantId, day],
    queryFn: () => getP2DailyProcessingReport(tenantId, day, accessToken, 'work'),
    enabled: Boolean(tenantId && accessToken && day),
    staleTime: 60_000,
  });
  const data = report.data;
  const timezone = data?.timezone || fallbackTimezone || 'Asia/Kolkata';

  if (report.isLoading) return <SectionCard><p className="p2w-muted">Loading…</p></SectionCard>;
  if (report.isError) {
    return (
      <div className="p2w-alert p2w-alert--error" role="alert">
        {report.error instanceof Error ? report.error.message : 'The day could not be loaded.'}{' '}
        <button type="button" className="p2w-button p2w-button--ghost" onClick={() => report.refetch()}>Try again</button>
      </div>
    );
  }
  if (!data) return null;
  return (
    <div className="screen-stack p2dr">
      {data.teamWork ? <WorkDoneCard work={data.teamWork} day={data.day} timezone={timezone} /> : null}
      {data.deliveryFilesClosed ? <DeliveryFilesClosedCard closed={data.deliveryFilesClosed} day={data.day} timezone={timezone} /> : null}
      <SectionCard>
        <details>
          <summary><strong>How these are counted</strong></summary>
          <ul className="p2dr-notes">
            {data.notes.map((note) => <li key={note}>{note}</li>)}
            <li>Times are in {timezone}.</li>
          </ul>
        </details>
      </SectionCard>
    </div>
  );
}
