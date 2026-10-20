import { useEffect, useSyncExternalStore } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

/**
 * "← Back to Journey 360": one step back to where the user actually came
 * from, named (product owner 2026-10-20: from Journey 360 to Documents there
 * was no way back to Journey 360 -- only to the list).
 *
 * The app keeps its own short record of visited screens (``useTrackScreens``,
 * mounted once in the app shell): a Back press or this link steps through it
 * exactly like the browser does, so the previous screen comes back with its
 * tab and filters. Opened directly (no previous screen), it goes to the
 * fallback instead.
 */
type Entry = { key: string; path: string };
let entries: Entry[] = [];
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
const snapshot = () => entries;

export function useTrackScreens(): void {
  const location = useLocation();
  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    const at = entries.findIndex((entry) => entry.key === location.key);
    if (at >= 0) entries = entries.slice(0, at + 1);
    else entries = [...entries, { key: location.key, path }].slice(-50);
    listeners.forEach((listener) => listener());
  }, [location.key, location.pathname, location.search]);
}

/** A human name for a screen of the app, from its path. */
export function screenName(path: string): string {
  const [pathname, query = ''] = path.split('?');
  const tab = new URLSearchParams(query).get('tab');
  if (/^\/p2\/journeys\/[^/]+\/overview/.test(pathname)) {
    return tab ? `Journey 360 · ${tab.charAt(0).toUpperCase()}${tab.slice(1)}` : 'Journey 360';
  }
  if (/^\/p2\/journeys\/[^/]+\/documents/.test(pathname)) return 'Documents';
  if (/^\/p2\/journeys\/[^/]+\/tasks/.test(pathname)) return 'Tasks';
  if (/^\/p2\/journeys\/[^/]+\/compliance-report/.test(pathname)) return 'Compliance report';
  if (pathname.startsWith('/reviews')) return 'Task Queue';
  if (pathname.startsWith('/p2/tasks')) return 'My tasks';
  if (pathname.startsWith('/duplicate-bookings')) return 'Duplicate bookings';
  if (pathname.startsWith('/p2/reports')) return 'Daily processing';
  if (pathname.startsWith('/audit/')) return 'Audit review';
  if (pathname === '/dashboard') return 'Overview';
  if (pathname.startsWith('/p2')) return 'Booking & Delivery';
  return 'previous screen';
}

type Props = { fallbackTo: string; fallbackLabel: string };

export default function BackLink({ fallbackTo, fallbackLabel }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const visited = useSyncExternalStore(subscribe, snapshot, snapshot);
  const here = visited.findIndex((entry) => entry.key === location.key);
  const previous = here > 0 ? visited[here - 1] : null;
  if (previous) {
    return (
      <button type="button" className="p2w-back" onClick={() => navigate(-1)}>
        ← Back to {screenName(previous.path)}
      </button>
    );
  }
  return <Link className="p2w-back" to={fallbackTo}>← {fallbackLabel}</Link>;
}
