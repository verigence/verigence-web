import { useMemo, useState } from 'react';

import type { P2MasterDocumentRef } from '../../../services/audit-core/uc03P2';
import {
  KIND_LABEL,
  KIND_MARK,
  KIND_ORDER,
  type LoadedMaster,
  type MasterKind,
  inForceOn,
  shortDate,
} from './mastersLoaded';

type View = 'CALENDAR' | 'LIST';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function DocumentLink({ document, onOpen, busy }: {
  document: P2MasterDocumentRef;
  onOpen: (uploadId: string, fileName: string) => void;
  busy: boolean;
}) {
  if (!document) return <span className="p2w-muted">No document on record</span>;
  if (!document.openable) {
    return (
      <span className="p2w-muted" title="Loaded before the file itself was kept.">
        {document.fileName} (not stored)
      </span>
    );
  }
  return (
    <button
      type="button"
      className="text-link"
      disabled={busy}
      onClick={() => onOpen(document.uploadId, document.fileName)}
    >
      {document.fileName}
    </button>
  );
}

/**
 * Which masters have been loaded and what answers on the chosen date.
 *
 * Calendar: the month around the chosen date, each day marked with the
 * masters that START on it (P price list, C consumer, X exchange/scrappage,
 * K corporate, G grid); picking a day reads the book on that day. List: every
 * version published, newest first. Both read the version tables, so a master
 * loaded without its document still shows, and says so.
 */
