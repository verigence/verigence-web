import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router-dom';

import Journey360Page from './Journey360Page';
import { getBookingReviewV2 } from '../services/audit-core/uc03DocumentReviewV2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';

/**
 * Booking Details is the consolidated read/view surface after Review & Submit.
 * A pre-submit attempt to enter this route must resume the governed Booking
 * capture cycle at Review rather than exposing an incomplete details page.
 */
export default function BookingDetailsV2Page() {
  const { journeyId = '' } = useParams<{ journeyId: string }>();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const enabled = Boolean(project?.tenantId && journeyId && accessToken);

  const reviewQuery = useQuery({
    queryKey: ['uc03-document-review-v2', project?.tenantId, journeyId],
    queryFn: () => getBookingReviewV2(project!.tenantId, journeyId, accessToken),
    enabled,
    refetchOnWindowFocus: false,
  });

  if (!journeyId) return <Navigate to="/dashboard" replace />;
  if (!project || !accessToken) return null;
  if (reviewQuery.isPending) {
    return <div className="uc03-c1-loading" role="status">Opening Booking Review…</div>;
  }
  if (reviewQuery.isError || !reviewQuery.data || !reviewQuery.data.captureSubmitted) {
    return <Navigate to={`/v2/bookings/${journeyId}/review`} replace />;
  }

  return <Journey360Page />;
}
