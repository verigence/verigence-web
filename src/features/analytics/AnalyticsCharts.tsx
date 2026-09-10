import ReactECharts from 'echarts-for-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const chartPalette = ['#07366b', '#078ba0', '#1a73b8', '#36a6a0', '#6f83c7', '#d78b2b', '#b45472', '#5b7d55'];
const chartFont = 'Inter, Arial, Helvetica, sans-serif';

function finite(value: unknown): number {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function compactMoney(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function fullMoney(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

export type AnalyticsChartRow = Record<string, string | number> & { label: string };

type ValueKind = 'count' | 'currency' | 'percent';

function axisFormatter(kind: ValueKind, value: number): string {
  if (kind === 'currency') return compactMoney(value);
  if (kind === 'percent') return `${value}%`;
  return compactNumber(value);
}

function tooltipFormatter(kind: ValueKind, value: number): string {
  if (kind === 'currency') return fullMoney(value);
  if (kind === 'percent') return `${value.toFixed(1)}%`;
  return new Intl.NumberFormat('en-IN').format(value);
}

export function AnalyticsBarChart({
  rows,
  valueKey = 'value',
  valueLabel,
  valueKind = 'count',
  emptyText = 'No chartable data in the current snapshot.',
}: {
  rows: AnalyticsChartRow[];
  valueKey?: string;
  valueLabel: string;
  valueKind?: ValueKind;
  emptyText?: string;
}) {
  const data = rows.filter((row) => finite(row[valueKey]) > 0).slice(0, 12);
  if (!data.length) return <p className="analytics-chart-empty">{emptyText}</p>;
  const height = Math.max(300, data.length * 42 + 80);

  return (
    <div className="analytics-chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 28, bottom: 10, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#dfe8f0" />
          <XAxis type="number" tickFormatter={(value) => axisFormatter(valueKind, finite(value))} tick={{ fontFamily: chartFont, fontSize: 11, fill: '#58718d' }} axisLine={{ stroke: '#cfdbe6' }} tickLine={false} />
          <YAxis type="category" dataKey="label" width={185} tick={{ fontFamily: chartFont, fontSize: 11.5, fill: '#31506e' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(value) => [tooltipFormatter(valueKind, finite(value)), valueLabel]} contentStyle={{ fontFamily: chartFont, borderRadius: 10, borderColor: '#d7e3ed' }} />
          <Bar dataKey={valueKey} name={valueLabel} fill={chartPalette[1]} radius={[0, 7, 7, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AnalyticsMultiBarChart({
  rows,
  series,
  valueKind = 'count',
  stacked = false,
  emptyText = 'No chartable data in the current snapshot.',
}: {
  rows: AnalyticsChartRow[];
  series: Array<{ key: string; label: string }>;
  valueKind?: ValueKind;
  stacked?: boolean;
  emptyText?: string;
}) {
  const data = rows.filter((row) => series.some((item) => finite(row[item.key]) > 0)).slice(0, 12);
  if (!data.length) return <p className="analytics-chart-empty">{emptyText}</p>;
  const height = Math.max(320, data.length * 46 + 90);

  return (
    <div className="analytics-chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 28, bottom: 12, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#dfe8f0" />
          <XAxis type="number" tickFormatter={(value) => axisFormatter(valueKind, finite(value))} tick={{ fontFamily: chartFont, fontSize: 11, fill: '#58718d' }} axisLine={{ stroke: '#cfdbe6' }} tickLine={false} />
          <YAxis type="category" dataKey="label" width={185} tick={{ fontFamily: chartFont, fontSize: 11.5, fill: '#31506e' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(value, name) => [tooltipFormatter(valueKind, finite(value)), String(name)]} contentStyle={{ fontFamily: chartFont, borderRadius: 10, borderColor: '#d7e3ed' }} />
          <Legend wrapperStyle={{ fontFamily: chartFont, fontSize: 11.5 }} />
          {series.map((item, index) => (
            <Bar key={item.key} dataKey={item.key} name={item.label} stackId={stacked ? 'total' : undefined} fill={chartPalette[index % chartPalette.length]} radius={stacked ? 0 : [0, 6, 6, 0]} maxBarSize={22} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AnalyticsDonutChart({
  rows,
  valueLabel,
  valueKind = 'count',
  emptyText = 'No chartable data in the current snapshot.',
}: {
  rows: Array<{ label: string; value: number }>;
  valueLabel: string;
  valueKind?: ValueKind;
  emptyText?: string;
}) {
  const data = rows.filter((row) => finite(row.value) > 0).slice(0, 8);
  if (!data.length) return <p className="analytics-chart-empty">{emptyText}</p>;

  return (
    <div className="analytics-chart analytics-chart--donut">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius="52%" outerRadius="78%" paddingAngle={2} stroke="#ffffff" strokeWidth={2}>
            {data.map((row, index) => <Cell key={`${row.label}-${index}`} fill={chartPalette[index % chartPalette.length]} />)}
          </Pie>
          <Tooltip formatter={(value, name) => [tooltipFormatter(valueKind, finite(value)), String(name)]} contentStyle={{ fontFamily: chartFont, borderRadius: 10, borderColor: '#d7e3ed' }} />
          <Legend wrapperStyle={{ fontFamily: chartFont, fontSize: 11.5 }} />
        </PieChart>
      </ResponsiveContainer>
      <span className="analytics-chart__center-label">{valueLabel}</span>
    </div>
  );
}

export function AnalyticsTreemap({
  rows,
  valueLabel,
  valueKind = 'count',
  emptyText = 'No chartable data in the current snapshot.',
}: {
  rows: Array<{ label: string; value: number }>;
  valueLabel: string;
  valueKind?: ValueKind;
  emptyText?: string;
}) {
  const data = rows.filter((row) => finite(row.value) > 0).slice(0, 18);
  if (!data.length) return <p className="analytics-chart-empty">{emptyText}</p>;

  const option = {
    color: chartPalette,
    textStyle: { fontFamily: chartFont },
    tooltip: {
      trigger: 'item',
      formatter: (params: { name?: string; value?: number }) => `${params.name ?? ''}<br/>${valueLabel}: ${tooltipFormatter(valueKind, finite(params.value))}`,
    },
    series: [
      {
        type: 'treemap',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        visibleMin: 1,
        label: { show: true, formatter: '{b}', fontFamily: chartFont, fontSize: 11, overflow: 'truncate' },
        upperLabel: { show: false },
        itemStyle: { borderColor: '#ffffff', borderWidth: 3, gapWidth: 3 },
        data: data.map((row) => ({ name: row.label, value: row.value })),
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 390, width: '100%' }} notMerge lazyUpdate />;
}
