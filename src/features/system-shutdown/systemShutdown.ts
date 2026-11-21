import type { SystemShutdownOverview } from '../../services/security/systemShutdown';

export const systemShutdownKeys = { admin: ['security', 'system-shutdown', 'admin'] as const };

const IST = 'Asia/Kolkata';

export const isHhMm = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** "8:00 am" for an India time given as HH:MM. */
export function clockLabel(hhmm: string | null | undefined): string {
  if (!hhmm || !isHhMm(hhmm)) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** "8:00 am" today, "8:00 am tomorrow" or "8:00 am on 23 Nov", India time, for a moment given in UTC. */
export function untilLabel(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: IST });
  const time = at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST });
  if (day(at) === day(now)) return time;
  if (day(at) === day(new Date(now.getTime() + 24 * 3600_000))) return `${time} tomorrow`;
  return `${time} on ${at.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: IST })}`;
}

export interface ShutdownHeadline {
  shut: boolean;
  title: string;
  detail: string;
}

/** What the top of the tab says: running or shut, why, and until when. */
export function headline(state: SystemShutdownOverview, now: Date = new Date()): ShutdownHeadline {
  const hours = state.hoursFromIst && state.hoursToIst
    ? `${clockLabel(state.hoursFromIst)} to ${clockLabel(state.hoursToIst)}`
    : null;
  if (state.resting) {
    const until = untilLabel(state.restUntilUtc, now);
    return {
      shut: true,
      title: `Verigence is shut until ${until}`,
      detail: state.manual === 'SHUT'
        ? `Shut down by hand. It starts by itself at ${until}, or when a Super Admin or Executive presses Start now.`
        : `The daily shutdown (${hours ?? 'set below'}). It starts by itself at ${until}, or when a Super Admin or Executive presses Start now.`,
    };
  }
  if (state.manual === 'OPEN') {
    return {
      shut: false,
      title: 'Verigence is running',
      detail: `Started by hand during the daily shutdown. It runs until ${untilLabel(state.manualUntilUtc, now)}; the next daily shutdown happens as usual.`,
    };
  }
  return {
    shut: false,
    title: 'Verigence is running',
    detail: hours ? `The next daily shutdown is ${hours}, India time.` : 'There is no daily shutdown.',
  };
}

const ACTIONS: Record<string, string> = { SHUT_NOW: 'Shut down now', START_NOW: 'Start now' };

/** "Shut down now", "Start now", or "Daily hours set to 10:00 pm to 7:30 am". */
export function actionLabel(action: string | null | undefined): string {
  if (!action) return '—';
  if (ACTIONS[action]) return ACTIONS[action];
  const hours = /^HOURS (\d\d:\d\d)-(\d\d:\d\d)$/.exec(action);
  return hours ? `Daily hours set to ${clockLabel(hours[1])} to ${clockLabel(hours[2])}` : action;
}
