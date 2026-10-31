import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

import SectionCard from '../../../components/SectionCard';
import { getSystemHealthDaily, type DailyHealthRow } from '../../../services/audit-core/systemHealth';
import {
  DI_FAILURE_KINDS, REFUSAL_KINDS, SYSTEM_SERIES, dayLabel, halfOverHalf, hasCodes, pct, rangeFailedPct, signedPct, total,
} from './trendLogic';
import { AXIS, ChartTooltip as BaseTooltip, SERIES, SeriesLegend } from './chartParts';

/**
 * How Document Intelligence errors and system failures move day by day (product
 * owner 2026-10-30). Each chart has one axis and one unit; the table under the
 * charts carries every number.
 */
const RANGES = [7, 14, 30];
const ChartTooltip = (props: Parameters<typeof BaseTooltip>[0]) => <BaseTooltip labelFormat={dayLabel} {...props} />;

function StackedDays({ days, series, label }: {
  days: DailyHealthRow[]; series: ReadonlyArray<{ key: string; label: string }>; label: string;
}) {
  return (
    <div className="sh-chart" role="img" aria-label={label}>
      <SeriesLegend series={series} />
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--sh-grid)" />
          <XAxis dataKey="date" tickFormatter={dayLabel} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--sh-grid)' }} minTickGap={8} />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={44} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--sh-cursor)' }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={SERIES[i]}
              stroke="var(--sh-surface)" strokeWidth={1}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={28} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function MiniBars({ days, dataKey, label }: { days: DailyHealthRow[]; dataKey: string; label: string }) {
  const sum = days.reduce((n, d) => n + Number(d[dataKey as keyof DailyHealthRow] ?? 0), 0);
  return (
    <figure className="sh-mini">
      <figcaption><span>{label}</span><b>{sum.toLocaleString('en-IN')}</b></figcaption>
      <div className="sh-chart" role="img" aria-label={`${label} per day`}>
        <ResponsiveContainer width="100%" height={96}>
          <BarChart data={days} margin={{ top: 4, right: 2, bottom: 0, left: 2 }} barCategoryGap="22%">
            <XAxis dataKey="date" tick={false} tickLine={false} axisLine={{ stroke: 'var(--sh-grid)' }} height={2} />
            <YAxis hide allowDecimals={false} domain={[0, (max: number) => Math.max(max, 1)]} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--sh-cursor)' }} />
            <Bar dataKey={dataKey} name={label} fill="var(--sh-series-1)" radius={[3, 3, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export default function DailyTrendTab({ accessToken }: { accessToken: string }) {
  const [days, setDays] = useState(14);
  const [tenantId, setTenantId] = useState<string>('');
  const daily = useQuery({
    queryKey: ['admin', 'system-health', 'daily', days, tenantId],
    queryFn: () => getSystemHealthDaily(days, tenantId || null, accessToken),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const data = daily.data;
  const rows = useMemo(() => data?.days ?? [], [data]);
  // Today is still running: the half-on-half comparison uses complete days only.
  const completeDays = useMemo(() => rows.slice(0, -1), [rows]);
  const refusalDays = useMemo(() => rows.filter((d) => hasCodes(d, data?.codesRecordedFrom ?? null)), [rows, data]);
  const diFailures = total(rows, 'badScan') + total(rows, 'notReadInTime') + total(rows, 'failedOther');

  return (
    <div className="sh-stack sh-viz">
      <div className="p2w-listbar">
        <div className="p2w-segment" role="tablist" aria-label="Days">
          {RANGES.map((n) => (
            <button key={n} type="button" role="tab" aria-selected={days === n} className={days === n ? 'is-active' : ''} onClick={() => setDays(n)}>
              {n} days
            </button>
          ))}
        </div>
        <label className="sh-search">Project{' '}
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            <option value="">All Projects</option>
            {data?.projects.map((p) => (
              <option key={p.tenantId} value={p.tenantId}>{p.projectName}{p.projectStatus && p.projectStatus !== 'ACTIVE' ? ` (${p.projectStatus.toLowerCase()})` : ''}</option>
            ))}
          </select>
        </label>
      </div>

      {daily.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{daily.error instanceof Error ? daily.error.message : 'The daily trend could not be loaded.'}</div> : null}
      {daily.isLoading ? <div className="p2w-skeleton">Loading…</div> : null}

      {data ? (
        <>
          <dl className="tm-tiles">
            <div className={diFailures ? 'is-warn' : ''}><dt>DI failures</dt><dd>{diFailures.toLocaleString('en-IN')}</dd>
              <span>{pct(rangeFailedPct(rows))} of {total(rows, 'documents').toLocaleString('en-IN')} pages</span></div>
            <div className={rangeFailedPct(rows, true) ? 'is-warn' : ''}><dt>System-side DI failures</dt><dd>{pct(rangeFailedPct(rows, true))}</dd>
              <span>not read in 30 min or failed; scans excluded</span></div>
            <div className={total(rows, 'serverErrors') ? 'is-bad' : ''}><dt>Server errors (5xx)</dt><dd>{total(rows, 'serverErrors')}</dd>
              <span>{signedPct(halfOverHalf(completeDays, 'serverErrors'))}, complete days</span></div>
            <div className={total(rows, 'restarts') + total(rows, 'uncleanStops') ? 'is-warn' : ''}><dt>Restarts</dt><dd>{total(rows, 'restarts')}</dd>
              <span>{total(rows, 'uncleanStops')} unclean stops · {total(rows, 'deploysFailed')} failed deploys</span></div>
          </dl>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>Document Intelligence failures per day</h3>
              <p className="p2w-muted">Pages uploaded that day that did not get read. Scan quality is the photo (the PC's side); the other two are the system's.</p>
            </div>
            <StackedDays days={rows} series={DI_FAILURE_KINDS} label="Document Intelligence failures per day, by kind" />
          </SectionCard>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>DI failure rate per day</h3>
              <p className="p2w-muted">Share of the day's settled pages that failed. A gap is a day with no pages.</p>
            </div>
            <div className="sh-chart" role="img" aria-label="Document Intelligence failure rate per day">
              <SeriesLegend series={[{ label: 'All failures' }, { label: 'System side (scans excluded)' }]} line />
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                  <CartesianGrid vertical={false} stroke="var(--sh-grid)" />
                  <XAxis dataKey="date" tickFormatter={dayLabel} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--sh-grid)' }} minTickGap={8} />
                  <YAxis unit="%" tick={AXIS} tickLine={false} axisLine={false} width={48} tickCount={6} allowDecimals={false}
                    domain={[0, (max: number) => Math.max(10, Math.ceil(max / 5) * 5)]} />
                  <Tooltip content={<ChartTooltip unit="%" />} cursor={{ stroke: 'var(--sh-axis-text)', strokeDasharray: '3 3' }} />
                  <Line type="monotone" dataKey="diFailedPct" name="All failures" stroke="var(--sh-series-1)" strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2, fill: 'var(--sh-surface)' }} activeDot={{ r: 5 }} connectNulls={false} />
                  <Line type="monotone" dataKey="diSystemFailedPct" name="System side (scans excluded)" stroke="var(--sh-series-2)" strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2, fill: 'var(--sh-surface)' }} activeDot={{ r: 5 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>System failures per day</h3>
              <p className="p2w-muted">Each on its own scale. Platform-wide{tenantId ? '; gave up after retries is for the selected Project' : ''}.</p>
            </div>
            <div className="sh-minis">
              {SYSTEM_SERIES.map((s) => <MiniBars key={s.key} days={rows} dataKey={s.key} label={s.label} />)}
            </div>
          </SectionCard>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>Refused requests per day</h3>
              <p className="p2w-muted">
                {data.codesRecordedFrom
                  ? `By kind, from ${dayLabel(data.codesRecordedFrom)} when error codes began to be recorded.`
                  : 'Error codes are recorded from this release on; this chart fills in from tomorrow.'}
              </p>
            </div>
            {refusalDays.length ? <StackedDays days={refusalDays} series={REFUSAL_KINDS} label="Refused requests per day, by kind" />
              : <p className="p2w-muted">Nothing recorded yet.</p>}
          </SectionCard>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>The numbers</h3>
              <p className="p2w-muted">Every figure the charts draw, per IST day.</p>
            </div>
            <div className="p2dr-scroll">
              <table className="p2dr-table">
                <thead>
                  <tr>
                    <th>Day</th><th className="sh-num">Pages</th><th className="sh-num">Read</th><th className="sh-num">Scan quality</th>
                    <th className="sh-num">Not read 30 min</th><th className="sh-num">Other DI</th><th className="sh-num">Failed %</th>
                    <th className="sh-num">Requests</th><th className="sh-num">4xx</th><th className="sh-num">5xx</th>
                    <th className="sh-num">Restarts</th><th className="sh-num">Unclean</th><th className="sh-num">Failed deploys</th><th className="sh-num">Gave up</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows].reverse().map((d) => (
                    <tr key={d.date}>
                      <td>{dayLabel(d.date)}</td>
                      <td className="sh-num">{d.documents}</td><td className="sh-num">{d.read}</td>
                      <td className="sh-num">{d.badScan}</td><td className={d.notReadInTime ? 'sh-num tm-warn' : 'sh-num'}>{d.notReadInTime}</td>
                      <td className={d.failedOther ? 'sh-num tm-warn' : 'sh-num'}>{d.failedOther}</td><td className="sh-num">{pct(d.diFailedPct)}</td>
                      <td className="sh-num">{d.requests ? d.requests.toLocaleString('en-IN') : '—'}</td>
                      <td className="sh-num">{d.requests ? d.clientErrors : '—'}</td>
                      <td className={d.serverErrors ? 'sh-num tm-bad' : 'sh-num'}>{d.requests ? d.serverErrors : '—'}</td>
                      <td className={d.restarts ? 'sh-num tm-warn' : 'sh-num'}>{d.restarts}</td>
                      <td className={d.uncleanStops ? 'sh-num tm-warn' : 'sh-num'}>{d.uncleanStops}</td>
                      <td className={d.deploysFailed ? 'sh-num tm-bad' : 'sh-num'}>{d.deploysFailed}</td>
                      <td className={d.deadLetters ? 'sh-num tm-bad' : 'sh-num'}>{d.deadLetters}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="sh-notes">
              {data.requestsRecordedFrom ? <li>Requests are counted from {dayLabel(data.requestsRecordedFrom)}; a "—" is a day before that.</li> : null}
              {data.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
