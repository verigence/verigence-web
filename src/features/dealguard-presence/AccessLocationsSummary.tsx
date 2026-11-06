import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../components/SectionCard';
import { getAccessLocations, mapLink, type AccessPerson } from '../../services/audit-core/accessLocations';
import type { TaskManagerMode } from '../../services/audit-core/taskManager';
import { formatDistance } from '../../services/audit-core/locationChecks';
import '../../styles/dealguard-presence.css';
import '../../styles/access-locations.css';

const ROLES = ['', 'PC', 'TL', 'PM'] as const;

function when(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

function Person({ person }: { person: AccessPerson }) {
  const share = person.accesses ? Math.round((person.atTaggedOutlet / person.accesses) * 100) : 0;
  return (
    <tr>
      <td data-label="Person">
        <strong>{person.name ?? person.actorId}</strong>
        <span className={`al-tag al-tag--${person.role.toLowerCase()}`}>{person.role}</span>
        <small>Last opened {when(person.lastAccessAtUtc)}</small>
      </td>
      <td data-label="Times opened" className="al-num">{person.accesses}</td>
      <td data-label="At tagged outlet">
        <strong>{person.atTaggedOutlet}</strong> <small>({share}%)</small>
        {person.taggedOutlets.length > 0 && <small>{person.taggedOutlets.join(', ')}</small>}
      </td>
      <td data-label="Top places elsewhere">
        {person.topPlaces.length === 0 ? <span className="al-muted">None</span> : (
          <ol className="al-places">
            {person.topPlaces.map((place, i) => (
              <li key={`${place.latitude},${place.longitude}`}>
                <span className="al-count">{place.count}×</span>
                <span>
                  <a href={mapLink(place.latitude, place.longitude)} target="_blank" rel="noreferrer">
                    {place.address ?? `${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}`}
                  </a>
                  {!place.address && <small> (address being looked up)</small>}
                  {i === 0 && place.lastAtUtc && <small> · last {when(place.lastAtUtc)}</small>}
                </span>
              </li>
            ))}
          </ol>
        )}
        {person.otherPlacesAccesses > 0 && <small>{person.otherPlacesAccesses} more from {person.places - person.topPlaces.length} other places</small>}
      </td>
      <td data-label="No location / unclear" className="al-num">
        {person.noLocation}{person.unclear ? ` / ${person.unclear}` : ''}
      </td>
    </tr>
  );
}

/**
 * Where each PC, TL and PM opened Verigence from, between two dates (product owner, 2026-11-06):
 * at the outlet they are tagged to (within 500 m), and the three other places they opened it from
 * most, with a readable address. SuperAdmin (Reports) and Executive (DealGuard) only.
 */
export default function AccessLocationsSummary({ mode, tenantId, accessToken }: {
  mode: TaskManagerMode; tenantId: string; accessToken?: string;
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('');
  const query = useQuery({
    queryKey: ['access-locations', mode, tenantId, from, to, role],
    queryFn: () => getAccessLocations(mode, tenantId, { from: from || undefined, to: to || undefined, role: role || undefined }, accessToken),
    enabled: Boolean(tenantId && accessToken),
    staleTime: 60_000,
  });
  const data = query.data;

  return (
    <>
      <SectionCard>
        <div className="lc-toolbar">
          <label><span>From</span><input type="date" value={from || data?.from || ''} onChange={(e) => setFrom(e.target.value)} /></label>
          <label><span>To</span><input type="date" value={to || data?.to || ''} onChange={(e) => setTo(e.target.value)} /></label>
          <label>
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}>
              {ROLES.map((r) => <option key={r} value={r}>{r || 'PC, TL and PM'}</option>)}
            </select>
          </label>
        </div>
        {data ? (
          <p className="lc-summary">
            <span><strong>{data.totals.people}</strong> people</span>
            <span><strong>{data.totals.accesses}</strong> times opened</span>
            <span><strong>{data.totals.atTaggedOutlet}</strong> at tagged outlet</span>
            <span><strong>{data.totals.elsewhere}</strong> elsewhere</span>
            <span><strong>{data.totals.noLocation}</strong> no location</span>
          </p>
        ) : null}
        {data ? (
          <p className="p2w-muted">
            Each sign-in and each reopening of the app counts once (openings less than 10 minutes apart count once).
            Within {formatDistance(data.radiusM)} of an outlet the person is assigned to is their tagged outlet; other
            openings within {formatDistance(data.radiusM)} of each other are one place. Recorded until{' '}
            {new Date(`${data.watchUntil}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.
          </p>
        ) : null}
      </SectionCard>
      {query.isLoading ? <SectionCard><p>Reading sign-in locations…</p></SectionCard> : null}
      {query.isError ? <SectionCard><div className="form-alert form-alert--error">Sign-in locations could not be read.</div></SectionCard> : null}
      {data && !data.people.length ? <SectionCard><p className="p2w-muted">Nobody has opened Verigence in these dates yet.</p></SectionCard> : null}
      {data && data.people.length ? (
        <SectionCard>
          <div className="uc01-admin-table-wrap">
            <table className="uc01-admin-table al-table">
              <thead>
                <tr><th>Person</th><th>Times opened</th><th>At tagged outlet</th><th>Top 3 places elsewhere</th><th>No location / unclear</th></tr>
              </thead>
              <tbody>{data.people.map((p) => <Person key={p.actorId} person={p} />)}</tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}
    </>
  );
}
