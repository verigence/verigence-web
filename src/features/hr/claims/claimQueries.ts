import { useQuery } from '@tanstack/react-query';

import {
  CLAIM_LIST_ALL_PERMISSIONS,
  getClaim,
  getClaimCategories,
  getClaimSummary,
  listAllClaims,
  listMyClaims,
  type ClaimStatus,
} from '../../../services/hr/claims';
import { useSessionStore } from '../../../store/sessionStore';
import { useHrAccess } from '../hrQueries';

export const claimKeys = {
  all: ['hr', 'claims'] as const,
  categories: ['hr', 'claims', 'categories'] as const,
  summary: (month: string) => ['hr', 'claims', 'summary', month] as const,
  mine: ['hr', 'claims', 'mine'] as const,
  review: (filters: { status: string; month: string }) => ['hr', 'claims', 'review', filters] as const,
  detail: (id: string) => ['hr', 'claims', 'detail', id] as const,
  receipt: (claimId: string, receiptId: string) => ['hr', 'claims', 'receipt', claimId, receiptId] as const,
};

/** Every read is made once per need, never retried, and not refreshed when the window regains focus. */
const once = { retry: false, refetchOnWindowFocus: false } as const;

export function useClaimCategories(enabled = true) {
  const token = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: claimKeys.categories,
    queryFn: () => getClaimCategories(token!),
    enabled: Boolean(token) && enabled,
    staleTime: 10 * 60_000,
    ...once,
  });
}

/** `month` is YYYY-MM (the expense month); empty means the current month. */
export function useClaimSummary(month: string, enabled = true) {
  const token = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: claimKeys.summary(month),
    queryFn: () => getClaimSummary(token!, month || undefined),
    enabled: Boolean(token) && enabled,
    staleTime: 30_000,
    ...once,
  });
}

export function useMyClaims(enabled = true) {
  const token = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: claimKeys.mine,
    queryFn: () => listMyClaims(token!),
    enabled: Boolean(token) && enabled,
    ...once,
  });
}

export function useAllClaims(filters: { status: '' | ClaimStatus; month: string }, enabled = true) {
  const token = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: claimKeys.review(filters),
    queryFn: () => listAllClaims(token!, { status: filters.status || undefined, month: filters.month || undefined }),
    enabled: Boolean(token) && enabled,
    placeholderData: (previous) => previous,
    ...once,
  });
}

export function useClaim(claimId: string | undefined) {
  const token = useSessionStore((s) => s.accessToken);
  return useQuery({
    queryKey: claimKeys.detail(claimId ?? ''),
    queryFn: () => getClaim(token!, claimId!),
    enabled: Boolean(token) && Boolean(claimId),
    ...once,
  });
}

/** What this person may do with claims. Convenience only: the HR service checks every request again. */
export function useClaimAccess() {
  const access = useHrAccess();
  return {
    loading: access.loading,
    /** Has an employee record, so can have claims of their own. */
    isEmployee: access.isEmployee,
    /** HR, Finance or the CEO: may list every claim. */
    canListAll: CLAIM_LIST_ALL_PERMISSIONS.some((key) => access.can(key)),
  };
}
