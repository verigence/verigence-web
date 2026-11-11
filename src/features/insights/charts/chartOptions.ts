/** ECharts options for the Analytics reports, built apart from the drawing so they can be
 *  tested. Carbon colours; one value axis per chart; figures in the tooltip and on the bars. */

export const FONT = "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif";
/** Carbon's categorical colours, in order. */
export const SERIES = ['#0f62fe', '#ba4e00', '#6929c4', '#009d9a', '#9f1853', '#198038', '#002d9c', '#b28600', '#ee538b', '#012749'];
export const TONE = {
  good: '#198038', warning: '#ba4e00', danger: '#da1e28', neutral: '#8d8d8d', quiet: '#c6c6c6', primary: '#0f62fe', second: '#6929c4',
} as const;

export type Formatter = (value: number) => string;
export interface BarSeries { name: string; data: (number | null)[]; color?: string }
export interface BarInput {
  categories: string[];
  series: BarSeries[];
  horizontal?: boolean;
  stacked?: boolean;
  /** Each category adds up to 100%: the series are shares. */
  percent?: boolean;
  format?: Formatter;
  /** A reference line across the value axis (the network's figure). */
  reference?: { value: number; label: string };
  /** Print the figure on each bar (single series, or the total of a stack). */
  labels?: boolean;
  max?: number;
  /** Room for the category names of a horizontal chart, in pixels. */
  labelWidth?: number;
}

const axisText = { color: '#525252', fontFamily: FONT, fontSize: 12 };
const tooltip = {
  confine: true, backgroundColor: '#ffffff', borderColor: '#e0e0e0', padding: 12,
  textStyle: { color: '#161616', fontFamily: FONT, fontSize: 12 },
};
const plain: Formatter = (value) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(value);

export function barOption(input: BarInput) {
  const format = input.percent ? ((value: number) => `${plain(value)}%`) : input.format ?? plain;
  const category = {
    type: 'category', data: input.categories, inverse: Boolean(input.horizontal), axisTick: { show: false },
    axisLine: { lineStyle: { color: '#8d8d8d' } },
    axisLabel: { ...axisText, color: '#161616', interval: 0, hideOverlap: !input.horizontal, width: input.horizontal ? input.labelWidth ?? 190 : undefined, overflow: 'truncate' },
  };
  const value = {
    type: 'value', max: input.percent ? 100 : input.max, axisLabel: { ...axisText, formatter: (v: number) => format(v) },
    splitLine: { lineStyle: { color: '#e0e0e0' } },
  };
  const legend = input.series.length > 1;
  return {
    textStyle: { fontFamily: FONT },
    color: SERIES,
    grid: { left: 8, right: input.horizontal ? 64 : 16, top: (legend ? 36 : 16) + (input.reference && input.horizontal ? 18 : 0), bottom: 8, containLabel: true },
    legend: legend
      ? { top: 0, left: 0, icon: 'rect', itemWidth: 10, itemHeight: 10, textStyle: { color: '#525252', fontFamily: FONT, fontSize: 12 } }
      : undefined,
    tooltip: {
      ...tooltip, trigger: 'axis', axisPointer: { type: 'shadow' },
      valueFormatter: (v: unknown) => (typeof v === 'number' ? format(v) : '—'),
    },
    xAxis: input.horizontal ? value : category,
    yAxis: input.horizontal ? category : value,
    series: input.series.map((series, index) => ({
      name: series.name, type: 'bar', stack: input.stacked || input.percent ? 'all' : undefined, barMaxWidth: 28,
      itemStyle: { color: series.color ?? SERIES[index % SERIES.length], borderColor: '#ffffff', borderWidth: input.stacked || input.percent ? 1 : 0 },
      data: series.data,
      label: input.labels && input.series.length === 1
        ? { show: true, position: input.horizontal ? 'right' : 'top', color: '#161616', fontFamily: FONT, fontSize: 11,
          formatter: (params: { value: number | null }) => (params.value == null ? '' : format(params.value)) }
        : undefined,
      markLine: input.reference && index === 0 ? {
        silent: true, symbol: 'none', lineStyle: { color: '#161616', type: 'dashed', width: 1 },
        label: { formatter: input.reference.label, color: '#161616', fontFamily: FONT, fontSize: 11, position: input.horizontal ? 'start' : 'insideEndTop',
          backgroundColor: '#ffffff', padding: [2, 4] },
        data: [input.horizontal ? { xAxis: input.reference.value } : { yAxis: input.reference.value }],
      } : undefined,
    })),
  };
}

