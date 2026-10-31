/**
 * Shared chart pieces for the System Health tabs: the four validated categorical slots
 * (--sh-series-1..4 on .sh-viz), axis text, a legend in series order and a tooltip.
 */
export const SERIES = ['var(--sh-series-1)', 'var(--sh-series-2)', 'var(--sh-series-3)', 'var(--sh-series-4)'];
export const AXIS = { fontSize: 11, fill: 'var(--sh-axis-text)' };

export function ChartTooltip({ active, payload, label, unit = '', labelFormat }: {
  active?: boolean; payload?: Array<{ name: string; value: number | null; color: string }>; label?: string; unit?: string;
  labelFormat?: (label: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="sh-tooltip">
      <strong>{label ? (labelFormat ? labelFormat(label) : label) : ''}</strong>
      {payload.map((p) => (
        <span key={p.name}><i style={{ background: p.color }} aria-hidden="true" />{p.name}<b>{p.value ?? '—'}{p.value !== null && p.value !== undefined ? unit : ''}</b></span>
      ))}
    </div>
  );
}

/** Legend in series order, text in ink (the swatch carries the colour). */
export function SeriesLegend({ series, line = false }: { series: ReadonlyArray<{ label: string }>; line?: boolean }) {
  return (
    <ul className="sh-legend">
      {series.map((s, i) => (
        <li key={s.label}><i className={line ? 'is-line' : ''} style={{ background: SERIES[i] }} aria-hidden="true" />{s.label}</li>
      ))}
    </ul>
  );
}
