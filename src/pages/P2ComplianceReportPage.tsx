import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-journey360.css';

import BackLink from '../components/BackLink';
import AuditSummaryTab from '../features/uc03-p2/journey360/AuditSummaryTab';
import PageHeader from '../components/PageHeader';
import { CONTROL_STATUS, FLAG_LABELS, money, signedMoney, varianceTone } from '../features/uc03-p2/journey360/j360Format';
import { displayValue, formatDateTime, humanizeKey } from '../features/uc03-p2/workspace/p2Format';
import { getP2Journey360Section } from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import { matchLevelText } from '../features/uc03-p2/matchLevel';
import {
  ACCEPTANCE_LABEL,
  CLOSURE_KIND_LABEL,
  SEVERITIES,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  type ClosureObservation,
  type ObservationSeverity,
} from '../services/audit-core/reviewerClosure';

const SOURCE_LABEL: Record<string, string> = { SYSTEM: 'Audit', REVIEWER: 'Reviewer', TL: 'Team Lead', PM: 'Project Manager' };

const HEADER_LABELS: Record<string, string> = {
  journeyReference: 'Journey', bookingReference: 'Booking reference', productLabel: 'Vehicle', dealerName: 'Dealer',
  outletName: 'Outlet', customerDisplayName: 'Customer', vin: 'VIN', dealType: 'Deal type', financedBy: 'Financed by',
  bookingDate: 'Booking date', deliveryDate: 'Delivery date',
};

const VERDICT_TONE = { COMPLIANT: 'success', INCOMPLETE: 'progress', NON_COMPLIANT: 'danger' } as const;

