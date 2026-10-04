import SectionCard from '../../../components/SectionCard';
import type { ClaimSummary } from '../../../services/hr/claims';
import { formatMonth, formatRupees, formatRupeesShort } from './claimFormat';
import { toPaise } from './claimRules';

/** Share of `part` in `whole` for drawing a bar only (0 to 100). Not used for any money decision. */
function percent(part: number, whole: number): number {
  const a = toPaise(part);
  const b = toPaise(whole);
  if (a === null || b === null || b <= 0) return 0;
  return Math.max(0, Math.min(100, (a / b) * 100));
}

/** The month's travel against the limit, with the limit, the Finance threshold and the rules as the service states them. */
export default function ClaimSummaryCard({ summary }: { summary: ClaimSummary }) {
  const used = percent(summary.travelUsed, summary.travelLimit);
  const threshold = percent(summary.financeThreshold, summary.travelLimit);
  const full = toPaise(summary.travelRemaining) === 0;
  return (
    <SectionCard
      title={`Travel for ${formatMonth(summary.month)}`}
      description="Your travel claims for this expense month, except rejected and cancelled ones."
      className="hrc-summary"
    >
      <dl className="hrc-metrics">
        <div><dt>Claimed</dt><dd>{formatRupees(summary.travelUsed)}</dd></div>
        <div><dt>Monthly limit</dt><dd>{formatRupeesShort(summary.travelLimit)}</dd></div>
        <div><dt>Left to claim</dt><dd className={full ? 'hrc-metrics__warn' : undefined}>{formatRupees(summary.travelRemaining)}</dd></div>
      </dl>
      <div
        className="hrc-meter"
        role="img"
        aria-label={`${formatRupees(summary.travelUsed)} of ${formatRupeesShort(summary.travelLimit)} used. Finance approves a month's travel above ${formatRupeesShort(summary.financeThreshold)}.`}
      >
        <span className="hrc-meter__fill" style={{ width: `${used}%` }} />
        <span className="hrc-meter__mark" style={{ left: `${threshold}%` }} />
      </div>
      <p className="hrc-meter__legend">
        <span>Finance approves a month's travel above {formatRupeesShort(summary.financeThreshold)}</span>
      </p>
      {summary.mealsLimit !== null && (
        <p className="hrc-summary__line">
          Meals: {formatRupees(summary.mealsUsed)} claimed of {formatRupeesShort(summary.mealsLimit)} a month.
        </p>
      )}
      <ul className="hrc-rules">
        {summary.rules.map((rule) => <li key={rule}>{rule}</li>)}
      </ul>
      <p className="hrc-summary__line">
        A claim sent today goes into the <strong>{formatMonth(summary.nextPayrollMonth)}</strong> payroll.
      </p>
    </SectionCard>
  );
}
