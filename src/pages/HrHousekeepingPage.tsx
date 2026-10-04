import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import PageHeader from '../components/PageHeader';
import SectionCard from '../components/SectionCard';
import { currentMonthIst, formatWorkDate, todayIst } from '../features/hr/attendance/attendanceFormat';
import {
  KIND_LABEL,
  deletableTotal,
  describeCounts,
  periodRange,
  type PeriodMode,
} from '../features/hr/housekeeping/housekeepingLogic';
import { hrErrorMessage } from '../services/hr/client';
import {
  previewHousekeeping,
  purgeHousekeeping,
  type HousekeepingKind,
  type HousekeepingPreview,
} from '../services/hr/housekeeping';
import { useSessionStore } from '../store/sessionStore';
import '../styles/hr-attendance.css';

/** SuperAdmin: clear old HR attendance, leave or reimbursement records for a day or a month. */
export default function HrHousekeepingPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const today = todayIst();
  const [kind, setKind] = useState<HousekeepingKind>('ATTENDANCE');
  const [mode, setMode] = useState<PeriodMode>('MONTH');
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(currentMonthIst());
  const [seen, setSeen] = useState<HousekeepingPreview | null>(null);
  const [typed, setTyped] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const range = periodRange(mode, mode === 'DAY' ? day : month, today);
  const scope = range ? { kind, from_date: range.from, to_date: range.to } : null;
  const periodText = range ? (range.from === range.to ? formatWorkDate(range.from) : `${formatWorkDate(range.from)} to ${formatWorkDate(range.to)}`) : '';

  const reset = () => { setSeen(null); setTyped(''); };
  const check = useMutation({
    mutationFn: () => previewHousekeeping(accessToken!, scope!),
    onSuccess: (result) => { setSeen(result); setTyped(''); setNotice(null); },
    onError: (error) => { setSeen(null); setNotice({ ok: false, text: hrErrorMessage(error) }); },
  });
  const purge = useMutation({
    mutationFn: () => purgeHousekeeping(accessToken!, scope!),
    onSuccess: (result) => {
      setSeen(null);
      setTyped('');
      const left = result.filesNotRemoved ?? 0;
      setNotice({
        ok: true,
        text: `Deleted ${describeCounts(result.counts) || 'the records'}.${left ? ` ${left} stored file${left === 1 ? '' : 's'} could not be removed and stay in storage.` : ''}`,
      });
    },
    onError: (error) => { setSeen(null); setNotice({ ok: false, text: hrErrorMessage(error) }); },
  });
  const busy = check.isPending || purge.isPending;
  const total = seen ? deletableTotal(seen.counts) : 0;
  const canDelete = Boolean(seen && !seen.blockedBy && total > 0 && typed === 'DELETE' && !busy);

  return (
    <section className="uc01-admin-page hr-page" aria-label="HR housekeeping">
      <PageHeader
        eyebrow="Administration"
        title="HR housekeeping"
        description="Clear old attendance, leave or reimbursement records for a day or a month. You see what will go first, and the delete needs you to type DELETE. A month that a payroll has already used cannot be cleared."
      />
      {notice && <div className={`uc01-admin-message uc01-admin-message--${notice.ok ? 'success' : 'error'}`} role={notice.ok ? 'status' : 'alert'}>{notice.text}</div>}

      <SectionCard title="What to clear">
        <div className="hr-form">
          <div className="hr-form-grid">
            <label className="hr-field"><span className="hr-pay-label">Records</span>
              <select value={kind} disabled={busy} onChange={(e) => { setKind(e.target.value as HousekeepingKind); reset(); }}>
                {(Object.keys(KIND_LABEL) as HousekeepingKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </label>
            <label className="hr-field"><span className="hr-pay-label">For</span>
              <select value={mode} disabled={busy} onChange={(e) => { setMode(e.target.value as PeriodMode); reset(); }}>
                <option value="MONTH">A month</option>
                <option value="DAY">A day</option>
              </select>
            </label>
            {mode === 'DAY' ? (
              <label className="hr-field"><span className="hr-pay-label">Day</span>
                <input type="date" value={day} max={today} disabled={busy} onChange={(e) => { setDay(e.target.value); reset(); }} />
              </label>
            ) : (
              <label className="hr-field"><span className="hr-pay-label">Month</span>
                <input type="month" value={month} max={currentMonthIst()} disabled={busy} onChange={(e) => { setMonth(e.target.value); reset(); }} />
              </label>
            )}
          </div>
          <div className="hr-actions">
            <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={!scope || busy} onClick={() => check.mutate()}>
              {check.isPending ? 'Checking…' : 'Show what would be deleted'}
            </button>
          </div>
        </div>
      </SectionCard>

      {seen && (
        <SectionCard title={`${KIND_LABEL[seen.kind]}, ${periodText}`}>
          {seen.blockedBy ? (
            <div className="uc01-admin-message uc01-admin-message--error" role="alert">{seen.blockedBy}</div>
          ) : total === 0 ? (
            <div className="uc01-admin-state">Nothing to delete for this period.</div>
          ) : (
            <>
              <p>This will permanently delete {describeCounts(seen.counts)}.{seen.kind === 'LEAVE' ? ' Leave balances go back to what they would be had these leaves never been taken.' : ''} It cannot be undone.</p>
              <div className="hr-form">
                <label className="hr-field"><span className="hr-pay-label">Type DELETE to confirm</span>
                  <input value={typed} disabled={busy} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
                </label>
                <div className="hr-actions">
                  <button type="button" className="uc01-admin-button uc01-admin-button--danger-primary" disabled={!canDelete} onClick={() => purge.mutate()}>
                    {purge.isPending ? 'Deleting…' : 'Delete these records'}
                  </button>
                </div>
              </div>
            </>
          )}
        </SectionCard>
      )}
    </section>
  );
}
