import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import { searchUc03Journeys, type JourneySearchMatch } from '../services/audit-core/uc03JourneySearch';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const matchLabels: Record<JourneySearchMatch, string> = {
  DEALER_BOOKING_NUMBER: 'Dealer booking no.',
  MOBILE_NUMBER: 'Mobile number',
  CUSTOMER_ENTERED_NAME: 'Entered customer name',
  CUSTOMER_LEGAL_NAME: 'Document customer name',
  VIN: 'VIN',
  CHASSIS_NUMBER: 'Chassis number',
  REGISTRATION_NUMBER: 'Registration number',
  INVOICE_REFERENCE: 'Invoice reference',
  DMS_REFERENCE: 'DMS vehicle reference',
  PAYMENT_REFERENCE: 'Payment reference',
  TECHNICAL_ID: 'Technical reference',
};

function roleScopeCopy(role?: string): string {
  if (role === 'PC') return 'Search is restricted to the Dealer Outlet(s) assigned to you.';
  if (role === 'TL') return 'Search covers all Dealers and Outlets assigned to you.';
  if (role === 'PM') return 'Search covers your complete assigned scope.';
  return 'Journey search is available to PC, TL and PM users.';
}

function mobileLabel(last4: string | null): string {
  return last4 ? `••••••${last4}` : 'Mobile not available';
}

