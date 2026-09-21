import { useEffect, useState, type ReactNode } from 'react';

import { verigenceLockup } from '../assets/verigenceLockup';
import { useSessionStore } from '../store/sessionStore';
import '../styles/app-download-portal.css';

interface AndroidReleaseMetadata {
  available: boolean;
  appName: string;
  platform: 'Android';
  version?: string | null;
  build?: string | null;
  size?: string | null;
  sha256?: string | null;
  minAndroid?: string | null;
  releasedAt?: string | null;
  packageName: string;
}

const DEFAULT_METADATA: AndroidReleaseMetadata = {
  available: false,
  appName: 'Verigence',
  platform: 'Android',
  packageName: 'com.verigence.app',
};

const INSTALL_VIDEO_URL = (
  import.meta.env.VITE_ANDROID_INSTALL_VIDEO_URL?.trim()
  || 'https://www.youtube.com/embed/n1d5p6ioxo0?rel=0'
);

/**
 * This portal's actual audience is graduate hires installing a work app
 * for the first time in their life, from outside the Play Store -- not a
 * marketing page, and not a bare-minimum utility either. Two earlier
 * passes over-corrected: first too much (a hero banner, a four-badge
 * trust strip, a separate install-steps card) pushed the video below the
 * fold with no hint it existed; then too little (three bare facts, no
 * guidance) left a first-time installer with no idea what Android's
 * "unrecognized app"/Play Protect warnings even mean or that they're
 * expected. This version keeps every piece of real guidance a first-time
 * installer needs -- what the file is, why Android will warn them, and
 * exactly what to tap -- laid out so scrolling to read it is fine, but
 * nothing is bulked up with marketing copy for its own sake.
 */
export default function AppDownloadPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const [metadata, setMetadata] = useState<AndroidReleaseMetadata>(DEFAULT_METADATA);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!accessToken) return;
      setLoading(true);
      setMessage(undefined);
      try {
        const response = await fetch('/app-distribution/metadata', {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error(response.status === 401
            ? 'Your session has expired. Please sign in again.'
            : 'Release information could not be loaded.');
        }
        const payload = await response.json() as AndroidReleaseMetadata;
        if (active) setMetadata(payload);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : 'Release information could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [accessToken]);

  const download = async () => {
    if (!accessToken || !metadata.available || downloading) return;
    setDownloading(true);
    setMessage(undefined);
    try {
      const response = await fetch('/app-distribution/latest', {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error('Your session has expired. Please sign in again.');
        if (response.status === 503) throw new Error('The Android release is temporarily unavailable.');
        throw new Error('The APK could not be downloaded. Please try again.');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = response.headers.get('X-Verigence-Filename') || 'Verigence.apk';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
      setMessage('Download started. Open the APK from your browser downloads when it finishes.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The APK could not be downloaded.');
    } finally {
      setDownloading(false);
    }
  };

  const versionSize = [
    metadata.version ? `Version ${metadata.version}` : null,
    metadata.size,
  ].filter(Boolean).join(' · ');

  return (
    <main className="app-portal-shell">
      <header className="app-portal-topbar">
        <img src={verigenceLockup} alt="Verigence" className="app-portal-logo" />
        <span className="app-portal-badge"><ShieldIcon /><span>Official distribution</span></span>
      </header>

      <section className="app-portal-content" aria-label="Verigence Android download">
        <article className="app-release-card">
          <div className="app-release-heading">
            <span className="app-release-icon" aria-hidden="true"><VerigenceAppIcon /></span>
            <div>
              <h1>{metadata.appName} for Android</h1>
              <p className="app-release-note">
                {loading ? 'Checking for a release…' : !metadata.available ? 'Not published yet.' : versionSize}
              </p>
            </div>
          </div>

          <button
            className="app-download-button"
            type="button"
            onClick={() => void download()}
            disabled={loading || !metadata.available || downloading}
          >
            <DownloadIcon />
            {downloading ? 'Preparing download…' : 'Download APK'}
          </button>
          <p className="app-release-trust"><CheckIcon /> Signed and verified by Verigence IT</p>

          {message && <div className="app-portal-message" role="status">{message}</div>}
        </article>

        <article className="app-warning-card">
          <p>
            <strong>Android will show a warning during install — that's expected.</strong> This
            app comes directly from Verigence, not the Play Store, so Android flags it as
            "unrecognized" and Play Protect may ask you to confirm. The steps below cover exactly
            what to tap.
          </p>
        </article>

        <article className="app-video-card">
          <h2>How to install it</h2>
          <ol className="app-install-steps">
            <li>
              <span>1</span>
              <div><strong>Download</strong><small>Tap Download APK above.</small></div>
            </li>
            <li>
              <span>2</span>
              <div><strong>Allow this source</strong><small>Android will ask once — tap Settings, then allow this browser.</small></div>
            </li>
            <li>
              <span>3</span>
              <div><strong>Install</strong><small>Open the downloaded file and tap Install. Play Protect may ask again — tap Install anyway.</small></div>
            </li>
            <li>
              <span>4</span>
              <div><strong>Open Verigence</strong><small>Sign in with the work account you were given.</small></div>
            </li>
          </ol>
          <div className="app-video-frame">
            <iframe
              src={INSTALL_VIDEO_URL}
              title="How to install an Android app from outside Google Play"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
          <p className="app-video-caption">Prefer to watch? The video above walks through the same four steps.</p>
        </article>
      </section>
    </main>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

function DownloadIcon() { return <Icon><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></Icon>; }
function ShieldIcon() { return <Icon><path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z" /><path d="m8.7 12 2.1 2.1 4.7-5" /></Icon>; }
function CheckIcon() { return <Icon><path d="m5 12 4 4L19 6" /></Icon>; }

function VerigenceAppIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#062b63" />
      <path d="M16 18h32L42 32l6 14H16l6-14-6-14Z" fill="#ffffff" opacity=".98" />
      <path d="M23 25h18l-4.5 10H27.5L23 25Z" fill="#00afa8" />
      <path d="M29 18h6l-1 7h-4l-1-7Z" fill="#0a63c7" />
    </svg>
  );
}
