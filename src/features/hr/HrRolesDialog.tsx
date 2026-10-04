import { useEffect, useState } from 'react';

import {
  assignUserHrRole,
  getUserHrRoles,
  HR_ROLE_KEYS,
  removeUserHrRole,
  type HrRoleKey,
} from '../../services/security/hrRoles';

const ROLES: Record<HrRoleKey, { label: string; description: string }> = {
  HRADMIN: {
    label: 'HR Admin',
    description: 'Add, edit and import employees, see PAN and Aadhaar, view change history and HR settings.',
  },
  CEO: {
    label: 'CEO',
    description: 'Same employee access as HR Admin. Payroll approval will be added with payroll.',
  },
  FINANCEADMIN: {
    label: 'Finance Admin',
    description: 'View employee records. Reimbursement and salary-structure approvals will be added with those modules.',
  },
};
const ORDER: HrRoleKey[] = ['HRADMIN', 'FINANCEADMIN', 'CEO'];

interface Props {
  accessToken: string;
  user: { userId: string; displayName: string; primaryEmail: string | null };
  onClose: () => void;
}

/** SuperAdmin: choose which company-wide HR roles a person holds. Each change is saved at once. */
export default function HrRolesDialog({ accessToken, user, onClose }: Props) {
  const [held, setHeld] = useState<HrRoleKey[] | null>(null);
  const [busy, setBusy] = useState<HrRoleKey | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getUserHrRoles(accessToken, user.userId)
      .then((roles) => !cancelled && setHeld(roles))
      .catch((problem) => !cancelled && setLoadError(problem instanceof Error ? problem.message : 'The HR roles could not be loaded.'));
    return () => {
      cancelled = true;
    };
  }, [accessToken, user.userId]);

  const toggle = async (role: HrRoleKey, grant: boolean) => {
    setBusy(role);
    setError('');
    try {
      if (grant) await assignUserHrRole(accessToken, user.userId, role);
      else await removeUserHrRole(accessToken, user.userId, role);
      setHeld((current) => {
        const next = new Set(current ?? []);
        if (grant) next.add(role);
        else next.delete(role);
        return HR_ROLE_KEYS.filter((key) => next.has(key));
      });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'The HR role could not be changed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="uc01-admin-dialog-backdrop" role="presentation">
      <section className="uc01-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="hr-roles-title">
        <div>
          <span className="eyebrow">HR access</span>
          <h2 id="hr-roles-title">HR roles for {user.displayName}</h2>
          <p>
            These roles apply company-wide and do not change the person&apos;s project role (PC, TL, PM). A person can hold more
            than one. The change takes effect within a minute.
          </p>
        </div>
        {loadError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{loadError}</div>}
        {!held && !loadError && <div className="uc01-admin-state">Loading…</div>}
        {held && (
          <div className="hr-role-list">
            {ORDER.map((role) => (
              <label key={role} className="hr-check hr-role-option">
                <input
                  type="checkbox"
                  checked={held.includes(role)}
                  disabled={busy !== null}
                  onChange={(event) => void toggle(role, event.target.checked)}
                />
                <span>
                  {ROLES[role].label}{busy === role ? ' — saving…' : ''}
                  <small>{ROLES[role].description}</small>
                </span>
              </label>
            ))}
          </div>
        )}
        {error && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</div>}
        <div className="uc01-admin-dialog__actions">
          <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={busy !== null} onClick={onClose}>Done</button>
        </div>
      </section>
    </div>
  );
}
