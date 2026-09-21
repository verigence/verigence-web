import { useEffect, useMemo, useState, type ReactNode } from 'react';

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

function formatReleaseDate(value?: string | null): string {
  if (!value) return 'Latest approved build';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

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

  const releaseLabel = useMemo(() => {
    if (metadata.version && metadata.build) return `Version ${metadata.version} · Build ${metadata.build}`;
    if (metadata.version) return `Version ${metadata.version}`;
    if (metadata.build) return `Build ${metadata.build}`;
    return 'Latest approved Android release';
  }, [metadata.build, metadata.version]);

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

  return (
    <main className="app-portal-shell">
      <header className="app-portal-topbar">
        <img src={verigenceLockup} alt="Verigence" className="app-portal-logo" />
        <div className="app-portal-secure-badge" aria-label="Official authenticated distribution portal">
          <ShieldIcon />
          <span>Official App Distribution</span>
        </div>
      </header>

      <section className="app-portal-hero">
        <div>
          <p className="app-portal-eyebrow">VERIGENCE MOBILE</p>
          <h1>Get Verigence for Android</h1>
          <p className="app-portal-subtitle">
            Download the official Verigence Android application from our authenticated distribution portal.
          </p>
        </div>
      </section>

      <section className="app-portal-content" aria-label="Verigence Android download">
        <article className="app-release-card">
          <div className="app-release-main">
            <div className="app-release-icon" aria-hidden="true"><VerigenceAppIcon /></div>
            <div className="app-release-copy">
              <div className="app-release-title-row">
                <div>
                  <h2>{metadata.appName}</h2>
                  <p>{releaseLabel}</p>
                </div>
                <span className={`app-release-status ${metadata.available ? 'is-ready' : 'is-pending'}`}>
                  {loading ? 'Checking…' : metadata.available ? 'Available' : 'Not published'}
                </span>
              </div>
              <div className="app-release-meta">
                <span><AndroidIcon /> Android</span>
                {metadata.minAndroid && <span>{metadata.minAndroid}</span>}
                {metadata.size && <span>{metadata.size}</span>}
                <span>{formatReleaseDate(metadata.releasedAt)}</span>
              </div>
            </div>
          </div>

          <div className="app-release-actions">
            <button
              className="app-download-button"
              type="button"
              onClick={() => void download()}
              disabled={loading || !metadata.available || downloading}
            >
              <DownloadIcon />
              {downloading ? 'Preparing download…' : 'Download APK'}
            </button>
            <p className="app-release-note">
              Signed Verigence package · <code>{metadata.packageName}</code>
            </p>
          </div>

          {message && <div className="app-portal-message" role="status">{message}</div>}

          <div className="app-trust-strip">
            <div><CheckIcon /><span>Authenticated</span></div>
            <div><CheckIcon /><span>Official build</span></div>
            <div><CheckIcon /><span>Signed package</span></div>
          </div>
        </article>

        <div className="app-install-grid">
          {/* Video first, not the text steps -- it was rendering a full
              screen below the fold with nothing on screen hinting it was
              there at all. Immediately after the download button is the
              one placement a PC will actually scroll into without being
              told to. */}
          <article className="app-video-card">
            <div className="app-card-heading">
              <span className="app-card-icon"><PlayIcon /></span>
              <div>
                <p className="app-card-kicker">QUICK WALKTHROUGH</p>
                <h2>How to allow an APK install</h2>
              </div>
            </div>
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
          </article>

          <article className="app-guide-card">
            <div className="app-card-heading">
              <span className="app-card-icon"><PhoneIcon /></span>
              <div>
                <p className="app-card-kicker">FIRST-TIME INSTALL</p>
                <h2>Install in four steps</h2>
              </div>
            </div>
            <ol className="app-install-steps">
              <li><strong>Download</strong></li>
              <li><strong>Allow this source</strong></li>
              <li><strong>Install</strong></li>
              <li><strong>Open Verigence</strong></li>
            </ol>
            <a
              className="app-help-link"
              href="https://support.google.com/android/answer/9457058"
              target="_blank"
              rel="noreferrer"
            >
              Android installation guidance <ExternalIcon />
            </a>
          </article>
        </div>
      </section>

      <footer className="app-portal-footer">
        <span>Verigence · Audit, Governance, Intelligence</span>
        <span>Official authenticated application distribution</span>
      </footer>
    </main>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

function ShieldIcon() { return <Icon><path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z" /><path d="m8.7 12 2.1 2.1 4.7-5" /></Icon>; }
function DownloadIcon() { return <Icon><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></Icon>; }
function CheckIcon() { return <Icon><path d="m5 12 4 4L19 6" /></Icon>; }
function PhoneIcon() { return <Icon><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></Icon>; }
function PlayIcon() { return <Icon><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4Z" /></Icon>; }
function ExternalIcon() { return <Icon><path d="M14 5h5v5" /><path d="m10 14 9-9" /><path d="M19 13v6H5V5h6" /></Icon>; }
function AndroidIcon() { return <Icon><path d="M7 10h10v8H7z" /><path d="M9 7 7.5 4.5M15 7l1.5-2.5M9 14v6M15 14v6M5 11v5M19 11v5" /><path d="M8 10a4 4 0 0 1 8 0" /></Icon>; }

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
