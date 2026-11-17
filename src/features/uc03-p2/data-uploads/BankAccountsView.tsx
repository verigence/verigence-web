import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import {
  getBankAccountRegister,
  listBankAccounts,
  rupees,
  type BankAccount,
} from '../../../services/audit-core/uc03BankStatements';
import { monthLabel } from '../../../services/audit-core/uc03ProjectTracker';

/**
 * Each bank account's running record (product owner 17 Nov 2026): statements come daily or twice a
 * week and overlap; every transaction is kept once, with the upload that first loaded it, and the
 * days covered, the days missing and whether the balance continues between uploads.
 */

function day(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(`${value}T00:00:00`));
}

function days(list: string[]): string {
  return list.map(day).join(', ');
}

function Coverage({ a }: { a: BankAccount }) {
  const c = a.coverage;
  return (
    <>
      {c.from ? `${day(c.from)} – ${day(c.to)}` : '—'}
      <br />
      {c.missing.length ? <span className="p2du-tag p2du-tag--bad" title={days(c.missing)}>{c.missing.length} day{c.missing.length === 1 ? '' : 's'} missing</span> : null}
      {c.notYetLoaded ? <> <span className="p2du-tag p2du-tag--warn">not loaded since {day(c.notYetLoaded.from)}</span></> : null}
      {!c.missing.length && !c.notYetLoaded ? <small className="p2w-muted">no day missing</small> : null}
    </>
  );
}

export default function BankAccountsView({ tenantId, accessToken, month, dealerId, enabled }: {
  tenantId?: string;
  accessToken?: string;
  month: string;
  dealerId?: string;
  enabled: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const accounts = useQuery({
    queryKey: ['bank-accounts', tenantId, month, dealerId],
    queryFn: () => listBankAccounts(tenantId!, month, accessToken, dealerId || undefined),
    enabled,
  });
  const register = useQuery({
    queryKey: ['bank-account-register', tenantId, month, open],
    queryFn: () => getBankAccountRegister(tenantId!, open!, month, accessToken),
    enabled: enabled && Boolean(open),
  });
  const items = accounts.data?.items ?? [];
  return (
    <div className="p2du-scroll">
      {accounts.isLoading ? <p className="p2w-muted">Loading…</p> : null}
      {accounts.isError ? <p className="p2w-empty">{accounts.error instanceof Error ? accounts.error.message : 'Not available.'}</p> : null}
      {accounts.data && !items.length ? <p className="p2w-empty">No account statement loaded for {monthLabel(month)} yet.</p> : null}
      {items.length ? (
        <>
          <p className="p2w-muted">
            Each account's transactions of {monthLabel(month)} over all its uploads, each once. Uploads that follow one another
            must continue the balance; a break means transactions are missing between them.
          </p>
          <table className="p2du-table p2du-table--stack">
            <thead>
              <tr>
                <th>Account</th><th>Dealership</th><th className="num">Uploads</th><th>Days covered</th>
                <th className="num">Credits</th><th className="num">Debits</th><th className="num">No receipt</th><th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.account} className={`is-clickable${open === a.account ? ' is-selected' : ''}`}
                  onClick={() => setOpen(open === a.account ? null : a.account)}>
                  <td data-label="Account">{a.bankName ?? 'Bank'}<br /><small className="p2w-muted">{a.accountNumber ?? '—'}</small></td>
                  <td data-label="Dealership">{a.dealerName}<br /><small className="p2w-muted">{a.outletName ?? 'All outlets'}</small></td>
                  <td data-label="Uploads" className="num">{a.uploads}</td>
                  <td data-label="Days covered"><Coverage a={a} /></td>
                  <td data-label="Credits" className="num">{a.credits}<br /><small className="p2w-muted">{rupees(a.creditTotal)}</small></td>
                  <td data-label="Debits" className="num">{a.debits}<br /><small className="p2w-muted">{rupees(a.debitTotal)}</small></td>
                  <td data-label="No receipt" className="num">{a.creditsNoReceipt ? <span className="p2du-tag p2du-tag--warn">{a.creditsNoReceipt}</span> : 0}</td>
                  <td data-label="Balance">
                    {a.balanceBreaks.length
                      ? <span className="p2du-tag p2du-tag--bad" title={a.balanceBreaks.map((b) => `after ${day(b.after)}: closing ${rupees(b.closing)}, next opening ${rupees(b.nextOpening)}`).join('\n')}>
                        {a.balanceBreaks.length} break{a.balanceBreaks.length === 1 ? '' : 's'}</span>
                      : <span className="p2du-tag p2du-tag--ok">Continues</span>}
                    <br /><small className="p2w-muted">{a.openingBalance ? rupees(a.openingBalance) : '—'} → {a.closingBalance ? rupees(a.closingBalance) : '—'}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      {open ? (
        <div className="p2du-panel">
          {register.isLoading ? <p className="p2w-muted">Loading…</p> : null}
          {register.isError ? <p className="p2w-empty">{register.error instanceof Error ? register.error.message : 'Not available.'}</p> : null}
          {register.data ? (
            <>
              <header>
                <h4>{register.data.bankName ?? 'Bank'} {register.data.accountNumber ?? ''} · {register.data.transactions} transactions</h4>
                {register.data.coverage.missing.length ? <p className="p2w-muted">Missing: {days(register.data.coverage.missing)}</p> : null}
              </header>
              <table className="p2du-table p2du-table--stack">
                <thead>
                  <tr><th>Date</th><th>Narration</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th><th>Result</th><th>Loaded from</th></tr>
                </thead>
                <tbody>
                  {register.data.rows.map((r, i) => (
                    <tr key={i}>
                      <td data-label="Date">{day(r.date)}</td>
                      <td data-label="Narration">{r.narration}{r.reference ? <><br /><small className="p2w-muted">{r.reference}</small></> : null}</td>
                      <td data-label="Debit" className="num">{r.debit ? rupees(r.debit) : ''}</td>
                      <td data-label="Credit" className="num">{r.credit ? rupees(r.credit) : ''}</td>
                      <td data-label="Balance" className="num">{r.balance ? rupees(r.balance) : ''}</td>
                      <td data-label="Result">
                        {r.journeyId
                          ? <><Link className="p2w-link" to={`/p2/journeys/${r.journeyId}/overview`}>{r.journeyReference}</Link>{r.basisLabel ? <><br /><small className="p2w-muted">on {r.basisLabel}</small></> : null}</>
                          : r.result ?? ''}
                      </td>
                      <td data-label="Loaded from"><small className="p2w-muted">{r.loadedFrom}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
