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
