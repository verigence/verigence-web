import { Link } from 'react-router-dom';

import DialogShell from '../../hr/attendance/DialogShell';
import type { CheckoutCheck } from '../../../services/audit-core/uc03MyWork';

/** ``blocked``: the CHECKOUT_GATE_REGISTER switch is on, so OK only closes the window. */
type Props = { check: CheckoutCheck; blocked: boolean; onOk: () => void; onClose: () => void };

/**
 * Before a PC checks out: the previous day's gate register of an onsite outlet is not finished
 * (product owner 2026-11-02). With the switch off it is a warning and OK goes on to check-out;
 * with it on, check-out is not allowed until the gate register is done.
 */
export default function CheckoutGateRegisterWarning({ check, blocked, onOk, onClose }: Props) {
  const outlets = check.pending.map((p) => p.outletName);
  return (
    <DialogShell title="You have not completed the day’s work" eyebrow="Check-out" onClose={onClose}>
      <div className="uc01-admin-message uc01-admin-message--error" role="alert">
        The gate register for <strong>{check.label}</strong> is not uploaded for <strong>{outlets.join(', ')}</strong>.
      </div>
      <p>
        {blocked
          ? 'You cannot check out until the gate register is uploaded and its counts entered.'
          : 'Going forward, you will not be allowed to check out without it. Press OK to check out today.'}
      </p>
      <div className="uc01-admin-dialog__actions">
        <Link className="uc01-admin-button" to="/p2/gate-pass" onClick={onClose}>Upload gate register</Link>
        <button type="button" className="uc01-admin-button uc01-admin-button--primary" onClick={blocked ? onClose : onOk}>OK</button>
      </div>
    </DialogShell>
  );
}
