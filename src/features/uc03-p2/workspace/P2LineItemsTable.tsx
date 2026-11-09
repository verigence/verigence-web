import { useMemo, useState } from 'react';

import type { P2LineItem, P2LineItemChange } from '../../../services/audit-core/uc03P2';
import { humanizeKey } from './p2Format';

/**
 * A table field (an NDC's charges and payments, a ledger's vouchers, an
 * invoice's lines) shown line by line, each line corrected, removed or added
 * on its own (product owner 2026-11-09). Audit Core writes the new table
 * through the ordinary correction, so the change log, the TL / Reviewer
 * information and the re-check are those of any other field.
 *
 * Layout follows the Carbon data table with inline row editing: a toolbar
 * with the primary "Add line", one row per line, row actions at the end.
 */

const FIRST = /^(particulars|description|item|narration|label|name)/;
const DATES = /date/;
const FIGURES = /(amount|rate|quantity|qty|balance|total|value|price|tax|cess|debit|credit)/;

/** Columns in reading order: what the line is, its date and references, then figures. */
export function lineColumns(rows: P2LineItem[], fallback: string[]): string[] {
  const keys: string[] = [];
  for (const row of rows) for (const key of Object.keys(row)) if (!keys.includes(key)) keys.push(key);
  const columns = keys.length ? keys : fallback;
  const rank = (key: string) => (FIRST.test(key) ? 0 : DATES.test(key) ? 1 : FIGURES.test(key) ? 3 : 2);
  return [...columns].sort((a, b) => rank(a) - rank(b));
}

function norm(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/,/g, '').trim();
  const number = Number(text);
  return text !== '' && Number.isFinite(number) ? String(number) : text;
}

/** Same line when every filled value agrees (21000 and "21,000" agree). */
export function sameLine(a: P2LineItem, b: P2LineItem): boolean {
  const filled = (row: P2LineItem) => Object.entries(row)
    .map(([key, value]) => [key, norm(value)] as const)
    .filter(([, value]) => value !== '')
    .sort(([x], [y]) => x.localeCompare(y));
  return JSON.stringify(filled(a)) === JSON.stringify(filled(b));
}

const figure = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