export interface Slice { name: string; value: number; color?: string }
export function donutOption(slices: Slice[], centre: { value: string; label: string }, format: Formatter = plain) {
  const shown = slices.filter((slice) => slice.value > 0);
  const total = shown.reduce((sum, slice) => sum + slice.value, 0);
  return {
    textStyle: { fontFamily: FONT },
    tooltip: {
      ...tooltip, trigger: 'item',
      formatter: (params: { name: string; value: number; percent: number }) => `${params.name}<br/><strong>${format(params.value)}</strong> · ${plain(params.percent)}%`,
    },
    legend: {
      orient: 'vertical', right: 0, top: 'middle', icon: 'rect', itemWidth: 10, itemHeight: 10,
      textStyle: { color: '#161616', fontFamily: FONT, fontSize: 12 },
      formatter: (name: string) => {
        const slice = shown.find((item) => item.name === name);
        return slice && total ? `${name}  ${plain((slice.value / total) * 100)}%` : name;
      },
    },
    title: {
      text: centre.value, subtext: centre.label, left: '29%', top: '40%', textAlign: 'center',
      textStyle: { color: '#161616', fontFamily: FONT, fontSize: 20, fontWeight: 400 },
      subtextStyle: { color: '#525252', fontFamily: FONT, fontSize: 12 },
    },
    series: [{
      type: 'pie', radius: ['56%', '82%'], center: ['30%', '50%'], avoidLabelOverlap: true, label: { show: false },
      itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
      data: shown.map((slice, index) => ({ name: slice.name, value: slice.value, itemStyle: { color: slice.color ?? SERIES[index % SERIES.length] } })),
    }],
  };
}

/** Rows ranked by a figure, the largest first, cut to what a chart can carry. */
export function topBy<T>(rows: T[], value: (row: T) => number | null | undefined, limit = 12): T[] {
  return rows.filter((row) => (value(row) ?? 0) > 0).sort((a, b) => (value(b) ?? 0) - (value(a) ?? 0)).slice(0, limit);
}

export interface ScatterPoint {
  name: string;
  group: string;
  /** x, y, and the size the bubble scales by. */
  x: number;
  y: number;
  size: number;
  detail?: string;
}
export interface ScatterInput {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  formatX: Formatter;
  formatY: Formatter;
  formatSize: Formatter;
  sizeLabel: string;
  reference?: { value: number; label: string };
}

/** Bubbles: position carries two measures, size a third, colour the group. The chart the
 *  ranked bars cannot draw — an outlet high and to the right gives more on more business. */
