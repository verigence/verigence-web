import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { verigenceLockup } from '../../assets/verigenceLockup';
import type { MaintenanceNotice } from '../../services/security/announcements';
import { useSessionStore } from '../../store/sessionStore';
import { resetOperationalContext } from '../uc03/projectContext';
import { formatBackAt } from './announcementLogic';

/** The calm "we'll be back" screen that replaces the app while maintenance is on. */
export default function MaintenancePage({ notice, onCheck, checking }: { notice: MaintenanceNotice; onCheck: () => Promise<unknown>; checking: boolean }) {
  const signOut = useSessionStore((state) => state.signOut);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [again, setAgain] = useState(false);
  const back = formatBackAt(notice.backAt);

  return (
    <main className="maintenance-screen" aria-labelledby="maintenance-title">
      <div className="maintenance-card">
        <img className="maintenance-card__logo" src={verigenceLockup} alt="Verigence" />
        <h1 id="maintenance-title">{notice.title}</h1>
        <p className="maintenance-card__body">{notice.body}</p>
        {back && <p className="maintenance-card__back">Expected back around <strong>{back}</strong></p>}
        {again && !checking && <p className="maintenance-card__hint" role="status">Still being worked on. Please try again a little later.</p>}
        <div className="maintenance-card__actions">
          <button type="button" className="announce-card__button" disabled={checking} onClick={() => { setAgain(true); void onCheck(); }}>
            {checking ? 'Checking…' : 'Check again'}
          </button>
          <button type="button" className="maintenance-card__link" onClick={() => { resetOperationalContext(queryClient); signOut(); navigate('/login'); }}>Sign out</button>
        </div>
      </div>
    </main>
  );
}
