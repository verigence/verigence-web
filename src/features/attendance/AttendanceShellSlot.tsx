import { useEffect, useState, type ComponentType } from 'react';

import { useProjectContextStore } from '../../store/projectContextStore';
import { useSessionStore } from '../../store/sessionStore';

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * Intentionally tiny initial-bundle boundary.
 *
 * The Attendance reminder code, CSS and network request are imported only after the
 * primary application has had time to render. Any import/API failure stays local and
 * never blocks normal Verigence navigation or business actions.
 */
export default function AttendanceShellSlot() {
  const signedIn = useSessionStore((state) => state.signedIn);
  const accessToken = useSessionStore((state) => state.accessToken);
  const selectedProject = useProjectContextStore((state) => state.selectedProject);
  const [Reminder, setReminder] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (!signedIn || !accessToken || !selectedProject) {
      setReminder(null);
      return undefined;
    }

    let cancelled = false;
    const load = () => {
      void import('./AttendanceReminder')
        .then((module) => {
          if (!cancelled) setReminder(() => module.default);
        })
        .catch(() => {
          if (!cancelled) setReminder(null);
        });
    };

    const idleWindow = window as IdleWindow;
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(load, { timeout: 2_500 });
      return () => {
        cancelled = true;
        idleWindow.cancelIdleCallback?.(handle);
      };
    }

    const handle = window.setTimeout(load, 1_500);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [accessToken, selectedProject, signedIn]);

  return Reminder ? <Reminder /> : null;
}
