import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-data-uploads.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { dealTypeLabel, type DmsDumpKind } from '../services/audit-core/uc03DmsDumps';
import {
  INTIMATION_STATE_LABELS,
  claimIntimation,
  getIntimationSetup,
  listIntimations,
  withdrawIntimation,
  type IntimationItem,
  type IntimationView,
} from '../services/audit-core/uc03DmsIntimations';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

function stamp(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    .format(new Date(value));
}

/** The reports whose pop-up the PC has already seen in this browser session. */
const SEEN_KEY = 'dmsi-report-notice-seen';
function seenReports(): string[] {
  try { return JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '[]') as string[]; } catch { return []; }
}
function markReportSeen(reportId: string): void {
  try { sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seenReports(), reportId].slice(-50))); } catch { /* storage unavailable */ }
}

function day(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(`${value}T00:00:00`));
}

/**
 * Booking / Delivery Intimation (product owner 18 Nov 2026): once a DMS dump is uploaded, the PC
 * opens this tab, sees the dump's rows of the outlets grouped with theirs in the DMS (by default
 * the days since the previous dump, and every earlier row not yet marked or in Verigence, carried
 * into each new dump -- 19 Nov 2026), searches by customer name, mobile or OTF, and marks the
 * bookings / deliveries the dealership intimated to them. A row already in Verigence needs no
 * mark; a mark stays with the booking in later dumps.
 *
 * Once the DMS report has been generated from the dump, the screen says so in a note and a pop-up
 * (product owner 20 Nov 2026): a change made now reaches the report only if the Reviewer / TL
 * generates it again, or with the next dump.
 */
