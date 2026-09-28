import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-journey360.css';

import PageHeader from '../components/PageHeader';
import DealTab from '../features/uc03-p2/journey360/DealTab';
import P2RecheckButton from '../features/uc03-p2/workspace/P2RecheckButton';
import {
  ActivityTab,
  AddonsTab,
  AuditTab,
  ChecksTab,
  CustomerTab,
  DeliveryTab,
  DocumentsTab,
  DuplicatesBanner,
  PaymentsTab,
  RegistrationTab,
  TimelineTab,
  TradeInTab,
  VehicleTab,
} from '../features/uc03-p2/journey360/Journey360Tabs';
import { money, signedMoney, varianceTone } from '../features/uc03-p2/journey360/j360Format';
import { formatDateTime, humanizeKey } from '../features/uc03-p2/workspace/p2Format';
import {
  getP2Journey360,
  getP2Journey360Section,
  type P2SectionMap,
} from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

const TABS = [
  { key: 'deal', label: 'Deal' },
  { key: 'addons', label: 'Add-ons' },
  { key: 'payments', label: 'Payments' },
  { key: 'documents', label: 'Documents' },
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'tradein', label: 'Trade-in / Scrappage' },
  { key: 'customer', label: 'Customer' },
  { key: 'registration', label: 'Registration' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'compliance', label: 'Checks' },
  { key: 'audit', label: 'Audit trail' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'activity', label: 'Activity' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const STAGE_LABEL: Record<string, string> = {
  BOOKING_DOCUMENT_UPLOAD: 'Booking · documents',
  BOOKING_VERIFY_DOCUMENTS: 'Booking · verify',
  BOOKING_COMPLETE: 'Booking complete',
  DELIVERY_DOCUMENT_UPLOAD: 'Delivery · documents',
  DELIVERY_VERIFY_DOCUMENTS: 'Delivery · verify',
  DELIVERY_COMPLETE: 'Delivered',
};

function errorText(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : '';
}

function useSection<K extends keyof P2SectionMap>(section: K, tenantId?: string, journeyId?: string, accessToken?: string, enabled = true) {
  return useQuery({
    queryKey: ['p2-360', tenantId, journeyId, section],
    queryFn: () => getP2Journey360Section(tenantId!, journeyId!, section, accessToken),
    enabled: Boolean(enabled && tenantId && journeyId && accessToken),
    staleTime: 15_000,
  });
}

/** Journey 360: the complete picture of one customer journey, read from
 * Audit Core's own facts. The summary loads first; each tab loads on open. */
export default function P2JourneyOverviewPage() {
  const { journeyId } = useParams();
  const [search, setSearch] = useSearchParams();
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const requested = search.get('tab') as TabKey | null;
  const tab: TabKey = TABS.some((t) => t.key === requested) ? requested! : 'deal';

  const summary = useQuery({
    queryKey: ['p2-360', tenantId, journeyId, 'summary'],
    queryFn: () => getP2Journey360(tenantId!, journeyId!, accessToken),
    enabled: Boolean(tenantId && journeyId && accessToken),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
  const duplicates = useSection('duplicates', tenantId, journeyId, accessToken);
  const deal = useSection('deal', tenantId, journeyId, accessToken, tab === 'deal');
  const addons = useSection('addons', tenantId, journeyId, accessToken, tab === 'addons');
  const payments = useSection('payments', tenantId, journeyId, accessToken, tab === 'payments');
  const documents = useSection('documents', tenantId, journeyId, accessToken, tab === 'documents');
  const vehicle = useSection('vehicle', tenantId, journeyId, accessToken, tab === 'vehicle');
  const tradein = useSection('tradein', tenantId, journeyId, accessToken, tab === 'tradein');
  const customer = useSection('customer', tenantId, journeyId, accessToken, tab === 'customer');
  const registration = useSection('registration', tenantId, journeyId, accessToken, tab === 'registration');
  const delivery = useSection('delivery', tenantId, journeyId, accessToken, tab === 'delivery');
  const compliance = useSection('compliance', tenantId, journeyId, accessToken, tab === 'compliance');
  const activity = useSection('activity', tenantId, journeyId, accessToken, tab === 'activity');
  const timeline = useSection('timeline', tenantId, journeyId, accessToken, tab === 'timeline');
  const audit = useSection('audit', tenantId, journeyId, accessToken, tab === 'audit');

  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' }>();
  const data = summary.data;
  const j = data?.journey;
  const m = data?.money;
  const failed = (data?.controls.BOOKING.fail ?? 0) + (data?.controls.DELIVERY.fail ?? 0);
  const passed = data?.controls.BOOKING.pass ?? 0;
  const setTab = (key: TabKey) => {
    const params = new URLSearchParams(search);
    params.set('tab', key);
    setSearch(params, { replace: true });
  };

  const active = { deal, addons, payments, documents, vehicle, tradein, customer, registration, delivery, compliance, activity, timeline, audit }[tab];
  let body: React.ReactNode = null;
  if (active.isLoading) body = <div className="p2w-skeleton" aria-busy="true">Loading…</div>;
  else if (active.isError) {
    body = (
      <div className="p2w-alert p2w-alert--error" role="alert">
        This section could not be loaded. {errorText(active.error)}
        <button type="button" className="p2w-link" onClick={() => void active.refetch()}>Try again</button>
      </div>
    );
  } else if (journeyId && tenantId) {
    if (tab === 'deal' && deal.data) body = <DealTab deal={deal.data} journeyId={journeyId} tenantId={tenantId} accessToken={accessToken} />;
    if (tab === 'addons' && addons.data) body = <AddonsTab addons={addons.data} journeyId={journeyId} tenantId={tenantId} accessToken={accessToken} />;
    if (tab === 'payments' && payments.data) body = <PaymentsTab payments={payments.data} journeyId={journeyId} />;
    if (tab === 'documents' && documents.data) body = <DocumentsTab data={documents.data} journeyId={journeyId} />;
    if (tab === 'vehicle' && vehicle.data) body = <VehicleTab data={vehicle.data} tenantId={tenantId} journeyId={journeyId} accessToken={accessToken} />;
    if (tab === 'tradein' && tradein.data) body = <TradeInTab data={tradein.data} />;
    if (tab === 'customer' && customer.data) body = <CustomerTab data={customer.data} />;
    if (tab === 'registration' && registration.data) body = <RegistrationTab data={registration.data} journeyId={journeyId} />;
    if (tab === 'delivery' && delivery.data) body = <DeliveryTab data={delivery.data} />;
    if (tab === 'compliance' && compliance.data) body = <ChecksTab data={compliance.data} />;
    if (tab === 'activity' && activity.data) body = <ActivityTab data={activity.data} />;
    if (tab === 'timeline' && timeline.data) body = <TimelineTab data={timeline.data} />;
    if (tab === 'audit' && audit.data) body = <AuditTab data={audit.data} />;
  }

  return (
    <div className="screen-stack p2-screen p2w j360">
      <PageHeader
        eyebrow="Journey 360"
        title={j?.customerName ?? 'Journey 360'}
        description={j ? [j.vehicle ?? 'Vehicle not identified yet', j.outletName, j.reference].filter(Boolean).join(' · ') : 'Loading the journey…'}
        actions={journeyId ? (
          <div className="p2w-header-links">
            <Link className="p2w-link" to={`/p2/journeys/${journeyId}/documents`}>Documents</Link>
            <Link className="p2w-link" to={`/p2/journeys/${journeyId}/documents?tab=photos`}>Photos</Link>
            <Link className="p2w-link" to={`/p2/journeys/${journeyId}/tasks`}>Tasks{data?.numbers.openTasks ? ` (${data.numbers.openTasks})` : ''}</Link>
            {tenantId ? <P2RecheckButton tenantId={tenantId} journeyId={journeyId} accessToken={accessToken}
              onDone={(text, tone) => setNotice({ text, tone })} /> : null}
            <Link className="p2w-button p2w-button--secondary" to={`/p2/journeys/${journeyId}/compliance-report`}>Compliance report</Link>
          </div>
        ) : undefined}
      />

      {summary.isError ? (
        <div className="p2w-alert p2w-alert--error" role="alert">
          The journey could not be loaded. {errorText(summary.error)}
          <button type="button" className="p2w-link" onClick={() => void summary.refetch()}>Try again</button>
        </div>
      ) : null}

      {notice ? (
        <div className={`p2w-alert p2w-alert--${notice.tone}`} role="status">
          {notice.text}<button type="button" className="p2w-link" onClick={() => setNotice(undefined)} aria-label="Dismiss">×</button>
        </div>
      ) : null}
      <DuplicatesBanner pairs={duplicates.data?.pairs ?? []} />

      {data && j && m ? (
        <>
          <section className="j360-head" aria-label="Journey summary">
            <div className="j360-head__facts">
              <span className={`p2w-chip p2w-chip--${data.stage.stage.endsWith('COMPLETE') ? 'success' : 'progress'}`}>
                {STAGE_LABEL[data.stage.stage] ?? humanizeKey(data.stage.stage)}
              </span>
              <dl className="j360-facts j360-facts--inline">
                <div><dt>SKU</dt><dd>{j.skuCode ?? '—'}</dd></div>
                <div><dt>VIN / chassis</dt><dd>{j.vin ?? '—'}</dd></div>
                <div><dt>Registration</dt><dd>{j.registrationNumber ?? '—'}</dd></div>
                <div><dt>Financier</dt><dd>{j.financier ?? 'Cash / not known'}</dd></div>
                <div><dt>Insurer</dt><dd>{j.insurer ?? '—'}</dd></div>
                <div><dt>Customer</dt><dd>{humanizeKey(j.customerType ?? '') || '—'}{j.mobileLast4 ? ` · ••${j.mobileLast4}` : ''}</dd></div>
                <div><dt>Started</dt><dd>{formatDateTime(j.createdAtUtc)}</dd></div>
                {j.deliveredAtUtc ? <div><dt>Delivered</dt><dd>{formatDateTime(j.deliveredAtUtc)}</dd></div> : null}
              </dl>
            </div>
            <dl className="j360-money" aria-label="Money">
              <div><dt>Standard</dt><dd>{money(m.net.standard)}</dd></div>
              <div><dt>Booking offer</dt><dd>{money(m.net.booking)}</dd></div>
              <div><dt>Current deal</dt><dd>{money(m.net.current)}</dd></div>
              <div><dt>Received</dt><dd>{money(m.paid.total)}</dd></div>
              <div className={Number(m.balanceDue ?? 0) > 0 ? 'is-due' : ''}><dt>Balance due</dt><dd>{money(m.balanceDue)}</dd></div>
              <div className={`j360-variance ${varianceTone(m.variance.currentVsStandard)}`}>
                <dt>Variance vs standard</dt><dd>{signedMoney(m.variance.currentVsStandard)}</dd>
              </div>
            </dl>
            <ul className="j360-counts" aria-label="Status">
              <li className={failed ? 'is-danger' : 'is-success'}>
                <button type="button" onClick={() => setTab('compliance')}>
                  <strong>{failed || passed}</strong><span>{failed ? `check${failed === 1 ? '' : 's'} with issues` : 'checks passed'}</span>
                </button>
              </li>
              <li className={data.numbers.overdueTasks ? 'is-danger' : data.numbers.openTasks ? 'is-warning' : 'is-success'}>
                <Link to={`/p2/journeys/${journeyId}/tasks`}>
                  <strong>{data.numbers.openTasks}</strong><span>open tasks{data.numbers.overdueTasks ? ` · ${data.numbers.overdueTasks} overdue` : ''}</span>
                </Link>
              </li>
              <li className={m.flagged ? 'is-warning' : 'is-success'}>
                <button type="button" onClick={() => setTab('deal')}>
                  <strong>{m.flagged}</strong><span>deal lines to look at</span>
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setTab('documents')}>
                  <strong>{data.numbers.documents}</strong><span>documents</span>
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setTab('vehicle')}>
                  <strong>{data.numbers.vehiclePhotos}</strong><span>vehicle photos</span>
                </button>
              </li>
            </ul>
          </section>

          <nav className="j360-tabs" aria-label="Journey 360 sections">
            {TABS.map((item) => (
              <button key={item.key} type="button" aria-current={tab === item.key ? 'page' : undefined}
                className={tab === item.key ? 'is-active' : ''} onClick={() => setTab(item.key)}>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="j360-body">{body}</div>
        </>
      ) : summary.isLoading ? <div className="p2w-skeleton" aria-busy="true">Loading the journey…</div> : null}
    </div>
  );
}
