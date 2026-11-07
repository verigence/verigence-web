import { create } from 'zustand';

import type { UserRole } from '../domain/models';
import { getVerigenceDeviceContext } from '../services/device/identity';
import { rememberLog } from '../services/security/rememberDebugLog';
import { disableRememberedSession } from '../services/security/rememberSessionLifecycle';

interface BusinessContext {
  tenantId: string;
  dealerId: string;
  outletId: string;
}

/**
 * Why the in-app session ends. Only `USER` (the person pressed Sign out, on any screen) forgets
 * "Keep me signed in" on this device. `SESSION_ENDED` is every automatic ending (the short token ran
 * out, Security refused a renewal, the network failed): the remembered credential stays, and only
 * Security can reject it, through /auth/resume. Required, so no caller can forget the device by
 * default (2026-11-07).
 */
export type SignOutReason = 'USER' | 'SESSION_ENDED';

interface SessionState extends BusinessContext {
  signedIn: boolean;
  email: string;
  displayName: string;
  role: UserRole;
  accessToken?: string;
  accessTokenExpiresAtUtc?: string;
  securitySessionId?: string;
  securityDeviceId?: string;
  /** Goes up on every sign-in and every resume, so each opening of the app can be noted once. */
  accessEpoch: number;
  accessKind: 'SIGN_IN' | 'RESUME';
  signInAuthenticated: (
    email: string,
    accessToken: string,
    role: UserRole,
    expiresAtUtc: string,
    securitySessionId: string,
    securityDeviceId: string,
  ) => void;
  signInPreview: (email: string, role?: UserRole) => void;
  signOut: (reason: SignOutReason) => void;
  setRolePreview: (role: UserRole) => void;
  setAccessToken: (token?: string, expiresAtUtc?: string) => void;
  /** A remembered session resumed while the app was open: new tokens, same person, same context. */
  applyResumedSession: (accessToken: string, expiresAtUtc: string, securitySessionId: string, securityDeviceId: string) => void;
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
  accessEpoch: 0,
  accessKind: 'SIGN_IN',
  signInAuthenticated: (
    email,
    accessToken,
    role,
    accessTokenExpiresAtUtc,
    securitySessionId,
    securityDeviceId,
  ) =>
    set((state) => ({
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
      accessEpoch: state.accessEpoch + 1,
      accessKind: 'SIGN_IN',
    })),
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
  signOut: (reason) => {
    rememberLog('sign-out', { reason });
    if (reason === 'USER') {
      void disableRememberedSession(getVerigenceDeviceContext());
    }
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
    });
  },
  setRolePreview: (role) => set({ role }),
  setAccessToken: (accessToken, accessTokenExpiresAtUtc) => set({
    accessToken,
    accessTokenExpiresAtUtc,
  }),
  setBusinessContext: (context) => set(context),
  applyResumedSession: (accessToken, accessTokenExpiresAtUtc, securitySessionId, securityDeviceId) => set((state) => ({
    accessToken,
    accessTokenExpiresAtUtc,
    securitySessionId,
    securityDeviceId,
    accessEpoch: state.accessEpoch + 1,
    accessKind: 'RESUME',
  })),
}));
