import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import '../../../styles/uc03-p2-bulk-upload.css';

import { listBulkUploads } from '../../../services/audit-core/uc03BulkUpload';
import { useProjectContextStore } from '../../../store/projectContextStore';
import { useSessionStore } from '../../../store/sessionStore';

/**
 * While a PC's bulk upload is being processed (product owner 2026-11-03): "give a message to the
 * PC not to upload any new file as a precaution till all these files get uploaded" -- only to a
 * PC mapped to more than one outlet (uploads are per selected outlet otherwise).
 */
export default function BulkUploadBanner() {
  const project = useProjectContextStore((s) => s.selectedProject);
  const accessToken = useSessionStore((s) => s.accessToken) ?? undefined;
  const tenantId = project?.tenantId;
  const isPc = project?.operatingRole === 'PC';
  const list = useQuery({
    queryKey: ['p2-bulk-uploads', tenantId],
    queryFn: () => listBulkUploads(tenantId!, accessToken),
    enabled: Boolean(tenantId && accessToken && isPc),
    refetchInterval: (query) => (query.state.data?.inProgress ? 30_000 : 120_000),
    retry: false,
  });
  if (!isPc || !list.data?.inProgress || !list.data.multiOutlet) return null;
  return (
    <div className="p2bu-banner" role="status">
      Your bulk upload is being processed. Please do not upload new files until it is done.{' '}
      <Link to="/p2/bulk-upload">See progress</Link>
    </div>
  );
}
