import { Navigate, useParams } from 'react-router-dom';

/**
 * 06-Sep-2026 UC03 authority C-01/C-03 retires the separate Booking Details /
 * Additional Information screen. Keep this route only as a compatibility redirect
 * for old bookmarks and in-flight clients; active capture proceeds Documents -> Review.
 * Audit exceptions do not stop the business process.
 */
export default function BookingDetailsV2Page() {
  const { journeyId = '' } = useParams<{ journeyId: string }>();
  return journeyId
    ? <Navigate to={`/v2/bookings/${journeyId}/review`} replace />
    : <Navigate to="/dashboard" replace />;
}
