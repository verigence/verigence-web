import type { ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { useQuery } from '@tanstack/react-query';

import { verigenceLockup } from '../../assets/verigenceLockup';
import { getAppVersionStatus } from '../../services/security/appVersion';
import { isBelow } from './appVersionLogic';

const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
const thisVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined;

/**
 * In the Android app only: when SuperAdmin's minimum version is in force and this app is older,
 * the app is replaced by "Update required" with the download link. Checked at start, every 30
 * minutes and on focus. A failed check never locks the app; Security still refuses an old app at
 * sign-in and when the session renews. Web browsers always have the current screens.
 */
export default function AppUpdateGate({ children }: { children: ReactNode }) {
  const native = Capacitor.isNativePlatform();
  const status = useQuery({
    queryKey: ['security', 'app-version'],
    queryFn: getAppVersionStatus,
    enabled: native,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: () => (visible() ? 30 * 60_000 : false),
  });
  const policy = status.data;
  if (!native || !policy?.inForce || !isBelow(thisVersion, policy.minimumVersion)) return <>{children}</>;

  return (
    <main className="maintenance-screen" aria-labelledby="update-title">
      <div className="maintenance-card">
        <img className="maintenance-card__logo" src={verigenceLockup} alt="Verigence" />
        <h1 id="update-title">Update required</h1>
        <p className="maintenance-card__body">
          This version of the Verigence app ({thisVersion ?? 'unknown'}) can no longer be used. Download and install
          version {policy.minimumVersion} or newer to continue. The download opens in your phone's browser: sign in there
          and install it.
        </p>
        <div className="maintenance-card__actions">
          {/* Leaving the app opens the phone's browser, where the person signs in and installs the new app. */}
          <button type="button" className="announce-card__button" onClick={() => { window.location.href = policy.downloadUrl; }}>
            Download the latest app
          </button>
        </div>
      </div>
    </main>
  );
}
