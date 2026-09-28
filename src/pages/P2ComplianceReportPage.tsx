import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-journey360.css';

import PageHeader from '../components/PageHeader';
import { CONTROL_STATUS, FLAG_LABELS, money, signedMoney, varianceTone } from '../features/uc03-p2/journey360/j360Format';
import { displayValue, formatDateTime, humanizeKey } from '../features/uc03-p2/workspace/p2Format';
import { getP2Journey360Section } from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const HEADER_LABELS: Record<string, string> = {
  journeyReference: 'Journey', bookingReference: 'Booking reference', productLabel: 'Vehicle', dealerName: 'Dealer',
  outletName: 'Outlet', customerDisplayName: 'Customer', vin: 'VIN', dealType: 'Deal type', financedBy: 'Financed by',
  bookingDate: 'Booking date', deliveryDate: 'Delivery date',
};

const VERDICT_TONE = { COMPLIANT: 'success', INCOMPLETE: 'progress', NON_COMPLIANT: 'danger' } as const;

/** Compliance report: the legacy report extended with the Phase 2 check
 * ledger, deal variances, duplicate bookings and open work. Print-ready. */
export default function P2ComplianceReportPage() {
  const { journeyId } = useParams();
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const report = useQuery({
    queryKey: ['p2-360', tenantId, journeyId, 'compliance-report'],
    queryFn: () => getP2Journey360Section(tenantId!, journeyId!, 'compliance-report', accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken),
    staleTime: 0,
  });
  const r = report.data;
  const h = r?.header ?? {};

  return (
    <div className={`screen-stack p2-screen p2w j360 j360-report${r && r.review?.status !== 'REVIEWED' ? ' is-draft' : ''}`}>
      <PageHeader
        eyebrow="Compliance report"
        title={h.customerDisplayName ?? 'Compliance report'}
        description={r ? [h.productLabel, h.dealerName, h.outletName, h.journeyReference].filter(Boolean).join(' · ') : 'Preparing the report…'}
        actions={(
          <div className="p2w-header-links">
            <Link className="p2w-link" to={`/p2/journeys/${journeyId}/overview`}>Journey 360</Link>
            <button type="button" className="p2w-button p2w-button--secondary" onClick={() => window.print()} disabled={!r}>Print / save PDF</button>
          </div>
        )}
      />
      {report.isError ? (
        <div className="p2w-alert p2w-alert--error" role="alert">
          The report could not be prepared. <button type="button" className="p2w-link" onClick={() => void report.refetch()}>Try again</button>
        </div>
      ) : null}
      {report.isLoading ? <div className="p2w-skeleton" aria-busy="true">Preparing the report…</div> : null}

      {r ? (
        <>
          <section className={`j360-card j360-verdict is-${VERDICT_TONE[r.verdict.code]}`} aria-label="Verdict">
            <div>
              <span className="j360-label">Verdict</span>
              <strong className={`p2w-tone p2w-tone--${VERDICT_TONE[r.verdict.code]}`}>{r.verdict.label}</strong>
              <span className="p2w-muted">Generated {formatDateTime(r.generatedAtUtc)} · stage {humanizeKey(r.stage.code)}</span>
              {r.review ? (
                <span className={`j360-review-status p2w-tone p2w-tone--${r.review.status === 'REVIEWED' ? 'success' : 'progress'}`}>
                  {r.review.status === 'REVIEWED' && r.review.reviewedAtUtc
                    ? `${r.review.label} on ${formatDateTime(r.review.reviewedAtUtc)}`
                    : r.review.label}
                </span>
              ) : null}
            </div>
            <dl className="j360-facts">
              <div><dt>Checks with issues</dt><dd>{r.verdict.failedControls}</dd></div>
              <div><dt>Checks not complete</dt><dd>{r.verdict.incompleteControls}</dd></div>
              <div><dt>High / critical findings open</dt><dd>{r.verdict.highOrCriticalFindings}</dd></div>
              <div><dt>Possible duplicate bookings</dt><dd>{r.verdict.duplicatePairs}</dd></div>
              <div><dt>Open tasks</dt><dd>{r.verdict.openTasks}</dd></div>
              <div><dt>Findings (open / resolved)</dt><dd>{r.summary.openFindings} / {r.summary.resolvedFindings}</dd></div>
            </dl>
          </section>

          <section className="j360-card" aria-label="Journey">
            <h3 className="j360-h3">Journey</h3>
            <dl className="j360-facts">
              {Object.entries(h).filter(([key]) => key !== 'journeyId').map(([key, value]) => (
                <div key={key}><dt>{HEADER_LABELS[key] ?? humanizeKey(key)}</dt><dd>{value ?? '—'}</dd></div>
              ))}
            </dl>
          </section>

          <section className="j360-card" aria-label="Deal">
            <h3 className="j360-h3">Deal</h3>
            <dl className="j360-paid">
              <div><dt>Standard net</dt><dd>{money(r.deal.summary.net.standard)}</dd></div>
              <div><dt>Booking offer net</dt><dd>{money(r.deal.summary.net.booking)}</dd></div>
              <div><dt>Current deal net</dt><dd>{money(r.deal.summary.net.current)}</dd></div>
              <div><dt>Received</dt><dd>{money(r.deal.summary.paid.total)}</dd></div>
              <div><dt>Balance due</dt><dd>{money(r.deal.summary.balanceDue)}</dd></div>
              <div className={`j360-variance ${varianceTone(r.deal.summary.variance.currentVsStandard)}`}><dt>Variance vs standard</dt><dd>{signedMoney(r.deal.summary.variance.currentVsStandard)}</dd></div>
            </dl>
            {r.deal.flaggedLines.length ? (
              <div className="j360-table-wrap">
                <table className="j360-table">
                  <caption>Lines that differ</caption>
                  <thead><tr><th scope="col">Line</th><th scope="col" className="is-num">Standard</th><th scope="col" className="is-num">Booking</th>
                    <th scope="col" className="is-num">Billed</th><th scope="col" className="is-num">Variance</th><th scope="col">Why</th></tr></thead>
                  <tbody>
                    {r.deal.flaggedLines.map((line) => (
                      <tr key={`${line.category}-${line.label}`}>
                        <th scope="row">{line.label}<small className="p2w-muted">{line.category}</small></th>
                        <td className="is-num" data-label="Standard">{money(line.standard)}</td>
                        <td className="is-num" data-label="Booking">{money(line.booking)}</td>
                        <td className="is-num" data-label="Billed">{money(line.billed)}</td>
                        <td className="is-num" data-label="Variance">{signedMoney(line.variance)}</td>
                        <td data-label="Why">{line.flags.map((flag) => FLAG_LABELS[flag] ?? humanizeKey(flag)).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="p2w-muted">Every deal line agrees across the documents and the masters.</p>}
          </section>

          {r.duplicates.length ? (
            <section className="j360-card" aria-label="Duplicate bookings">
              <h3 className="j360-h3">Possible duplicate bookings</h3>
              <ul className="j360-controls">
                {r.duplicates.map((pair) => (
                  <li key={pair.findingId} className="is-danger">
                    <span className="p2w-chip p2w-chip--danger">{humanizeKey(pair.severity)}</span>
                    <span className="j360-controls__body">
                      <strong>{pair.role === 'THIS_IS_DUPLICATE' ? 'Matches an earlier booking' : 'A later booking matches this one'}</strong>
                      <span className="p2w-muted">{pair.otherJourney.customer_name ?? '—'} · {pair.otherJourney.outlet_name ?? '—'} · {pair.otherJourney.journey_reference ?? pair.otherJourney.journey_id}</span>
                    </span>
                    <span className="p2w-muted j360-controls__meta">{pair.matchBasisLabel ?? humanizeKey(pair.matchBasis ?? '')}{pair.matchConfidencePercent ? ` · ${pair.matchConfidencePercent}%` : ''}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {(['BOOKING', 'DELIVERY'] as const).filter((stage) => r.controls[stage]?.length).map((stage) => (
            <section key={stage} className="j360-card" aria-label={`${stage} checks`}>
              <h3 className="j360-h3">{humanizeKey(stage)} checks · {r.controlStatistics[stage].pass} of {r.controlStatistics[stage].total} passed</h3>
              <ul className="j360-controls">
                {r.controls[stage]!.filter((item) => item.status !== 'NOT_APPLICABLE').map((item) => {
                  const status = CONTROL_STATUS[item.status] ?? { label: humanizeKey(item.status), tone: 'neutral' };
                  return (
                    <li key={item.code}>
                      <span className={`p2w-chip p2w-chip--${status.tone}`}>{status.label}</span>
                      <span className="j360-controls__body">
                        <strong>{item.label}</strong>
                        <span className="p2w-muted">{item.reason}</span>
                        {item.leftValue !== undefined && item.leftValue !== null ? (
                          <span className="j360-compare">Found {displayValue(item.leftValue)} · compared with {displayValue(item.rightValue)}</span>
                        ) : null}
                      </span>
                      <span className="p2w-muted j360-controls__meta">{humanizeKey(item.category)}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {r.sections.map((section) => (
            <section key={section.key} className="j360-card" aria-label={section.label}>
              <h3 className="j360-h3">{section.label}</h3>
              {section.lineItems.length ? (
                <div className="j360-table-wrap">
                  <table className="j360-table">
                    <thead><tr><th scope="col">Item</th><th scope="col">Detail</th><th scope="col" className="is-num">Standard</th><th scope="col" className="is-num">Actual</th></tr></thead>
                    <tbody>
                      {section.lineItems.map((item, index) => (
                        <tr key={`${item.label}-${index}`}>
                          <th scope="row">{item.label}</th>
                          <td data-label="Detail">{item.detail ?? '—'}</td>
                          <td className="is-num" data-label="Standard">{money(item.standardAmount)}</td>
                          <td className="is-num" data-label="Actual">{money(item.actualAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {section.flags.length ? (
                <ul className="j360-controls">
                  {section.flags.map((flag) => (
                    <li key={flag.findingId}>
                      <span className={`p2w-chip p2w-chip--${['HIGH', 'CRITICAL'].includes(flag.severity) ? 'danger' : 'warning'}`}>{humanizeKey(flag.severity)}</span>
                      <span className="j360-controls__body"><strong>{flag.title}</strong>
                        <span className="p2w-muted">{humanizeKey(flag.findingTypeCode)} · raised {formatDateTime(flag.createdAtUtc)}{flag.isNew ? ' · new' : ''}</span></span>
                      <span className="p2w-muted j360-controls__meta">{humanizeKey(flag.status)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}

          {r.openTasks.length ? (
            <section className="j360-card" aria-label="Open tasks">
              <h3 className="j360-h3">Open tasks</h3>
              <ul className="j360-controls">
                {r.openTasks.map((task) => (
                  <li key={task.task_id}>
                    <span className="p2w-chip p2w-chip--progress">{humanizeKey(task.priority ?? 'normal')}</span>
                    <span className="j360-controls__body"><strong>{task.title}</strong>
                      <span className="p2w-muted">{task.assigned_role_code ?? ''} · {humanizeKey(task.task_status)}</span></span>
                    <span className="p2w-muted j360-controls__meta">{task.due_at_utc ? `due ${formatDateTime(task.due_at_utc)}` : ''}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {r.resolvedHistory.length ? (
            <section className="j360-card" aria-label="Resolved findings">
              <h3 className="j360-h3">Resolved findings</h3>
              <ul className="j360-controls">
                {r.resolvedHistory.map((item) => (
                  <li key={item.findingId}>
                    <span className="p2w-chip p2w-chip--success">Resolved</span>
                    <span className="j360-controls__body"><strong>{item.title}</strong>
                      <span className="p2w-muted">{item.resolutionReason ?? humanizeKey(item.findingTypeCode)}</span></span>
                    <span className="p2w-muted j360-controls__meta">{formatDateTime(item.resolvedAtUtc ?? item.createdAtUtc)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
