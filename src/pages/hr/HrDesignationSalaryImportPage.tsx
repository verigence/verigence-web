import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import SectionCard from '../../components/SectionCard';
import { hrErrorMessage } from '../../services/hr/client';
import {
  commitDesignationSalaryImport,
  previewDesignationSalaryImport,
  type DsPreview,
  type DsResult,
} from '../../services/hr/designationSalaryImport';
import { PAYROLL_PERMISSION } from '../../services/hr/payroll';
import { useSessionStore } from '../../store/sessionStore';
import {
  committableRows,
  DS_BATCH_SIZE,
  dsSalaryActionText,
  dsStatusText,
  dsStatusTone,
  summariseDsResults,
} from '../../features/hr/designationSalaryPlan';
import { formatDate } from '../../features/hr/hrLabels';
import { hrKeys, useHrAccess } from '../../features/hr/hrQueries';
import { chunk } from '../../features/hr/importPlan';
import { formatRupees } from '../../features/hr/payroll/money';
import '../../styles/hr-attendance.css';

type Phase = 'choose' | 'checking' | 'preview' | 'importing' | 'done';

export default function HrDesignationSalaryImportPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useHrAccess();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const stopRequested = useRef(false);

  const [phase, setPhase] = useState<Phase>('choose');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<DsPreview | null>(null);
  const [error, setError] = useState('');
  const [results, setResults] = useState<DsResult[]>([]);
  const [stoppedEarly, setStoppedEarly] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!access.canManageEmployees || !access.can(PAYROLL_PERMISSION.salaryPropose)) {
    return (
      <section className="uc01-admin-page" aria-label="Import designation and salary">
        <PageHeader eyebrow="HR" title="Import designation and salary" />
        <div className="uc01-admin-state uc01-admin-state--error">
          <strong>You do not have access to import designations and salaries.</strong>
          <span>It needs permission to manage employees and to propose salaries.</span>
          <Link to="/hr/employees">Back to employees</Link>
        </div>
      </section>
    );
  }
  const canSeeSalaries =
    access.can(PAYROLL_PERMISSION.salaryPropose) || access.can(PAYROLL_PERMISSION.salaryApprove) || access.can(PAYROLL_PERMISSION.payrollRead);

  const reset = () => {
    setPhase('choose');
    setFile(null);
    setPreview(null);
    setResults([]);
    setError('');
    setStoppedEarly(false);
    setProgress({ done: 0, total: 0 });
    stopRequested.current = false;
    if (input.current) input.current.value = '';
  };

  const check = async (chosen: File) => {
    setError('');
    setFile(chosen);
    setPhase('checking');
    try {
      setPreview(await previewDesignationSalaryImport(accessToken!, chosen));
      setPhase('preview');
    } catch (problem) {
      setError(hrErrorMessage(problem));
      setFile(null);
      setPhase('choose');
    }
  };

  const run = async () => {
    if (!file || !preview) return;
    const batches = chunk(committableRows(preview.rows), DS_BATCH_SIZE);
    const total = batches.flat().length;
    stopRequested.current = false;
    setStoppedEarly(false);
    setResults([]);
    setError('');
    setProgress({ done: 0, total });
    setPhase('importing');
    let done = 0;
    for (const batch of batches) {
      if (stopRequested.current) {
        setStoppedEarly(true);
        break;
      }
      try {
        // One attempt per batch. A failure stops the import rather than guessing what was saved.
        const response = await commitDesignationSalaryImport(accessToken!, file, batch);
        setResults((all) => [...all, ...response.results]);
        done += batch.length;
        setProgress({ done, total });
      } catch (problem) {
        setError(`${hrErrorMessage(problem)} The import stopped. Some rows of the last batch may have been saved: choose the file again and check the preview.`);
        setStoppedEarly(true);
        break;
      }
    }
    await queryClient.invalidateQueries({ queryKey: hrKeys.employees });
    setPhase('done');
  };

  const ready = preview ? committableRows(preview.rows).length : 0;
  const summary = summariseDsResults(results, preview?.rows);

  return (
    <section className="uc01-admin-page hr-page" aria-label="Import designation and salary">
      <PageHeader
        eyebrow="HR"
        title="Import designation and salary"
        description="Set designations and propose monthly salaries for many employees from an Excel (.xlsx) sheet. You see a preview first; nothing is saved until you confirm."
        actions={<Link className="uc01-admin-button" to="/hr/employees">All employees</Link>}
      />

      {error && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</div>}

      {(phase === 'choose' || phase === 'checking') && (
        <SectionCard title="1. Choose the sheet" description="The first sheet is read. Columns: Employee ID, Designation, Salary (Monthly), and optionally Date of Joining.">
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hr-visually-hidden"
            aria-label="Designation and salary spreadsheet"
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              if (chosen) void check(chosen);
            }}
          />
          <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={phase === 'checking'} onClick={() => input.current?.click()}>
            {phase === 'checking' ? 'Checking the sheet…' : 'Choose Excel file'}
          </button>
          <p className="hr-muted">A salary is only proposed here. Finance still has to approve it before it counts. Every valid row is imported. A salary from ₹21,001 to ₹24,999 is saved as &ldquo;template pending&rdquo; and waits for HR to create that template; it cannot be approved until then.</p>
          <p className="hr-muted">Salary figures are private. Do not keep this file in shared places.</p>
        </SectionCard>
      )}

      {preview && (phase === 'preview' || phase === 'importing' || phase === 'done') && (
        <>
          <div className="uc01-admin-metrics" aria-label="Sheet summary">
            <div><span>Rows</span><strong>{preview.summary.total}</strong></div>
            <div><span>Ready</span><strong>{preview.summary.ready}</strong></div>
            <div><span>Template pending</span><strong>{preview.summary.templatePending}</strong></div>
            <div><span>No change</span><strong>{preview.summary.noChange}</strong></div>
            <div><span>Need fixing</span><strong>{preview.summary.errors}</strong></div>
          </div>

          {phase === 'preview' && (
            <SectionCard title="2. Confirm">
              {ready === 0 ? (
                <div className="uc01-admin-message uc01-admin-message--info">No row is ready to apply. Fix the sheet and choose it again.</div>
              ) : (
                <p className="hr-muted">Designations are set now. Proposed salaries wait for Finance approval.</p>
              )}
              <div className="hr-actions">
                {ready > 0 && (
                  <button type="button" className="uc01-admin-button uc01-admin-button--primary" onClick={() => void run()}>
                    Apply {ready} {ready === 1 ? 'row' : 'rows'}
                  </button>
                )}
                <button type="button" className="uc01-admin-button" onClick={reset}>Choose a different file</button>
              </div>
            </SectionCard>
          )}

          {phase === 'importing' && (
            <SectionCard title="Applying…">
              <div className="hr-progress" role="status" aria-live="polite">
                <progress max={progress.total} value={progress.done} />
                <span>{progress.done} of {progress.total} done. Please keep this page open.</span>
              </div>
              <button type="button" className="uc01-admin-button uc01-admin-button--compact" onClick={() => { stopRequested.current = true; }}>
                Stop after this batch
              </button>
            </SectionCard>
          )}

          {phase === 'done' && (
            <SectionCard title="Result">
              <p>
                <strong>{summary.applied}</strong> applied
                {summary.failed > 0 && <>, <strong>{summary.failed}</strong> not saved</>}
                {summary.skipped > 0 && <>, <strong>{summary.skipped}</strong> skipped</>}.
                {' '}Designations updated: <strong>{summary.designationsUpdated}</strong>.
              </p>
              <p>
                <strong>{summary.waitingForFinance}</strong> {summary.waitingForFinance === 1 ? 'salary is' : 'salaries are'} waiting for Finance approval.
                {summary.templatePending > 0 && <> <strong>{summary.templatePending}</strong> {summary.templatePending === 1 ? 'is' : 'are'} template pending: Finance can approve {summary.templatePending === 1 ? 'it' : 'them'} once the ₹21,001–₹24,999 template is created.</>}
              </p>
              {stoppedEarly && <div className="uc01-admin-message uc01-admin-message--info">The import did not finish. Choose the file again to continue with the rows not yet saved.</div>}
              <div className="hr-actions">
                {canSeeSalaries && <Link className="uc01-admin-button" to="/hr/payroll/salaries">View salaries</Link>}
                <Link className="uc01-admin-button" to="/hr/employees">View employees</Link>
                <button type="button" className="uc01-admin-button" onClick={reset}>Import another file</button>
              </div>
            </SectionCard>
          )}

          <div className="uc01-admin-table-wrap">
            <table className="uc01-admin-table hr-table">
              <thead>
                <tr><th>Row</th><th>Employee</th><th>New designation</th><th>Salary</th><th>Status</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => {
                  const result = results.find((x) => x.row === r.row);
                  const shown = result ? result.status : r.status;
                  const lines = result ? (result.error ? [result.error] : []) : [...r.errors, ...r.notes];
                  return (
                    <tr key={r.row}>
                      <td data-label="Row"><span>{r.row}</span></td>
                      <td data-label="Employee">
                        <span className="hr-daily-cell"><strong>{r.fullName || '—'}</strong><small>{r.employeeCode || 'No ID'}</small></span>
                      </td>
                      <td data-label="New designation"><span>{r.designation ?? <span className="hr-muted">Unchanged</span>}</span></td>
                      <td data-label="Salary">
                        {r.salaryAction ? (
                          <span className="hr-daily-cell">
                            {r.salary !== null && <strong>{formatRupees(r.salary)} a month</strong>}
                            <small>
                              {dsSalaryActionText[r.salaryAction]}
                              {r.effectiveFrom && r.salaryAction === 'PROPOSE' ? ` from ${formatDate(r.effectiveFrom)}` : ''}
                            </small>
                            {r.templatePending && <span className="hr-flag">Saves as template pending</span>}
                          </span>
                        ) : <span className="hr-muted">—</span>}
                      </td>
                      <td data-label="Status"><span className={`uc01-admin-status uc01-admin-status--${dsStatusTone[shown]}`}>{dsStatusText[shown]}</span></td>
                      <td data-label="Notes">
                        {lines.length === 0 ? <span className="hr-muted">—</span> : (
                          <ul className="hr-notes">{lines.map((line) => <li key={line}>{line}</li>)}</ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
