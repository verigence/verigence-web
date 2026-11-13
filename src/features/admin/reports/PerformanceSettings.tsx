import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getPerformanceSettings,
  setPerformanceSettings,
  type PerformanceSettingItem,
} from '../../../services/audit-core/uc03Performance';

const GROUPS: Array<{ key: string; label: string }> = [
  { key: 'OUTPUT', label: 'Output' },
  { key: 'QUALITY', label: 'Quality' },
  { key: 'UTILISATION', label: 'Utilisation' },
  { key: 'DUTIES', label: 'Duties' },
  { key: 'COMPARISON', label: 'Comparison' },
];

/**
 * What the Performance view shows (product owner 2026-11-13: "make the parameters to be displayed
 * configurable under Superadmin control, like utilization and all"): each measure, the duties and
 * the comparison with peers, for every Project. A switch takes effect at once for everybody.
 */
export default function PerformanceSettings({ accessToken }: { accessToken?: string }) {
  const client = useQueryClient();
  const key = ['admin-performance-settings'];
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({ queryKey: key, queryFn: () => getPerformanceSettings(accessToken), enabled: Boolean(accessToken), retry: 1 });
  const change = useMutation({
    mutationFn: (item: PerformanceSettingItem) => setPerformanceSettings({ [item.key]: !item.shown }, accessToken),
    onSuccess: (data) => {
      setError(null);
      client.setQueryData(key, data);
      // The view itself is read again with the new setting.
      void client.invalidateQueries({ queryKey: ['p2-performance'] });
    },
    onError: () => setError('The change could not be saved. Try again.'),
  });
  if (query.isPending) return <p>Loading…</p>;
  if (query.isError) return <div className="uc01-admin-message uc01-admin-message--error">The settings could not be loaded.</div>;
  const items = query.data.items;
  return (
    <div className="p2w">
      {error ? <div className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</div> : null}
      <table className="p2w-table" aria-label="What the Performance view shows">
        <thead><tr><th>Group</th><th>Item</th><th>Shown</th></tr></thead>
        <tbody>
          {GROUPS.flatMap((group) => items.filter((i) => i.group === group.key).map((item) => (
            <tr key={item.key}>
              <td>{group.label}</td>
              <td>{item.label}</td>
              <td>
                <label className="p2mw-toggle">
                  <input type="checkbox" checked={item.shown} disabled={change.isPending}
                    onChange={() => change.mutate(item)} aria-label={`Show ${item.label}`} />{' '}
                  {item.shown ? 'Shown' : 'Hidden'}
                </label>
              </td>
            </tr>
          )))}
        </tbody>
      </table>
      <p className="p2w-muted">Applies to every Project and to everyone (PC, Reviewer, TL, PM, Executive). A hidden item is not sent to the screen at all.</p>
    </div>
  );
}
