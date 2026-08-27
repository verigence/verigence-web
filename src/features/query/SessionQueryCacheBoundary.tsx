import { useLayoutEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useSessionStore } from '../../store/sessionStore';

/**
 * Operational query data is retained in memory for the authenticated session.
 * Clear it synchronously when the signed-in human/persona changes so data from a
 * previous session cannot be rendered by a later one. Access-token renewal does
 * not clear the cache.
 */
export default function SessionQueryCacheBoundary() {
  const queryClient = useQueryClient();
  const signedIn = useSessionStore((state) => state.signedIn);
  const email = useSessionStore((state) => state.email);
  const role = useSessionStore((state) => state.role);
  const previousScope = useRef<string | undefined>(undefined);

  useLayoutEffect(() => {
    const scope = signedIn ? `${email.trim().toLowerCase()}|${role}` : 'SIGNED_OUT';
    if (previousScope.current !== undefined && previousScope.current !== scope) {
      queryClient.clear();
    }
    previousScope.current = scope;
  }, [email, queryClient, role, signedIn]);

  return null;
}