function cellText(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (FIGURES.test(key) && typeof value === 'number') return figure.format(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

type Editing = { mode: 'edit'; index: number } | { mode: 'add' } | { mode: 'remove'; index: number };

export default function P2LineItemsTable({
  label,
  rows,
  extractedRows,
  fallbackColumns,
  readOnly,
  submit,
}: {
  label: string;
  rows: P2LineItem[];
  extractedRows: P2LineItem[];
  /** Columns offered when the table has no lines yet. */
  fallbackColumns: string[];
  readOnly?: boolean;
  submit: (change: P2LineItemChange) => Promise<void>;
}) {
  const columns = useMemo(() => lineColumns([...rows, ...extractedRows], fallbackColumns), [rows, extractedRows, fallbackColumns]);
  const [editing, setEditing] = useState<Editing>();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const open = (next: Editing) => {
    setEditing(next);
    setError(undefined);
    setNote('');
    const source = next.mode === 'edit' ? rows[next.index] : {};
    setDraft(Object.fromEntries(columns.map((key) => [key, source[key] === null || source[key] === undefined ? '' : String(source[key])])));
  };
  const close = () => { setEditing(undefined); setError(undefined); };

  const run = async (change: P2LineItemChange) => {
    setBusy(true);
    setError(undefined);
    try {
      await submit({ ...change, remarks: note.trim() || undefined });
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the line.');
    } finally {
      setBusy(false);
    }
  };

  const draftRow = (): P2LineItem => Object.fromEntries(columns.map((key) => [key, draft[key]?.trim() ? draft[key].trim() : null]));
  const draftEmpty = columns.every((key) => !draft[key]?.trim());

  const form = (title: string, onSave: () => void) => (
    <form className="p2w-lines__form" aria-label={title}
      onSubmit={(event) => { event.preventDefault(); if (!draftEmpty) onSave(); }}
      onKeyDown={(event) => { if (event.key === 'Escape') close(); }}>
      <p className="p2w-lines__form-title">{title}</p>
      <div className="p2w-lines__inputs">
        {columns.map((key, position) => (
          <label key={key}>
            <span>{humanizeKey(key)}</span>
            <input autoFocus={position === 0} value={draft[key] ?? ''} inputMode={FIGURES.test(key) ? 'decimal' : 'text'}
              onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} />
          </label>
        ))}
      </div>
      <label className="p2w-lines__note">
        <span>Note (optional): the Team Lead and Reviewer are informed.</span>
        <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      {error ? <p className="p2w-lines__error" role="alert">{error}</p> : null}
      <div className="p2w-field__actions">
        <button type="button" className="p2w-button p2w-button--ghost" onClick={close}>Cancel</button>
        <button type="submit" className="p2w-button p2w-button--primary" disabled={busy || draftEmpty}>
          {busy ? 'Saving…' : 'Save line'}
        </button>
      </div>
    </form>
  );

  return (
    <div className="p2w-lines">
      <div className="p2w-lines__toolbar">
        <span>{`${rows.length} ${rows.length === 1 ? 'line' : 'lines'}`}</span>
        {!readOnly ? (
          <button type="button" className="p2w-button p2w-button--ghost" disabled={busy || editing?.mode === 'add'}
            onClick={() => open({ mode: 'add' })}>+ Add line</button>
        ) : null}
      </div>
      <div className="p2w-lines__scroll">
        <table className="p2w-lines__table" aria-label={label}>
          <thead>
            <tr>
              <th scope="col">#</th>
              {columns.map((key) => (
                <th key={key} scope="col" className={FIGURES.test(key) ? 'is-figure' : undefined}>{humanizeKey(key)}</th>
              ))}
              {!readOnly ? <th scope="col"><span className="p2w-visually-hidden">Actions</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const changed = !extractedRows.some((read) => sameLine(read, row));
              return (
                <tr key={`${index}:${JSON.stringify(row)}`} className={changed ? 'is-changed' : undefined}>
                  <td>
                    {index + 1}
                    {changed ? <span className="p2w-chip p2w-chip--info p2w-lines__chip">Changed</span> : null}
                  </td>
                  {columns.map((key) => (
                    <td key={key} className={FIGURES.test(key) ? 'is-figure' : undefined}>{cellText(key, row[key])}</td>
                  ))}
                  {!readOnly ? (
                    <td className="p2w-lines__row-actions">
                      <button type="button" className="p2w-button p2w-button--ghost" disabled={busy}
                        onClick={() => open({ mode: 'edit', index })} aria-label={`Edit line ${index + 1}`}>Edit</button>
                      <button type="button" className="p2w-button p2w-button--ghost is-danger" disabled={busy}
                        onClick={() => { setEditing({ mode: 'remove', index }); setError(undefined); setNote(''); }}
                        aria-label={`Remove line ${index + 1}`}>Remove</button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {!rows.length ? (
              <tr><td colSpan={columns.length + (readOnly ? 1 : 2)} className="p2w-lines__empty">No lines were read.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {editing?.mode === 'edit' ? form(`Correct line ${editing.index + 1}`, () => void run({
        operation: 'UPDATE', rowIndex: editing.index, expectedRow: rows[editing.index], row: draftRow(),
      })) : null}
      {editing?.mode === 'add' ? form('Add a line', () => void run({ operation: 'ADD', row: draftRow() })) : null}
      {editing?.mode === 'remove' ? (
        <div className="p2w-lines__form" role="group" aria-label={`Remove line ${editing.index + 1}`}>
          <p className="p2w-lines__form-title">Remove line {editing.index + 1}?</p>
          <p className="p2w-muted">{columns.map((key) => cellText(key, rows[editing.index]?.[key])).filter((v) => v !== '—').join(' · ')}</p>
          <label className="p2w-lines__note">
            <span>Note (optional): why does this line not belong?</span>
            <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          {error ? <p className="p2w-lines__error" role="alert">{error}</p> : null}
          <div className="p2w-field__actions">
            <button type="button" className="p2w-button p2w-button--ghost" onClick={close}>Cancel</button>
            <button type="button" className="p2w-button p2w-button--danger" disabled={busy}
              onClick={() => void run({ operation: 'REMOVE', rowIndex: editing.index, expectedRow: rows[editing.index] })}>
              {busy ? 'Removing…' : 'Remove line'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
