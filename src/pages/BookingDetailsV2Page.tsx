import { Navigate, useParams } from 'react-router-dom';

import Journey360Page from './Journey360Page';

/**
 * 06-Sep-2026 UC03 simplification retires the old manual Additional Information
 * capture step, not the post-capture Booking Details view. This route is the
 * consolidated read/view surface after Review & Submit and uses the same Audit
 * Core-backed data projection without exposing Journey terminology to the PC.
 * Audit exceptions do not stop the business process.
 */
export default function BookingDetailsV2Page() {
  const { journeyId = '' } = useParams<{ journeyId: string }>();
  return journeyId
    ? <Journey360Page />
    : <Navigate to="/dashboard" replace />;
}
