import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  // Scoped boundaries (e.g. around one page section) pass their own inert
  // fallback -- null by default -- instead of the full-page message, so one
  // section's bug doesn't read as the whole page being broken.
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

// A lazy-loaded route chunk built by a since-superseded deploy 404s once
// this same-origin SPA has redeployed and the old hashed filename no
// longer exists -- this app's own wrangler.jsonc serves index.html as the
// fallback for any unmatched asset path, so the browser gets HTML where it
// expected JavaScript and refuses to execute it ("disallowed MIME type").
// A tab left open across a deploy hits this the moment it lazy-loads its
// first not-yet-visited route; it isn't a real bug in that route, just a
// stale bundle, and the fix is simply the current index.html -- not a dead
// "something went wrong" page. Found live: a browser tab open across
// several deploys in one evening got exactly this on /apps.
export const STALE_CHUNK_RELOAD_FLAG = 'verigence-stale-chunk-reload';
const STALE_CHUNK_RELOAD_AT = 'verigence-stale-chunk-reload-at';
const STALE_CHUNK_RELOAD_COOLDOWN_MS = 60_000;

/**
 * Reload to the current bundle, at most once a minute per tab. The
 * per-boot flag above is cleared by App.tsx once the app has rendered,
 * which is right for a deploy (the next one gets its own reload) but not
 * for a chunk that keeps failing for another reason: reload, boot, clear,
 * fail, reload... Seen while screenshotting this app with an asset
 * blocked on purpose: the tab reloaded /dashboard every second. The
 * cooldown stamp is never cleared by the app, so a persistent failure ends
 * on the ordinary error message instead of a reload loop. Returns whether a
 * reload was started.
 */
export function reloadForStaleChunk(): boolean {
  try {
    const last = Number(sessionStorage.getItem(STALE_CHUNK_RELOAD_AT) || 0);
    if (Date.now() - last < STALE_CHUNK_RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(STALE_CHUNK_RELOAD_AT, String(Date.now()));
    sessionStorage.setItem(STALE_CHUNK_RELOAD_FLAG, '1');
  } catch {
    // sessionStorage unavailable (private browsing, blocked storage): no
    // way to bound the reloads, so do not start one.
    return false;
  }
  window.location.reload();
  return true;
}

function isStaleChunkLoadError(error: Error): boolean {
  const message = error.message || '';
  return (
    /error loading dynamically imported module/i.test(message)
    || /failed to fetch dynamically imported module/i.test(message)
    || /importing a module script failed/i.test(message)
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      JSON.stringify({
        event_name: 'web_react_error',
        service_name: 'verigence-web',
        error_type: error.name,
        message: error.message,
        component_stack: info.componentStack?.slice(0, 500),
      }),
    );

    if (isStaleChunkLoadError(error)) {
      // Reload once per stale bundle -- App.tsx clears the per-boot flag
      // once the app has actually rendered past boot, so a LATER deploy
      // hitting this same tab still gets its own one free reload instead
      // of being silently suppressed by a flag from hours earlier; the
      // helper's cooldown keeps a chunk that fails for any other reason
      // from reloading the tab in a loop. No reload: the fallback UI below.
      let flagged = false;
      try {
        flagged = Boolean(sessionStorage.getItem(STALE_CHUNK_RELOAD_FLAG));
      } catch {
        flagged = true;
      }
      if (!flagged) reloadForStaleChunk();
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback !== undefined ? this.props.fallback : (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <p>Something went wrong. Please refresh the page.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