export default function MastersLoadedPanel({
  rows, on, onPick, onOpenDocument, busyDocument, loading, failed,
}: {
  rows: LoadedMaster[];
  on: string;
  onPick: (date: string) => void;
  onOpenDocument: (uploadId: string, fileName: string) => void;
  busyDocument: string | null;
  loading: boolean;
  failed: boolean;
}) {
  const [view, setView] = useState<View>('CALENDAR');
  const [cursor, setCursor] = useState(() => ({ year: Number(on.slice(0, 4)), month: Number(on.slice(5, 7)) - 1 }));
  const [kinds, setKinds] = useState<Set<MasterKind>>(() => new Set(KIND_ORDER));

  const starts = useMemo(() => {
    const byDay = new Map<string, Set<MasterKind>>();
    for (const row of rows) {
      if (!row.answers) continue;
      const set = byDay.get(row.effectiveFrom) ?? new Set<MasterKind>();
      set.add(row.kind);
      byDay.set(row.effectiveFrom, set);
    }
    return byDay;
  }, [rows]);

  const standing = useMemo(() => inForceOn(rows, on), [rows, on]);

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(cursor.year, cursor.month, 1));
    const lead = (first.getUTCDay() + 6) % 7; // Monday first
    const days = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
    const out: Array<string | null> = Array.from({ length: lead }, () => null);
    for (let day = 1; day <= days; day += 1) out.push(iso(cursor.year, cursor.month, day));
    while (out.length % 7) out.push(null);
    return out;
  }, [cursor]);

  const monthLabel = new Date(Date.UTC(cursor.year, cursor.month, 1))
    .toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  function shift(by: number) {
    setCursor(({ year, month }) => {
      const next = month + by;
      return { year: year + Math.floor(next / 12), month: ((next % 12) + 12) % 12 };
    });
  }

  function toggle(kind: MasterKind) {
    setKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind); else next.add(kind);
      return next.size ? next : new Set(KIND_ORDER);
    });
  }

  const listed = rows.filter((row) => kinds.has(row.kind)).slice().reverse();

  return (
    <section className="p2w-masters" aria-label="Masters loaded">
      <div className="p2w-masters__head">
        <div>
          <h3>Masters loaded</h3>
          <p className="p2w-muted">What has been published, and what answers on {shortDate(on)}.</p>
        </div>
        <div className="p2w-masters__switch" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={view === 'CALENDAR'} className={view === 'CALENDAR' ? 'is-active' : ''} onClick={() => setView('CALENDAR')}>Calendar</button>
          <button type="button" role="tab" aria-selected={view === 'LIST'} className={view === 'LIST' ? 'is-active' : ''} onClick={() => setView('LIST')}>All loaded</button>
        </div>
      </div>

      {loading && <p className="p2w-muted">Reading what has been loaded…</p>}
      {failed && <div className="form-alert form-alert--error">The list of loaded masters could not be read.</div>}

      {!loading && !failed && (
        <div className="p2w-masters__body">
          <div className="p2w-masters__standing">
            <h4>In force on {shortDate(on)}</h4>
            <ul>
              {KIND_ORDER.map((kind) => {
                const items = standing[kind];
                return (
                  <li key={kind}>
                    <span className={`p2w-masters__mark p2w-masters__mark--${KIND_MARK[kind]}`} aria-hidden="true">{KIND_MARK[kind]}</span>
                    <div>
                      <strong>{KIND_LABEL[kind]}</strong>
                      {items.length === 0 && <div className="p2w-masters__none">Nothing in force on this date</div>}
                      {items.map((item) => (
                        <div key={item.key} className="p2w-masters__item">
                          <span>{shortDate(item.effectiveFrom)} – {item.effectiveTo ? shortDate(item.effectiveTo) : 'until replaced'}</span>
                          <span className="p2w-muted"> · {item.detail}</span>
                          <div>
                            <DocumentLink
                              document={item.document}
                              onOpen={onOpenDocument}
                              busy={busyDocument === item.document?.uploadId}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {view === 'CALENDAR' ? (
            <div className="p2w-masters__calendar">
              <div className="p2w-masters__nav">
                <button type="button" className="p2w-icon-button" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
                <strong>{monthLabel}</strong>
                <button type="button" className="p2w-icon-button" aria-label="Next month" onClick={() => shift(1)}>›</button>
              </div>
              <div className="p2w-masters__grid" role="grid" aria-label={monthLabel}>
                {WEEKDAYS.map((d) => <div key={d} className="p2w-masters__dow" role="columnheader">{d}</div>)}
                {cells.map((day, index) => {
                  if (!day) return <div key={`blank-${index}`} className="p2w-masters__blank" />;
                  const marks = KIND_ORDER.filter((k) => starts.get(day)?.has(k));
                  const label = marks.length
                    ? `${shortDate(day)}: ${marks.map((k) => KIND_LABEL[k]).join(', ')} start`
                    : shortDate(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      role="gridcell"
                      aria-selected={day === on}
                      aria-label={label}
                      title={label}
                      className={`p2w-masters__day${day === on ? ' is-selected' : ''}${marks.length ? ' has-start' : ''}`}
                      onClick={() => onPick(day)}
                    >
                      <span className="p2w-masters__num">{Number(day.slice(8))}</span>
                      <span className="p2w-masters__marks">
                        {marks.map((k) => (
                          <span key={k} className={`p2w-masters__mark p2w-masters__mark--${KIND_MARK[k]}`}>{KIND_MARK[k]}</span>
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="p2w-muted p2w-masters__legend">
                {KIND_ORDER.map((k) => `${KIND_MARK[k]} ${KIND_LABEL[k]}`).join(' · ')}. A letter marks the day a master starts; pick a day to read the book on it.
              </p>
            </div>
          ) : (
            <div className="p2w-masters__list">
              <div className="p2w-masters__filters">
                {KIND_ORDER.map((kind) => (
                  <label key={kind} className="p2w-check">
                    <input type="checkbox" checked={kinds.has(kind)} onChange={() => toggle(kind)} /> {KIND_LABEL[kind]}
                  </label>
                ))}
              </div>
              {listed.length === 0 ? (
                <p className="p2w-muted">Nothing has been loaded yet.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="p2w-table">
                    <thead>
                      <tr><th>Master</th><th>From</th><th>To</th><th>Contents</th><th>Document</th></tr>
                    </thead>
                    <tbody>
                      {listed.map((row) => (
                        <tr key={row.key} className={row.answers ? '' : 'is-superseded'}>
                          <td>
                            {KIND_LABEL[row.kind]}
                            {!row.answers && <div className="p2w-muted">Replaced by a later upload on the same date</div>}
                          </td>
                          <td>
                            <button type="button" className="text-link" onClick={() => onPick(row.effectiveFrom)}>
                              {shortDate(row.effectiveFrom)}
                            </button>
                          </td>
                          <td>{row.effectiveTo ? shortDate(row.effectiveTo) : 'until replaced'}</td>
                          <td>{row.detail}</td>
                          <td>
                            <DocumentLink document={row.document} onOpen={onOpenDocument} busy={busyDocument === row.document?.uploadId} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