export default function JourneySearchPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const selectedProject = useProjectContextStore((state) => state.selectedProject);
  const [queryText, setQueryText] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const trimmed = queryText.trim();
    if (trimmed.length < 3) {
      setDebouncedQuery('');
      return undefined;
    }
    const timer = window.setTimeout(() => setDebouncedQuery(trimmed), 280);
    return () => window.clearTimeout(timer);
  }, [queryText]);

  const operatingRole = selectedProject?.operatingRole;
  const supportedRole = operatingRole === 'PC' || operatingRole === 'TL' || operatingRole === 'PM';
  const tenantId = selectedProject?.tenantId || '';

  const searchQuery = useQuery({
    queryKey: ['uc03-journey-search', tenantId, debouncedQuery],
    queryFn: () => searchUc03Journeys(tenantId, debouncedQuery, accessToken, 12),
    enabled: Boolean(accessToken && tenantId && supportedRole && debouncedQuery.length >= 3),
    staleTime: 10_000,
  });

  const results = searchQuery.data?.items || [];
  const scopeSummary = useMemo(() => {
    if (!selectedProject) return '';
    const { dealerCount, outletCount } = selectedProject.scope;
    if (operatingRole === 'PC') return `${outletCount} assigned outlet${outletCount === 1 ? '' : 's'}`;
    if (operatingRole === 'TL') return `${dealerCount} dealer${dealerCount === 1 ? '' : 's'} · ${outletCount} outlet${outletCount === 1 ? '' : 's'}`;
    if (operatingRole === 'PM') return selectedProject.scope.allDealers
      ? 'All assigned Dealers'
      : `${dealerCount} dealer${dealerCount === 1 ? '' : 's'} · ${outletCount} outlet${outletCount === 1 ? '' : 's'}`;
    return '';
  }, [operatingRole, selectedProject]);

  return (
    <div className="screen-stack journey-search-page">
      <PageHeader
        eyebrow="Current Workspace"
        title="Journey Search"
        description="Find a customer journey using the identifiers your team actually works with, then open Booking and Delivery together."
      />

      <section className="journey-search-panel" aria-label="Journey search">
        <div className="journey-search-panel__heading">
          <div>
            <span className="journey-search-panel__kicker">Authorized scope</span>
            <strong>{roleScopeCopy(operatingRole)}</strong>
          </div>
          {scopeSummary && <span className="journey-search-panel__scope">{scopeSummary}</span>}
        </div>

        <label className="journey-search-input-wrap">
          <span className="journey-search-input-wrap__icon" aria-hidden="true">⌕</span>
          <input
            autoFocus
            type="search"
            value={queryText}
            onChange={(event) => setQueryText(event.target.value)}
            placeholder="Customer name, mobile, dealer booking no., VIN, registration, invoice…"
            aria-label="Search customer journeys"
            autoComplete="off"
            spellCheck={false}
          />
          {queryText && (
            <button type="button" onClick={() => setQueryText('')} className="journey-search-clear">
              Clear
            </button>
          )}
        </label>
        <p className="journey-search-hint">
          You can also search chassis number, DMS vehicle reference or a payment / UTR reference. Enter at least 3 characters.
        </p>
      </section>

      {!supportedRole && (
        <div className="journey-search-state journey-search-state--warning">
          Journey Search is currently available only for Process Consultant, Team Lead and Project Manager roles.
        </div>
      )}

      {supportedRole && !queryText.trim() && (
        <div className="journey-search-empty">
          <span className="journey-search-empty__mark">360</span>
          <div>
            <strong>Search the complete customer journey</strong>
            <p>One result brings together Customer, Booking, Payments, Delivery, Vehicle, documents and audit findings.</p>
          </div>
        </div>
      )}

      {supportedRole && queryText.trim().length > 0 && queryText.trim().length < 3 && (
        <div className="journey-search-state">Enter at least 3 characters to start searching.</div>
      )}

      {searchQuery.isFetching && debouncedQuery && (
        <div className="journey-search-state journey-search-state--loading">Searching your authorized Journeys…</div>
      )}

      {searchQuery.isError && (
        <div className="journey-search-state journey-search-state--error">
          We couldn't complete the search. Please retry in a moment.
        </div>
      )}

      {!searchQuery.isFetching && searchQuery.data && results.length === 0 && (
        <div className="journey-search-empty">
          <span className="journey-search-empty__mark">0</span>
          <div>
            <strong>No Journey found in your scope</strong>
            <p>Check the customer name or reference. Journeys outside your assigned Dealer / Outlet scope are intentionally not shown.</p>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <section className="journey-search-results" aria-live="polite">
          <div className="journey-search-results__header">
            <strong>{searchQuery.data?.resultCount} result{searchQuery.data?.resultCount === 1 ? '' : 's'}</strong>
            <span>Most relevant first</span>
          </div>
          <div className="journey-search-result-list">
            {results.map((item) => (
              <article className="journey-search-result" key={item.journeyId}>
                <div className="journey-search-result__identity">
                  <div className="journey-search-result__avatar" aria-hidden="true">
                    {item.customerDisplayName.trim().slice(0, 1).toUpperCase() || 'C'}
                  </div>
                  <div>
                    <strong>{item.customerLegalName || item.customerDisplayName}</strong>
                    {item.customerLegalName && item.customerLegalName !== item.customerDisplayName && (
                      <small>Entered as {item.customerDisplayName}</small>
                    )}
                    <span>{mobileLabel(item.customerMobileLast4)}</span>
                  </div>
                </div>

                <div className="journey-search-result__reference">
                  <span>Dealer Booking No.</span>
                  <strong>{item.bookingReference || 'Not available'}</strong>
                  <small>{item.productLabel || 'Vehicle details pending'}</small>
                </div>

                <div className="journey-search-result__location">
                  <span>{item.dealerName}</span>
                  <strong>{item.outletName}</strong>
                  <small>
                    Matched on {matchLabels[item.matchedOn]}
                    {item.matchedValue ? ` · ${item.matchedValue}` : ''}
                  </small>
                </div>

                <div className="journey-search-result__status">
                  <div><span>Booking</span><StatusPill value={item.bookingStatus || 'NOT_STARTED'} compact /></div>
                  <div><span>Delivery</span><StatusPill value={item.deliveryStatus || 'NOT_STARTED'} compact /></div>
                </div>

                <Link className="journey-search-result__open" to={`/journeys/${item.journeyId}/overview`}>
                  View Journey <span aria-hidden="true">→</span>
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
