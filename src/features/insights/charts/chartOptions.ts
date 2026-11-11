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
