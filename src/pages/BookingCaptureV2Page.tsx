// Keep Booking V2 cold-open on the lightweight Part-1 bootstrap path.
// The fast entry seeds the governed workspace before rendering the full page,
// so opening a Booking does not block on the heavier /uc03-workspace read.
export { default } from './BookingCaptureV2FastEntry';
