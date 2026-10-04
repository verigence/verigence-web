import PageHeader from '../../../components/PageHeader';
import { payrollErrorMessage } from './payrollErrors';

export function LoadingState({ children = 'Loading…' }: { children?: string }) {
  return <div className="uc01-admin-state" role="status">{children}</div>;
}

export function ErrorState({ title, error, onRetry, busy }: { title: string; error: unknown; onRetry?: () => void; busy?: boolean }) {
  return (
    <div className="uc01-admin-state uc01-admin-state--error" role="alert">
      <strong>{title}</strong>
      <span>{payrollErrorMessage(error)}</span>
      {onRetry && <button type="button" className="uc01-admin-button hr-pay-button" onClick={onRetry} disabled={busy}>Try again</button>}
    </div>
  );
}

export function EmptyState({ children }: { children: string }) {
  return <div className="uc01-admin-state hr-pay-empty">{children}</div>;
}

/** Shown in place of a whole page when the signed-in person's HR role does not cover it. */
export function NoAccess({ eyebrow = 'HR', title, message }: { eyebrow?: string; title: string; message: string }) {
  return (
    <section className="uc01-admin-page" aria-label={title}>
      <PageHeader eyebrow={eyebrow} title={title} />
      <div className="uc01-admin-state uc01-admin-state--error">
        <strong>{message}</strong>
        <span>Ask an administrator to give you the right HR role.</span>
      </div>
    </section>
  );
}
