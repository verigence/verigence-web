import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import SectionCard from '../../components/SectionCard';
import { hrErrorMessage } from '../../services/hr/client';
import { getHrAudit, type AuditEntry } from '../../services/hr/employees';
import { useSessionStore } from '../../store/sessionStore';
import { formatDateTime } from './hrLabels';
import { hrKeys } from './hrQueries';

const actionLabels: Record<string, string> = {
  EMPLOYEE_CREATED: 'Employee created',
  EMPLOYEE_UPDATED: 'Details changed by HR',
  EMPLOYEE_SELF_UPDATED: 'Details changed by the employee',
  LOGIN_CREATED: 'Verigence login created',
  LOGIN_CREATE_FAILED: 'Login creation failed',
  SENSITIVE_REVEALED: 'PAN and Aadhaar shown',
  SENSITIVE_REVEALED_SELF: 'PAN and Aadhaar shown to the employee',
  QUALIFICATION_ADDED: 'Qualification added',
  QUALIFICATION_UPDATED: 'Qualification changed',
  QUALIFICATION_REMOVED: 'Qualification removed',
  PHOTO_CHANGED: 'Photo changed',
};

const fieldLabel = (key: string) => key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').toLowerCase();

/** A short, readable line per change. PAN and Aadhaar values are never in the log, only "changed". */
export function describeChange(entry: AuditEntry): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(entry.changes ?? {})) {
    if (value && typeof value === 'object' && 'from' in value && 'to' in value) {
      const change = value as { from: unknown; to: unknown };
      out.push(`${fieldLabel(key)}: ${String(change.from ?? '—')} → ${String(change.to ?? '—')}`);
    } else if (key === 'password' || key === 'securityUserId') {
      continue;
    } else {
      out.push(`${fieldLabel(key)}: ${String(value)}`);
    }
  }
  return out;
}

export default function AuditHistory({ employeeId }: { employeeId: string }) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const [pages, setPages] = useState<AuditEntry[][]>([]);
  const [cursor, setCursor] = useState<number | undefined>(undefined);

  const page = useQuery({
    queryKey: [...hrKeys.audit(employeeId), cursor ?? 'first'],
    queryFn: async () => {
      const data = await getHrAudit(accessToken!, employeeId, cursor);
      return data;
    },
    enabled: Boolean(accessToken),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const earlier = pages.flat();
  const current = page.data?.items ?? [];
  const entries = cursor === undefined ? current : [...earlier, ...current];
  const next = page.data?.nextBeforeId ?? null;

  return (
    <SectionCard title="History" description="Every change to this record, newest first.">
      {page.isLoading && <p className="hr-muted">Loading history…</p>}
      {page.isError && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{hrErrorMessage(page.error)}</div>}
      {!page.isLoading && !page.isError && entries.length === 0 && <p className="hr-muted">Nothing recorded yet.</p>}
      {entries.length > 0 && (
        <ol className="hr-history">
          {entries.map((entry) => (
            <li key={entry.auditId}>
              <strong>{actionLabels[entry.action] ?? entry.action.replace(/_/g, ' ').toLowerCase()}</strong>
              <small>{formatDateTime(entry.occurredAt)}</small>
              {describeChange(entry).map((line) => <span key={line}>{line}</span>)}
            </li>
          ))}
        </ol>
      )}
      {next !== null && (
        <button
          type="button"
          className="uc01-admin-button uc01-admin-button--compact"
          disabled={page.isFetching}
          onClick={() => {
            setPages((all) => (cursor === undefined ? [current] : [...all, current]));
            setCursor(next);
          }}
        >
          {page.isFetching ? 'Loading…' : 'Show earlier'}
        </button>
      )}
    </SectionCard>
  );
}
