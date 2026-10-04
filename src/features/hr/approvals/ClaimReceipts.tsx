import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { fetchClaimReceipt, getClaimDetail, type ClaimReceipt } from '../../../services/hr/approvals';
import { hrErrorMessage } from '../../../services/hr/client';
import { useSessionStore } from '../../../store/sessionStore';
import { formatBytes } from './approvalFormat';
import { approvalKeys } from './approvalKeys';
import BlobViewerDialog from './BlobViewerDialog';

function ReceiptRow({ claimId, receipt, index }: { claimId: string; receipt: ClaimReceipt; index: number }) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const [wanted, setWanted] = useState(false);
  const [open, setOpen] = useState(false);
  const file = useQuery({
    queryKey: approvalKeys.receipt(claimId, receipt.receiptId),
    queryFn: () => fetchClaimReceipt(accessToken!, claimId, receipt.receiptId),
    enabled: Boolean(accessToken) && wanted,
    retry: false,
    staleTime: Infinity,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const title = receipt.name?.trim() || `Receipt ${index + 1}`;
  const kind = receipt.contentType === 'application/pdf' ? 'PDF' : 'Image';

  return (
    <li className="hr-appr-receipt">
      <span className="hr-appr-receipt__name">
        <strong>{title}</strong>
        <small>{kind}, {formatBytes(receipt.sizeBytes)}</small>
      </span>
      <button
        type="button"
        className="uc01-admin-button uc01-admin-button--compact"
        disabled={file.isFetching}
        onClick={() => {
          setWanted(true);
          setOpen(true);
          if (file.isError) void file.refetch();
        }}
      >
        {file.isFetching ? 'Loading…' : 'View'}
      </button>
      {file.isError && <span className="hr-field__error" role="alert">{hrErrorMessage(file.error)}</span>}
      {open && file.data && <BlobViewerDialog title={title} blob={file.data} onClose={() => setOpen(false)} />}
    </li>
  );
}

/**
 * The receipt list comes from the claim itself (the approvals list does not carry it) and is
 * fetched only when asked for. Each receipt opens in a viewer, fetched with the caller's token.
 */
export default function ClaimReceipts({ claimId }: { claimId: string }) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const [requested, setRequested] = useState(false);
  const detail = useQuery({
    queryKey: approvalKeys.claimDetail(claimId),
    queryFn: () => getClaimDetail(accessToken!, claimId),
    enabled: Boolean(accessToken) && requested,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (!requested) {
    return (
      <button type="button" className="uc01-admin-button hr-appr-photo-button" onClick={() => setRequested(true)}>
        View receipts
      </button>
    );
  }
  if (detail.isLoading) return <span className="hr-muted" role="status">Loading receipts…</span>;
  if (detail.isError) {
    return (
      <span className="hr-appr-inline-error" role="alert">
        <span>{hrErrorMessage(detail.error)}</span>
        <button type="button" className="uc01-admin-button uc01-admin-button--compact" onClick={() => detail.refetch()} disabled={detail.isFetching}>Try again</button>
      </span>
    );
  }
  const receipts = detail.data?.receipts ?? [];
  if (receipts.length === 0) return <span className="hr-muted">No receipts attached.</span>;
  return (
    <ul className="hr-appr-receipts">
      {receipts.map((receipt, index) => <ReceiptRow key={receipt.receiptId} claimId={claimId} receipt={receipt} index={index} />)}
    </ul>
  );
}
