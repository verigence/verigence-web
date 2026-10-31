import { differentCustomerQuestion } from './customerNameGuard';

/**
 * Asked before a file named after someone else is uploaded into a booking
 * (2026-10-31). Inline, beside the drop area, never a browser dialog: the PC
 * keeps working and the other files of the drop are already uploading.
 * Without `onStartNew` (someone who does not start bookings) the choice is
 * to add the file here or not upload it.
 */
export default function P2DifferentCustomerPrompt({
  fileNames,
  bookingName,
  onStartNew,
  onAddHere,
  onCancel,
}: {
  fileNames: readonly string[];
  bookingName: string | null;
  onStartNew?: () => void;
  onAddHere: () => void;
  onCancel: () => void;
}) {
  const one = fileNames.length === 1;
  return (
    <div className="p2w-choice p2w-choice--guard" role="group" aria-label="Is this the same customer?">
      <span aria-live="polite">{differentCustomerQuestion(fileNames, bookingName, Boolean(onStartNew))}</span>
      <div>
        {onStartNew ? (
          <button type="button" className="p2w-button p2w-button--primary" onClick={onStartNew}>
            {one ? 'Start new booking with this file' : 'Start new booking with these files'}
          </button>
        ) : null}
        <button type="button" className="p2w-button p2w-button--secondary" onClick={onAddHere}>Add to this booking</button>
        {onStartNew ? null : (
          <button type="button" className="p2w-button p2w-button--ghost" onClick={onCancel}>Do not upload</button>
        )}
      </div>
    </div>
  );
}
