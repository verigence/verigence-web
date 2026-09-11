import ReactECharts from 'echarts-for-react';

import SectionCard from '../../components/SectionCard';
import type { AnalyticsDashboardData, AnalyticsScorecardRow } from '../../services/analytics/client';
import { AnalyticsBubbleChart, AnalyticsParetoChart } from './AnalyticsCharts';

const chartFont = 'Inter, Arial, Helvetica, sans-serif';

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(value: number): string {
  return `${Number(value || 0).toFixed(1)}%`;
}

function humanize(value: string): string {
  if (!value) return 'Unspecified';
  const acronyms: Record<string, string> = { ew: 'EW', rsa: 'RSA', gst: 'GST', id: 'ID', rc: 'RC', po: 'PO', upi: 'UPI' };
  return value
    .replace(/[:/]/g, ' ')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((token) => acronyms[token.toLowerCase()] || `${token.charAt(0).toUpperCase()}${token.slice(1).toLowerCase()}`)
    .join(' ');
}

function humanizeRuleKey(value: string): string {
  const [prefix, suffix] = value.split(':', 2);
  if (suffix && prefix.includes('REQUIRED_DOCUMENT_MISSING')) return `Missing: ${humanize(suffix)}`;
  if (suffix && prefix.includes('DISCOUNT_EVIDENCE_MISSING')) return `Missing evidence: ${humanize(suffix)}`;
  return suffix ? `${humanize(prefix)} · ${humanize(suffix)}` : humanize(value);
}

function aggregate<T>(rows: T[], label: (row: T) => string, value: (row: T) => number) {
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    const key = label(row) || 'Unspecified';
    totals.set(key, (totals.get(key) || 0) + value(row));
  });
  return Array.from(totals.entries())
    .map(([rowLabel, rowValue]) => ({ label: rowLabel, value: rowValue }))
    .sort((a, b) => b.value - a.value);
}

