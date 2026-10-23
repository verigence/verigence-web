import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { formatUploadDay, groupByPc, groupByUploadDay, pcCounts } from '../features/uc03-p2/review/boardGrouping';
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
  groupBy,
  onClaim,
  onRelease,
  busyId,
}: {
  group: ReviewerOutletGroup;
  groupBy: GroupBy;
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
          {(groupBy === 'PC'
            ? groupByPc(group.journeys).map((g) => ({ key: `pc:${g.pcName}`, label: g.pcName || 'PC not recorded', journeys: g.journeys }))
            : groupByUploadDay(group.journeys).map((g) => ({ key: g.uploadDate || 'undated', label: formatUploadDay(g.uploadDate), journeys: g.journeys }))
          ).map((day) => (
            <tbody key={day.key}>
              <tr>
                <th colSpan={5} scope="colgroup" style={{ textAlign: 'left' }}>
                  {day.label}{' '}
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

type GroupBy = 'DAY' | 'PC';

/**
 * The Reviewer's board: every journey in the outlets they are mapped to,
 * split by dealership and outlet, then by upload day or by PC.
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
  // Dealership and PC narrow what was read (product owner 2026-10-23: by
  // dealership, outlet, date and PC). Both apply to the rows the board returned;
  // the outlet and date pickers are the ones sent to the server.
  const [dealerId, setDealerId] = useState('');
  const [pcName, setPcName] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('DAY');
  const rangeReversed = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const filtered = Boolean(outletId || dateFrom || dateTo || dealerId || pcName !== null);

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

  const allOutlets = query.data?.outlets ?? [];
  const outletOptions = query.data?.outletOptions ?? [];
  const dealerOptions = useMemo(() => {
    const seen = new Map<string, { dealerId: string; dealerName: string; journeyCount: number }>();
    for (const option of outletOptions) {
      const entry = seen.get(option.dealerId) ?? { dealerId: option.dealerId, dealerName: option.dealerName || option.dealerId, journeyCount: 0 };
      entry.journeyCount += option.journeyCount;
      seen.set(option.dealerId, entry);
    }
    return [...seen.values()].sort((a, b) => a.dealerName.localeCompare(b.dealerName));
  }, [outletOptions]);
  const inDealer = useMemo(
    () => allOutlets.filter((group) => !dealerId || group.dealerId === dealerId),
    [allOutlets, dealerId],
  );
  const pcOptions = useMemo(() => pcCounts(inDealer.flatMap((group) => group.journeys)), [inDealer]);
  const outlets = useMemo(
    () => inDealer
      .map((group) => ({
        ...group,
        journeys: pcName === null ? group.journeys : group.journeys.filter((j) => (j.pcName ?? '').trim() === pcName),
      }))
      .filter((group) => group.journeys.length > 0),
    [inDealer, pcName],
  );
  const dealerSections = useMemo(() => {
    const sections: Array<{ dealerId: string; dealerName: string; outlets: ReviewerOutletGroup[] }> = [];
    for (const group of outlets) {
      const last = sections.find((section) => section.dealerId === group.dealerId);
      if (last) last.outlets.push(group);
      else sections.push({ dealerId: group.dealerId, dealerName: group.dealerName || group.dealerId, outlets: [group] });
    }
    return sections;
  }, [outlets]);
  const shownJourneys = outlets.reduce((sum, group) => sum + group.journeys.length, 0);

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
              {dealerId || pcName !== null
                ? `${shownJourneys} of ${query.data.journeyCount} ${query.data.journeyCount === 1 ? 'journey' : 'journeys'}`
                : `${query.data.journeyCount} ${query.data.journeyCount === 1 ? 'journey' : 'journeys'}`} across{' '}
              {outlets.length} {outlets.length === 1 ? 'outlet' : 'outlets'}
              {query.data.totalMatching && query.data.totalMatching > query.data.journeyCount
                ? ` (showing the first ${query.data.journeyCount} of ${query.data.totalMatching}; narrow by outlet or date to see the rest)`
                : ''}
            </span>
          )}
        </div>
        <div className="p2w-row" style={{ gap: 12, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          {dealerOptions.length > 1 && (
            <label>
              <span className="p2w-muted">Dealership </span>
              <select
                value={dealerId}
                onChange={(event) => {
                  setDealerId(event.target.value);
                  // An outlet of another dealership would leave the board empty.
                  const kept = outletOptions.find((o) => o.outletId === outletId);
                  if (event.target.value && kept && kept.dealerId !== event.target.value) setOutletId('');
                }}
              >
                <option value="">All dealerships</option>
                {dealerOptions.map((option) => (
                  <option key={option.dealerId} value={option.dealerId}>
                    {option.dealerName} ({option.journeyCount})
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span className="p2w-muted">Outlet </span>
            <select value={outletId} onChange={(event) => setOutletId(event.target.value)}>
              <option value="">All outlets</option>
              {outletOptions.filter((option) => !dealerId || option.dealerId === dealerId).map((option) => (
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
          <label>
            <span className="p2w-muted">PC </span>
            <select
              value={pcName === null ? '*' : pcName}
              onChange={(event) => setPcName(event.target.value === '*' ? null : event.target.value)}
            >
              <option value="*">All PCs</option>
              {pcOptions.map((option) => (
                <option key={option.pcName || 'none'} value={option.pcName}>
                  {option.pcName || 'PC not recorded'} ({option.count})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="p2w-muted">Group by </span>
            <select value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupBy)}>
              <option value="DAY">Upload day</option>
              <option value="PC">PC</option>
            </select>
          </label>
          {filtered && (
            <button
              type="button"
              className="text-link"
              onClick={() => { setOutletId(''); setDateFrom(''); setDateTo(''); setDealerId(''); setPcName(null); }}
            >
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
      {query.data && allOutlets.length === 0 && (
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

      {query.data && allOutlets.length > 0 && outlets.length === 0 && (
        <SectionCard>
          <strong>No journeys match</strong>
          <p className="p2w-muted">Nothing in what was read matches this dealership and PC.</p>
        </SectionCard>
      )}

      {dealerSections.map((section) => (
        <div key={section.dealerId} className="screen-stack">
          {dealerSections.length > 1 && (
            <h2 className="p2w-section-title" style={{ margin: '8px 0 0' }}>
              {section.dealerName}{' '}
              <span className="p2w-muted" style={{ fontSize: '.85rem', fontWeight: 400 }}>
                · {section.outlets.length} {section.outlets.length === 1 ? 'outlet' : 'outlets'}
              </span>
            </h2>
          )}
          {section.outlets.map((group) => (
        <OutletBlock
          key={`${group.dealerId}:${group.outletId}`}
          group={group}
          groupBy={groupBy}
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
      ))}
    </div>
  );
}
