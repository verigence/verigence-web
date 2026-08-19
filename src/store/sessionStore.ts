import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { UserRole } from '../domain/models';

interface BusinessContext {
  tenantId: string;
  dealerId: string;
  outletId: string;
}

interface SessionState extends BusinessContext {
  signedIn: boolean;
  email: string;
  displayName: string;
  role: UserRole;
  accessToken?: string;
  signInPreview: (email: string, role?: UserRole) => void;
  signOut: () => void;
  setRolePreview: (role: UserRole) => void;
  setAccessToken: (token?: string) => void;
  setBusinessContext: (context: Partial<BusinessContext>) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      signedIn: false,
      email: '',
      displayName: '',
      role: 'PC',
      tenantId: '',
      dealerId: '',
      outletId: '',
      accessToken: undefined,
      signInPreview: (email, role = 'PC') =>
        set({ signedIn: true, email, displayName: email.split('@')[0] || email, role }),
      signOut: () =>
        set({
          signedIn: false,
          email: '',
          displayName: '',
          tenantId: '',
          dealerId: '',
          outletId: '',
          accessToken: undefined,
        }),
      setRolePreview: (role) => set({ role }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setBusinessContext: (context) => set(context),
    }),
    {
      name: 'verigence-web-session',
      partialize: (state) => ({
        signedIn: state.signedIn,
        email: state.email,
        displayName: state.displayName,
        role: state.role,
        tenantId: state.tenantId,
        dealerId: state.dealerId,
        outletId: state.outletId,
      }),
    },
  ),
);
