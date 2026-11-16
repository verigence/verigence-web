import type { AiCostFigures, AiCostProject } from '../../../services/audit-core/systemHealth';

/** The two kinds of provider call, in the order the chart and its legend draw them. */
export const COST_SERIES = [
  { key: 'extractionUsd', label: 'Reading (extraction)' },
  { key: 'classificationUsd', label: 'Sorting (classification)' },
] as const;

/** US dollars: two decimals from a dollar up, four below it (a read costs about half a cent). */
export function usd(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const digits = Math.abs(value) >= 1 || value === 0 ? 2 : 4;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** The approximate rupee figure of a dollar amount, to the rupee. */
export function inr(value: number | null | undefined, rate: number): string {
  if (value === null || value === undefined) return '—';
  const rupees = value * rate;
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: rupees >= 100 ? 0 : 2 })}`;
}

/** "booking_form" -> "Booking form". */
export function typeLabel(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Unknown';
}

/** Share of the whole, as a percentage to one decimal; nothing when the whole is nothing. */
export function share(part: number, whole: number): string {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—';
}

/** All Projects together: what one Journey with uploads cost, when there is one. */
export function costPerJourney(projects: AiCostProject[]): number | null {
  const journeys = projects.reduce((n, p) => n + p.journeysWithUploads, 0);
  const cost = projects.reduce((n, p) => n + p.costUsd, 0);
  return journeys > 0 ? cost / journeys : null;
}

export function calls(figures: AiCostFigures): number {
  return figures.reads + figures.classifications;
}
