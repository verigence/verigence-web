import type { ReactNode } from 'react';

import { hrErrorMessage } from '../../../services/hr/client';
import DecisionDialog from './DecisionDialog';
import type { DecisionNotice, DecisionTarget } from './useDecisionFlow';

interface ListState<T> {
  data?: T[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => unknown;
}

interface Flow<T> {
  target: DecisionTarget<T> | null;
  error: string;
  notice: DecisionNotice | null;
  busy: boolean;
  cancel: () => void;
  confirm: (note: string) => void;
  dismissNotice: () => void;
}

interface Props<T> {
  /** "attendance exceptions" */
  noun: string;
  query: ListState<T>;
  flow: Flow<T>;
  emptyText: string;
  summaryOf: (item: T) => string;
  children: (items: T[]) => ReactNode;
}

/** Loading, error and empty states, the result notice and the decision dialog, shared by the three tabs. */
export default function ApprovalListFrame<T>({ noun, query, flow, emptyText, summaryOf, children }: Props<T>) {
  const items = query.data ?? [];
  return (
    <div className="hr-appr-panel">
      <div className="hr-appr-bar">
        <p className="hr-count" aria-live="polite">
          {query.isLoading || query.isError ? '' : items.length === 1 ? `1 waiting for you` : `${items.length} waiting for you`}
        </p>
        <button type="button" className="uc01-admin-button hr-appr-refresh" onClick={() => query.refetch()} disabled={query.isFetching || flow.busy}>
          {query.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {flow.notice && (
        <div className={`uc01-admin-message uc01-admin-message--${flow.notice.tone === 'success' ? 'success' : 'error'} hr-appr-notice`} role="status">
          <span>{flow.notice.text}</span>
          <button type="button" className="uc01-admin-button uc01-admin-button--compact" onClick={flow.dismissNotice}>Dismiss</button>
        </div>
      )}

      {query.isLoading && <div className="uc01-admin-state" role="status">Loading {noun}…</div>}
      {query.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>The {noun} could not be loaded.</strong>
          <span>{hrErrorMessage(query.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => query.refetch()} disabled={query.isFetching}>Try again</button>
        </div>
      )}
      {!query.isLoading && !query.isError && items.length === 0 && (
        <div className="uc01-admin-state hr-appr-empty">
          <strong>Nothing is waiting for you.</strong>
          <span>{emptyText}</span>
        </div>
      )}
      {!query.isLoading && !query.isError && items.length > 0 && children(items)}

      {flow.target && (
        <DecisionDialog
          decision={flow.target.decision}
          summary={summaryOf(flow.target.item)}
          busy={flow.busy}
          error={flow.error}
          onConfirm={flow.confirm}
          onCancel={flow.cancel}
        />
      )}
    </div>
  );
}