export default function P2DmsIntimationsPage() {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken) ?? undefined;
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const kind: DmsDumpKind = params.get('kind') === 'DELIVERY' ? 'DELIVERY' : 'BOOKING';
  const word = kind === 'BOOKING' ? 'booking' : 'delivery';
  const [view, setView] = useState<IntimationView>('new');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const enabled = Boolean(tenantId && accessToken);

  useEffect(() => {
    const t = setTimeout(() => setQ(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const setup = useQuery({ queryKey: ['dms-intimation-setup', tenantId], queryFn: () => getIntimationSetup(tenantId!, accessToken), enabled });
  const dealers = setup.data?.dealers ?? [];
  const dealerParam = params.get('dealerId') ?? '';
  const dealerId = dealers.some((d) => d.dealerId === dealerParam) ? dealerParam : dealers[0]?.dealerId ?? '';
  const dealer = dealers.find((d) => d.dealerId === dealerId);
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const listKey = ['dms-intimations', tenantId, kind, dealerId, view, q];
  const list = useQuery({
    queryKey: listKey,
    queryFn: () => listIntimations(tenantId!, { kind, dealerId: dealerId || undefined, view, q }, accessToken),
    enabled: enabled && Boolean(dealerId),
  });

  const act = async (item: IntimationItem, claim: boolean) => {
    const key = `${item.dumpId}:${item.rowNo}`;
    setBusyRow(key);
    setError(null);
    try {
      if (claim) await claimIntimation(tenantId!, item, accessToken);
      else await withdrawIntimation(tenantId!, item, accessToken);
      await queryClient.invalidateQueries({ queryKey: ['dms-intimations', tenantId, kind] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not be saved.');
    } finally {
      setBusyRow(null);
    }
  };

  // "Refresh from Verigence": the dump matched again with Verigence as it is now, on demand only
  // (product owner 21 Nov 2026: not on every opening, which would load the system needlessly).
  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const fresh = await listIntimations(tenantId!, { kind, dealerId: dealerId || undefined, view, q, refresh: true }, accessToken);
      queryClient.setQueryData(listKey, fresh);
      await queryClient.invalidateQueries({ queryKey: ['dms-intimations', tenantId, kind, dealerId],
        predicate: (query) => JSON.stringify(query.queryKey) !== JSON.stringify(listKey) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not refresh from Verigence.');
    } finally {
      setRefreshing(false);
    }
  };

  const dump = list.data?.dump;
  const report = list.data?.report ?? null;
  // Once the report is generated, a refresh asks first (product owner 21 Nov 2026): changes now reach
  // the report only if the Reviewer / TL generates it again.
  const askRefresh = () => { if (report) setConfirmRefresh(true); else void refresh(); };
  // The pop-up once per report in a session; the note stays on the screen.
  const showNotice = Boolean(report && !dismissed.includes(report.reportId) && !seenReports().includes(report.reportId));
  const closeNotice = () => {
    if (!report) return;
    markReportSeen(report.reportId);
    setDismissed((ids) => [...ids, report.reportId]);
  };
  const counts = list.data?.counts;
  const canMark = Boolean(setup.data?.canMark);
  // To check: the rows since the previous dump and the earlier ones nobody has marked yet.
  const views: [IntimationView, string][] = [
    ['new', 'To check'],
    ['month', 'Whole month'],
  ];

  return (
    <div className="screen-stack p2-screen p2w dmsi">
      <PageHeader
        eyebrow="Daily duties"
        title={kind === 'BOOKING' ? 'Booking Intimation' : 'Delivery Intimation'}
        description={`Mark the ${word}s of the DMS dump that the dealership intimated to you. A ${word} already in Verigence needs no mark.`}
      />
      {/* Booking and Delivery Intimation are the two tabs of the left-pane entry. */}
      {error ? <div className="p2w-alert p2w-alert--error" role="alert">{error}</div> : null}
      {setup.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{setup.error instanceof Error ? setup.error.message : 'Not available.'}</div> : null}
      {setup.data && !dealers.length ? <p className="p2w-empty">No outlet is mapped to you.</p> : null}

      {dealer ? (
        <SectionCard>
          <div className="dmsi-head">
            {dealers.length > 1 ? (
              <label>Dealership
                <select value={dealerId} onChange={(e) => setParam('dealerId', e.target.value)}>
                  {dealers.map((d) => <option key={d.dealerId} value={d.dealerId}>{d.dealerName}</option>)}
                </select>
              </label>
            ) : <strong>{dealer.dealerName}</strong>}
            {dealer.groupOutlets.length ? (
              <span className="p2w-muted">DMS location {dealer.groups.join(', ')}: {dealer.groupOutlets.join(', ')}</span>
            ) : null}
            <span className="p2w-muted">
              {dump ? `Dump of ${day(dump.dumpDate)}${dump.previousDumpDate ? ` · previous ${day(dump.previousDumpDate)}` : ''}` : list.isLoading ? '' : `No ${word} dump yet this month.`}
            </span>
            {dump ? (
              <span className="dmsi-refresh">
                <span className="p2w-muted">
                  {dump.matchedAtUtc ? `Checked with Verigence ${stamp(dump.matchedAtUtc)}` : 'Not yet checked with Verigence'}
                </span>
                <button type="button" className="p2w-button" onClick={askRefresh} disabled={refreshing || list.isFetching}
                  title="Check the dump again against the bookings and deliveries uploaded in Verigence">
                  {refreshing ? 'Checking with Verigence…' : 'Refresh from Verigence'}
                </button>
              </span>
            ) : null}
          </div>
          {report && dump ? (
            <div className="p2w-alert p2w-alert--review dmsi-report-note" role="status">
              <span>
                <strong>The DMS report has already been generated</strong> from the {word} dump of {day(dump.dumpDate)}
                {' '}(by {report.generatedBy}, {stamp(report.generatedAtUtc)}). If you make changes now, please let the
                Reviewer / TL know so that they can re-generate the report, or wait for the next dump to be uploaded
                to sync with Verigence.
              </span>
            </div>
          ) : null}
          {list.data?.newStates && dump ? (
            <div className="p2du-tiles">
              <div className="p2du-tile p2du-tile--bad"><span>Not marked</span><strong>{list.data.newStates.OPEN}</strong><small>{counts?.open ? `${counts.open} carried from earlier dumps` : 'to check'}</small></div>
              <div className="p2du-tile p2du-tile--warn"><span>Marked intimated</span><strong>{list.data.newStates.INTIMATED}</strong></div>
              <div className="p2du-tile"><span>In Verigence</span><strong>{list.data.newStates.IN_VERIGENCE}</strong></div>
            </div>
          ) : null}
          <div className="dmsi-tools">
            <input type="search" className="dmsi-search" value={search} placeholder="Name, mobile or OTF"
              aria-label="Search the dump" onChange={(e) => setSearch(e.target.value)} />
            {!q.trim() ? (
              <div className="p2du-switcher" role="tablist" aria-label="Rows">
                {views.map(([v, label]) => (
                  <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}>
                    {label}<b>{counts?.[v] ?? 0}</b>
                  </button>
                ))}
              </div>
            ) : <span className="p2w-muted">Searching the whole month</span>}
          </div>

          {list.isLoading ? <p className="p2w-muted">Loading…</p> : null}
          {list.data && dump && !list.data.items.length ? <p className="p2w-empty">No row here.</p> : null}
          <ul className="dmsi-list">
            {(list.data?.items ?? []).map((item) => {
              const key = `${item.dumpId}:${item.rowNo}`;
              const state = INTIMATION_STATE_LABELS[item.state];
              return (
                <li key={key} className={`dmsi-row dmsi-row--${item.state.toLowerCase()}`}>
                  <div className="dmsi-row__main">
                    <strong>{item.customerName ?? '—'}</strong>
                    <span className="p2w-muted">{day(item.eventDate)} · {item.location ?? '—'}{item.mobile ? ` · ${item.mobile}` : ''}</span>
                    {item.carried && item.state === 'OPEN' ? <span className="p2du-tag p2du-tag--warn dmsi-carried">From an earlier dump</span> : null}
                    <span className="dmsi-row__ids">
                      {kind === 'BOOKING'
                        ? <>{item.otf ?? item.bookingNumber ?? '—'}{item.otf && item.bookingNumber ? ` · ${item.bookingNumber}` : ''}</>
                        : <>{item.chassis ?? '—'}{item.otf ? ` · ${item.otf}` : ''}</>}
                      {item.model ? ` · ${item.model}${item.variant ? ` ${item.variant}` : ''}` : ''}
                      {item.consultant ? ` · SC ${item.consultant}` : ''}
                    </span>
                  </div>
                  <div className="dmsi-row__state">
                    <span className={`p2du-tag p2du-tag--${state.tone}`}>{state.label}</span>
                    {kind === 'DELIVERY' ? <span className={`p2du-tag p2du-tag--${dealTypeLabel(item.dealType).tone}`} title={item.dealTypeBasis ?? undefined}>{dealTypeLabel(item.dealType).label}</span> : null}
                    {item.journeyId && item.canOpenJourney !== false ? (
                      <Link className="p2w-link" to={`/p2/journeys/${item.journeyId}/overview`}>{item.journeyReference}</Link>
                    ) : null}
                    {item.journeyId && item.canOpenJourney === false ? (
                      <small className="p2w-muted">{item.journeyReference} · uploaded at {item.journeyOutlet ?? 'another outlet'}{item.journeyUploadedBy ? ` by ${item.journeyUploadedBy}` : ''}</small>
                    ) : null}
                    {item.bookingOnFile ? <small className="p2w-muted">Booking on file, delivery not uploaded</small> : null}
                    {item.mark ? <small className="p2w-muted">{item.mark.mine ? 'By you' : `By ${item.mark.byName}`}</small> : null}
                    {canMark && item.state === 'OPEN' ? (
                      <button type="button" className="p2w-button p2w-button--primary" disabled={busyRow === key}
                        onClick={() => void act(item, true)}>
                        {busyRow === key ? 'Saving…' : 'Intimated to me'}
                      </button>
                    ) : null}
                    {canMark && item.state === 'INTIMATED' && item.mark?.mine ? (
                      <button type="button" className="p2w-link" disabled={busyRow === key} onClick={() => void act(item, false)}>Withdraw</button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {list.data?.truncated ? <p className="p2w-muted">The first 500 rows are shown; search to narrow.</p> : null}
        </SectionCard>
      ) : null}
      {report && dump && confirmRefresh ? (
        <div className="p2w-dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmRefresh(false); }}>
          <div className="p2w-dialog" role="alertdialog" aria-modal="true" aria-labelledby="dmsi-refresh-title" aria-describedby="dmsi-refresh-text">
            <h3 id="dmsi-refresh-title">Report has been generated</h3>
            <p id="dmsi-refresh-text">
              The DMS report has already been generated from the {word} dump of {day(dump.dumpDate)} by {report.generatedBy}
              {' '}({stamp(report.generatedAtUtc)}). If any changes are to be made, please let the Reviewer / TL know so
              that they can re-generate the report.
            </p>
            <div className="p2w-dialog__actions">
              <button type="button" className="p2w-button" onClick={() => setConfirmRefresh(false)}>Cancel</button>
              <button type="button" className="p2w-button p2w-button--primary" autoFocus
                onClick={() => { setConfirmRefresh(false); void refresh(); }}>Continue</button>
            </div>
          </div>
        </div>
      ) : null}
      {report && dump && showNotice ? (
        <div className="p2w-dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) closeNotice(); }}>
          <div className="p2w-dialog" role="alertdialog" aria-modal="true" aria-labelledby="dmsi-report-title" aria-describedby="dmsi-report-text">
            <h3 id="dmsi-report-title">Report has already been generated</h3>
            <p id="dmsi-report-text">
              The DMS report has been generated from the {word} dump of {day(dump.dumpDate)} by {report.generatedBy}
              {' '}({stamp(report.generatedAtUtc)}). If you want to make changes, please let the Reviewer / TL know so
              that they can re-generate the report, or wait for the next dump to be uploaded to sync with Verigence.
            </p>
            <div className="p2w-dialog__actions">
              <button type="button" className="p2w-button p2w-button--primary" autoFocus onClick={closeNotice}>OK</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
