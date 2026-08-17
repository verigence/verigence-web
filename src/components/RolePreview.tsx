import type { UserRole } from '../domain/models';
import { runtimeConfig } from '../services/runtime';
import { useSessionStore } from '../store/sessionStore';

const roles: Array<{ value: UserRole; label: string }> = [
  { value: 'PC', label: 'Process Consultant' },
  { value: 'TL', label: 'Team Lead' },
  { value: 'PM', label: 'Project Manager' },
  { value: 'CRM', label: 'CRM Operator' },
  { value: 'TENANT_ADMIN', label: 'Tenant Admin' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
];

export default function RolePreview() {
  const role = useSessionStore((state) => state.role);
  const setRole = useSessionStore((state) => state.setRolePreview);
  if (runtimeConfig.mode !== 'demo') return null;
  return (
    <label className="role-preview">
      <span>Preview as</span>
      <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
        {roles.map((item) => (
          <option key={item.value} value={item.value}>{item.label}</option>
        ))}
      </select>
    </label>
  );
}
