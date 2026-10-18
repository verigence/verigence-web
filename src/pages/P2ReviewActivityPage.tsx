import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import {
  getReviewerActivity,
  type ReviewerActivityBucket,
} from '../services/audit-core/uc03P2Reviewer';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

function bucketLabel(bucket: string, period: 'day' | 'week') {
  const parsed = new Date(`${bucket}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return bucket;
  const date = parsed.toLocaleDateString('en-IN', {
    weekday: period === 'day' ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
  });
  return period === 'week' ? `Week of ${date}` : date;
}

function Bucket({ bucket, period }: { bucket: ReviewerActivityBucket; period: 'day' | 'week' }) {
  const total = bucket.bookingReviewed + bucket.deliveryReviewed;
  return (
    <SectionCard>
      <div className="p2w-card__title">
        <h3>{bucketLabel(bucket.bucket, period)}</h3>
        <p className="p2w-muted">
          {total} {total === 1 ? 'stage' : 'stages'} marked reviewed
          {bucket.journeys ? ` across ${bucket.journeys} ${bucket.journeys === 1 ? 'journey' : 'journeys'}` : ''}
          {bucket.fieldChanges ? ` · ${bucket.fieldChanges} field ${bucket.fieldChanges === 1 ? 'change' : 'changes'}` : ''}
        </p>
      </div>
      <div className="p2w-row" style={{ gap: 24, marginBottom: 8 }}>
        <span>Booking: <strong>{bucket.bookingReviewed}</strong></span>
        <span>Delivery: <strong>{bucket.deliveryReviewed}</strong></span>
      </div>
      {bucket.outlets.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="p2w-table">
            <thead>
              <tr>
                <th>Outlet</th>
                <th>Dealership</th>
                <th>Stage</th>
                <th>Marked</th>
                <th>Journeys</th>
              </tr>
            </thead>
            <tbody>
              {bucket.outlets.map((row, index) => (
                <tr key={`${row.outletId}:${row.stageCode}:${index}`}>
                  <td>{row.outletName || row.outletId}</td>
                  <td>{row.dealerName || '—'}</td>
                  <td>{row.stageCode === 'BOOKING' ? 'Booking' : 'Delivery'}</td>
                  <td>{row.marks}</td>
                  <td>{row.journeys}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

/**
 * What a Reviewer got through, by day or by week, split by outlet.
 *
 * The buckets are cut on the project's own timezone rather than UTC, because
 * India runs UTC+05:30 and a day counted in UTC would push an evening's work
 * into the day before. Weeks start on Monday. A stage is counted once: the
 * reviewed marks are immutable, so yesterday's figure cannot move.
 */
export default function P2ReviewActivityPage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const [period, setPeriod] = useState<'day' | 'week'>('day');

  const query = useQuery({
    queryKey: ['p2-reviewer-activity', tenantId, period],
    queryFn: () => getReviewerActivity(tenantId!, period, accessToken),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 60_000,
  });

  const buckets = query.data?.buckets ?? [];

  return (
    <div className="screen-stack p2w">
      <PageHeader
        eyebrow="DealGuard"
        title="Review Activity"
        description="Stages you marked reviewed, and values you corrected, by day and by week."
      />

      <SectionCard>
        <div className="p2w-row" style={{ gap: 12, alignItems: 'center' }}>
          <button
            type="button"
            className={period === 'day' ? 'uc02-button uc02-button--primary' : 'uc02-button'}
            onClick={() => setPeriod('day')}
          >
            Daily
          </button>
          <button
            type="button"
            className={period === 'week' ? 'uc02-button uc02-button--primary' : 'uc02-button'}
            onClick={() => setPeriod('week')}
          >
            Weekly
          </button>
          {query.data && (
            <span className="p2w-muted">
              Days and weeks are counted in {query.data.timezone}; weeks start on Monday.
            </span>
          )}
        </div>
      </SectionCard>

      {query.isLoading && <SectionCard><p>Counting…</p></SectionCard>}
      {query.isError && (
        <SectionCard>
          <div className="form-alert form-alert--error">Your activity could not be read.</div>
        </SectionCard>
      )}
      {query.data && buckets.length === 0 && (
        <SectionCard>
          <strong>Nothing recorded yet</strong>
          <p className="p2w-muted">
            Marking a stage&apos;s documents reviewed, or correcting an extracted value, will show up here.
          </p>
        </SectionCard>
      )}

      {buckets.map((bucket) => (
        <Bucket key={bucket.bucket} bucket={bucket} period={period} />
      ))}
    </div>
  );
}
