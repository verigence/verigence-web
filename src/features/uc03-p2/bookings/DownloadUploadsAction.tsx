import { useState } from 'react';

import { getP2UploadedFiles, getP2UploadFileLink, type P2UploadedFile } from '../../../services/audit-core/uc03P2';
import UploadedFilesTab from '../journey360/UploadedFilesTab';

export type UploadsOutcome = 'none' | 'failed' | 'choose';

/** What the Actions item does with a journey's uploads: download the only one, or ask which. */
export function pickUpload(files: P2UploadedFile[]): { batchId: string } | 'choose' | 'none' {
  const usable = files.filter((file) => file.status !== 'CANCELLED');
  if (usable.length === 1) return { batchId: usable[0].batchId };
  return usable.length ? 'choose' : 'none';
}

/**
 * "Download uploaded PDF" in a journey's Actions menu (product owner 2026-11-07: the full PDF the
 * PC uploaded, from Actions rather than inside Journey 360). One file downloads at once; when the
 * PC uploaded several, the row shows a short list to pick from. Removed or repeated uploads are
 * left out. The dialogs live outside the menu (UploadsDialog) so closing the menu does not hide them.
 */
export function DownloadUploadsItem({ tenantId, journeyId, accessToken, onOutcome }: {
  tenantId: string; journeyId: string; accessToken?: string; onOutcome: (outcome: UploadsOutcome) => void;
}) {
  const [busy, setBusy] = useState(false);
  const start = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.closest('details')?.removeAttribute('open');
    setBusy(true);
    // The tab is opened on the click itself so a pop-up blocker allows it.
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
      const { files } = await getP2UploadedFiles(tenantId, journeyId, accessToken);
      const pick = pickUpload(files);
      if (typeof pick === 'object') {
        const { url } = await getP2UploadFileLink(tenantId, journeyId, pick.batchId, accessToken);
        if (tab) tab.location.href = url; else window.location.assign(url);
        return;
      }
      tab?.close();
      onOutcome(pick);
    } catch {
      tab?.close();
      onOutcome('failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" role="menuitem" data-file-download disabled={busy} onClick={(event) => void start(event)}>
      {busy ? 'Opening…' : 'Download uploaded PDF'}
    </button>
  );
}

export function UploadsDialog({ outcome, tenantId, journeyId, journeyLabel, accessToken, onClose }: {
  outcome: UploadsOutcome; tenantId: string; journeyId: string; journeyLabel: string; accessToken?: string;
  onClose: () => void;
}) {
  const titleId = `p2w-uploads-${journeyId}`;
  return (
    <div className="p2w-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`p2w-dialog p2w-raise${outcome === 'choose' ? ' p2w-dialog--wide' : ''}`}
        role={outcome === 'choose' ? 'dialog' : 'alertdialog'} aria-modal="true" aria-labelledby={titleId}>
        {outcome === 'choose' ? (
          <>
            <h2 id={titleId}>Uploaded files · {journeyLabel}</h2>
            <UploadedFilesTab tenantId={tenantId} journeyId={journeyId} accessToken={accessToken} />
          </>
        ) : (
          <>
            <h2 id={titleId}>{outcome === 'none' ? 'Nothing uploaded yet' : 'The file could not be opened'}</h2>
            <p>{outcome === 'none' ? `No file has been uploaded to ${journeyLabel} yet.` : 'Please try again in a moment.'}</p>
          </>
        )}
        <div className="p2w-dialog__actions">
          <button type="button" className="p2w-button p2w-button--primary" autoFocus onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
