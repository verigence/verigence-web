import ReactECharts from 'echarts-for-react';

/** The chart library, in its own chunk: reached only through `Chart`. */
export default function EChart({ option, height }: { option: object; height: number }) {
  return <ReactECharts option={option} notMerge lazyUpdate style={{ height, width: '100%' }} />;
}
