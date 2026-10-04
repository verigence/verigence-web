import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import SectionCard from '../../components/SectionCard';
import { hrErrorMessage } from '../../services/hr/client';
import type { Employee } from '../../services/hr/employees';

const SHOW_FOR_MS = 30_000;

interface Props {
  employee: Employee;
  /** Whether this person may reveal the full numbers (HR permission, or their own record). */
  canReveal: boolean;
  reveal: () => Promise<{ pan: string | null; aadhaar: string | null }>;
}

/** PAN and Aadhaar are masked. A reveal is a deliberate, recorded action and hides again by itself. */
export default function SensitiveNumbers({ employee, canReveal, reveal }: Props) {
  const [shown, setShown] = useState<{ pan: string | null; aadhaar: string | null } | null>(null);
  const mutation = useMutation({ mutationFn: reveal, onSuccess: (data) => setShown(data) });

  useEffect(() => {
    if (!shown) return undefined;
    const timer = window.setTimeout(() => setShown(null), SHOW_FOR_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);

  // Leaving the page or switching employee must not leave numbers in memory.
  useEffect(() => () => setShown(null), [employee.employeeId]);

  return (
    <SectionCard title="Identity numbers" description={canReveal ? 'Showing the full numbers is recorded in the audit history.' : undefined}>
      <dl className="definition-list hr-definitions">
        <div><dt>PAN</dt><dd>{shown ? shown.pan ?? '—' : employee.panMasked ?? '—'}</dd></div>
        <div><dt>Aadhaar</dt><dd>{shown ? shown.aadhaar ?? '—' : employee.aadhaarMasked ?? '—'}</dd></div>
      </dl>
      {mutation.isError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{hrErrorMessage(mutation.error)}</div>}
      {canReveal && (
        <div className="hr-actions">
          {shown ? (
            <button type="button" className="uc01-admin-button uc01-admin-button--compact" onClick={() => setShown(null)}>Hide</button>
          ) : (
            <button type="button" className="uc01-admin-button uc01-admin-button--compact" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Loading…' : 'Show full numbers'}
            </button>
          )}
          {shown && <span className="hr-muted">Hides again after 30 seconds.</span>}
        </div>
      )}
    </SectionCard>
  );
}
