/** Helpers for the System Health "Jobs" tab: times are India time, HH:MM on a 24-hour clock. */

export function isHhMm(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** "21:30" as people say it: "9:30 pm". */
export function clockLabel(hhmm: string | null | undefined): string {
  if (!hhmm || !isHhMm(hhmm)) return '—';
  const [hour, minute] = hhmm.split(':').map(Number);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'am' : 'pm'}`;
}

/** What the page says about the night's sleep. */
export function sleepText(window: { enabled: boolean; startIst: string | null; endIst: string | null }): string {
  if (!window.enabled) return 'The system does not sleep at night: the sleep window is switched off.';
  return `The system sleeps from ${clockLabel(window.startIst)} to ${clockLabel(window.endIst)} India time: `
    + 'nothing below runs then unless its time is set inside the window, and the database is not billed while it sleeps.';
}

/** How many of the live Projects the job's last run covered. */
export function coverageText(job: { lastRunAtUtc: string | null; projectsRunLast: number; projects: number }): string {
  if (!job.lastRunAtUtc) return 'Not run yet';
  return `${job.projectsRunLast} of ${job.projects} Projects`;
}