function PulseTile({ label, value, detail, emphasis = false }: { label: string; value: string; detail: string; emphasis?: boolean }) {
  return (
    <article className={`analytics-pulse-tile${emphasis ? ' analytics-pulse-tile--emphasis' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function ScopeTable({ rows, level }: { rows: AnalyticsScorecardRow[]; level: 'dealer' | 'outlet' }) {
  if (!rows.length) return <p className="analytics-empty-copy">No {level} rows are configured in this snapshot.</p>;
  return (
    <div className="data-table-wrap analytics-table-wrap analytics-scorecard-table-wrap">
      <table className="data-table analytics-scorecard-table">
        <thead>
          <tr>
            <th>{level === 'dealer' ? 'Dealer' : 'Dealer / Outlet'}</th>
            <th>Journeys</th>
            <th>Issue Journeys</th>
            <th>Missing Docs</th>
            <th>Finance</th>
            <th>Insurance</th>
            <th>Trade-in</th>
            <th>EW</th>
            <th>RSA</th>
            <th>Accessories</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.outlet_id || row.dealer_id} className={row.journey_count === 0 ? 'analytics-scorecard-table__inactive' : undefined}>
              <td>
                <strong>{level === 'dealer' ? row.dealer_name : row.outlet_name || 'Unspecified outlet'}</strong>
                {level === 'outlet' ? <small>{row.dealer_name}{row.city ? ` · ${row.city}` : ''}</small> : null}
              </td>
              <td>{formatNumber(row.journey_count)}</td>
              <td><span className="analytics-rate analytics-rate--issue">{percent(row.journeys_with_findings_pct)}</span><small>{formatNumber(row.finding_count)} findings</small></td>
              <td><span className="analytics-rate analytics-rate--issue">{percent(row.journeys_with_missing_documents_pct)}</span><small>{formatNumber(row.missing_document_flag_count)} flags</small></td>
              <td>{percent(row.finance_penetration_pct)}</td>
              <td>{percent(row.insurance_penetration_pct)}</td>
              <td>{percent(row.trade_in_penetration_pct)}</td>
              <td>{percent(row.ew_penetration_pct)}</td>
              <td>{percent(row.rsa_penetration_pct)}</td>
              <td>{percent(row.accessory_penetration_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PenetrationHeatmap({ title, rows }: { title: string; rows: AnalyticsScorecardRow[] }) {
  const metrics = [
    ['Finance', 'finance_penetration_pct'],
    ['Insurance', 'insurance_penetration_pct'],
    ['Trade-in', 'trade_in_penetration_pct'],
    ['EW', 'ew_penetration_pct'],
    ['RSA', 'rsa_penetration_pct'],
    ['Accessories', 'accessory_penetration_pct'],
    ['Corporate Disc.', 'corporate_discount_penetration_pct'],
    ['GST Benefit', 'gst_benefit_penetration_pct'],
    ['Exchange Disc.', 'exchange_discount_penetration_pct'],
  ] as const;
  const labels = rows.map((row) => row.scope_level === 'OUTLET' ? `${row.dealer_name} · ${row.outlet_name || 'Outlet'}` : row.dealer_name);
  const cells: Array<[number, number, number]> = [];
  rows.forEach((row, rowIndex) => {
    metrics.forEach(([, key], columnIndex) => cells.push([columnIndex, rowIndex, Number(row[key] || 0)]));
  });

  if (!rows.length) return null;
  const option = {
    textStyle: { fontFamily: chartFont },
    tooltip: {
      position: 'top',
      formatter: (params: { data?: [number, number, number] }) => {
        const item = params.data;
        if (!item) return '';
        return `${labels[item[1]]}<br/>${metrics[item[0]][0]}: ${item[2].toFixed(1)}%`;
      },
    },
    grid: { top: 30, right: 30, bottom: 78, left: 200 },
    xAxis: {
      type: 'category',
      data: metrics.map(([label]) => label),
      axisLabel: { rotate: 28, fontFamily: chartFont, color: '#58718d', fontSize: 10.5 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'category',
      data: labels,
      axisLabel: { fontFamily: chartFont, color: '#31506e', width: 180, overflow: 'truncate', fontSize: 10.5 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    visualMap: {
      min: 0,
      max: 100,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 8,
      text: ['100%', '0%'],
      textStyle: { fontFamily: chartFont, color: '#58718d' },
      inRange: { color: ['#eef5f8', '#a9d6d8', '#49a8ad', '#0a6575', '#07366b'] },
    },
    series: [{
      name: 'Penetration',
      type: 'heatmap',
      data: cells,
      label: {
        show: true,
        formatter: (params: { data?: [number, number, number] }) => `${Math.round(params.data?.[2] || 0)}%`,
        fontFamily: chartFont,
        fontSize: 9.5,
      },
      emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(7,54,107,0.22)' } },
    }],
  };

  return (
    <SectionCard title={title} description="Penetration is measured as journeys containing the product or benefit divided by journeys in that dealer/outlet. Zero-activity locations remain visible rather than disappearing.">
      <ReactECharts option={option} style={{ height: Math.max(360, rows.length * 46 + 150), width: '100%' }} notMerge lazyUpdate />
    </SectionCard>
  );
}

export default function AnalyticsProjectOverview({ data }: { data: AnalyticsDashboardData }) {
  const summary = data.network.project_summary;
  const activeDealers = data.network.dealers.filter((row) => row.journey_count > 0);
  const activeOutlets = data.network.outlets.filter((row) => row.journey_count > 0);
  const dealerRisk = activeDealers.map((row) => ({
    label: row.dealer_name,
    x: row.journey_count,
    y: row.journeys_with_findings_pct,
    size: Math.max(row.finding_count, 1),
  }));
  const missingRules = aggregate(data.documents.missing_document_flags, (row) => humanizeRuleKey(row.rule_key), (row) => row.flag_count);
  const attentionRows = [...data.network.outlets]
    .filter((row) => row.journey_count > 0)
    .sort((a, b) => (b.journeys_with_findings_pct - a.journeys_with_findings_pct) || (b.high_finding_count - a.high_finding_count));

  return (
    <>
      <section className="analytics-project-pulse">
        <div className="analytics-project-pulse__intro">
          <span>Project business pulse</span>
          <strong>{formatNumber(summary.journey_count)} journeys</strong>
          <p>{formatNumber(summary.active_dealer_count)} of {formatNumber(summary.dealer_count)} dealers and {formatNumber(summary.active_outlet_count)} of {formatNumber(summary.outlet_count)} outlets currently have journey activity in the snapshot.</p>
        </div>
        <div className="analytics-project-pulse__metrics">
          <PulseTile label="Receipt value" value={formatMoney(summary.payment_amount)} detail="Captured across the project" />
          <PulseTile label="Journeys with findings" value={percent(summary.journeys_with_findings_pct)} detail={`${formatNumber(summary.finding_count)} findings · ${formatNumber(summary.high_finding_count)} high severity`} emphasis={summary.journeys_with_findings_pct > 0} />
          <PulseTile label="Missing-document journeys" value={percent(summary.journeys_with_missing_documents_pct)} detail={`${formatNumber(summary.missing_document_flag_count)} missing-document flags`} emphasis={summary.journeys_with_missing_documents_pct > 0} />
          <PulseTile label="Actual discount" value={formatMoney(summary.actual_discount_amount)} detail={`Eligible basis captured: ${formatMoney(summary.eligible_discount_amount)}`} />
        </div>
      </section>

      <SectionCard title="Dealer Business Scorecard" description="Project-wide comparison. No synthetic composite compliance score is used; the scorecard shows the underlying issue and penetration measures directly.">
        <ScopeTable rows={data.network.dealers} level="dealer" />
      </SectionCard>

      <div className="analytics-split analytics-split--project-risk">
        <SectionCard title="Dealer Compliance Pressure" description="Dealers are positioned by journey volume and the share of journeys carrying findings. Bubble size follows total finding count.">
          <AnalyticsBubbleChart rows={dealerRisk} xLabel="Journeys" yLabel="Journeys with findings" yKind="percent" />
        </SectionCard>
        <section className="analytics-attention-panel">
          <div className="analytics-attention-panel__header">
            <span>Where to look first</span>
            <h3>Outlet attention ranking</h3>
            <p>Active outlets ranked by finding pressure; missing-document and high-severity counts stay visible beside the rate.</p>
          </div>
          {attentionRows.length ? (
            <ol className="analytics-attention-list">
              {attentionRows.slice(0, 8).map((row, index) => (
                <li key={row.outlet_id || `${row.dealer_id}-${index}`}>
                  <span className="analytics-attention-list__rank">{index + 1}</span>
                  <span className="analytics-attention-list__copy"><strong>{row.outlet_name || 'Unspecified outlet'}</strong><small>{row.dealer_name}</small></span>
                  <span className="analytics-attention-list__metric"><strong>{percent(row.journeys_with_findings_pct)}</strong><small>{formatNumber(row.high_finding_count)} high · {formatNumber(row.missing_document_flag_count)} missing-doc flags</small></span>
                </li>
              ))}
            </ol>
          ) : <p className="analytics-empty-copy">No active outlet has journey data in the current snapshot.</p>}
        </section>
      </div>

      <PenetrationHeatmap title="Dealer Penetration Landscape" rows={data.network.dealers} />
      <PenetrationHeatmap title="Outlet Penetration Landscape" rows={data.network.outlets} />

      <SectionCard title="Outlet Business Scorecard" description="Every configured outlet remains visible, including outlets with no current journey volume, so coverage gaps are not hidden.">
        <ScopeTable rows={data.network.outlets} level="outlet" />
      </SectionCard>

      {missingRules.length ? (
        <SectionCard title="Project Missing-document Concentration" description="Which missing-document rules explain the current project-level evidence exceptions.">
          <AnalyticsParetoChart rows={missingRules} valueLabel="Missing flags" />
        </SectionCard>
      ) : null}

      <details className="analytics-coverage">
        <summary>Snapshot data coverage · technical diagnostics</summary>
        <div className="analytics-coverage__body">
          <p>Source-row coverage for the current Analytics snapshot. This is diagnostic information, not a business score.</p>
          <div className="data-table-wrap analytics-table-wrap">
            <table className="data-table">
              <thead><tr><th>Dataset</th><th>Rows</th></tr></thead>
              <tbody>{data.overview.entities.map((row) => <tr key={row.source_table}><td>{humanize(row.source_table)}</td><td>{formatNumber(row.row_count)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </details>
    </>
  );
}
