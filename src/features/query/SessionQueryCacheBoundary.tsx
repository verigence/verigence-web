import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useSessionStore } from '../../store/sessionStore';

/**
 * TanStack Query is intentionally trusted as an operational in-memory cache.
 * Clear that cache when the authenticated human/session persona changes so
 * cached tenant/journey data can never bleed into a subsequent sign-in.
 * Access-token renewal alone does not clear the cache.
 */
export default function SessionQueryCacheBoundary() {
  const queryClient = useQueryClient();
  const signedIn = useSessionStore((state) => state.signedIn);
  const email = useSessionStore((state) => state.email);
  const role = useSessionStore((state) => state.role);
  const previousScope = useRef<string>();

  useEffect(() => {
    const scope = signedIn ? `${email.trim().toLowerCase()}|${role}` : 'SIGNED_OUT';
    if (previousScope.current !== undefined && previousScope.current !== scope) {
      queryClient.clear();
    }
    previousScope.current = scope;
  }, [email, queryClient, role, signedIn]);

  return null;
}
