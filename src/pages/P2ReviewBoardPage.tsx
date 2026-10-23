import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { formatUploadDay, groupByUploadDay } from '../features/uc03-p2/review/boardGrouping';
import {
  claimJourney,
  getReviewerBoard,
  releaseJourneyClaim,
  type ReviewerJourney,
  type ReviewerOutletGroup,
  type ReviewerStageSummary,
} from '../services/audit-core/uc03P2Reviewer';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

function when(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-IN');
}

/**
 * A stage reads as one of three things: nothing uploaded yet, documents on
 * file and still to review, or reviewed. The count is shown either way so a
 * document that arrived after the mark is visible rather than hidden behind
 * the tick.
 */
function Stage({ label, stage }: { label: string; stage: ReviewerStageSummary }) {
  if (stage.documentCount === 0) {
    return <span className="p2w-muted">{label}: none yet</span>;
  }
  if (stage.reviewedAtUtc) {
    return (
      <span>
        {label}: <strong>reviewed</strong>{' '}
        <span className="p2w-muted">({stage.documentCount} on file)</span>
      </span>
    );
  }
  return (
    <span>
      {label}: <strong>{stage.documentCount}</strong>{' '}
      <span className="p2w-muted">to review</span>
    </span>
  );
}

function JourneyRow({
  journey,
  onClaim,
  onRelease,
  busy,
}: {
  journey: ReviewerJourney;
  onClaim: (journeyId: string) => void;
  onRelease: (journeyId: string) => void;
  busy: boolean;
}) {
  const claimedBySomeoneElse = Boolean(journey.claimedByActorId) && !journey.claimedByMe;
  return (
    <tr>
      <td>
        <Link to={`/p2/journeys/${journey.journeyId}/documents`}>
          <strong>{journey.journeyReference || journey.journeyId}</strong>
        </Link>
        <div className="p2w-muted">{journey.customerName || '—'}</div>
      </td>
      <td>{journey.pcName || '—'}</td>
      <td>{when(journey.createdAtUtc)}</td>
      <td>
        <div><Stage label="Booking" stage={journey.booking} /></div>
        <div><Stage label="Delivery" stage={journey.delivery} /></div>
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        {journey.claimedByMe ? (
          <>
            <strong>You</strong>
            {' · '}
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={() => onRelease(journey.journeyId)}
            >
              Release
            </button>
          </>
        ) : claimedBySomeoneElse ? (
          <>
            <span className="p2w-muted">{journey.claimedByActorId}</span>
            {' · '}
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={() => onClaim(journey.journeyId)}
            >
              Take over
            </button>
          </>
        ) : (
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() => onClaim(journey.journeyId)}
          >
            Claim
          </button>
        )}
      </td>
    </tr>
  );
}

