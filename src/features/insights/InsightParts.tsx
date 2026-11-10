import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import type { GroupRow } from '../../services/audit-core/uc03Insights';
import { downloadCsv, shortOutlet, sortRows, type SortDirection } from './insightFormat';

/* The pieces every Analytics report is made of (IBM Carbon patterns, g10 theme):
   stat tiles, cards, a content switcher, ranked meter bars, a thin segmented bar with
   its legend, and one sortable, paged data table. Charts are these marks in plain
   HTML: every figure is printed beside its bar, so nothing is read by colour or by
   hovering alone. */

export type Tone = 'default' | 'danger' | 'warning' | 'good';

export interface TileItem {
  label: string;
  value: string;
  detail?: ReactNode;
  tone?: Tone;
  /** 0–100: draws a meter under the figure. */
  meter?: number | null;
}

export function Tiles({ items, label }: { items: TileItem[]; label: string }) {
  return (
    <section className="ins-tiles" aria-label={label}>
      {items.map((item) => (
        <div key={item.label} className={`ins-tile${item.tone && item.tone !== 'default' ? ` is-${item.tone}` : ''}`}>
          <span className="ins-tile__label">{item.label}</span>
          <strong>{item.value}</strong>
          {typeof item.meter === 'number' ? (
            <span className="ins-meter" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, item.meter))}%` }} /></span>
          ) : null}
          {item.detail ? <span className="ins-tile__detail">{item.detail}</span> : null}
        </div>
      ))}
    </section>
  );
}

export function Section({ title, description, actions, children }: {
  title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="ins-card" aria-label={title}>
      <div className="ins-card__head">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="ins-card__actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Switcher<T extends string>({ label, options, value, onChange }: {
  label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (next: T) => void;
}) {
  return (
    <div className="ins-switcher" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value}
                className={value === option.value ? 'is-selected' : undefined} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface MeterRow {
  key: string;
  label: string;
  sub?: string | null;
  value: number;
  display: string;
  detail?: string | null;
  thin?: boolean;
}

/** Ranked bars on one baseline: a name, a bar and its figure on every row. */
export function MeterList({ rows, max, empty, limit = 12 }: {
  rows: MeterRow[]; max?: number; empty: string; limit?: number;
}) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <p className="ins-empty">{empty}</p>;
  const shown = all ? rows : rows.slice(0, limit);
  const top = max ?? Math.max(...rows.map((row) => row.value), 1);
  return (
    <>
      <ul className="ins-meters">
        {shown.map((row) => (
          <li key={row.key} className={row.thin ? 'is-thin' : undefined}>
            <span className="ins-meters__name">
              {row.label}
              {row.sub ? <small>{row.sub}</small> : null}
            </span>
            <span className="ins-meters__figure">
              {row.display}
              {row.detail ? <small>{row.detail}</small> : null}
            </span>
            <span className="ins-meters__bar" aria-hidden="true">
              <span style={{ width: `${top > 0 ? Math.max(0, Math.min(100, (row.value / top) * 100)) : 0}%` }} />
            </span>
          </li>
        ))}
      </ul>
      {rows.length > limit ? (
        <button type="button" className="ins-link ins-more" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      ) : null}
    </>
  );
}

export interface Segment { key: string; label: string; value: number; tone: 'a' | 'b' | 'c' | 'd' | 'none' }

/** One whole split into parts, read beside its figures: thin, no text on it. */
export function SegmentBar({ parts, label }: { parts: Segment[]; label: string }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const text = parts.filter((part) => part.value > 0).map((part) => `${part.label} ${part.value}`).join(', ');
  return (
    <span className="ins-segments" role="img" aria-label={`${label}: ${text || 'nothing'}`} title={text}>
      {total > 0 ? parts.filter((part) => part.value > 0).map((part) => (
        <span key={part.key} className={`ins-seg ins-seg--${part.tone}`} style={{ flexGrow: part.value }} />
      )) : null}
    </span>
  );
}

export function Legend({ items }: { items: { label: string; tone: Segment['tone'] }[] }) {
  return (
    <ul className="ins-legend">
      {items.map((item) => (
        <li key={item.label}><span className={`ins-swatch ins-seg--${item.tone}`} aria-hidden="true" />{item.label}</li>
      ))}
    </ul>
  );
}

/** A figure with a thin bar under it, for a column of rates or amounts in a table. */
export function CellBar({ value, max, display, tone = 'a' }: {
  value: number | null | undefined; max: number; display: string; tone?: 'a' | 'b';
}) {
  const width = typeof value === 'number' && max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span className="ins-cellbar">
      <span>{display}</span>
      <span className={`ins-cellbar__track ins-cellbar__track--${tone}`} aria-hidden="true"><span style={{ width: `${width}%` }} /></span>
    </span>
  );
}

export function JourneyLink({ journeyId, children }: { journeyId: string; children?: ReactNode }) {
  return (
    <Link className="ins-link" to={`/p2/journeys/${journeyId}/overview?tab=deal`}>{children ?? 'Journey 360 →'}</Link>
  );
}

/** The name of a group: an outlet reads short under its dealership, a small group is marked. */
export function GroupName({ row, thinBelow }: { row: GroupRow; thinBelow?: number }) {
  return (
    <>
      <span className="ins-primary">
        {shortOutlet(row.label, row.parent)}
        {row.thin ? <span className="ins-tag" title={thinBelow ? `Fewer than ${thinBelow} deals: read the rate with care` : undefined}>Few deals</span> : null}
      </span>
      {row.parent ? <span className="ins-secondary">{row.parent}</span> : null}
    </>
  );
}

export interface Column<T> {
  key: string;
  label: string;
  numeric?: boolean;
  /** What the column sorts and exports by. */
  value: (row: T) => string | number | null | undefined;
  render?: (row: T) => ReactNode;
}

const PAGE_SIZES = [10, 25, 50];

/** Carbon data table: sortable headers, optional paging and CSV export. */
export function DataTable<T>({ columns, rows, rowKey, sort, pageSize, csvName, empty, caption, rowClass }: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sort?: { key: string; direction: SortDirection };
  pageSize?: number;
  csvName?: string;
  empty: string;
  caption: string;
  rowClass?: (row: T) => string | undefined;
}) {
  const [order, setOrder] = useState(sort ?? null);
  const [size, setSize] = useState(pageSize ?? 0);
  const [page, setPage] = useState(1);
  const sorted = useMemo(() => {
    const column = order ? columns.find((c) => c.key === order.key) : undefined;
    return column && order ? sortRows(rows, column.value, order.direction) : rows;
  }, [rows, columns, order]);
  const pages = size ? Math.max(1, Math.ceil(sorted.length / size)) : 1;
  const current = Math.min(page, pages);
  const shown = size ? sorted.slice((current - 1) * size, current * size) : sorted;

  const sortBy = (key: string, numeric?: boolean) => {
    setPage(1);
    setOrder((previous) => (previous?.key === key
      ? { key, direction: previous.direction === 'desc' ? 'asc' : 'desc' }
      : { key, direction: numeric ? 'desc' : 'asc' }));
  };

  if (!rows.length) return <p className="ins-empty">{empty}</p>;
  return (
    <>
      {csvName ? (
        <div className="ins-table-tools">
          <button type="button" className="ins-button" onClick={() => downloadCsv(
            csvName, columns.map((c) => c.label), sorted.map((row) => columns.map((c) => c.value(row))))}>
            Export CSV
          </button>
        </div>
      ) : null}
      <div className="ins-table-wrap">
        <table className="ins-table">
          <caption className="ins-visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={column.numeric ? 'is-num' : undefined}
                    aria-sort={order?.key === column.key ? (order.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className={`ins-sort${order?.key === column.key ? ' is-sorted' : ''}`}
                          onClick={() => sortBy(column.key, column.numeric)}>
                    {column.label}
                    <span aria-hidden="true">{order?.key === column.key ? (order.direction === 'asc' ? '▲' : '▼') : '↕'}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={rowKey(row)} className={rowClass?.(row)}>
                {columns.map((column) => (
                  <td key={column.key} data-label={column.label} className={column.numeric ? 'is-num' : undefined}>
                    {column.render ? column.render(row) : (column.value(row) ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {size ? (
        <div className="ins-pagination">
          <label>
            Items per page
            <select value={size} onChange={(event) => { setSize(Number(event.target.value)); setPage(1); }}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span>{(current - 1) * size + 1}–{Math.min(current * size, sorted.length)} of {sorted.length}</span>
          <span className="ins-pagination__pages">
            <button type="button" aria-label="Previous page" disabled={current <= 1} onClick={() => setPage(current - 1)}>‹</button>
            <span>Page {current} of {pages}</span>
            <button type="button" aria-label="Next page" disabled={current >= pages} onClick={() => setPage(current + 1)}>›</button>
          </span>
        </div>
      ) : null}
    </>
  );
}

/** How the figures are read, in the report's own words: closed until asked for. */
export function Notes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <details className="ins-notes">
      <summary>How these figures are read</summary>
      <ul>{notes.map((note) => <li key={note}>{note}</li>)}</ul>
    </details>
  );
}

export const GROUPINGS = [
  { value: 'outlets', label: 'Outlet' },
  { value: 'dealers', label: 'Dealership' },
  { value: 'models', label: 'Model' },
] as const;
export type Grouping = (typeof GROUPINGS)[number]['value'];

export const GROUPING_NAME: Record<string, string> = {
  outlets: 'Outlet', dealers: 'Dealership', models: 'Model', districts: 'District', categories: 'Category',
};