/** Audit report (product owner 2026-11-06; made crisp 2026-11-09: "I need to
 * see crisp report covering what is there, what is missed, what is
 * observation, justifications ... severity as high, medium, low"). It leads
 * with the verdict and the counts, then the observations by severity, what is
 * missed, what is on file, the justifications for items not taken as
 * observations, and the remarks and sign-off. Everything else -- journey
 * facts, the Audit summary or Deal, the checks, findings and open work -- is
 * under Details. Print-ready. */
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
  // The Audit summary is for a file with delivery documents (product owner
  // 2026-10-30), as on Journey 360; before that the Deal section stands in.
  const deliveryStarted = r?.deal.summary.deliveryStarted === true;
  const auditSummary = useQuery({
    queryKey: ['p2-360', tenantId, journeyId, 'audit-summary'],
    queryFn: () => getP2Journey360Section(tenantId!, journeyId!, 'audit-summary', accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken && deliveryStarted),
    staleTime: 15_000,
  });
  const closure = r?.reviewerClosure ?? null;
  const checklist = r?.documentChecklist ?? [];
  const onFile = checklist.filter((d) => d.onFile);
  const missed = checklist.filter((d) => !d.onFile);
  // A closed journey shows the closure's decided observations; before that,
  // what the closure will list, as suggested (provisional).
  // A closure from before observations carries only answers: each item reads
  // as not taken as an observation, its answer the justification.
  const decided: ClosureObservation[] | null = closure ? (closure.observations ?? closure.items.map((item) => ({
    key: item.key, kind: item.kind, stage: item.stage, label: item.label, detail: item.detail, stands: false,
    severity: null, justification: item.answer ?? null, note: null, source: 'SYSTEM' as const,
    tlRejection: closure.rejections.find((x) => x.key === item.key)?.reason ?? null,
  }))) : null;
  const observations: ClosureObservation[] = decided ?? (r?.observationCandidates ?? [])
    .filter((c) => c.suggestedStands)
    .map((c) => ({ key: c.key, kind: c.kind, stage: c.stage, label: c.label, detail: c.detail, stands: true,
      severity: c.suggestedSeverity, justification: null, note: null, source: 'SYSTEM' as const, tlRejection: null }));
  const standing = observations.filter((o) => o.stands);
  const justified = (decided ?? []).filter((o) => !o.stands);
  const counts: Record<ObservationSeverity, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const o of standing) if (o.severity && !o.tlRejection) counts[o.severity] += 1;

  return (
    <div className={`screen-stack p2-screen p2w j360 j360-report${r && r.review?.status !== 'REVIEWED' ? ' is-draft' : ''}`}>
      <BackLink fallbackTo={`/p2/journeys/${journeyId}/overview`} fallbackLabel="Journey 360" />
      <PageHeader
        eyebrow="Audit report"
        title={h.customerDisplayName ?? 'Audit report'}
        description={r ? [h.productLabel, h.dealerName, h.outletName, h.journeyReference].filter(Boolean).join(' · ') : 'Preparing the report…'}
        actions={(
          <div className="p2w-header-links">
            <Link className="p2w-link" to={`/p2/journeys/${journeyId}/overview`}>Journey 360</Link>
            <Link className="p2w-link" to={`/p2/journeys/${journeyId}/overview?tab=files`}>Uploaded files</Link>
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
              <span className="p2w-muted">As at {formatDateTime(r.generatedAtUtc)} · stage {humanizeKey(r.stage.code)} · checks re-run every night while the delivery is in progress</span>
              {closure ? (
                <span className={`j360-review-status p2w-tone p2w-tone--${closure.acceptanceStatus === 'REJECTED' ? 'danger' : 'success'}`}>
                  Closed by the Reviewer on {formatDateTime(closure.closedAtUtc)} · {ACCEPTANCE_LABEL[closure.acceptanceStatus]}
                </span>
              ) : r.review ? (
                <span className={`j360-review-status p2w-tone p2w-tone--${r.review.status === 'REVIEWED' ? 'success' : 'progress'}`}>
                  {r.review.status === 'REVIEWED' && r.review.reviewedAtUtc
                    ? `${r.review.label} on ${formatDateTime(r.review.reviewedAtUtc)}`
                    : r.review.label}
                </span>
              ) : null}
            </div>
            <dl className="j360-facts j360-glance">
              <div><dt>Documents on file</dt><dd>{onFile.length} of {checklist.length}</dd></div>
              <div className={missed.length ? 'is-danger' : ''}><dt>Documents missed</dt><dd>{missed.length}</dd></div>
              {SEVERITIES.map((severity) => (
                <div key={severity} className={`is-${severity.toLowerCase()}`}>
                  <dt>{SEVERITY_LABEL[severity]} observations</dt><dd>{counts[severity]}</dd>
                </div>
              ))}
              {decided ? <div><dt>Not taken as observations</dt><dd>{justified.length}</dd></div> : null}
              <div><dt>Checks with issues</dt><dd>{r.verdict.failedControls}</dd></div>
              <div><dt>Open tasks</dt><dd>{r.verdict.openTasks}</dd></div>
            </dl>
          </section>

          <section className="j360-card" aria-label="Observations">
            <h3 className="j360-h3">Observations</h3>
            {!decided ? (
              <p className="p2w-muted">Provisional: listed as the audit sees them now. The Reviewer decides each one, and its
                severity, when closing the journey.</p>
            ) : null}
            {standing.length ? (
              <div className="j360-table-wrap">
                <table className="j360-table j360-observations">
                  <caption className="visually-hidden">Observations by severity</caption>
                  <thead><tr><th scope="col">Severity</th><th scope="col">Observation</th><th scope="col">Raised by</th><th scope="col">Note / Team Lead</th></tr></thead>
                  <tbody>
                    {standing.map((o) => (
                      <tr key={o.key} className={o.tlRejection ? 'is-flagged' : ''}>
                        <td data-label="Severity">{o.severity
                          ? <span className={`p2w-chip p2w-chip--${SEVERITY_TONE[o.severity]}`}>{SEVERITY_LABEL[o.severity]}</span> : '—'}</td>
                        <th scope="row">{o.label}
                          {o.detail ? <small className="p2w-muted" style={{ display: 'block' }}>{o.detail}</small> : null}
                          <small className="p2w-muted" style={{ display: 'block' }}>{CLOSURE_KIND_LABEL[o.kind] ?? humanizeKey(o.kind)}{o.stage ? ` · ${humanizeKey(o.stage)}` : ''}</small>
                        </th>
                        <td data-label="Raised by">{SOURCE_LABEL[o.source] ?? o.source}</td>
                        <td data-label="Note">{o.note ?? ''}
                          {o.tlRejection ? <small className="p2w-tone p2w-tone--danger" style={{ display: 'block' }}>Rejected by the Team Lead: {o.tlRejection}</small> : null}
                          {!o.note && !o.tlRejection ? '—' : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="p2w-muted">No observations.</p>}
          </section>

          <section className="j360-card" aria-label="What is missed">
            <h3 className="j360-h3">What is missed · {missed.length}</h3>
            {missed.length ? (
              <ul className="j360-controls">
                {missed.map((d) => (
                  <li key={`${d.stage}-${d.key}`} className="is-danger">
                    <span className={`p2w-chip p2w-chip--${d.requirement === 'MANDATORY' ? 'danger' : 'warning'}`}>
                      {d.requirement === 'MANDATORY' ? 'Mandatory' : 'Conditional'}</span>
                    <span className="j360-controls__body"><strong>{d.label}</strong>
                      {d.reason ? <span className="p2w-muted">{d.reason}</span> : null}</span>
                    <span className="p2w-muted j360-controls__meta">{humanizeKey(d.stage)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="p2w-muted">Every required document is on file.</p>}
          </section>

          <section className="j360-card" aria-label="What is on file">
            <h3 className="j360-h3">What is on file · {onFile.length}</h3>
            {onFile.length ? (
              <ul className="j360-onfile">
                {onFile.map((d) => (
                  <li key={`${d.stage}-${d.key}`}><span className="p2w-chip p2w-chip--success">✓</span> {d.label}
                    <small className="p2w-muted"> · {humanizeKey(d.stage)}</small></li>
                ))}
              </ul>
            ) : <p className="p2w-muted">No required document is on file yet.</p>}
          </section>

          {justified.length ? (
            <section className="j360-card" aria-label="Justifications">
              <h3 className="j360-h3">Not taken as observations · justifications</h3>
              <div className="j360-table-wrap">
                <table className="j360-table">
                  <thead><tr><th scope="col">Item</th><th scope="col">Justification</th></tr></thead>
                  <tbody>
                    {justified.map((o) => (
                      <tr key={o.key} className={o.tlRejection ? 'is-flagged' : ''}>
                        <th scope="row">{o.label}
                          <small className="p2w-muted" style={{ display: 'block' }}>{CLOSURE_KIND_LABEL[o.kind] ?? humanizeKey(o.kind)}{o.stage ? ` · ${humanizeKey(o.stage)}` : ''}</small></th>
                        <td data-label="Justification">{o.justification ?? '—'}
                          {o.tlRejection ? <small className="p2w-tone p2w-tone--danger" style={{ display: 'block' }}>Rejected by the Team Lead: {o.tlRejection}</small> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {closure ? (
            <section className="j360-card j360-closure" aria-label="Remarks and sign-off">
              <h3 className="j360-h3">Remarks and sign-off</h3>
              <blockquote className="j360-closure__comment">
                <span className="j360-label">Reviewer's closing comment</span>
                <p>{closure.comment}</p>
              </blockquote>
              {closure.remarks ? (
                <blockquote className="j360-closure__comment">
                  <span className="j360-label">Additional remarks</span>
                  <p>{closure.remarks}</p>
                </blockquote>
              ) : null}
              <dl className="j360-facts">
                <div><dt>Closed by</dt><dd>{closure.closedRole === 'REVIEWER' ? 'Reviewer' : humanizeKey(closure.closedRole)}</dd></div>
                <div><dt>Closed on</dt><dd>{formatDateTime(closure.closedAtUtc)}</dd></div>
                <div><dt>Team Lead</dt><dd>{ACCEPTANCE_LABEL[closure.acceptanceStatus]}
                  {closure.decidedAtUtc ? ` · ${formatDateTime(closure.decidedAtUtc)}` : ''}
                  {closure.acceptanceStatus === 'PENDING' && closure.acceptanceDueUtc
                    ? ` · auto-approves ${formatDateTime(closure.acceptanceDueUtc)}` : ''}</dd></div>
              </dl>
            </section>
          ) : null}

          <details className="j360-card j360-appendix">
            <summary className="j360-h3">Details: journey, deal, checks and history</summary>
          <section className="j360-card" aria-label="Journey">
            <h3 className="j360-h3">Journey</h3>
            <dl className="j360-facts">
              {Object.entries(h).filter(([key]) => key !== 'journeyId').map(([key, value]) => (
                <div key={key}><dt>{HEADER_LABELS[key] ?? humanizeKey(key)}</dt><dd>{value ?? '—'}</dd></div>
              ))}
            </dl>
          </section>

          {deliveryStarted ? (
            <div className="j360-report-audit" aria-label="Audit summary">
              {auditSummary.data ? (
                <AuditSummaryTab data={auditSummary.data} regenerating={auditSummary.isFetching}
                  onRegenerate={() => void auditSummary.refetch()} />
              ) : auditSummary.isError ? (
                <div className="p2w-alert p2w-alert--error" role="alert">
                  The Audit summary could not be prepared. <button type="button" className="p2w-link" onClick={() => void auditSummary.refetch()}>Try again</button>
                </div>
              ) : <div className="p2w-skeleton" aria-busy="true">Preparing the Audit summary…</div>}
            </div>
          ) : (
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
          )}

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
                    <span className="p2w-muted j360-controls__meta">{pair.matchBasisLabel ?? humanizeKey(pair.matchBasis ?? '')}{` · ${matchLevelText(pair.matchConfidenceLabel)}`}</span>
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
          </details>
        </>
      ) : null}
    </div>
  );
}
