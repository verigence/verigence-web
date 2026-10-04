import { useState } from 'react';

import { hrErrorMessage } from '../../../services/hr/client';
import type { AttendanceEvent } from '../../../services/hr/attendance';
import DialogShell from './DialogShell';
import { useAttendancePhoto, useObjectUrl } from './attendanceQueries';

function CameraGlyph({ busy }: { busy: boolean }) {
  if (busy) return <span aria-hidden="true">…</span>;
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l1.6-2h6.8L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  );
}

interface Props {
  attendanceId: string;
  event: AttendanceEvent;
  hasPhoto: boolean;
  /** Load the thumbnail at once. Off in lists, so a photo is only fetched (and, for HR, logged) when opened. */
  autoLoad?: boolean;
  /** For the dialog title and the accessible name, e.g. "Fri, 02 Oct 2026". */
  caption: string;
}

/** The stamped attendance photo: a small button that opens it full size in a dialog. */
export default function PhotoThumb({ attendanceId, event, hasPhoto, autoLoad = false, caption }: Props) {
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(autoLoad);
  const photo = useAttendancePhoto(attendanceId, event, hasPhoto && requested);
  const url = useObjectUrl(photo.data);
  const label = event === 'CHECK_IN' ? 'Check-in' : 'Check-out';

  if (!hasPhoto) return null;

  return (
    <>
      <button
        type="button"
        className="hr-att-thumb"
        aria-label={`View ${label.toLowerCase()} photo, ${caption}`}
        onClick={() => {
          setRequested(true);
          setOpen(true);
        }}
      >
        {url ? <img src={url} alt="" /> : <CameraGlyph busy={photo.isFetching} />}
      </button>
      {open && (
        <DialogShell title={`${label} photo`} eyebrow={caption} onClose={() => setOpen(false)}>
          {photo.isLoading && <div className="uc01-admin-state">Loading the photo…</div>}
          {photo.isError && (
            <div className="uc01-admin-state uc01-admin-state--error" role="alert">
              <strong>The photo could not be loaded.</strong>
              <span>{hrErrorMessage(photo.error)}</span>
              <button type="button" className="uc01-admin-button" onClick={() => photo.refetch()}>Try again</button>
            </div>
          )}
          {url && <img className="hr-att-photo-full" src={url} alt={`${label} photo with time and place printed on it`} />}
          <div className="uc01-admin-dialog__actions">
            <button type="button" className="uc01-admin-button" onClick={() => setOpen(false)}>Close</button>
          </div>
        </DialogShell>
      )}
    </>
  );
}
