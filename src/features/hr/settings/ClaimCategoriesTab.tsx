import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { hrErrorMessage } from '../../../services/hr/client';
import {
  listClaimCategories,
  updateClaimCategoryTaxable,
  type ClaimCategory,
} from '../../../services/hr/hrSettings';
import { settingsKeys } from './settingsKeys';

interface Props {
  accessToken: string;
}

const KIND_LABEL: Record<string, string> = { TRAVEL: 'Travel', MEALS: 'Meals' };

export default function ClaimCategoriesTab({ accessToken }: Props) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const query = useQuery({
    queryKey: settingsKeys.categories,
    queryFn: () => listClaimCategories(accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const items = query.data?.items ?? [];

  const toggle = useMutation({
    mutationFn: (p: { code: string; taxable: boolean }) => updateClaimCategoryTaxable(accessToken, p.code, p.taxable),
    onSuccess: (saved, p) => {
      queryClient.setQueryData<{ items: ClaimCategory[] }>(settingsKeys.categories, (old) =>
        old ? { items: old.items.map((c) => (c.code === saved.code ? { ...c, taxable: saved.taxable } : c)) } : old,
      );
      const label = items.find((c) => c.code === p.code)?.label ?? p.code;
      setError('');
      setNotice(`${label} is now ${saved.taxable ? 'taxable' : 'not taxable'}.`);
    },
    onError: (e) => {
      setNotice('');
      setError(hrErrorMessage(e));
    },
  });

  return (
    <div className="hr-sections">
      <p className="hrs-intro">
        Each claim category is either taxable or not. When a run is prepared, taxable claim amounts go to payroll as
        a taxable earning and the others as a non-taxable earning. Nothing is assumed tax-free.
      </p>

      {notice && <div className="uc01-admin-message uc01-admin-message--success" role="status">{notice}</div>}
      {error && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</div>}

      {query.isLoading && <div className="uc01-admin-state">Loading claim categories…</div>}
      {query.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>Claim categories could not be loaded.</strong>
          <span>{hrErrorMessage(query.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => query.refetch()} disabled={query.isFetching}>Try again</button>
        </div>
      )}

      {!query.isLoading && !query.isError && (
        <div className="uc01-admin-table-wrap">
          <table className="uc01-admin-table hr-table hrs-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Type</th>
                <th>Receipt</th>
                <th>Rate</th>
                <th>Taxable</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const pendingHere = toggle.isPending && toggle.variables?.code === c.code;
                return (
                  <tr key={c.code}>
                    <td data-label="Category"><strong>{c.label}</strong><small>{c.code}</small></td>
                    <td data-label="Type"><span>{KIND_LABEL[c.kind] ?? c.kind}</span></td>
                    <td data-label="Receipt"><span>{c.receiptRequired ? 'Required' : 'Not required'}</span></td>
                    <td data-label="Rate">
                      <span>{c.perKm ? (c.ratePerKm && c.ratePerKm > 0 ? `₹${c.ratePerKm} per km` : 'Not set (see Rules)') : '—'}</span>
                    </td>
                    <td data-label="Taxable">
                      <label className="hrs-switch">
                        <input
                          type="checkbox"
                          checked={c.taxable}
                          disabled={toggle.isPending}
                          onChange={(event) => {
                            setNotice('');
                            setError('');
                            toggle.mutate({ code: c.code, taxable: event.target.checked });
                          }}
                        />
                        <span className="hrs-switch__text">
                          {pendingHere ? 'Saving…' : c.taxable ? 'Taxable' : 'Not taxable'}
                        </span>
                      </label>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && <tr><td colSpan={5} className="uc01-admin-empty">There are no claim categories.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
