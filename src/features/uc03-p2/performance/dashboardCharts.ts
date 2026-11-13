/** The two charts of a dashboard, as ECharts options built apart from the drawing so they can be
 *  tested. One value axis; bars for what was done, a line for what it is measured against. */
import { FONT, SERIES } from '../../insights/charts/chartOptions';
import { sumAt, type DashSeries, type Period } from '../../../services/audit-core/uc03Performance';

const INK = '#161616';
const axisText = { color: '#525252', fontFamily: FONT, fontSize: 12 };
const number = (value: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(value);

/** Each series added up over the periods (days, or weeks) shown. */
export function byPeriod(series: DashSeries[], periods: Period[]): DashSeries[] {
  return series.map((s) => ({ ...s, data: periods.map((p) => sumAt(s.data, p.indexes)) }));
}

/** ``labels``: print each bar's figure (only where there is room and no line to collide with). */
export function trendOption(series: DashSeries[], periods: Period[], labels = true) {
  const shown = byPeriod(series, periods);
  if (!shown.some((s) => s.data.some((v) => v > 0))) return null;
  const bars = shown.filter((s) => s.kind !== 'line');
  const few = labels && periods.length <= 16 && bars.length === shown.length;
  return {
    textStyle: { fontFamily: FONT },
    grid: { left: 8, right: 16, top: 56, bottom: 8, containLabel: true },
    legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 10, textStyle: { color: '#525252', fontFamily: FONT, fontSize: 12 } },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, backgroundColor: '#ffffff', borderColor: '#e0e0e0', padding: 12,
      textStyle: { color: INK, fontFamily: FONT, fontSize: 12 },
      valueFormatter: (v: unknown) => (typeof v === 'number' ? number(v) : '—'),
    },
    xAxis: {
      type: 'category', data: periods.map((p) => p.label), axisTick: { show: false }, axisLine: { lineStyle: { color: '#8d8d8d' } },
      axisLabel: { ...axisText, color: INK, hideOverlap: true },
    },
    yAxis: { type: 'value', minInterval: 1, axisLabel: axisText, splitLine: { lineStyle: { color: '#e0e0e0' } } },
    series: shown.map((s) => (s.kind === 'line' ? {
      name: s.name, type: 'line', data: s.data, symbol: 'circle', symbolSize: 6, z: 3,
      lineStyle: { color: INK, width: 2, type: 'dashed' }, itemStyle: { color: INK, borderColor: '#ffffff', borderWidth: 1 },
    } : {
      name: s.name, type: 'bar', data: s.data, barMaxWidth: 22, barGap: '12%',
      itemStyle: { color: SERIES[bars.indexOf(s) % SERIES.length], borderRadius: [3, 3, 0, 0] },
      label: few && bars.length <= 2 ? { show: true, position: 'top', color: INK, fontFamily: FONT, fontSize: 11,
        formatter: (p: { value: number }) => (p.value ? number(p.value) : '') } : undefined,
    })),
  };
}
