import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { recheckP2Journey } from '../../../services/audit-core/uc03P2';
import { resyncUnifiedCaptureV2 } from '../../../services/audit-core/uc03UnifiedDocumentCapture';

/**
 * Phase 1's "Recheck documents", for Phase 2. First asks the existing
 * document sync to pull in anything Document Intelligence finished after
 * the page stopped watching (best effort: a Journey with nothing to resync
 * still gets rechecked), then asks Phase 2 to reconcile late pages,
 * recompute the stage and re-run every check.
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
      await recheckP2Journey(tenantId, journeyId, accessToken);
      for (const key of ['p2-documents', 'p2-stage', 'p2-360', 'p2-tasks']) {
        void queryClient.invalidateQueries({ queryKey: [key, tenantId] });
        void queryClient.invalidateQueries({ queryKey: [key, tenantId, journeyId] });
      }
      onDone?.('Recheck started. Documents that finished late and every check are refreshed in a few seconds.', 'success');
    } catch (cause) {
      onDone?.(cause instanceof Error && cause.message ? cause.message : 'The recheck could not be started.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className="p2w-button p2w-button--secondary" disabled={busy} onClick={() => void run()}
      title="A document sometimes finishes reading after the screen stopped watching it. Recheck picks those up and re-runs every check.">
      {busy ? 'Rechecking…' : 'Recheck documents'}
    </button>
  );
}
