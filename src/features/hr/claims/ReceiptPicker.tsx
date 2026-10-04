import { useRef, useState } from 'react';

import { MAX_RECEIPTS_PER_CLAIM, type ClaimReceipt } from '../../../services/hr/claims';
import ReceiptViewer from './ReceiptViewer';
import { formatBytes } from './claimFormat';
import { prepareReceipt, type PreparedReceipt } from './receiptFiles';
import { useObjectUrl } from './useObjectUrl';

function Preview({ receipt, onRemove, disabled }: { receipt: PreparedReceipt; onRemove: () => void; disabled: boolean }) {
  const url = useObjectUrl(receipt.blob);
  return (
    <li className="hrc-preview">
      {url ? <img src={url} alt={`Preview of ${receipt.name}`} /> : <span className="hrc-preview__blank" aria-hidden="true" />}
      <span className="hrc-preview__meta">
        <strong>{receipt.name}</strong>
        <small>{formatBytes(receipt.blob.size)}</small>
      </span>
      <button type="button" className="uc01-admin-button uc01-admin-button--compact uc01-admin-button--danger" disabled={disabled} onClick={onRemove} aria-label={`Remove ${receipt.name}`}>
        Remove
      </button>
    </li>
  );
}

interface Props {
  photos: PreparedReceipt[];
  onChange: (photos: PreparedReceipt[]) => void;
  disabled?: boolean;
  error?: string;
  required: boolean;
  /** Resubmit: receipts already on the claim, which can be kept or taken off. */
  claimId?: string;
  existing?: ClaimReceipt[];
  removedIds?: string[];
  onToggleRemoved?: (receiptId: string) => void;
}

/** Choose receipt photos from the camera or the gallery, see them, remove them. */
export default function ReceiptPicker({ photos, onChange, disabled = false, error, required, claimId, existing = [], removedIds = [], onToggleRemoved }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('');
  const kept = existing.filter((r) => !removedIds.includes(r.receiptId));
  const total = kept.length + photos.length;
  const room = MAX_RECEIPTS_PER_CLAIM - total;

  const add = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (input.current) input.current.value = '';
    if (files.length === 0) return;
    setNotice('');
    setWorking(true);
    const problems: string[] = [];
    const added: PreparedReceipt[] = [];
    for (const file of files.slice(0, Math.max(room, 0))) {
      try {
        added.push(await prepareReceipt(file));
      } catch (problem) {
        problems.push(`${file.name || 'A photo'}: ${problem instanceof Error ? problem.message : 'could not be used.'}`);
      }
    }
    if (files.length > Math.max(room, 0)) problems.push(`Only ${MAX_RECEIPTS_PER_CLAIM} receipts fit on one claim, so some photos were left out.`);
    if (added.length) onChange([...photos, ...added]);
    setNotice(problems.join(' '));
    setWorking(false);
  };

  return (
    <div className={`hrc-picker${error ? ' hrc-picker--error' : ''}`}>
      <div className="hrc-picker__head">
        <span className="hrc-picker__title">
          Receipt photos{required && <span className="hr-field__required" aria-hidden="true"> *</span>}
        </span>
        <span className="hr-muted">{total} of {MAX_RECEIPTS_PER_CLAIM}</span>
      </div>

      {existing.length > 0 && claimId && (
        <div className="hrc-picker__existing">
          <p className="hr-muted">Already on this claim. Take off any that are wrong.</p>
          {kept.length > 0 && <ReceiptViewer claimId={claimId} receipts={kept} eager />}
          <ul className="hrc-picker__list">
            {existing.map((r, index) => {
              const removed = removedIds.includes(r.receiptId);
              return (
                <li key={r.receiptId} className="hrc-preview">
                  <span className="hrc-preview__meta">
                    <strong className={removed ? 'hrc-struck' : undefined}>{r.name || `Receipt ${index + 1}`}</strong>
                    <small>{removed ? 'Will be taken off' : formatBytes(r.sizeBytes)}</small>
                  </span>
                  <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={disabled} onClick={() => onToggleRemoved?.(r.receiptId)}>
                    {removed ? 'Keep it' : 'Take off'}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {photos.length > 0 && (
        <ul className="hrc-picker__list" aria-label="New receipt photos">
          {photos.map((p) => (
            <Preview key={p.id} receipt={p} disabled={disabled} onRemove={() => onChange(photos.filter((x) => x.id !== p.id))} />
          ))}
        </ul>
      )}

      <input
        ref={input}
        id="claim-receipts"
        type="file"
        accept="image/*"
        multiple
        className="hr-visually-hidden"
        aria-label="Add receipt photos"
        disabled={disabled || working || room <= 0}
        onChange={(event) => void add(event.target.files)}
      />
      <button
        type="button"
        className="uc01-admin-button hrc-picker__add"
        disabled={disabled || working || room <= 0}
        onClick={() => input.current?.click()}
      >
        {working ? 'Preparing photos…' : room <= 0 ? 'Receipt limit reached' : total === 0 ? 'Add receipt photo' : 'Add another photo'}
      </button>
      <span className="hr-field__hint">Take a photo or choose one from your gallery. JPEG, PNG or WebP, up to 5 MB each. Photos are shrunk before sending.</span>
      {notice && <span className="hr-field__error" role="alert">{notice}</span>}
      {error && <span id="claim-receipts-error" className="hr-field__error" role="alert">{error}</span>}
    </div>
  );
}
