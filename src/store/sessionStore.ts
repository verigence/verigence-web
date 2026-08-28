import { create } from 'zustand';

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
  accessTokenExpiresAtUtc?: string;
  securitySessionId?: string;
  securityDeviceId?: string;
  signInAuthenticated: (
    email: string,
    accessToken: string,
    role: UserRole,
    expiresAtUtc: string,
    securitySessionId: string,
    securityDeviceId: string,
  ) => void;
  signInPreview: (email: string, role?: UserRole) => void;
  signOut: () => void;
  setRolePreview: (role: UserRole) => void;
  setAccessToken: (token?: string, expiresAtUtc?: string) => void;
  setBusinessContext: (context: Partial<BusinessContext>) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  signedIn: false,
  email: '',
  displayName: '',
  role: 'PC',
  tenantId: '',
  dealerId: '',
  outletId: '',
  accessToken: undefined,
  accessTokenExpiresAtUtc: undefined,
  securitySessionId: undefined,
  securityDeviceId: undefined,
  signInAuthenticated: (
    email,
    accessToken,
    role,
    accessTokenExpiresAtUtc,
    securitySessionId,
    securityDeviceId,
  ) =>
    set({
      signedIn: true,
      email,
      displayName: email.split('@')[0] || email,
      role,
      tenantId: '',
      dealerId: '',
      outletId: '',
      accessToken,
      accessTokenExpiresAtUtc,
      securitySessionId,
      securityDeviceId,
    }),
  // Retained only for local/demo tooling. Protected routes reject preview sessions because
  // they require a Security-issued human access token.
  signInPreview: (email, role = 'PC') =>
    set({
      signedIn: true,
      email,
      displayName: email.split('@')[0] || email,
      role,
      tenantId: '',
      dealerId: '',
      outletId: '',
      accessToken: undefined,
      accessTokenExpiresAtUtc: undefined,
      securitySessionId: undefined,
      securityDeviceId: undefined,
    }),
  signOut: () =>
    set({
      signedIn: false,
      email: '',
      displayName: '',
      role: 'PC',
      tenantId: '',
      dealerId: '',
      outletId: '',
      accessToken: undefined,
      accessTokenExpiresAtUtc: undefined,
      securitySessionId: undefined,
      securityDeviceId: undefined,
    }),
  setRolePreview: (role) => set({ role }),
  setAccessToken: (accessToken, accessTokenExpiresAtUtc) => set({
    accessToken,
    accessTokenExpiresAtUtc,
  }),
  setBusinessContext: (context) => set(context),
}));
