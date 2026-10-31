import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getUploadPause } from '../../../services/audit-core/uploadPause';
import { useProjectContextStore } from '../../../store/projectContextStore';
import { useSessionStore } from '../../../store/sessionStore';
import { uploadPauseState, type UploadPauseState } from './uploadPause';

export const uploadPauseKey = (tenantId: string | undefined) => ['p2-upload-pause', tenantId] as const;

/** Whether uploads are paused for the signed-in user's Project: read every
 * minute and when the window regains focus; a failed read is "not paused". */
export function useUploadPause(): UploadPauseState & { refresh: () => void } {
  const tenantId = useProjectContextStore((s) => s.selectedProject?.tenantId);
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: uploadPauseKey(tenantId),
    queryFn: () => getUploadPause(tenantId!, accessToken),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: 'always',
    retry: false,
  });
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: uploadPauseKey(tenantId) });
  }, [queryClient, tenantId]);
  return { ...uploadPauseState(status.data, status.isError), refresh };
}
