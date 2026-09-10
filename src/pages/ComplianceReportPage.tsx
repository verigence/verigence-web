import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import {
  getComplianceReport,
  type Uc03ComplianceReportFlag,
  type Uc03ComplianceReportSection,
} from '../services/audit-core/uc03Audit';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-compliance-report.css';

function friendly(value: string | null | undefined): string {
  if (!value) return '';
  return value.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function dateLabel(value: string | null): string {
  if (!value) return 'Not captured';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function timeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function amountLabel(value: number | null): string {
  if (value === null) return '—';
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function severityClass(severity: string): string {
  const normalized = severity.toUpperCase();
  if (normalized === 'CRITICAL' || normalized === 'HIGH') return 'is-high';
  if (normalized === 'MEDIUM') return 'is-medium';
  return 'is-low';
}

function FlagRow({ flag }: { flag: Uc03ComplianceReportFlag }) {
  return (
    <div className={`crpt-flag ${severityClass(flag.severity)}`}>
      <div className="crpt-flag__head">
        <span className="crpt-flag__severity">{friendly(flag.severity)}</span>
        {flag.findingClass && <span className="crpt-flag__class">{friendly(flag.findingClass)}</span>}
        {flag.isNew && <span className="crpt-flag__new">New</span>}
      </div>
      <p className="crpt-flag__title">{flag.title}</p>
      <span className="crpt-flag__meta">Raised {timeLabel(flag.createdAtUtc)}</span>
    </div>
  );
}

function Section({ section }: { section: Uc03ComplianceReportSection }) {
  return (
    <section className="crpt-section">
      <h2>{section.label}</h2>
      {section.lineItems.length > 0 && (
        <div className="crpt-lines">
          {section.lineItems.map((line, index) => (
            <div className="crpt-line" key={`${section.key}-${index}`}>
              <div className="crpt-line__label">
                <strong>{line.label}</strong>
                {line.detail && <span>{line.detail}</span>}
              </div>
              <div className="crpt-line__amounts">
                {line.standardAmount !== null && <span className="crpt-line__standard">Std {amountLabel(line.standardAmount)}</span>}
                <strong>{amountLabel(line.actualAmount)}</strong>
              </div>
            </div>
          ))}
        </div>
      )}
      {section.flags.length > 0 && (
        <div className="crpt-flags">
          {section.flags.map((flag) => <FlagRow key={flag.findingId} flag={flag} />)}
        </div>
      )}
    </section>
  );
}

export default function ComplianceReportPage() {
  const { journeyId = '' } = useParams<{ journeyId: string }>();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);

  const reportQuery = useQuery({
    queryKey: ['uc03-compliance-report', project?.tenantId, journeyId],
    queryFn: () => getComplianceReport(project!.tenantId, journeyId, accessToken),
    enabled: Boolean(project?.tenantId && accessToken && journeyId),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  if (!journeyId) return null;

  return (
    <div className="screen-stack crpt-page">
      <div className="crpt-actionbar">
        <Link to={`/v2/bookings/${journeyId}/details`} className="crpt-back">← Back to Journey</Link>
        {reportQuery.data && (
          <span className="crpt-live-note">Live as of {timeLabel(reportQuery.data.generatedAtUtc)} · never frozen</span>
        )}
        <button type="button" className="crpt-print" onClick={() => window.print()}>Download (PDF)</button>
      </div>

      {reportQuery.isPending && <div className="page-loading">Loading Compliance Report…</div>}
      {reportQuery.isError && (
        <section className="dashboard-load-state" role="alert">
          <div className="dashboard-load-state__mark" aria-hidden="true">!</div>
          <div className="dashboard-load-state__copy">
            <strong>We couldn't load this Compliance Report.</strong>
            <p>Please try again.</p>
          </div>
          <button type="button" className="user-menu-button" onClick={() => reportQuery.refetch()}>Try Again</button>
        </section>
      )}

      {reportQuery.data && (
        <>
          <header className="crpt-header">
            <div className="crpt-header__top">
              <div>
                <span className="crpt-header__eyebrow">{reportQuery.data.header.dealerName} · {reportQuery.data.header.outletName}</span>
                <h1>{reportQuery.data.header.customerDisplayName}</h1>
                <p>{reportQuery.data.header.productLabel || 'Vehicle not captured'}</p>
              </div>
              <span className="crpt-role-pill">TL / PM view</span>
            </div>
            <div className="crpt-header__meta">
              <div><span>Booking Ref</span><strong>{reportQuery.data.header.bookingReference || '—'}</strong></div>
              <div><span>VIN</span><strong>{reportQuery.data.header.vin || 'Not captured'}</strong></div>
              <div><span>Booking Date</span><strong>{dateLabel(reportQuery.data.header.bookingDate)}</strong></div>
              <div><span>Delivery Date</span><strong>{dateLabel(reportQuery.data.header.deliveryDate)}</strong></div>
              <div><span>Deal Type</span><strong>{reportQuery.data.header.dealType || 'Not captured'}</strong></div>
              <div><span>Financed By</span><strong>{reportQuery.data.header.financedBy || 'Cash / not financed'}</strong></div>
            </div>
          </header>

          <div className="crpt-summary">
            <div className="crpt-tile"><span>Total Findings</span><strong>{reportQuery.data.summary.totalFindings}</strong></div>
            <div className="crpt-tile"><span>Open</span><strong>{reportQuery.data.summary.openFindings}</strong></div>
            <div className="crpt-tile"><span>Resolved</span><strong>{reportQuery.data.summary.resolvedFindings}</strong></div>
            <div className="crpt-tile crpt-tile--attention"><span>High / Critical Open</span><strong>{reportQuery.data.summary.highOrCriticalOpen}</strong></div>
          </div>

          {reportQuery.data.sections.length === 0 && (
            <p className="crpt-empty">No commercial line items or findings recorded yet for this deal.</p>
          )}
          {reportQuery.data.sections.map((section) => <Section key={section.key} section={section} />)}

          {reportQuery.data.resolvedHistory.length > 0 && (
            <details className="crpt-history">
              <summary>Resolved History ({reportQuery.data.resolvedHistory.length})</summary>
              <div className="crpt-history__list">
                {reportQuery.data.resolvedHistory.map((item) => (
                  <div className="crpt-history__item" key={item.findingId}>
                    <div className="crpt-history__title">
                      <strong>{item.title}</strong>
                      <span>{friendly(item.severity)}</span>
                    </div>
                    <div className="crpt-history__dates">
                      <span>Raised {dateLabel(item.createdAtUtc)}</span>
                      {item.resolvedAtUtc && <span>Resolved {dateLabel(item.resolvedAtUtc)}</span>}
                    </div>
                    {item.resolutionReason && <p>{item.resolutionReason}</p>}
                  </div>
                ))}
              </div>
            </details>
          )}

          <footer className="crpt-footnote">
            This report is always generated live and is never frozen or snapshotted — new documents
            (bank statements, RTO paperwork, insurance confirmations) can add or resolve observations
            after Delivery. Reopen this page any time for the current state. Use your browser's print
            dialog (Download PDF above) to save a point-in-time copy.
          </footer>
        </>
      )}
    </div>
  );
}