export function scatterOption(input: ScatterInput) {
  const groups = [...new Set(input.points.map((point) => point.group))];
  const largest = Math.max(...input.points.map((point) => point.size), 1);
  const scale = (size: number) => 12 + Math.sqrt(size / largest) * 34;
  return {
    textStyle: { fontFamily: FONT },
    grid: { left: 8, right: 24, top: groups.length > 1 ? 56 : 32, bottom: 8, containLabel: true },
    legend: groups.length > 1
      ? { top: 0, left: 0, icon: 'circle', itemWidth: 10, itemHeight: 10, textStyle: { color: '#525252', fontFamily: FONT, fontSize: 12 } }
      : undefined,
    tooltip: {
      confine: true, backgroundColor: '#ffffff', borderColor: '#e0e0e0', padding: 12,
      textStyle: { color: '#161616', fontFamily: FONT, fontSize: 12 },
      formatter: (params: { data: { name: string; group: string; value: number[]; size: number; detail?: string } }) => {
        const point = params.data;
        return `<strong>${point.name}</strong> · ${point.group}<br/>${input.xLabel}: ${input.formatX(point.value[0])}<br/>`
          + `${input.yLabel}: ${input.formatY(point.value[1])}<br/>${input.sizeLabel}: ${input.formatSize(point.size)}`
          + (point.detail ? `<br/>${point.detail}` : '');
      },
    },
    xAxis: { type: 'value', name: input.xLabel, nameLocation: 'middle', nameGap: 28,
      nameTextStyle: { color: '#525252', fontFamily: FONT, fontSize: 12 },
      axisLabel: { color: '#525252', fontFamily: FONT, fontSize: 12, formatter: (value: number) => input.formatX(value) },
      splitLine: { lineStyle: { color: '#e0e0e0' } } },
    yAxis: { type: 'value', name: input.yLabel, nameTextStyle: { color: '#525252', fontFamily: FONT, fontSize: 12, align: 'left' },
      axisLabel: { color: '#525252', fontFamily: FONT, fontSize: 12, formatter: (value: number) => input.formatY(value) },
      splitLine: { lineStyle: { color: '#e0e0e0' } } },
    series: groups.map((group, index) => ({
      name: group, type: 'scatter', symbolSize: (value: number[], params: { data: { size: number } }) => scale(params.data.size),
      itemStyle: { color: SERIES[index % SERIES.length], opacity: 0.82, borderColor: '#ffffff', borderWidth: 1 },
      emphasis: { itemStyle: { opacity: 1, borderColor: '#161616' } },
      label: { show: true, position: 'top', color: '#161616', fontFamily: FONT, fontSize: 11,
        formatter: (params: { data: { name: string } }) => params.data.name },
      labelLayout: { hideOverlap: true },
      markLine: input.reference && index === 0 ? {
        silent: true, symbol: 'none', lineStyle: { color: '#161616', type: 'dashed', width: 1 },
        label: { formatter: input.reference.label, color: '#161616', fontFamily: FONT, fontSize: 11, position: 'insideEndTop' },
        data: [{ yAxis: input.reference.value }],
      } : undefined,
      data: input.points.filter((point) => point.group === group)
        .map((point) => ({ name: point.name, group: point.group, value: [point.x, point.y], size: point.size, detail: point.detail })),
    })),
  };
}

/** Months as bars with a line over them: the flow in, and how it converts. */
export function comboOption(input: {
  categories: string[]; bars: { name: string; data: number[]; color?: string }; line: { name: string; data: number[]; color?: string };
}) {
  return {
    textStyle: { fontFamily: FONT },
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    legend: { top: 0, left: 0, icon: 'rect', itemWidth: 10, itemHeight: 10, textStyle: { color: '#525252', fontFamily: FONT, fontSize: 12 } },
    tooltip: { trigger: 'axis', confine: true, backgroundColor: '#ffffff', borderColor: '#e0e0e0', padding: 12,
      textStyle: { color: '#161616', fontFamily: FONT, fontSize: 12 } },
    xAxis: { type: 'category', data: input.categories, axisTick: { show: false }, axisLine: { lineStyle: { color: '#8d8d8d' } },
      axisLabel: { color: '#161616', fontFamily: FONT, fontSize: 12 } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#525252', fontFamily: FONT, fontSize: 12 },
      splitLine: { lineStyle: { color: '#e0e0e0' } } },
    series: [
      { name: input.bars.name, type: 'bar', barMaxWidth: 36, itemStyle: { color: input.bars.color ?? TONE.primary }, data: input.bars.data },
      { name: input.line.name, type: 'line', smooth: false, symbol: 'circle', symbolSize: 8,
        itemStyle: { color: input.line.color ?? TONE.good }, lineStyle: { width: 2, color: input.line.color ?? TONE.good },
        label: { show: true, position: 'top', color: '#161616', fontFamily: FONT, fontSize: 11 }, data: input.line.data },
    ],
  };
}
