import ReactECharts from 'echarts-for-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  Legend,
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
export type AnalyticsValueKind = 'count' | 'currency' | 'percent' | 'days';

function axisFormatter(kind: AnalyticsValueKind, value: number): string {
  if (kind === 'currency') return compactMoney(value);
  if (kind === 'percent') return `${value}%`;
  if (kind === 'days') return `${value}d`;
  return compactNumber(value);
}

function tooltipFormatter(kind: AnalyticsValueKind, value: number): string {
  if (kind === 'currency') return fullMoney(value);
  if (kind === 'percent') return `${value.toFixed(1)}%`;
  if (kind === 'days') return `${value.toFixed(1)} days`;
  return new Intl.NumberFormat('en-IN').format(value);
}

function emptyChart(text: string) {
  return <p className="analytics-chart-empty">{text}</p>;
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
  valueKind?: AnalyticsValueKind;
  emptyText?: string;
}) {
  const data = rows.filter((row) => finite(row[valueKey]) > 0).slice(0, 12);
  if (!data.length) return emptyChart(emptyText);
  const height = Math.max(300, data.length * 42 + 80);

  return (
    <div className="analytics-chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 28, bottom: 10, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#dfe8f0" />
          <XAxis type="number" tickFormatter={(value) => axisFormatter(valueKind, finite(value))} tick={{ fontFamily: chartFont, fontSize: 11, fill: '#58718d' }} axisLine={{ stroke: '#cfdbe6' }} tickLine={false} />
          <YAxis type="category" dataKey="label" width={180} tick={{ fontFamily: chartFont, fontSize: 11.5, fill: '#31506e' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(value) => [tooltipFormatter(valueKind, finite(value)), valueLabel]} contentStyle={{ fontFamily: chartFont, borderRadius: 10, borderColor: '#d7e3ed' }} />
          <Bar dataKey={valueKey} name={valueLabel} fill={chartPalette[1]} radius={[0, 7, 7, 0]} maxBarSize={24} />
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
  valueKind?: AnalyticsValueKind;
  emptyText?: string;
}) {
  const data = rows.filter((row) => finite(row.value) > 0).slice(0, 8);
  if (!data.length) return emptyChart(emptyText);

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
  valueKind?: AnalyticsValueKind;
  emptyText?: string;
}) {
  const data = rows.filter((row) => finite(row.value) > 0).slice(0, 18);
  if (!data.length) return emptyChart(emptyText);

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

export function AnalyticsSunburstChart({
  rows,
  valueLabel,
  valueKind = 'count',
  emptyText = 'No chartable data in the current snapshot.',
}: {
  rows: Array<{ group: string; label: string; value: number }>;
  valueLabel: string;
  valueKind?: AnalyticsValueKind;
  emptyText?: string;
}) {
  const validRows = rows.filter((row) => finite(row.value) > 0);
  if (!validRows.length) return emptyChart(emptyText);

  const groups = new Map<string, Array<{ name: string; value: number }>>();
  validRows.forEach((row) => {
    const group = row.group || 'Unspecified';
    const children = groups.get(group) || [];
    const existing = children.find((item) => item.name === row.label);
    if (existing) existing.value += finite(row.value);
    else children.push({ name: row.label || 'Unspecified', value: finite(row.value) });
    groups.set(group, children);
  });

  const data = Array.from(groups.entries()).map(([name, children]) => ({
    name,
    children: children.sort((a, b) => b.value - a.value),
  }));

  const option = {
    color: chartPalette,
    textStyle: { fontFamily: chartFont },
    tooltip: {
      trigger: 'item',
      formatter: (params: { name?: string; value?: number }) => `${params.name ?? ''}<br/>${valueLabel}: ${tooltipFormatter(valueKind, finite(params.value))}`,
    },
    series: [{
      type: 'sunburst',
      data,
      radius: ['8%', '92%'],
      nodeClick: false,
      sort: null,
      emphasis: { focus: 'ancestor' },
      label: { fontFamily: chartFont, fontSize: 11, minAngle: 8 },
      levels: [
        {},
        { r0: '8%', r: '42%', itemStyle: { borderWidth: 3, borderColor: '#fff' }, label: { rotate: 0, fontWeight: 700 } },
        { r0: '42%', r: '92%', itemStyle: { borderWidth: 2, borderColor: '#fff' }, label: { rotate: 'radial' } },
      ],
    }],
  };

  return <ReactECharts option={option} style={{ height: 420, width: '100%' }} notMerge lazyUpdate />;
}

export function AnalyticsBubbleChart({
  rows,
  xLabel,
  yLabel,
  xKind = 'count',
  yKind = 'count',
  emptyText = 'No chartable data in the current snapshot.',
}: {
  rows: Array<{ label: string; x: number; y: number; size?: number }>;
  xLabel: string;
  yLabel: string;
  xKind?: AnalyticsValueKind;
  yKind?: AnalyticsValueKind;
  emptyText?: string;
}) {
  const dataRows = rows.filter((row) => finite(row.x) > 0 || finite(row.y) > 0).slice(0, 14);
  if (!dataRows.length) return emptyChart(emptyText);
  const maxSize = Math.max(...dataRows.map((row) => finite(row.size ?? row.y)), 1);

  const option = {
    color: chartPalette,
    textStyle: { fontFamily: chartFont },
    grid: { top: 24, right: 24, bottom: 60, left: 74 },
    tooltip: {
      trigger: 'item',
      formatter: (params: { data?: [number, number, number, string] }) => {
        const item = params.data;
        if (!item) return '';
        return `${item[3]}<br/>${xLabel}: ${tooltipFormatter(xKind, item[0])}<br/>${yLabel}: ${tooltipFormatter(yKind, item[1])}`;
      },
    },
    xAxis: {
      type: 'value',
      name: xLabel,
      nameLocation: 'middle',
      nameGap: 36,
      axisLabel: { formatter: (value: number) => axisFormatter(xKind, finite(value)), fontFamily: chartFont, color: '#58718d' },
      splitLine: { lineStyle: { color: '#e6edf3', type: 'dashed' } },
    },
    yAxis: {
      type: 'value',
      name: yLabel,
      axisLabel: { formatter: (value: number) => axisFormatter(yKind, finite(value)), fontFamily: chartFont, color: '#58718d' },
      splitLine: { lineStyle: { color: '#e6edf3', type: 'dashed' } },
    },
    series: [{
      type: 'scatter',
      data: dataRows.map((row) => [finite(row.x), finite(row.y), finite(row.size ?? row.y), row.label]),
      symbolSize: (value: [number, number, number, string]) => 16 + 34 * Math.sqrt(finite(value[2]) / maxSize),
      itemStyle: { opacity: 0.82 },
      label: {
        show: dataRows.length <= 8,
        formatter: (params: { data?: [number, number, number, string] }) => params.data?.[3] ?? '',
        position: 'top',
        fontFamily: chartFont,
        fontSize: 10.5,
        color: '#31506e',
      },
      emphasis: { focus: 'series', scale: 1.15 },
    }],
  };

  return <ReactECharts option={option} style={{ height: 390, width: '100%' }} notMerge lazyUpdate />;
}

export function AnalyticsComboChart({
  rows,
  barLabel,
  lineLabel,
  barKind = 'count',
  lineKind = 'count',
  emptyText = 'No chartable data in the current snapshot.',
}: {
  rows: Array<{ label: string; bar: number; line: number }>;
  barLabel: string;
  lineLabel: string;
  barKind?: AnalyticsValueKind;
  lineKind?: AnalyticsValueKind;
  emptyText?: string;
}) {
  const data = rows.filter((row) => finite(row.bar) > 0 || finite(row.line) > 0).slice(0, 12);
  if (!data.length) return emptyChart(emptyText);

  const option = {
    color: [chartPalette[0], chartPalette[5]],
    textStyle: { fontFamily: chartFont },
    legend: { top: 0, textStyle: { fontFamily: chartFont, color: '#31506e' } },
    grid: { top: 48, right: 82, bottom: 84, left: 82 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: data.map((row) => row.label),
      axisLabel: { rotate: data.length > 5 ? 28 : 0, fontFamily: chartFont, color: '#58718d', width: 110, overflow: 'truncate' },
      axisTick: { alignWithLabel: true },
    },
    yAxis: [
      {
        type: 'value',
        name: barLabel,
        axisLabel: { formatter: (value: number) => axisFormatter(barKind, finite(value)), fontFamily: chartFont, color: '#58718d' },
        splitLine: { lineStyle: { color: '#e6edf3', type: 'dashed' } },
      },
      {
        type: 'value',
        name: lineLabel,
        axisLabel: { formatter: (value: number) => axisFormatter(lineKind, finite(value)), fontFamily: chartFont, color: '#58718d' },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: barLabel,
        type: 'bar',
        data: data.map((row) => finite(row.bar)),
        barMaxWidth: 34,
        itemStyle: { borderRadius: [7, 7, 0, 0] },
        tooltip: { valueFormatter: (value: number) => tooltipFormatter(barKind, finite(value)) },
      },
      {
        name: lineLabel,
        type: 'line',
        yAxisIndex: 1,
        data: data.map((row) => finite(row.line)),
        smooth: true,
        symbolSize: 8,
        lineStyle: { width: 3 },
        tooltip: { valueFormatter: (value: number) => tooltipFormatter(lineKind, finite(value)) },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 390, width: '100%' }} notMerge lazyUpdate />;
}

export function AnalyticsVarianceChart({
  rows,
  valueLabel,
  valueKind = 'currency',
  emptyText = 'No chartable data in the current snapshot.',
}: {
  rows: Array<{ label: string; value: number }>;
  valueLabel: string;
  valueKind?: AnalyticsValueKind;
  emptyText?: string;
}) {
  const data = rows.filter((row) => finite(row.value) !== 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 14);
  if (!data.length) return emptyChart(emptyText);

  const option = {
    textStyle: { fontFamily: chartFont },
    grid: { top: 22, right: 40, bottom: 32, left: 200 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (value: number) => tooltipFormatter(valueKind, finite(value)),
    },
    xAxis: {
      type: 'value',
      axisLabel: { formatter: (value: number) => axisFormatter(valueKind, finite(value)), fontFamily: chartFont, color: '#58718d' },
      splitLine: { lineStyle: { color: '#e6edf3', type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: data.map((row) => row.label),
      axisLabel: { fontFamily: chartFont, color: '#31506e', width: 175, overflow: 'truncate' },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      name: valueLabel,
      type: 'bar',
      data: data.map((row) => ({
        value: finite(row.value),
        itemStyle: { color: row.value > 0 ? '#b45472' : '#36a6a0', borderRadius: row.value > 0 ? [0, 6, 6, 0] : [6, 0, 0, 6] },
      })),
      barMaxWidth: 24,
      label: {
        show: true,
        position: 'outside',
        formatter: (params: { value?: number }) => axisFormatter(valueKind, finite(params.value)),
        fontFamily: chartFont,
        fontSize: 10.5,
        color: '#31506e',
      },
    }],
  };

  return <ReactECharts option={option} style={{ height: Math.max(330, data.length * 36 + 90), width: '100%' }} notMerge lazyUpdate />;
}

export function AnalyticsHeatmap({
  xLabels,
  yLabels,
  cells,
  valueLabel,
  emptyText = 'No chartable data in the current snapshot.',
}: {
  xLabels: string[];
  yLabels: string[];
  cells: Array<[number, number, number]>;
  valueLabel: string;
  emptyText?: string;
}) {
  const maxValue = Math.max(...cells.map((cell) => finite(cell[2])), 0);
  if (!xLabels.length || !yLabels.length || maxValue <= 0) return emptyChart(emptyText);

  const option = {
    textStyle: { fontFamily: chartFont },
    tooltip: {
      position: 'top',
      formatter: (params: { data?: [number, number, number] }) => {
        const item = params.data;
        if (!item) return '';
        return `${yLabels[item[1]]}<br/>${xLabels[item[0]]}: ${tooltipFormatter('count', item[2])}`;
      },
    },
    grid: { top: 38, right: 34, bottom: 76, left: 190 },
    xAxis: {
      type: 'category',
      data: xLabels,
      splitArea: { show: true },
      axisLabel: { fontFamily: chartFont, color: '#58718d' },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'category',
      data: yLabels,
      splitArea: { show: true },
      axisLabel: { fontFamily: chartFont, color: '#31506e', width: 165, overflow: 'truncate' },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    visualMap: {
      min: 0,
      max: maxValue,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 8,
      text: [valueLabel, ''],
      textStyle: { fontFamily: chartFont, color: '#58718d' },
      inRange: { color: ['#eef7f8', '#8dcbd1', '#078ba0', '#07366b'] },
    },
    series: [{
      name: valueLabel,
      type: 'heatmap',
      data: cells,
      label: {
        show: true,
        formatter: (params: { data?: [number, number, number] }) => (params.data?.[2] ? String(params.data[2]) : ''),
        fontFamily: chartFont,
        fontSize: 10.5,
      },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(7,54,107,0.25)' } },
    }],
  };

  return <ReactECharts option={option} style={{ height: Math.max(340, yLabels.length * 34 + 150), width: '100%' }} notMerge lazyUpdate />;
}

export function AnalyticsParetoChart({
  rows,
  valueLabel,
  emptyText = 'No chartable data in the current snapshot.',
}: {
  rows: Array<{ label: string; value: number }>;
  valueLabel: string;
  emptyText?: string;
}) {
  const data = rows.filter((row) => finite(row.value) > 0).sort((a, b) => b.value - a.value).slice(0, 12);
  if (!data.length) return emptyChart(emptyText);
  const total = data.reduce((sum, row) => sum + finite(row.value), 0);
  let running = 0;
  const cumulative = data.map((row) => {
    running += finite(row.value);
    return total ? (running / total) * 100 : 0;
  });

  const option = {
    color: [chartPalette[1], chartPalette[5]],
    textStyle: { fontFamily: chartFont },
    legend: { top: 0, data: [valueLabel, 'Cumulative share'], textStyle: { fontFamily: chartFont, color: '#31506e' } },
    grid: { top: 48, right: 72, bottom: 96, left: 62 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: data.map((row) => row.label),
      axisLabel: { rotate: 32, fontFamily: chartFont, color: '#58718d', width: 120, overflow: 'truncate' },
    },
    yAxis: [
      {
        type: 'value',
        name: valueLabel,
        minInterval: 1,
        axisLabel: { fontFamily: chartFont, color: '#58718d' },
        splitLine: { lineStyle: { color: '#e6edf3', type: 'dashed' } },
      },
      {
        type: 'value',
        name: 'Cumulative %',
        min: 0,
        max: 100,
        axisLabel: { formatter: '{value}%', fontFamily: chartFont, color: '#58718d' },
        splitLine: { show: false },
      },
    ],
    series: [
      { name: valueLabel, type: 'bar', data: data.map((row) => finite(row.value)), barMaxWidth: 34, itemStyle: { borderRadius: [6, 6, 0, 0] } },
      { name: 'Cumulative share', type: 'line', yAxisIndex: 1, data: cumulative.map((value) => Number(value.toFixed(1))), smooth: true, symbolSize: 8, lineStyle: { width: 3 } },
    ],
  };

  return <ReactECharts option={option} style={{ height: 420, width: '100%' }} notMerge lazyUpdate />;
}
