import { describe, expect, it } from 'vitest';

import { barOption, donutOption, topBy } from '../charts/chartOptions';

describe('chart options', () => {
  it('draws a horizontal stacked bar with one value axis and a legend', () => {
    const option = barOption({ horizontal: true, stacked: true, categories: ['A', 'B'],
      series: [{ name: 'Over', data: [1, 2] }, { name: 'Unknown', data: [3, 4] }] });
    expect(option.xAxis.type).toBe('value');
    expect(option.yAxis.type).toBe('category');
    expect(option.series.map((series) => series.stack)).toEqual(['all', 'all']);
    expect(option.legend).toBeDefined();
  });

  it('caps a share chart at 100 and writes percent', () => {
    const option = barOption({ percent: true, categories: ['A'], series: [{ name: 'In-house', data: [66.6] }, { name: 'Outside', data: [33.4] }] });
    expect((option.yAxis as { max?: number }).max).toBe(100);
    expect(option.tooltip.valueFormatter(66.6)).toBe('66.6%');
  });

  it('labels a single series and marks the network on the value axis', () => {
    const option = barOption({ horizontal: true, labels: true, categories: ['A'], series: [{ name: 'Cash share', data: [6.3] }],
      reference: { value: 4.5, label: 'Network 4.5%' }, format: (value) => `${value}%` });
    expect(option.legend).toBeUndefined();
    expect(option.series[0].label?.formatter({ value: 6.3 })).toBe('6.3%');
    expect(option.series[0].markLine?.data).toEqual([{ xAxis: 4.5 }]);
  });

  it('leaves empty slices out of a donut and writes each share in the legend', () => {
    const option = donutOption([{ name: 'In-house', value: 75 }, { name: 'Outside', value: 25 }, { name: 'None', value: 0 }], { value: '75%', label: 'in-house' });
    expect(option.series[0].data.map((slice) => slice.name)).toEqual(['In-house', 'Outside']);
    expect(option.legend.formatter('Outside')).toBe('Outside  25%');
  });

  it('ranks rows and drops the ones with nothing', () => {
    expect(topBy([{ n: 2 }, { n: 0 }, { n: 9 }, { n: null }], (row) => row.n, 2)).toEqual([{ n: 9 }, { n: 2 }]);
  });
});
