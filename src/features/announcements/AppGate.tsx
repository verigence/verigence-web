import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';

import { markAnnouncementSeen } from '../../services/security/announcements';
import { useSessionStore } from '../../store/sessionStore';
import '../../styles/announcements.css';
import AnnouncementDialog from './AnnouncementCard';
import MaintenancePage from './MaintenancePage';
import { gateDecision, isPublicPath, popupVisible, type GateDecision } from './announcementLogic';
import { useMaintenance, useMyAnnouncement } from './announcementHooks';

function AnnouncementHost({ gate }: { gate: GateDecision }) {
  const { pathname } = useLocation();
  const signedIn = useSessionStore((state) => state.signedIn);
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const announcement = useMyAnnouncement(signedIn && gate !== 'block' && !isPublicPath(pathname));

  if (!announcement || !popupVisible({ announcement, dismissed, signedIn, pathname, gate })) return null;

  const dismiss = () => {
    setDismissed((current) => new Set(current).add(announcement.announcementId));
    // Even if this fails the message is closed for this session: no retry loops.
    if (accessToken) void markAnnouncementSeen(accessToken, announcement.announcementId).catch(() => undefined);
    void queryClient.invalidateQueries({ queryKey: ['security', 'announcement', 'me'], refetchType: 'none' });
  };
  return <AnnouncementDialog kind={announcement.kind} title={announcement.title} body={announcement.body} onDismiss={dismiss} />;
}

/**
 * Around the routes: while maintenance is on, everyone but SuperAdmin sees the "we'll be back" page
 * after signing in; SuperAdmin gets the app with a banner. Also hosts the one-time announcement popup.
 */
export default function AppGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const signedIn = useSessionStore((state) => state.signedIn);
  const role = useSessionStore((state) => state.role);
  const { maintenance, check, checking } = useMaintenance();
  const gate = gateDecision({ maintenance, signedIn, role, pathname });

  if (gate === 'block' && maintenance) return <MaintenancePage notice={maintenance} onCheck={check} checking={checking} />;
  return (
    <>
      {children}
      {gate === 'admin-banner' && (
        <div className="maintenance-banner" role="status">
          <span>Maintenance mode is ON for everyone else.</span>
          <Link to="/admin/announcements">End maintenance</Link>
        </div>
      )}
      <AnnouncementHost gate={gate} />
    </>
  );
}
