/**
 * The Journey's position as two lines, one per stage:
 *   Booking   documents -> verify -> complete
 *   Delivery  documents -> verify -> complete
 */
const STEPS = ['Documents', 'Verify', 'Complete'] as const;

function position(stage: string): { booking: number; delivery: number } {
  switch (stage) {
    case 'BOOKING_DOCUMENT_UPLOAD': return { booking: 0, delivery: -1 };
    case 'BOOKING_VERIFY_DOCUMENTS': return { booking: 1, delivery: -1 };
    case 'BOOKING_COMPLETE': return { booking: 3, delivery: -1 };
    case 'DELIVERY_DOCUMENT_UPLOAD': return { booking: 3, delivery: 0 };
    case 'DELIVERY_VERIFY_DOCUMENTS': return { booking: 3, delivery: 1 };
    case 'DELIVERY_COMPLETE': return { booking: 3, delivery: 3 };
    default: return { booking: 0, delivery: -1 };
  }
}

function Line({ label, at, cancelled }: { label: string; at: number; cancelled?: boolean }) {
  return (
    <div className={`p2w-stageline${cancelled ? ' is-cancelled' : ''}`}>
      <span className="p2w-stageline__label">{label}</span>
      <ol>
        {STEPS.map((step, index) => {
          const state = cancelled ? 'todo' : index < at || (index === 2 && at >= 3) ? 'done' : index === at ? 'active' : 'todo';
          return <li key={step} className={`is-${state}`} aria-current={state === 'active' ? 'step' : undefined}>{step}</li>;
        })}
      </ol>
    </div>
  );
}

export default function JourneyStageLines({ stage, cancelled, delivered, review }: {
  stage: string;
  cancelled?: boolean;
  delivered?: boolean;
  /** A completed delivery is marked for the Team Lead's review. */
  review?: 'PENDING' | 'DONE';
}) {
  const at = position(stage);
  const delivery = delivered ? 3 : at.delivery;
  return (
    <div className="p2w-stagelines" aria-label="Journey stage">
      <Line label="Booking" at={at.booking} cancelled={cancelled} />
      {cancelled ? <span className="p2w-chip p2w-chip--neutral">Cancelled</span>
        : <Line label="Delivery" at={delivery} />}
      {!cancelled && review ? (
        <span className={`p2w-chip p2w-chip--${review === 'DONE' ? 'success' : 'warning'}`}>
          {review === 'DONE' ? 'TL reviewed' : 'Awaiting TL review'}
        </span>
      ) : null}
    </div>
  );
}
