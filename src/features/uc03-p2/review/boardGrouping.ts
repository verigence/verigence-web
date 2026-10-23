import type { ReviewerJourney } from '../../../services/audit-core/uc03P2Reviewer';

export type UploadDayGroup = { uploadDate: string; journeys: ReviewerJourney[] };

/**
 * An outlet's journeys, one group per upload day, in the order the server
 * sent them (oldest day first while open, newest first once closed). A
 * journey with no upload date goes in a group of its own at the end rather
 * than being dropped.
 */
export function groupByUploadDay(journeys: ReviewerJourney[]): UploadDayGroup[] {
  const groups: UploadDayGroup[] = [];
  const undated: ReviewerJourney[] = [];
  for (const journey of journeys) {
    if (!journey.uploadDate) {
      undated.push(journey);
      continue;
    }
    const last = groups[groups.length - 1];
    if (last && last.uploadDate === journey.uploadDate) last.journeys.push(journey);
    else groups.push({ uploadDate: journey.uploadDate, journeys: [journey] });
  }
  if (undated.length) groups.push({ uploadDate: '', journeys: undated });
  return groups;
}

/** "2026-10-12" as "12 Oct 2026", without moving the day through a timezone. */
export function formatUploadDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value || 'No upload date';
  const [, year, month, day] = match;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
}

export const NO_PC = '';

export type PcGroup = { pcName: string; journeys: ReviewerJourney[] };

/**
 * An outlet's journeys, one group per PC, PCs A to Z, each keeping the order
 * the server sent (oldest upload first while open). Journeys with no PC
 * recorded go in a group of their own at the end rather than being dropped.
 */
export function groupByPc(journeys: ReviewerJourney[]): PcGroup[] {
  const byPc = new Map<string, ReviewerJourney[]>();
  for (const journey of journeys) {
    const name = (journey.pcName ?? '').trim();
    const list = byPc.get(name) ?? [];
    list.push(journey);
    byPc.set(name, list);
  }
  const named = [...byPc.entries()]
    .filter(([name]) => name !== NO_PC)
    .sort(([a], [b]) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
    .map(([pcName, list]) => ({ pcName, journeys: list }));
  const unnamed = byPc.get(NO_PC);
  return unnamed ? [...named, { pcName: NO_PC, journeys: unnamed }] : named;
}

/** Every PC among the journeys with how many journeys each has, A to Z; "" for no PC recorded, last. */
export function pcCounts(journeys: ReviewerJourney[]): Array<{ pcName: string; count: number }> {
  return groupByPc(journeys).map((g) => ({ pcName: g.pcName, count: g.journeys.length }));
}
