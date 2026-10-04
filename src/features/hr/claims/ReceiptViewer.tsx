import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { fetchClaimReceipt, type ClaimReceipt } from '../../../services/hr/claims';
import { hrErrorMessage } from '../../../services/hr/client';
import { useSessionStore } from '../../../store/sessionStore';
import { claimKeys } from './claimQueries';
import { formatBytes } from './claimFormat';
import { useObjectUrl } from './useObjectUrl';

interface TileProps {
  claimId: string;
  receipt: ClaimReceipt;
  index: number;
  /** Load the picture straight away. HR and Finance load it on request, because each view is logged. */
  eager: boolean;
  onOpen: (url: string, name: string) => void;
}

function ReceiptTile({ claimId, receipt, index, eager, onOpen }: TileProps) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const [requested, setRequested] = useState(eager);
  const file = useQuery({
    queryKey: claimKeys.receipt(claimId, receipt.receiptId),
    queryFn: () => fetchClaimReceipt(accessToken!, claimId, receipt.receiptId),
    enabled: Boolean(accessToken) && requested,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
  });
  const url = useObjectUrl(file.data);
  const title = receipt.name || `Receipt ${index + 1}`;
  const isPdf = receipt.contentType === 'application/pdf';

  if (!requested) {
    return (
      <button type="button" className="hrc-receipt hrc-receipt--ask" onClick={() => setRequested(true)}>
        <span>View receipt {index + 1}</span>
        <small>{formatBytes(receipt.sizeBytes)}</small>
      </button>
    );
  }
  if (file.isLoading) return <div className="hrc-receipt hrc-receipt--state" role="status">Loading receipt…</div>;
  if (file.isError) {
    return (
      <div className="hrc-receipt hrc-receipt--state hrc-receipt--error" role="alert">
        <span>{hrErrorMessage(file.error)}</span>
        <button type="button" className="uc01-admin-button uc01-admin-button--compact" onClick={() => void file.refetch()}>Try again</button>
      </div>
    );
  }
  if (isPdf) {
    return (
      <a className="hrc-receipt hrc-receipt--ask" href={url ?? undefined} target="_blank" rel="noopener noreferrer" download={title}>
        <span>Open PDF receipt {index + 1}</span>
        <small>{formatBytes(receipt.sizeBytes)}</small>
      </a>
    );
  }
  return (
    <button type="button" className="hrc-receipt" onClick={() => url && onOpen(url, title)} aria-label={`Open ${title} full size`}>
      {url && <img src={url} alt={`Receipt ${index + 1}`} />}
    </button>
  );
}

/** The receipt photos of a claim, as thumbnails that open full size. */
export default function ReceiptViewer({ claimId, receipts, eager }: { claimId: string; receipts: ClaimReceipt[]; eager: boolean }) {
  const [open, setOpen] = useState<{ url: string; name: string } | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (receipts.length === 0) return <p className="hrc-empty-line">No receipt was attached.</p>;
  return (
    <>
      <div className="hrc-receipts">
        {receipts.map((receipt, index) => (
          <ReceiptTile
            key={receipt.receiptId}
            claimId={claimId}
            receipt={receipt}
            index={index}
            eager={eager}
            onOpen={(url, name) => setOpen({ url, name })}
          />
        ))}
      </div>
      {open && (
        <div className="hrc-lightbox" role="dialog" aria-modal="true" aria-label={`Receipt: ${open.name}`} onClick={() => setOpen(null)}>
          <div className="hrc-lightbox__bar">
            <span>{open.name}</span>
            <button ref={closeButton} type="button" className="uc01-admin-button" onClick={() => setOpen(null)}>Close</button>
          </div>
          <img src={open.url} alt={open.name} onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </>
  );
}
