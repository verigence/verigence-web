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

/**
 * The screen before this one and how many history steps away it is. Opening
 * a document or switching a tab adds history on the same screen; Back goes to
 * the screen before it, never to this screen again (product owner
 * 2026-10-20: on Documents it said "Back to Documents").
 */
export function previousScreen(
  visited: readonly Entry[], hereKey: string, pathname: string,
): { path: string; steps: number } | null {
  const here = visited.findIndex((entry) => entry.key === hereKey);
  if (here <= 0) return null;
  // The same kind of screen (a new booking's Documents gets its journey id
  // after the first upload, a Journey 360 tab changes): still this screen.
  const kind = (path: string) => screenName(path).split(' · ')[0];
  const current = kind(pathname);
  let at = here - 1;
  while (at >= 0 && kind(visited[at].path) === current) at -= 1;
  return at >= 0 ? { path: visited[at].path, steps: here - at } : null;
}

type Props = { fallbackTo: string; fallbackLabel: string };

export default function BackLink({ fallbackTo, fallbackLabel }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const visited = useSyncExternalStore(subscribe, snapshot, snapshot);
  const back = previousScreen(visited, location.key, location.pathname);
  if (back) {
    return (
      <button type="button" className="p2w-back" onClick={() => navigate(-back.steps)}>
        ← Back to {screenName(back.path)}
      </button>
    );
  }
  return <Link className="p2w-back" to={fallbackTo}>← {fallbackLabel}</Link>;
}