function OutletBlock({
  group,
  onClaim,
  onRelease,
  busyId,
}: {
  group: ReviewerOutletGroup;
  onClaim: (journeyId: string) => void;
  onRelease: (journeyId: string) => void;
  busyId: string | null;
}) {
  return (
    <SectionCard>
      <div className="p2w-card__title">
        <h3>{group.outletName || group.outletId}</h3>
        <p className="p2w-muted">
          {group.dealerName || '—'}
          {group.outletCode ? ` · ${group.outletCode}` : ''} · {group.journeys.length}{' '}
          {group.journeys.length === 1 ? 'journey' : 'journeys'}
        </p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="p2w-table">
          <thead>
            <tr>
              <th>Journey</th>
              <th>PC</th>
              <th>Uploaded</th>
              <th>Documents</th>
              <th>Claim</th>
            </tr>
          </thead>
          {groupByUploadDay(group.journeys).map((day) => (
            <tbody key={day.uploadDate || 'undated'}>
              <tr>
                <th colSpan={5} scope="colgroup" style={{ textAlign: 'left' }}>
                  {formatUploadDay(day.uploadDate)}{' '}
                  <span className="p2w-muted">
                    · {day.journeys.length} {day.journeys.length === 1 ? 'journey' : 'journeys'}
                  </span>
                </th>
              </tr>
              {day.journeys.map((journey) => (
                <JourneyRow
                  key={journey.journeyId}
                  journey={journey}
                  onClaim={onClaim}
                  onRelease={onRelease}
                  busy={busyId === journey.journeyId}
                />
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </SectionCard>
  );
}

/**
 * The Reviewer's board: every journey in the outlets they are mapped to,
 * split by dealership and outlet.
 *
 * Open journeys are the default because they are the day's work; closed ones
 * stay reachable but are asked for separately. A claim shows who is on a
 * journey and nothing more -- it does not gate the review, so a claim nobody
 * releases cannot lock anyone out.
 */
export default function P2ReviewBoardPage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [state, setState] = useState<'open' | 'closed'>('open');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  // Outlet and upload-date pickers: a Reviewer works one outlet and one day (or
  // a range of days) at a time, oldest first (product owner 2026-10-23).
  const [outletId, setOutletId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const rangeReversed = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const filtered = Boolean(outletId || dateFrom || dateTo);

  const query = useQuery({
    queryKey: ['p2-reviewer-board', tenantId, state, outletId, dateFrom, dateTo],
    queryFn: () => getReviewerBoard(tenantId!, state, accessToken, { outletId, dateFrom, dateTo }),
    enabled: Boolean(tenantId && accessToken) && !rangeReversed,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  const claim = useMutation({
    mutationFn: (journeyId: string) => claimJourney(tenantId!, journeyId, accessToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['p2-reviewer-board'] }),
    onError: () => setProblem('That journey could not be claimed.'),
    onSettled: () => setBusyId(null),
  });

  const release = useMutation({
    mutationFn: (journeyId: string) => releaseJourneyClaim(tenantId!, journeyId, accessToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['p2-reviewer-board'] }),
    onError: () => setProblem('That claim could not be released.'),
    onSettled: () => setBusyId(null),
  });

  const outlets = query.data?.outlets ?? [];

  return (
    <div className="screen-stack p2w">
      <PageHeader
        eyebrow="DealGuard"
        title="Document Review"
        description="Every journey in the outlets you cover. Open a journey to read its documents, correct what was extracted wrongly, and mark each stage reviewed."
      />

      <SectionCard>
        <div className="p2w-row" style={{ gap: 12, alignItems: 'center' }}>
          <button
            type="button"
            className={state === 'open' ? 'uc02-button uc02-button--primary' : 'uc02-button'}
            onClick={() => setState('open')}
          >
            Open
          </button>
          <button
            type="button"
            className={state === 'closed' ? 'uc02-button uc02-button--primary' : 'uc02-button'}
            onClick={() => setState('closed')}
          >
            Closed
          </button>
          {query.data && (
            <span className="p2w-muted">
              {query.data.journeyCount} {query.data.journeyCount === 1 ? 'journey' : 'journeys'} across{' '}
              {outlets.length} {outlets.length === 1 ? 'outlet' : 'outlets'}
              {query.data.totalMatching && query.data.totalMatching > query.data.journeyCount
                ? ` (showing the first ${query.data.journeyCount} of ${query.data.totalMatching}; narrow by outlet or date to see the rest)`
                : ''}
            </span>
          )}
        </div>
        <div className="p2w-row" style={{ gap: 12, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <label>
            <span className="p2w-muted">Outlet </span>
            <select value={outletId} onChange={(event) => setOutletId(event.target.value)}>
              <option value="">All outlets</option>
              {(query.data?.outletOptions ?? []).map((option) => (
                <option key={option.outletId} value={option.outletId}>
                  {option.outletName || option.outletCode || option.outletId} ({option.journeyCount})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="p2w-muted">Uploaded from </span>
            <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
          <label>
            <span className="p2w-muted">to </span>
            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} />
          </label>
          {filtered && (
            <button type="button" className="text-link" onClick={() => { setOutletId(''); setDateFrom(''); setDateTo(''); }}>
              Clear filters
            </button>
          )}
        </div>
        {rangeReversed && (
          <div className="form-alert form-alert--error" style={{ marginTop: 8 }}>
            The “from” date is after the “to” date.
          </div>
        )}
        {problem && <div className="form-alert form-alert--error" style={{ marginTop: 8 }}>{problem}</div>}
      </SectionCard>

      {query.isLoading && <SectionCard><p>Reading your outlets…</p></SectionCard>}
      {query.isError && (
        <SectionCard>
          <div className="form-alert form-alert--error">Your journeys could not be read.</div>
        </SectionCard>
      )}
      {query.data && outlets.length === 0 && (
        <SectionCard>
          <strong>Nothing {state === 'open' ? 'open' : 'closed'} right now</strong>
          <p className="p2w-muted">
            {filtered
              ? `No ${state} journeys match this outlet and date.`
              : state === 'open'
                ? 'No open journeys in the outlets you are mapped to.'
                : 'No closed journeys in the outlets you are mapped to.'}
          </p>
        </SectionCard>
      )}

      {outlets.map((group) => (
        <OutletBlock
          key={`${group.dealerId}:${group.outletId}`}
          group={group}
          busyId={busyId}
          onClaim={(journeyId) => {
            setProblem('');
            setBusyId(journeyId);
            claim.mutate(journeyId);
          }}
          onRelease={(journeyId) => {
            setProblem('');
            setBusyId(journeyId);
            release.mutate(journeyId);
          }}
        />
      ))}
    </div>
  );
}
