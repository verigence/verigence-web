import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import SectionCard from '../../../components/SectionCard';
import { getSystemHealthAiCost, type AiCostDay } from '../../../services/audit-core/systemHealth';
import { COST_SERIES, calls, costPerJourney, inr, share, typeLabel, usd } from './aiCostLogic';
import { AXIS, ChartTooltip as BaseTooltip, SERIES, SeriesLegend } from './chartParts';
import { dayLabel } from './trendLogic';

/**
 * What the AI provider calls of Document Intelligence cost (product owner 2026-11-16:
 * "I would like to know how much cost we are entailing"). One chart, one axis, one unit
 * (US dollars per day); the tables under it carry every number, per Project, per document
 * type and per day.
 */
const RANGES = [7, 30, 90];
const ChartTooltip = (props: Parameters<typeof BaseTooltip>[0]) => <BaseTooltip labelFormat={dayLabel} {...props} />;

function CostPerDay({ days }: { days: AiCostDay[] }) {
  return (
    <div className="sh-chart" role="img" aria-label="AI cost per day in US dollars, reading and sorting">
      <SeriesLegend series={COST_SERIES} />
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: -4 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--sh-grid)" />
          <XAxis dataKey="date" tickFormatter={dayLabel} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--sh-grid)' }} minTickGap={8} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => `$${v}`} />
          <Tooltip content={<ChartTooltip unit=" US$" />} cursor={{ fill: 'var(--sh-cursor)' }} />
          {COST_SERIES.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="cost" fill={SERIES[i]}
              stroke="var(--sh-surface)" strokeWidth={1}
              radius={i === COST_SERIES.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={28} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AiCostTab({ accessToken }: { accessToken: string }) {
  const [days, setDays] = useState(30);
  const [tenantId, setTenantId] = useState<string>('');
  const cost = useQuery({
    queryKey: ['admin', 'system-health', 'ai-cost', days, tenantId],
    queryFn: () => getSystemHealthAiCost(days, tenantId || null, accessToken),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const data = cost.data;
  const rate = data?.usdInr ?? 0;
  const perJourney = useMemo(() => (data ? costPerJourney(data.projects) : null), [data]);

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
            {data?.projectOptions.map((p) => (
              <option key={p.tenantId} value={p.tenantId}>{p.projectName}{p.projectStatus && p.projectStatus !== 'ACTIVE' ? ` (${p.projectStatus.toLowerCase()})` : ''}</option>
            ))}
          </select>
        </label>
      </div>

      {cost.isError ? <div className="p2w-alert p2w-alert--error" role="alert">{cost.error instanceof Error ? cost.error.message : 'The AI cost could not be loaded.'}</div> : null}
      {cost.isLoading ? <div className="p2w-skeleton">Loading…</div> : null}
      {data && !data.available ? (
        <div className="p2w-alert p2w-alert--error" role="alert">
          Document Intelligence could not be asked for its costs: {data.error ?? 'no answer'}. The figures below are empty, not zero spend.
        </div>
      ) : null}

      {data ? (
        <>
          <dl className="tm-tiles">
            <div><dt>Last {data.days} days</dt><dd>{usd(data.totals.costUsd)}</dd>
              <span>about {inr(data.totals.costUsd, rate)} · {calls(data.totals).toLocaleString('en-IN')} calls</span></div>
            <div><dt>Today</dt><dd>{usd(data.today?.costUsd ?? 0)}</dd>
              <span>about {inr(data.today?.costUsd ?? 0, rate)} · {(data.today ? calls(data.today) : 0).toLocaleString('en-IN')} calls so far</span></div>
            <div><dt>This month so far</dt><dd>{data.month.coveredFromFirst ? usd(data.month.costUsd) : '—'}</dd>
              <span>{data.month.coveredFromFirst
                ? (data.month.projectedUsd !== null
                  ? `${usd(data.month.projectedUsd)} (about ${inr(data.month.projectedUsd, rate)}) for the month at the pace of its ${data.month.completeDays} complete days`
                  : 'too few complete days to project the month')
                : 'choose a longer range to reach the 1st of the month'}</span></div>
            <div><dt>Per Journey</dt><dd>{usd(perJourney)}</dd>
              <span>{perJourney === null ? 'no Journey had uploads in this range' : `about ${inr(perJourney, rate)} per Journey with uploads in this range`}</span></div>
          </dl>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>AI cost per day</h3>
              <p className="p2w-muted">US dollars at list price, by IST day. Reading is the extraction of a document's fields; sorting is deciding what each page is.</p>
            </div>
            <CostPerDay days={data.daily} />
          </SectionCard>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>By Project</h3>
              <p className="p2w-muted">A Journey is counted when it had a page uploaded in this range.</p>
            </div>
            {data.projects.length ? (
              <div className="p2dr-scroll">
                <table className="p2dr-table">
                  <thead>
                    <tr>
                      <th>Project</th><th className="sh-num">Reading</th><th className="sh-num">Sorting</th>
                      <th className="sh-num">Total</th><th className="sh-num">About</th><th className="sh-num">Calls</th>
                      <th className="sh-num">Journeys</th><th className="sh-num">Per Journey</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.projects.map((p) => (
                      <tr key={p.tenantId}>
                        <td>{p.projectName}</td>
                        <td className="sh-num">{usd(p.extractionUsd)}</td><td className="sh-num">{usd(p.classificationUsd)}</td>
                        <td className="sh-num"><b>{usd(p.costUsd)}</b></td><td className="sh-num">{inr(p.costUsd, rate)}</td>
                        <td className="sh-num">{calls(p).toLocaleString('en-IN')}</td>
                        <td className="sh-num">{p.journeysWithUploads.toLocaleString('en-IN')}</td>
                        <td className="sh-num">{usd(p.costPerJourneyUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="p2w-muted">No AI calls in this range.</p>}
          </SectionCard>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>Reading, by document type</h3>
              <p className="p2w-muted">Dearest first. Sorting is not per document type: a page has no type until it is sorted.</p>
            </div>
            {data.documentTypes.length ? (
              <div className="p2dr-scroll">
                <table className="p2dr-table">
                  <thead>
                    <tr>
                      <th>Document type</th><th className="sh-num">Reads</th><th className="sh-num">Failed</th>
                      <th className="sh-num">Cost</th><th className="sh-num">Share of reading</th><th className="sh-num">Per read</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.documentTypes.map((t) => (
                      <tr key={t.documentTypeKey}>
                        <td>{typeLabel(t.documentTypeKey)}</td>
                        <td className="sh-num">{t.reads.toLocaleString('en-IN')}</td>
                        <td className={t.failedCalls ? 'sh-num tm-warn' : 'sh-num'}>{t.failedCalls}</td>
                        <td className="sh-num">{usd(t.costUsd)}</td>
                        <td className="sh-num">{share(t.costUsd, data.totals.extractionUsd)}</td>
                        <td className="sh-num">{usd(t.costPerReadUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="p2w-muted">No reads in this range.</p>}
          </SectionCard>

          <SectionCard>
            <div className="p2w-card__title">
              <h3>The numbers</h3>
              <p className="p2w-muted">Every figure the chart draws, per IST day.</p>
            </div>
            <div className="p2dr-scroll">
              <table className="p2dr-table">
                <thead>
                  <tr>
                    <th>Day</th><th className="sh-num">Reads</th><th className="sh-num">Sorting calls</th><th className="sh-num">Failed</th>
                    <th className="sh-num">No cost kept</th><th className="sh-num">Reading</th><th className="sh-num">Sorting</th>
                    <th className="sh-num">Total</th><th className="sh-num">About</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.daily].reverse().map((d) => (
                    <tr key={d.date}>
                      <td>{dayLabel(d.date)}</td>
                      <td className="sh-num">{d.reads.toLocaleString('en-IN')}</td>
                      <td className="sh-num">{d.classifications.toLocaleString('en-IN')}</td>
                      <td className={d.failedCalls ? 'sh-num tm-warn' : 'sh-num'}>{d.failedCalls}</td>
                      <td className={d.callsWithoutCost ? 'sh-num tm-warn' : 'sh-num'}>{d.callsWithoutCost.toLocaleString('en-IN')}</td>
                      <td className="sh-num">{usd(d.extractionUsd)}</td><td className="sh-num">{usd(d.classificationUsd)}</td>
                      <td className="sh-num"><b>{usd(d.costUsd)}</b></td><td className="sh-num">{inr(d.costUsd, rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="sh-notes">
              {data.prices.map((p) => (
                <li key={`${p.model}-${p.tier}`}>
                  {p.model}, {p.tier.toLowerCase()} tier: ${p.inputPerMTok} per million input tokens, ${p.outputPerMTok} per million output tokens.
                </li>
              ))}
              {data.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
