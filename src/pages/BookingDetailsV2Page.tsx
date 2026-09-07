import { Navigate, useParams } from 'react-router-dom';

import Journey360Page from './Journey360Page';

/**
 * Booking Details is the consolidated read/view surface after Review & Submit.
 *
 * The previous version fetched the review API here and redirected to Review
 * when captureSubmitted was false. That caused every "View Detail" navigation
 * to briefly show a loading spinner and then redirect to the Review page — even
 * for fully submitted bookings — whenever the API was slow or errored.
 *
 * The redirect guard belongs on the Booking capture flow (BookingCaptureV2WorkspacePage
 * and BookingReviewV2Page), not on the read-only detail view. Journey360Page already
 * handles missing / not-found journeys gracefully. If the booking has not been
 * submitted yet, the PC's work queue and the Booking capture flow will surface that.
 *
 * Audit exceptions do not stop the business process.
 */
export default function BookingDetailsV2Page() {
  const { journeyId = '' } = useParams<{ journeyId: string }>();
  if (!journeyId) return <Navigate to="/dashboard" replace />;
  return <Journey360Page />;
}
