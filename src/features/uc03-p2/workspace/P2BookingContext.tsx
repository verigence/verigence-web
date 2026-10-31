import { Link } from 'react-router-dom';

import type { P2JourneyFile } from '../../../services/audit-core/uc03P2';
import { customerIsNamed, displayName } from './customerNameGuard';

/*
 * Which booking the PC is adding to, and the way to the next one (product
 * owner 2026-10-31). The first file dropped on a new booking creates it and
 * the screen becomes that booking; the drop area looks the same, and the
 * customer's name only appears once the documents are read. These say so
 * plainly, from the first upload on.
 */

/** "Adding documents to booking ADI-RD-261031-004 — customer being identified" and "Start next booking". */
export function P2BookingBanner({
  reference,
  customerName,
  starting = false,
  onStartNext,
}: {
  reference?: string | null;
  customerName?: string | null;
  /** The next booking opens once this one's files are received. */
  starting?: boolean;
  /** Absent for someone who does not start bookings. */
  onStartNext?: () => void;
}) {
  const named = customerIsNamed(customerName);
  return (
    <section className="p2w-booking-banner" aria-label="The booking you are adding documents to">
      <p className="p2w-booking-banner__text">
        {reference ? <>Adding documents to booking <strong>{reference}</strong> — </> : 'Adding documents to this booking — '}
        {named
          ? <strong>{displayName(customerName!)}</strong>
          : <span className="p2w-booking-banner__pending">customer being identified</span>}
      </p>
      {onStartNext ? (
        <button type="button" className="p2w-button p2w-button--primary p2w-button--lg" onClick={onStartNext} disabled={starting}>
          {starting ? 'Opening next booking…' : 'Start next booking'}
        </button>
      ) : null}
    </section>
  );
}

/** Right after the first upload of a booking created on this screen. */
export function P2BookingCreatedNotice({
  reference,
  onStartNext,
  onDismiss,
}: {
  reference?: string | null;
  onStartNext: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="p2w-alert p2w-alert--success p2w-alert--next" role="status">
      <span>
        {reference ? <>Booking <strong>{reference}</strong> created.</> : 'Booking created.'} Next customer?
      </span>
      <button type="button" className="p2w-button p2w-button--secondary" onClick={onStartNext}>Start next booking</button>
      <button type="button" className="p2w-link" onClick={onDismiss} aria-label="Dismiss">×</button>
    </div>
  );
}

/** Files Audit Core found to be another person's (it takes them out of the booking). */
export function foreignFiles(files?: readonly P2JourneyFile[] | null): P2JourneyFile[] {
  return (files ?? []).filter((file) => file.identity?.status === 'FOREIGN');
}

/** "Tapan kumar patra.pdf is TAPAN KUMAR PATRA's file, not this customer's — it has
 * been taken out of this booking and moved to booking ADI-RD-261031-005." */
export function P2ForeignFileNotices({ files }: { files?: readonly P2JourneyFile[] | null }) {
  const foreign = foreignFiles(files);
  if (!foreign.length) return null;
  return (
    <>
      {foreign.map((file) => {
        const person = file.identity.personName?.trim() ? displayName(file.identity.personName) : null;
        const details = [file.identity.maskedPan ? `PAN ${file.identity.maskedPan}` : null, file.identity.reason?.trim() || null]
          .filter(Boolean).join(' · ');
        const moved = file.movedTo?.journeyId ? file.movedTo : null;
        return (
          <div key={file.batchId} className="p2w-alert p2w-alert--review" role="status">
            <span>
              <strong>{file.fileName}</strong> is {person ? `${person}'s` : "another customer's"} file, not this
              customer&apos;s — it has been taken out of this booking
              {moved ? (
                <>
                  {' '}and moved to booking{' '}
                  <Link className="p2w-link p2w-link--inline" to={`/p2/journeys/${encodeURIComponent(moved.journeyId)}/documents`}>
                    {moved.reference || 'the other booking'}
                  </Link>
                </>
              ) : null}
              .
              {details ? <small>{details}</small> : null}
            </span>
          </div>
        );
      })}
    </>
  );
}
