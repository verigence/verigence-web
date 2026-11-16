import type { CorrectionKind } from '../../../services/hr/attendanceCalendar';
import { formatTimeIst } from './attendanceFormat';

interface Asked {
  requested: CorrectionKind;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  locationCheckIn?: boolean;
  locationCheckOut?: boolean;
}

/**
 * What a correction asks for, in words: "Full day", "Check-out at 6:40 pm", or for a time or
 * location correction "Check-in at 10:20 am; check-in location at the outlet" (2026-11-16).
 */
export function correctionAskedText(c: Asked): string {
  if (c.requested === 'FULL_DAY') return 'Full day';
  if (c.requested === 'HALF_DAY') return 'Half day';
  if (c.requested === 'CHECK_OUT') return c.checkOutAt ? `Check-out at ${formatTimeIst(c.checkOutAt)}` : 'Check-out';
  const parts: string[] = [];
  if (c.checkInAt) parts.push(`check-in at ${formatTimeIst(c.checkInAt)}`);
  if (c.checkOutAt) parts.push(`check-out at ${formatTimeIst(c.checkOutAt)}`);
  if (c.locationCheckIn && c.locationCheckOut) parts.push('check-in and check-out location at the outlet');
  else if (c.locationCheckIn) parts.push('check-in location at the outlet');
  else if (c.locationCheckOut) parts.push('check-out location at the outlet');
  const text = parts.join('; ') || 'time or location';
  return text.charAt(0).toUpperCase() + text.slice(1);
}
