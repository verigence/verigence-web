import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { UserRole } from '../domain/models';
import { DEMO_TENANT_ID } from '../data/demoData';

interface SessionState {
  signedIn: boolean;
  email: string;
  displayName: string;
  role: UserRole;
  tenantId: string;
  accessToken?: string;
  signInPreview: (email: string, role?: UserRole) => void;
  signOut: () => void;
  setRolePreview: (role: UserRole) => void;
  setAccessToken: (token?: string) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      signedIn: false,
      email: 'pc@verigence.example',
      displayName: 'Demo User',
      role: 'PC',
      tenantId: DEMO_TENANT_ID,
      accessToken: undefined,
      signInPreview: (email, role = 'PC') =>
        set({ signedIn: true, email, displayName: email.split('@')[0] || 'Demo User', role }),
      signOut: () => set({ signedIn: false, accessToken: undefined }),
      setRolePreview: (role) => set({ role }),
      setAccessToken: (accessToken) => set({ accessToken }),
    }),
    {
      name: 'verigence-web-session',
      partialize: (state) => ({
        signedIn: state.signedIn,
        email: state.email,
        displayName: state.displayName,
        role: state.role,
        tenantId: state.tenantId,
      }),
    },
  ),
);
