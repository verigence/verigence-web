import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { fetchAttendancePhoto, type AttendanceEvent } from '../../../services/hr/approvals';
import { hrErrorMessage } from '../../../services/hr/client';
import { useSessionStore } from '../../../store/sessionStore';
import { approvalKeys } from './approvalKeys';
import BlobViewerDialog from './BlobViewerDialog';
import { useBlobUrl } from './useBlobUrl';

interface Props {
  attendanceId: string;
  event: AttendanceEvent;
  name: string;
}

/**
 * The stamped photo is fetched only when asked for: the server writes a history entry for every
 * view by someone other than the employee, so a long list must not open every photo by itself.
 */
export default function AttendancePhoto({ attendanceId, event, name }: Props) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const [requested, setRequested] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const photo = useQuery({
    queryKey: approvalKeys.photo(attendanceId, event),
    queryFn: () => fetchAttendancePhoto(accessToken!, attendanceId, event),
    enabled: Boolean(accessToken) && requested,
    retry: false,
    staleTime: Infinity,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const url = useBlobUrl(photo.data);
  const what = event === 'CHECK_IN' ? 'check-in' : 'check-out';

  if (!requested) {
    return (
      <button type="button" className="uc01-admin-button hr-appr-photo-button" onClick={() => setRequested(true)}>
        Show {what} photo
      </button>
    );
  }
  if (photo.isLoading) return <span className="hr-muted" role="status">Loading photo…</span>;
  if (photo.isError) {
    return (
      <span className="hr-appr-inline-error" role="alert">
        <span>{hrErrorMessage(photo.error)}</span>
        <button type="button" className="uc01-admin-button uc01-admin-button--compact" onClick={() => photo.refetch()} disabled={photo.isFetching}>Try again</button>
      </span>
    );
  }
  return (
    <>
      <button type="button" className="hr-appr-thumb" onClick={() => setEnlarged(true)} aria-label={`Enlarge ${what} photo of ${name}`}>
        {url && <img src={url} alt={`Stamped ${what} photo of ${name}`} />}
      </button>
      {enlarged && photo.data && <BlobViewerDialog title={`${name}: ${what} photo`} blob={photo.data} onClose={() => setEnlarged(false)} />}
    </>
  );
}
