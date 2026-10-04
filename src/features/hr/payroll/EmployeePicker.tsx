import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { hrErrorMessage } from '../../../services/hr/client';
import { listEmployees } from '../../../services/hr/employees';
import { payrollKeys } from '../../../services/hr/payroll';
import { useSessionStore } from '../../../store/sessionStore';
import { useHrAccess } from '../hrQueries';

export interface PickedEmployee {
  employeeId: string;
  fullName: string;
  employeeCode: string;
}

interface Props {
  id: string;
  label: string;
  value: PickedEmployee | null;
  onChange: (employee: PickedEmployee | null) => void;
  error?: string;
  disabled?: boolean;
  /** Include people who have left (for looking at an old salary history). */
  includeInactive?: boolean;
}

/** Search by name or code, then tap a person. One request after the typing stops. */
export default function EmployeePicker({ id, label, value, onChange, error, disabled, includeInactive }: Props) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const access = useHrAccess();
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(text), 350);
    return () => window.clearTimeout(timer);
  }, [text]);

  const results = useQuery({
    queryKey: [...payrollKeys.pickEmployees(term), includeInactive ? 'all' : 'active'],
    queryFn: () => listEmployees(accessToken!, { q: term, status: includeInactive ? undefined : 'ACTIVE', limit: 20 }),
    enabled: Boolean(accessToken) && access.canReadEmployees && open && !value,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  if (!access.canReadEmployees) {
    return (
      <div className="hr-field">
        <span className="hr-field__hint">
          Choosing a person needs access to the employee list, which your role does not include.
        </span>
      </div>
    );
  }

  if (value) {
    return (
      <div className={`hr-field${error ? ' hr-field--error' : ''}`}>
        <span className="hr-pay-label" id={`${id}-label`}>{label}</span>
        <div className="hr-pay-picked">
          <span>
            <strong>{value.fullName}</strong>
            <small>{value.employeeCode}</small>
          </span>
          <button type="button" className="uc01-admin-button hr-pay-button" disabled={disabled} onClick={() => { onChange(null); setText(''); setOpen(true); }}>
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`hr-field${error ? ' hr-field--error' : ''}`}>
      <label htmlFor={id}>{label}<span className="hr-field__required" aria-hidden="true"> *</span></label>
      <input
        id={id}
        type="search"
        autoComplete="off"
        placeholder="Search by name or employee code"
        value={text}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setText(event.target.value); setOpen(true); }}
      />
      {open && (
        <div className="hr-pay-results" role="listbox" aria-label={`${label} results`}>
          {results.isLoading && <p className="hr-pay-results__note" role="status">Searching…</p>}
          {results.isError && <p className="hr-pay-results__note hr-pay-results__note--error" role="alert">{hrErrorMessage(results.error)}</p>}
          {results.data?.items.length === 0 && <p className="hr-pay-results__note">No one matches.</p>}
          {results.data?.items.map((e) => (
            <button
              key={e.employeeId}
              type="button"
              role="option"
              aria-selected={false}
              className="hr-pay-result"
              onClick={() => { onChange({ employeeId: e.employeeId, fullName: e.fullName, employeeCode: e.employeeCode }); setOpen(false); }}
            >
              <strong>{e.fullName}</strong>
              <small>{e.employeeCode}{e.designation ? ` · ${e.designation}` : ''}</small>
            </button>
          ))}
        </div>
      )}
      {error && <span id={`${id}-error`} className="hr-field__error" role="alert">{error}</span>}
    </div>
  );
}
