/**
 * Where every "Capture new booking" in Web goes: the one Booking & Delivery
 * documents screen, which splits a multi-document PDF into pages before
 * anything is read. The Phase 1 capture flow (/v2/bookings/new) uploaded a
 * whole PDF as one document and is gone (2026-10-20).
 */
export const P2_NEW_BOOKING_PATH = '/p2/journeys/new/documents';

/** A PC's, TL's and PM's home: the Booking & Delivery list. */
export const P2_HOME_PATH = '/p2/bookings';
