import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { getStatutory, payrollKeys } from '../../../services/hr/payroll';
import { useSessionStore } from '../../../store/sessionStore';

/** On the runs list: says plainly when the statutory settings are not confirmed by the CA. */
export default function StatutoryBanner({ enabled }: { enabled: boolean }) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const view = useQuery({
    queryKey: payrollKeys.statutory,
    queryFn: () => getStatutory(accessToken!),
    enabled: Boolean(accessToken) && enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (view.isError) {
    return <div className="uc01-admin-message uc01-admin-message--info" role="status">The statutory settings could not be checked just now, so it is not known whether the CA has confirmed them.</div>;
  }
  if (!view.data || view.data.confirmed) return null;
  return (
    <div className="hr-pay-warning" role="alert">
      <strong>The statutory settings are not confirmed by your CA.</strong>
      <p>
        You can prepare a run, but the CEO cannot approve it until the PF, ESI and professional tax settings are confirmed.
        Then recompute the run and submit it again.
      </p>
      <Link className="uc01-admin-button hr-pay-button" to="/hr/payroll/settings">Open the statutory settings</Link>
    </div>
  );
}
