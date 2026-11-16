import type { LocationCheckCommand } from '../../services/audit-core/locationChecks';

/**
 * DealGuard checks kept on the device while it is offline (product owner,
 * 2026-11-16: "can you pls do offline check for the location"). A check that
 * cannot be sent (no network, a timeout) is kept in this browser's storage with
 * the moment it was read and sent when the network is back; the server judges
 * it at that moment. Pure functions over the stored list.
 */
export const QUEUE_KEY = 'vg.dealguard.locationQueue';
export const MAX_QUEUED = 100;
/** The server refuses a reading older than this. */
export const MAX_QUEUED_AGE_MS = 48 * 3_600_000;

export type QueuedCheck = LocationCheckCommand & { tenantId: string; clientCheckId: string; capturedAt: string };

export function parseQueue(raw: string | null | undefined): QueuedCheck[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is QueuedCheck => Boolean(item) && typeof item === 'object'
      && typeof (item as QueuedCheck).tenantId === 'string'
      && typeof (item as QueuedCheck).clientCheckId === 'string'
      && typeof (item as QueuedCheck).capturedAt === 'string'
      && typeof (item as QueuedCheck).outcome === 'string');
  } catch {
    return [];
  }
}

/** Drop what the server would refuse (too old, unreadable time). */
export function pruneQueue(queue: QueuedCheck[], now: number): QueuedCheck[] {
  return queue.filter((item) => {
    const at = Date.parse(item.capturedAt);
    return Number.isFinite(at) && now - at <= MAX_QUEUED_AGE_MS;
  });
}

/** Add a check, newest last; the oldest go when the list is full. */
export function addToQueue(queue: QueuedCheck[], item: QueuedCheck, now: number): QueuedCheck[] {
  const kept = pruneQueue(queue, now).filter((q) => q.clientCheckId !== item.clientCheckId);
  return [...kept, item].slice(-MAX_QUEUED);
}

/** A new id for a reading, so a resend is logged once. */
export function newClientCheckId(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `w-${random}`;
}
