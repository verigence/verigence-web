import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getPerformanceSettings, setPerformanceSettings } from '../../../services/audit-core/uc03Performance';

const GROUPS: Array<{ key: string; label: string }> = [
  { key: 'SECTION', label: 'Section' },
  { key: 'OUTPUT', label: 'Figure: output' },
  { key: 'QUALITY', label: 'Figure: quality' },
  { key: 'UTILISATION', label: 'Figure: utilisation' },
  { key: 'COMPARISON', label: 'Comparison' },
];
const ROLE_LABEL: Record<string, string> = { PC: 'PC', REVIEWER: 'Reviewer', TL: 'Team Lead', PM: 'PM', EXECUTIVE: 'Executive' };

/**
 * What each role sees in the Performance view (product owner 2026-11-13: "I want superadmin to be
 * able to control what TL can see and what PM can see"): a switch per section and figure, per
 * role, for every Project. A switch takes effect at once; a hidden item is not sent to the screen.
 */
export default function PerformanceSettings({ accessToken }: { accessToken?: string }) {
  const client = useQueryClient();
  const key = ['admin-performance-settings'];
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({ queryKey: key, queryFn: () => getPerformanceSettings(accessToken), enabled: Boolean(accessToken), retry: 1 });
  const change = useMutation({
    mutationFn: (change: { role: string; item: string; shown: boolean }) =>
      setPerformanceSettings({ [`${change.role}:${change.item}`]: change.shown }, accessToken),
    onSuccess: (data) => {
      setError(null);
      client.setQueryData(key, data);
      void client.invalidateQueries({ queryKey: ['p2-performance'] });
    },
    onError: () => setError('The change could not be saved. Try again.'),
  });
  if (query.isPending) return <p>Loading…</p>;
  if (query.isError) return <div className="uc01-admin-message uc01-admin-message--error">The settings could not be loaded.</div>;
  const { roles, items } = query.data;
  return (
    <div className="p2w">
      {error ? <div className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</div> : null}
      <div className="p2pt-scroll">
        <table className="p2w-table" aria-label="What each role sees in the Performance view">
          <thead>
            <tr><th scope="col">Kind</th><th scope="col">Item</th>{roles.map((r) => <th key={r} scope="col">{ROLE_LABEL[r] ?? r}</th>)}</tr>
          </thead>
          <tbody>
            {GROUPS.flatMap((group) => items.filter((i) => i.group === group.key).map((item) => (
              <tr key={item.key}>
                <td>{group.label}</td>
                <th scope="row">{item.label}</th>
                {roles.map((role) => (
                  <td key={role}>
                    <input type="checkbox" checked={item.shown[role] !== false} disabled={change.isPending}
                      aria-label={`${ROLE_LABEL[role] ?? role} sees ${item.label}`}
                      onChange={(e) => change.mutate({ role, item: item.key, shown: e.target.checked })} />
                  </td>
                ))}
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <p className="p2w-muted">Ticked means that role sees it. Applies to every Project. A PC or Reviewer only ever sees their own figures.</p>
    </div>
  );
}
