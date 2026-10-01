import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { recheckP2Journey } from '../../../services/audit-core/uc03P2';
import { resyncUnifiedCaptureV2 } from '../../../services/audit-core/uc03UnifiedDocumentCapture';

/**
 * "Re-sync with Document Intelligence" (decision 2026-10-01). First asks
 * the existing document sync to pull in anything Document Intelligence
 * finished after the page stopped watching (best effort: a Journey with
 * nothing to resync still gets rechecked), then asks Phase 2 to ask DI
 * again for every page held too long or settled unread, reconcile late
 * pages, recompute the stage and re-run every check.
 */
export default function P2RecheckButton({ tenantId, journeyId, accessToken, onDone }: {
  tenantId: string;
  journeyId: string;
  accessToken?: string;
  onDone?: (message: string, tone: 'success' | 'error') => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      try {
        await resyncUnifiedCaptureV2(tenantId, journeyId, accessToken);
      } catch {
        // No classified documents to resync is not a failure of the recheck.
      }
      const result = await recheckP2Journey(tenantId, journeyId, accessToken);
      for (const key of ['p2-documents', 'p2-stage', 'p2-360', 'p2-tasks']) {
        void queryClient.invalidateQueries({ queryKey: [key, tenantId] });
        void queryClient.invalidateQueries({ queryKey: [key, tenantId, journeyId] });
      }
      const reread = result.pagesReread ?? 0;
      onDone?.(reread
        ? `Re-sync started. ${reread === 1 ? 'One page' : `${reread} pages`} asked for again from Document Intelligence; values and every check refresh in a few seconds.`
        : 'Re-sync started. Values and every check refresh in a few seconds.', 'success');
    } catch (cause) {
      onDone?.(cause instanceof Error && cause.message ? cause.message : 'The re-sync could not be started.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className="p2w-button p2w-button--secondary" disabled={busy} onClick={() => void run()}
      title="Asks Document Intelligence again for every page held too long or not read, copies what it has finished, and re-runs every check.">
      {busy ? 'Re-syncing…' : 'Re-sync with Document Intelligence'}
    </button>
  );
}
