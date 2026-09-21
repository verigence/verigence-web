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
 * Exactly three things, per explicit instruction: the download button,
 * its version/size, and how to use it (the install video). Everything
 * this page used to carry beyond that -- a hero banner, a trust-badge
 * strip, a separate written install-steps card, package/checksum detail --
 * was cut, not just visually shrunk, after repeated direct feedback that
 * a marketing-style page pushed the one thing a PC actually needs (the
 * video) below the fold with no hint it existed.
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
      </header>

      <section className="app-portal-content" aria-label="Verigence Android download">
        <article className="app-release-card">
          <h1>{metadata.appName} for Android</h1>
          {(versionSize || loading) && (
            <p className="app-release-note">
              {loading ? 'Checking for a release…' : !metadata.available ? 'Not published yet.' : versionSize}
            </p>
          )}

          <button
            className="app-download-button"
            type="button"
            onClick={() => void download()}
            disabled={loading || !metadata.available || downloading}
          >
            <DownloadIcon />
            {downloading ? 'Preparing download…' : 'Download APK'}
          </button>

          {message && <div className="app-portal-message" role="status">{message}</div>}
        </article>

        <article className="app-video-card">
          <h2>How to install it</h2>
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
          {/* Same card as the video, not a second heavy section -- four
              short titles in a tight 2x2 grid, no descriptive sentences.
              The video already shows how; this is just the checklist to
              glance back at. */}
          <ol className="app-install-steps">
            <li><span>1</span>Download</li>
            <li><span>2</span>Allow this source</li>
            <li><span>3</span>Install</li>
            <li><span>4</span>Open Verigence</li>
          </ol>
        </article>
      </section>
    </main>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

function DownloadIcon() { return <Icon><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></Icon>; }
