/** Formatting and small sums shared by the Analytics reports. Pure, so it is unit tested. */

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** ₹12,34,567 — every rupee, Indian grouping. */
export function rupees(value: number | null | undefined): string {
  if (!isNumber(value)) return '—';
  return `${value < 0 ? '−' : ''}₹${Math.abs(Math.round(value)).toLocaleString('en-IN')}`;
}

/** ₹1.54 crore, ₹12.7 lakh, ₹45,000 — the figure a tile or a bar carries. */
export function rupeesShort(value: number | null | undefined): string {
  if (!isNumber(value)) return '—';
  const sign = value < 0 ? '−' : '';
  const n = Math.abs(value);
  if (n >= 1e7) return `${sign}₹${trim(n / 1e7, n >= 1e9 ? 0 : 2)} crore`;
  if (n >= 1e5) return `${sign}₹${trim(n / 1e5, n >= 1e6 ? 1 : 2)} lakh`;
  return `${sign}₹${Math.round(n).toLocaleString('en-IN')}`;
}

function trim(value: number, digits: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: digits });
}

export function count(value: number | null | undefined): string {
  return isNumber(value) ? value.toLocaleString('en-IN') : '—';
}

export function percent(value: number | null | undefined, digits = 0): string {
  return isNumber(value) ? `${value.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%` : '—';
}

/** A signed figure for "against the network": +2.4, −1.0, 0. */
export function signed(value: number | null | undefined, digits = 1): string {
  if (!isNumber(value)) return '—';
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return '0';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toLocaleString('en-IN', { maximumFractionDigits: digits })}`;
}

export function days(value: number | null | undefined): string {
  if (!isNumber(value)) return '—';
  const rounded = Math.round(value);
  return `${rounded} day${rounded === 1 ? '' : 's'}`;
}

/** "Utkal Mahindra - CDA" under "Utkal Mahindra" reads as "CDA". */
export function shortOutlet(outlet: string | null | undefined, dealer?: string | null): string {
  if (!outlet) return '—';
  if (dealer) {
    const lower = outlet.toLowerCase();
    const prefix = dealer.toLowerCase();
    for (const joiner of [' - ', ' – ', ': ']) {
      if (lower.startsWith(prefix + joiner)) return outlet.slice(dealer.length + joiner.length);
    }
  }
  return outlet;
}

export function dayLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** "2026-10" reads as "Oct 2026". */
export function monthLabel(value: string): string {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return value;
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

export function dateTimeLabel(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

/** The shade of a rate on the one-hue scale: 0 (none) to 6 (nearly all). */
export function heatStep(value: number | null | undefined): number {
  if (!isNumber(value) || value <= 0) return 0;
  if (value < 10) return 1;
  if (value < 25) return 2;
  if (value < 40) return 3;
  if (value < 60) return 4;
  if (value < 80) return 5;
  return 6;
}

/** The shade of a gap to the network's rate, as a share of what was expected:
 *  -3 (far below) to +3 (far above); 0 is within a deal of it. */
export function gapStep(gap: number | null | undefined, expected: number | null | undefined): number {
  if (!isNumber(gap) || Math.abs(gap) < 1) return 0;
  const base = Math.max(isNumber(expected) ? expected : 0, 1);
  const share = Math.abs(gap) / base;
  const size = share >= 0.6 ? 3 : share >= 0.3 ? 2 : 1;
  return gap > 0 ? size : -size;
}

export type QuickRange = 'this-month' | 'last-month' | 'all';

function iso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function quickRange(kind: QuickRange, today = new Date()): { from: string; to: string } {
  if (kind === 'all') return { from: '', to: '' };
  const offset = kind === 'last-month' ? -1 : 0;
  const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const last = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);
  return { from: iso(first), to: iso(last) };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // A cell a spreadsheet would run as a formula is written as text.
  const safe = /^[=+\-@]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

export function downloadCsv(name: string, headers: string[], rows: unknown[][]): void {
  const blob = new Blob([`﻿${toCsv(headers, rows)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export type SortDirection = 'asc' | 'desc';

export function sortRows<T>(rows: T[], valueOf: (row: T) => string | number | null | undefined, direction: SortDirection): T[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = valueOf(a);
    const right = valueOf(b);
    const leftEmpty = left === null || left === undefined || left === '';
    const rightEmpty = right === null || right === undefined || right === '';
    if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty ? 0 : leftEmpty ? 1 : -1; // nothing to show sorts last
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
    return String(left).localeCompare(String(right), 'en-IN', { numeric: true }) * factor;
  });
}
