import { useCallback, useState } from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

import type { DecisionKind } from '../../../services/hr/approvals';
import { decisionErrorMessage, decisionVerb, staleAfterError } from './approvalFormat';

export interface DecisionTarget<T> {
  item: T;
  decision: DecisionKind;
}

export interface DecisionNotice {
  tone: 'success' | 'error';
  text: string;
}

interface Options<T> {
  /** The key of this tab's list only: it is the only thing refetched after a decision. */
  listKey: QueryKey;
  send: (item: T, decision: DecisionKind, note: string) => Promise<unknown>;
  /** Who the notice names, e.g. "Asha Rao's leave". */
  describe: (item: T) => string;
}

/**
 * One decision at a time per tab: choose Approve/Reject/Send back, write the note, confirm.
 * The call is made once (no retry). The list is refreshed once afterwards, and also when the
 * server says the item was already decided or is no longer visible.
 */
export function useDecisionFlow<T>({ listKey, send, describe }: Options<T>) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<DecisionTarget<T> | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<DecisionNotice | null>(null);

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: listKey, exact: true }), [queryClient, listKey]);

  const mutation = useMutation({
    mutationFn: ({ item, decision, note }: { item: T; decision: DecisionKind; note: string }) => send(item, decision, note),
    onSuccess: (_result, { item, decision }) => {
      setTarget(null);
      setError('');
      setNotice({ tone: 'success', text: `${describe(item)} ${decisionVerb[decision].done}.` });
      void refresh();
    },
    onError: (problem) => {
      setError(decisionErrorMessage(problem));
      if (staleAfterError(problem)) void refresh();
    },
  });

  return {
    target,
    error,
    notice,
    busy: mutation.isPending,
    open: (item: T, decision: DecisionKind) => {
      setError('');
      setNotice(null);
      setTarget({ item, decision });
    },
    cancel: () => {
      if (!mutation.isPending) {
        setTarget(null);
        setError('');
      }
    },
    confirm: (note: string) => {
      if (target && !mutation.isPending) mutation.mutate({ item: target.item, decision: target.decision, note });
    },
    dismissNotice: () => setNotice(null),
  };
}
