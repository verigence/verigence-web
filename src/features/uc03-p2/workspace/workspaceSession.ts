/**
 * Which booking the workspace screen is working on (2026-10-31).
 *
 * A new booking and an existing one are the same route
 * (/p2/journeys/:journeyId/documents, "new" until the first upload creates
 * the Journey), so React kept one screen across them: after a booking was
 * created here, "Capture New Booking" (or any link to another booking) changed
 * the address but the screen stayed on the booking it had created, with the
 * same creation key, and the next customer's files went into it. Each booking
 * now gets a screen of its own: the screen is started afresh whenever the
 * address names another booking, except for the one step from "new" to the
 * booking this screen has just created.
 */

/** What "Start next booking" hands the fresh screen. */
export type NextBookingCarry = {
  /** Files to upload into the new booking ("Start new booking with this file"). */
  files?: File[];
  /** The outlet to preselect: the booking the PC was just working on. */
  outletId?: string;
};

export type WorkspaceSession = {
  /** Changes whenever a fresh screen is needed (the screen's React key). */
  key: number;
  /** The route's journey id the session last saw ("new" for a new booking). */
  route: string;
  /** The Journey this screen created, while its address still says "new". */
  createdId?: string;
  carry?: NextBookingCarry;
};

export const NEW_BOOKING_ROUTE = 'new';

export function openSession(route: string): WorkspaceSession {
  return { key: 0, route };
}

/** The session for the address now shown: a fresh screen for another booking. */
export function followRoute(session: WorkspaceSession, route: string): WorkspaceSession {
  if (route === session.route) return session;
  if (session.route === NEW_BOOKING_ROUTE && session.createdId && route === session.createdId) {
    return { ...session, route };
  }
  return {
    key: session.key + 1,
    route,
    carry: route === NEW_BOOKING_ROUTE ? session.carry : undefined,
  };
}

/** "Start next booking": a fresh new-booking screen. When the address is not
 * "new" yet the screen is started afresh as it changes (followRoute); when it
 * already is, it is started afresh now. */
export function startNextBooking(session: WorkspaceSession, carry: NextBookingCarry, route: string): WorkspaceSession {
  if (route === NEW_BOOKING_ROUTE) return { key: session.key + 1, route, carry };
  return { ...session, carry };
}

/** The screen created this Journey; the address follows. What was carried is spent. */
export function journeyCreated(session: WorkspaceSession, journeyId: string): WorkspaceSession {
  return { ...session, createdId: journeyId, carry: undefined };
}

export function carryTaken(session: WorkspaceSession): WorkspaceSession {
  return session.carry ? { ...session, carry: undefined } : session;
}

/** One creation per new-booking screen, even if several files are dropped at once. */
export function newBookingIdempotencyKey(): string {
  return `p2-new-booking-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
