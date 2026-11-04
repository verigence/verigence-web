/**
 * How every journey view shows a closed journey (product owner 2026-11-04):
 * closed by the Reviewer -- with where the Team Lead's decision stands -- or
 * closed by the rules (delivery complete, booking cancelled). Nothing for an
 * open journey.
 */
export type ReviewerClosureFlag = { status: 'PENDING' | 'ACCEPTED' | 'AUTO_ACCEPTED' | 'REJECTED'; closedAtUtc?: string | null };

const LABEL: Record<ReviewerClosureFlag['status'], { text: string; tone: string; title: string }> = {
  PENDING: { text: 'Closed by Reviewer · awaiting TL', tone: 'progress', title: 'The Team Lead accepts it, or it is accepted automatically after 96 hours' },
  ACCEPTED: { text: 'Closed by Reviewer · accepted', tone: 'success', title: 'The Team Lead accepted the closure' },
  AUTO_ACCEPTED: { text: 'Closed by Reviewer · auto-approved', tone: 'success', title: 'Not decided within 96 hours: accepted automatically' },
  REJECTED: { text: 'Sent back to Reviewer', tone: 'warning', title: 'The Team Lead rejected items of the closure' },
};

export function closureLabel(closure?: ReviewerClosureFlag | null, closed?: boolean | null): string | undefined {
  if (closure) return LABEL[closure.status]?.text;
  return closed ? 'Closed' : undefined;
}

export default function JourneyClosedBadge({ closure, closed }: { closure?: ReviewerClosureFlag | null; closed?: boolean | null }) {
  if (closure) {
    const label = LABEL[closure.status];
    if (!label) return null;
    const when = closure.closedAtUtc ? ` · ${new Date(closure.closedAtUtc).toLocaleDateString('en-IN')}` : '';
    return <span className={`p2w-chip p2w-chip--${label.tone}`} title={label.title}>{label.text}{when}</span>;
  }
  return closed ? <span className="p2w-chip p2w-chip--neutral" title="Delivery complete, or the booking was cancelled">Closed</span> : null;
}
