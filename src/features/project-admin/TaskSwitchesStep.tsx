import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { auditCoreErrorMessage } from '../../services/audit-core/errorMessage';
import {
  filterTaskSwitches,
  listTaskSwitches,
  setTaskSwitch,
  switchOutcome,
  type TaskSwitch,
} from '../../services/audit-core/taskSwitches';
import '../../styles/project-admin-task-switches.css';

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

const MIN_REASON = 5;

/**
 * Project Administration → Tasks (product owner 2026-11-19): every kind of task the
 * Project's checks raise, with how many are open, and a switch. Switched off, the check
 * stops for this Project and its open tasks and findings leave the existing journeys;
 * switched on again, every booking is checked again. Each change asks why and keeps who
 * and when. Tenant Admin and Super Admin only (the page is).
 */
export default function TaskSwitchesStep({ tenantId, accessToken }: { tenantId: string; accessToken?: string }) {
  const [items, setItems] = useState<TaskSwitch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<'ALL' | 'ON' | 'OFF'>('ALL');
  const [editing, setEditing] = useState<TaskSwitch | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems((await listTaskSwitches(tenantId, accessToken)).items);
    } catch (err) {
      setError(auditCoreErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [tenantId, accessToken]);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => filterTaskSwitches(items, query, show), [items, query, show]);
  const off = items.filter((item) => !item.enabled).length;

  function start(item: TaskSwitch) {
    setEditing(item);
    setReason('');
    setNotice(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || reason.trim().length < MIN_REASON) return;
    setSaving(true);
    setError(null);
    try {
      const result = await setTaskSwitch(tenantId, editing.code, !editing.enabled, reason.trim(), accessToken);
      setNotice(`${editing.name}: ${switchOutcome(result)}`);
      setEditing(null);
      await load();
    } catch (err) {
      setError(auditCoreErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="uc02-step-body">
      <div className="uc02-card uc02-list-card">
        <div className="uc02-list-toolbar">
          <div className="uc02-card__title">
            <h3>Tasks raised on this Project</h3>
            <p>
              Switch off a kind of task that is not relevant for now: its check stops for this Project and its open
              tasks leave the existing journeys. Switch it on again at any time; every booking is then checked again.
            </p>
          </div>
          <button className="uc02-button" type="button" onClick={() => void load()} disabled={loading}>Refresh</button>
        </div>

        <div className="vg-taskswitch__filters">
          <input
            className="vg-taskswitch__search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by task, code or category"
            aria-label="Search tasks"
          />
          <div className="vg-taskswitch__segments" role="group" aria-label="Show">
            {(['ALL', 'ON', 'OFF'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={show === value ? 'is-active' : ''}
                aria-pressed={show === value}
                onClick={() => setShow(value)}
              >
                {value === 'ALL' ? `All (${items.length})` : value === 'ON' ? `On (${items.length - off})` : `Off (${off})`}
              </button>
            ))}
          </div>
        </div>

        {notice && <div className="vg-taskswitch__notice" role="status">{notice}</div>}
        {error && <div className="vg-taskswitch__error" role="alert">{error}</div>}

        {editing && (
          <form className="vg-taskswitch__confirm" onSubmit={save}>
            <strong>{editing.enabled ? `Switch off “${editing.name}”?` : `Switch on “${editing.name}”?`}</strong>
            <p>
              {editing.enabled
                ? `The check stops for this Project. ${editing.open} open task${editing.open === 1 ? '' : 's'} will be closed on the existing journeys, and no new ones raised.`
                : 'Every booking of this Project is checked again; the tasks that still apply come back.'}
            </p>
            <label>
              <span>Reason</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
                placeholder={editing.enabled ? 'e.g. Not relevant for now; may be introduced later' : 'e.g. Needed again'}
                required
                minLength={MIN_REASON}
              />
            </label>
            <div className="uc02-actions">
              <button className="uc02-button" type="button" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
              <button
                className={`uc02-button ${editing.enabled ? 'uc02-button--danger' : 'uc02-button--primary'}`}
                disabled={saving || reason.trim().length < MIN_REASON}
              >
                {saving ? 'Saving…' : editing.enabled ? 'Switch off' : 'Switch on'}
              </button>
            </div>
          </form>
        )}

        {loading && !items.length ? (
          <p className="vg-taskswitch__empty">Loading…</p>
        ) : shown.length ? (
          <div className="uc02-table-wrap">
            <table className="uc02-table vg-taskswitch__table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Category</th>
                  <th>Goes to</th>
                  <th className="is-number">Open</th>
                  <th className="is-number">Last 30 days</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => (
                  <tr key={item.code} className={item.enabled ? '' : 'is-off'}>
                    <td>
                      <strong>{item.name}</strong>
                      <small><code>{item.code}</code></small>
                      {item.example && item.example !== item.name && <small>e.g. {item.example}</small>}
                    </td>
                    <td>{item.category}</td>
                    <td>{item.owner || '—'}</td>
                    <td className="is-number">{item.open}</td>
                    <td className="is-number">{item.raisedLast30Days}</td>
                    <td>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={item.enabled}
                        aria-label={`${item.name}: ${item.enabled ? 'on' : 'off'}`}
                        className={`vg-taskswitch__toggle${item.enabled ? ' is-on' : ''}`}
                        onClick={() => start(item)}
                        disabled={saving}
                      >
                        <span className="vg-taskswitch__track"><span className="vg-taskswitch__thumb" /></span>
                        <span>{item.enabled ? 'On' : 'Off'}</span>
                      </button>
                      {!item.enabled && (item.reason || item.changedByName) && (
                        <small className="vg-taskswitch__why">
                          {[item.changedByName, when(item.changedAtUtc)].filter(Boolean).join(', ')}
                          {item.reason ? `${item.changedByName || item.changedAtUtc ? ': ' : ''}${item.reason}` : ''}
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="vg-taskswitch__empty">No task matches.</p>
        )}
      </div>
    </div>
  );
}
