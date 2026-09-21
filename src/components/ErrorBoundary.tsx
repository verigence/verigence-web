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
      try {
        // Reload exactly once per stale bundle -- App.tsx clears this flag
        // once the app has actually rendered past boot, so a LATER deploy
        // hitting this same tab still gets its own one free reload instead
        // of being silently suppressed by a flag from hours earlier.
        if (!sessionStorage.getItem(STALE_CHUNK_RELOAD_FLAG)) {
          sessionStorage.setItem(STALE_CHUNK_RELOAD_FLAG, '1');
          window.location.reload();
        }
      } catch {
        // sessionStorage unavailable (private browsing, blocked storage) --
        // fall through to the ordinary fallback UI below.
      }
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
