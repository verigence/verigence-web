import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../styles/uc03-p2.css';
import '../styles/uc03-p2-workspace.css';
import '../styles/uc03-p2-daily-report.css';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { customerLabel } from '../features/uc03-p2/bookings/JourneyRow';
import {
  getP2DailyProcessingReport,
  type P2DailyCounts,
  type P2DailyJourneyRow,
  type P2DailyPcRow,
} from '../services/audit-core/uc03P2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

/** Today in the browser's calendar (the report itself uses the Project's timezone). */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function time(value: string | null, timezone: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(date);
}

function duration(minutes: number | null): string {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

function pcLabel(name: string | null, actorId: string | null): string {
  return name?.trim() || (actorId ? `PC ••••${actorId.replace(/[^a-zA-Z0-9]/g, '').slice(-6)}` : 'PC not recorded');
}

function uploadSummary(pcs: P2DailyPcRow[], day: string): string {
  const uploaded = pcs.filter((pc) => pc.journeysUploaded > 0).length;
  const others = pcs.length - uploaded;
  const head = `${uploaded} PC${uploaded === 1 ? '' : 's'} uploaded on ${day}`;
  return others ? `${head} · ${others} more with only system activity on earlier journeys` : head;
}

/** The figures every row shows, PC summary and journey alike. */
function CountCells({ row }: { row: P2DailyCounts }) {
  const d = row.documents;
  return (
    <>
      <td data-label="Files · pages">{row.files} · {row.pages}{row.duplicateFiles ? <span className="p2w-muted"> ({row.duplicateFiles} repeat)</span> : null}</td>
      <td data-label="Read correctly"><strong>{d.extracted}</strong></td>
      <td data-label="Waiting" className={d.waiting ? 'p2dr-warn' : undefined}>{d.waiting}</td>
      <td data-label="Failed" className={d.failed ? 'p2dr-bad' : undefined}>
        {d.failed}{d.rejectedScans ? <span className="p2w-muted"> ({d.rejectedScans} scan)</span> : null}
      </td>
      <td data-label="Not read · no values">{d.notRead} · {d.readNoValues}</td>
      <td data-label="Tasks opened">{row.tasksOpened}{row.tasksReopened ? <span className="p2w-muted"> +{row.tasksReopened} reopened</span> : null}</td>
      <td data-label="Auto retries · exhausted">{row.autoRetries} · <span className={row.retriesExhausted ? 'p2dr-bad' : undefined}>{row.retriesExhausted}</span></td>
      <td data-label="PC retry · read again · re-sync">{row.pcRetries} · {row.readAgain} · {row.resyncs}</td>
      <td data-label="Night: asked · fixed">{row.nightRequests} · {row.nightFixed}</td>
    </>
  );
}

const HEAD = (
  <>
    <th>Files · pages</th>
    <th>Read correctly</th>
    <th>Waiting</th>
    <th>Failed</th>
    <th>Not read · no values</th>
    <th>Tasks opened</th>
    <th>Auto retries · exhausted</th>
    <th>PC retry · read again · re-sync</th>
    <th>Night: asked · fixed</th>
  </>
);

function JourneyLine({ row, timezone }: { row: P2DailyJourneyRow; timezone: string }) {
  const customer = customerLabel(row.customerName);
  return (
    <tr className={row.uploadStartedAt ? undefined : 'p2dr-earlier'}>
      <td data-label="Journey">
        <Link to={`/p2/journeys/${row.journeyId}/overview`} className={customer.known ? undefined : 'is-unknown'}>{customer.text}</Link>
        <span className="p2w-muted p2dr-sub">{row.outletName}{row.outletCode ? ` · ${row.outletCode}` : ''}</span>
      </td>
      <td data-label="PC">{pcLabel(row.pcName, row.pcActorId)}</td>
      <td data-label="Start · finish">{time(row.uploadStartedAt, timezone)} · {row.uploadStartedAt ? time(row.processingFinishedAt, timezone) : '—'}</td>
      <td data-label="Total time">{row.uploadStartedAt ? (row.processingFinishedAt ? duration(row.processingMinutes) : 'Still processing') : 'No upload today'}</td>
      <CountCells row={row} />
    </tr>
  );
}

/**
 * Daily processing (TL, PM, Executive): how the system handled each PC's day.
 * Every figure comes from what Audit Core stores (see the report's notes);
 * nothing is estimated.
 */
export default function P2DailyProcessingReportPage() {
  const project = useProjectContextStore((s) => s.selectedProject);
  const accessToken = useSessionStore((s) => s.accessToken);
  const tenantId = project?.tenantId;
  const [day, setDay] = useState(todayIso());
  const report = useQuery({
    queryKey: ['p2-daily-processing', tenantId, day],
    queryFn: () => getP2DailyProcessingReport(tenantId!, day, accessToken),
    enabled: Boolean(tenantId && accessToken && day),
    staleTime: 60_000,
  });
  const data = report.data;
  const timezone = data?.timezone || project?.timezoneName || 'Asia/Kolkata';

  return (
    <div className="screen-stack p2-screen p2w p2dr">
      <PageHeader
        eyebrow="Booking & Delivery"
        title="Daily processing"
        description="Per PC, one day: what was uploaded, how much the system read, what is still waiting, how long it took, and how many retries, re-syncs and night corrections were needed."
      />

      <div className="p2w-listbar">
        <label className="p2dr-day">
          <span>Day</span>
          <input type="date" value={day} max={todayIso()} onChange={(event) => setDay(event.target.value)} />
        </label>
        {report.isFetching ? <span className="p2w-muted">Loading…</span> : null}
      </div>

      {report.isError ? (
        <div className="p2w-alert p2w-alert--error" role="alert">
          {report.error instanceof Error ? report.error.message : 'The report could not be loaded.'}
        </div>
      ) : null}

      {data ? (
        <>
          <SectionCard>
            <div className="p2w-card__title">
              <h3>By PC</h3>
              <p className="p2w-muted">{data.pcs.length ? uploadSummary(data.pcs, data.day) : `Nothing happened on ${data.day}.`}</p>
            </div>
            {data.pcs.length ? (
              <div className="p2dr-scroll">
                <table className="p2dr-table">
                  <thead>
                    <tr>
                      <th>PC</th>
                      <th>Journeys uploaded</th>
                      <th>Pages / journey</th>
                      <th>First upload · last finish</th>
                      <th>Total time</th>
                      {HEAD}
                    </tr>
                  </thead>
                  <tbody>
                    {data.pcs.map((pc) => (
                      <Fragment key={pc.pcActorId ?? 'none'}>
                        <tr>
                          <td data-label="PC"><strong>{pcLabel(pc.pcName, pc.pcActorId)}</strong>
                            {!pc.journeysUploaded ? <span className="p2w-muted p2dr-sub">No upload on this day</span> : null}
                          </td>
                          <td data-label="Journeys uploaded">{pc.journeysUploaded}</td>
                          <td data-label="Pages / journey">{pc.pagesPerJourney ?? '—'}</td>
                          <td data-label="First upload · last finish">{time(pc.firstUploadAt, timezone)} · {time(pc.lastFinishedAt, timezone)}</td>
                          <td data-label="Total time">{pc.stillProcessing ? `${pc.stillProcessing} still processing` : duration(pc.spanMinutes)}</td>
                          <CountCells row={pc} />
                        </tr>
                        {pc.earlier?.journeys ? (
                          <tr className="p2dr-earlier">
                            <td data-label="Earlier journeys" colSpan={5}>
                              Earlier journeys: {pc.earlier.journeys}
                              <span className="p2w-muted p2dr-sub">Not uploaded on this day; tasks and fixes from the system's own re-checks</span>
                            </td>
                            <CountCells row={pc.earlier} />
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </SectionCard>

          {data.journeys.length ? (
            <SectionCard>
              <div className="p2w-card__title">
                <h3>By journey</h3>
                <p className="p2w-muted">Every journey uploaded on the day, and every journey with a retry, re-sync, night correction or new task.</p>
              </div>
              <div className="p2dr-scroll">
                <table className="p2dr-table">
                  <thead>
                    <tr>
                      <th>Journey</th>
                      <th>PC</th>
                      <th>Start · finish</th>
                      <th>Total time</th>
                      {HEAD}
                    </tr>
                  </thead>
                  <tbody>
                    {data.journeys.map((row) => <JourneyLine key={`${row.journeyId}-${row.pcActorId}`} row={row} timezone={timezone} />)}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard>
            <div className="p2w-card__title"><h3>How these are counted</h3></div>
            <ul className="p2dr-notes">
              {data.notes.map((note) => <li key={note}>{note}</li>)}
              <li>Times are in {timezone}.</li>
            </ul>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
