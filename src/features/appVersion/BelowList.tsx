import type { DevicesBelow } from '../../services/security/appVersion';
import { peopleBelow } from './appVersionPolicyFormat';

/** The app installations seen in the last 30 days that a minimum stops, per version. */
export default function BelowList({ rows }: { rows: DevicesBelow[] }) {
  if (rows.length === 0) return <p className="hr-field__hint">No app installation seen in the last 30 days is below this version.</p>;
  const people = peopleBelow(rows);
  return (
    <div>
      <p className="hr-field__hint">Seen in the last 30 days and below this version: {people} {people === 1 ? 'person' : 'people'}.</p>
      <ul className="ar-version-list">
        {rows.map((r) => (
          <li key={r.appVersion ?? 'unknown'}>
            <b>{r.appVersion ?? 'Too old to report a version'}</b>: {r.devices} {r.devices === 1 ? 'device' : 'devices'}, {r.people} {r.people === 1 ? 'person' : 'people'}
          </li>
        ))}
      </ul>
    </div>
  );
}
