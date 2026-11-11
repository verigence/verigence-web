import { lazy, Suspense } from 'react';

const EChart = lazy(() => import('./EChart'));

/** One chart. `label` says what it shows to a screen reader; the figures are also in the
 *  table under it. An empty chart says so instead of drawing empty axes. */
export function Chart({ option, height = 300, label, empty }: { option: object | null; height?: number; label: string; empty?: string }) {
  if (!option) return <p className="ins-empty">{empty ?? 'Nothing to show for these filters.'}</p>;
  return (
    <div className="ins-chart" role="img" aria-label={label} style={{ minHeight: height }}>
      <Suspense fallback={<p className="ins-empty" aria-busy="true">Loading the chart…</p>}>
        <EChart option={option} height={height} />
      </Suspense>
    </div>
  );
}

/** Height for a horizontal bar chart of `rows` bars. */
export const barsHeight = (rows: number, legend = false) => Math.max(180, rows * 30 + (legend ? 70 : 40));
