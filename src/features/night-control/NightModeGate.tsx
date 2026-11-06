import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { NIGHT_MODE_MESSAGE } from '../../services/nightMode';
import type { NightFeatureKey } from '../../services/security/nightControl';
import { MoonIcon } from './NightControlBridge';
import { JOURNEY_360, nightFeature, useNightControl } from './nightControl';
import '../../styles/night-control.css';

const NAMES: Record<string, string> = { JOURNEY_360: 'Journey 360', FILE_DOWNLOAD: 'File downloads' };

/** The calm full-page state shown in place of a night-controlled screen. */
export function NightModeState({ name, startsAt, endsAt, message = NIGHT_MODE_MESSAGE }: {
  name: string; startsAt: string; endsAt: string; message?: string;
}) {
  return (
    <section className="night-state" aria-labelledby="night-state-title">
      <span className="night-state__icon"><MoonIcon size={32} /></span>
      <h1 id="night-state-title">{message}</h1>
      <p>{name} is closed from {startsAt} to {endsAt} (India time). Ask SuperAdmin if you need access.</p>
      <Link className="uc01-admin-button" to="/home">Go to home</Link>
    </section>
  );
}

/**
 * Renders the page, or "Night Mode On" when the feature is blocked for the signed-in person. While
 * Security's answer is on its way nothing is drawn (so the page does not flash open); a failed answer
 * shows the page -- Audit Core still refuses at night.
 */
export default function NightModeGate({ feature = JOURNEY_360, children }: { feature?: NightFeatureKey; children: ReactNode }) {
  const night = useNightControl();
  if (night.status === 'loading') return <div className="night-wait" aria-busy="true" />;
  if (!night.isBlocked(feature)) return children;
  const row = nightFeature(night.data, feature);
  return (
    <NightModeState
      name={NAMES[feature] ?? row?.label ?? 'This page'}
      startsAt={row?.startsAt ?? '20:00'}
      endsAt={row?.endsAt ?? '08:30'}
      message={night.message}
    />
  );
}
