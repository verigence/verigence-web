import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getJourneyReviewState,
  markStageDocumentsReviewed,
  type StageReviewState,
} from '../../../services/audit-core/uc03P2Reviewer';

const STAGE_LABELS: Record<'BOOKING' | 'DELIVERY', string> = {
  BOOKING: 'Booking documents',
  DELIVERY: 'Delivery documents',
};

function when(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-IN');
}

/**
 * One stage's line: reviewed, ready to mark, or how many documents are still
 * unopened.
 *
 * The outstanding count is the honest state even after the mark is set, so a
 * document that arrived later is visible instead of hidden behind the tick.
 */
function Stage({
  stageCode,
  state,
  onMark,
  busy,
}: {
  stageCode: 'BOOKING' | 'DELIVERY';
  state: StageReviewState;
  onMark: (stageCode: 'BOOKING' | 'DELIVERY') => void;
  busy: boolean;
}) {
  const { review, gate, canMarkReviewed } = state;
  const outstanding = gate.outstanding.length;

  return (
    <div className="p2w-review__stage">
      <div>
        <strong>{STAGE_LABELS[stageCode]}</strong>
        {review ? (
          <div className="p2w-muted">
            Reviewed {when(review.reviewedAtUtc)} · {review.documentCount}{' '}
            {review.documentCount === 1 ? 'document' : 'documents'} covered
          </div>
        ) : gate.reason === 'NO_DOCUMENTS' ? (
          <div className="p2w-muted">Nothing uploaded on this stage yet.</div>
        ) : (
          <div className="p2w-muted">
            {gate.openedCount} of {gate.documentCount} opened
            {outstanding > 0 ? ` · ${outstanding} still to open` : ''}
          </div>
        )}
        {!review && gate.documentCount > outstanding && outstanding > 0 && (
          <div className="p2w-muted">
            Open each remaining document to be able to mark this stage reviewed.
          </div>
        )}
      </div>
      <div>
        {review ? (
          <span className="p2w-pill p2w-pill--ok">Reviewed</span>
        ) : (
          <button
            type="button"
            className="uc02-button uc02-button--primary"
            disabled={!canMarkReviewed || busy}
            onClick={() => onMark(stageCode)}
          >
            {busy ? 'Marking…' : 'Mark reviewed'}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The Reviewer's panel on a journey: open every document on a stage, then mark
 * that stage reviewed.
 *
 * The button only enables once this person has opened every document, and the
 * server re-checks that when the mark is written, so the button is a courtesy
 * rather than the control. A mark is set once and never revoked.
 */
export default function P2StageReviewPanel({
  tenantId,
  journeyId,
  accessToken,
  onMarked,
}: {
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  onMarked?: () => void;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['p2-journey-review-state', tenantId, journeyId],
    queryFn: () => getJourneyReviewState(tenantId, journeyId, accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken),
    staleTime: 5_000,
  });

  const mark = useMutation({
    mutationFn: (stageCode: 'BOOKING' | 'DELIVERY') =>
      markStageDocumentsReviewed(tenantId, journeyId, stageCode, accessToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['p2-journey-review-state'] });
      void queryClient.invalidateQueries({ queryKey: ['p2-reviewer-board'] });
      onMarked?.();
    },
  });

  if (query.isLoading) {
    return <div className="p2w-review" aria-busy="true">Reading what you have opened…</div>;
  }
  if (query.isError || !query.data) {
    return (
      <div className="p2w-review">
        <div className="form-alert form-alert--error">The review state could not be read.</div>
      </div>
    );
  }

  return (
    <div className="p2w-review">
      <div className="p2w-card__title">
        <h3>Document review</h3>
        <p className="p2w-muted">
          Open each document, correct anything read wrongly, then mark the stage reviewed.
        </p>
      </div>
      {mark.isError && (
        <div className="form-alert form-alert--error">
          That stage could not be marked reviewed. Refresh and check what is still unopened.
        </div>
      )}
      {(['BOOKING', 'DELIVERY'] as const).map((stageCode) => (
        <Stage
          key={stageCode}
          stageCode={stageCode}
          state={query.data.stages[stageCode]}
          busy={mark.isPending && mark.variables === stageCode}
          onMark={(stage) => mark.mutate(stage)}
        />
      ))}
    </div>
  );
}
