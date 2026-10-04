import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import SectionCard from '../../components/SectionCard';
import { hrErrorMessage } from '../../services/hr/client';
import {
  commitEmployeeImport,
  previewEmployeeImport,
  type ImportPreview,
  type ImportResult,
} from '../../services/hr/employees';
import { useSessionStore } from '../../store/sessionStore';
import { loginProblem } from '../../features/hr/hrLabels';
import { hrKeys, useHrAccess } from '../../features/hr/hrQueries';
import {
  chunk,
  credentialsText,
  IMPORT_BATCH_SIZE,
  readyRowNumbers,
  summariseResults,
} from '../../features/hr/importPlan';

type Phase = 'choose' | 'checking' | 'preview' | 'importing' | 'done';

const statusClass: Record<string, string> = {
  READY: 'active',
  CREATED: 'active',
  EXISTS: 'rejected',
  SKIPPED: 'rejected',
  ERROR: 'suspended',
  FAILED: 'suspended',
};
const statusText: Record<string, string> = {
  READY: 'Ready',
  CREATED: 'Created',
  EXISTS: 'Already exists',
  SKIPPED: 'Skipped',
  ERROR: 'Needs fixing',
  FAILED: 'Not saved',
};

export default function HrEmployeeImportPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useHrAccess();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const stopRequested = useRef(false);

  const [phase, setPhase] = useState<Phase>('choose');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [createLogin, setCreateLogin] = useState(true);
  const [error, setError] = useState('');
  const [results, setResults] = useState<ImportResult[]>([]);
  const [stoppedEarly, setStoppedEarly] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  if (access.loading) return <div className="uc01-admin-state">Loading…</div>;
  if (!access.canManageEmployees) {
    return (
      <section className="uc01-admin-page" aria-label="Import employees">
        <PageHeader eyebrow="HR" title="Import employees" />
        <div className="uc01-admin-state uc01-admin-state--error">
          <strong>You do not have access to import employees.</strong>
          <Link to="/hr/employees">Back to employees</Link>
        </div>
      </section>
    );
  }

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
      setPreview(await previewEmployeeImport(accessToken!, chosen));
      setPhase('preview');
    } catch (problem) {
      setError(hrErrorMessage(problem));
      setFile(null);
      setPhase('choose');
    }
  };

  const run = async () => {
    if (!file || !preview) return;
    const batches = chunk(readyRowNumbers(preview.rows), IMPORT_BATCH_SIZE);
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
        const response = await commitEmployeeImport(accessToken!, file, batch, createLogin);
        setResults((all) => [...all, ...response.results]);
        done += batch.length;
        setProgress({ done, total });
      } catch (problem) {
        setError(
          `${hrErrorMessage(problem)} The import stopped. Some rows of the last batch may have been saved: choose the file again and check it; saved employees show as "Already exists".`,
        );
        setStoppedEarly(true);
        break;
      }
    }
    await queryClient.invalidateQueries({ queryKey: hrKeys.employees });
    setPhase('done');
  };

  const download = () => {
    const blob = new Blob([credentialsText(results)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'employee-login-details.txt';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const summary = summariseResults(results);
  const withPasswords = results.filter((r) => r.initialPassword).length;

  return (
    <section className="uc01-admin-page hr-page" aria-label="Import employees">
      <PageHeader
        eyebrow="HR"
        title="Import employees"
        description="Add many employees from an Excel (.xlsx) sheet. You see a preview first; nothing is saved until you confirm."
        actions={<Link className="uc01-admin-button" to="/hr/employees">All employees</Link>}
      />

      {error && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{error}</div>}

      {(phase === 'choose' || phase === 'checking') && (
        <SectionCard title="1. Choose the sheet" description="The first sheet is read. It needs columns for Employee ID, Employee Name and Personal Email; DOB, Gender, Contact Number, Qualification, Department, PAN, Aadhaar and Address are used when present.">
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hr-visually-hidden"
            aria-label="Employee spreadsheet"
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              if (chosen) void check(chosen);
            }}
          />
          <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={phase === 'checking'} onClick={() => input.current?.click()}>
            {phase === 'checking' ? 'Checking the sheet…' : 'Choose Excel file'}
          </button>
          <p className="hr-muted">Do not keep this file in shared places: it holds PAN and Aadhaar numbers.</p>
        </SectionCard>
      )}

      {preview && (phase === 'preview' || phase === 'importing' || phase === 'done') && (
        <>
          <div className="uc01-admin-metrics" aria-label="Sheet summary">
            <div><span>Rows</span><strong>{preview.summary.total}</strong></div>
            <div><span>Ready</span><strong>{preview.summary.ready}</strong></div>
            <div><span>Already exist</span><strong>{preview.summary.exists}</strong></div>
            <div><span>Need fixing</span><strong>{preview.summary.errors}</strong></div>
          </div>

          {phase === 'preview' && (
            <SectionCard title="2. Confirm">
              <label className="hr-check">
                <input type="checkbox" checked={createLogin} onChange={(e) => setCreateLogin(e.target.checked)} />
                <span>
                  Create a Verigence login for each employee
                  <small>A login needs a valid mobile number. Employees without one are still saved, and you can create their login later. Passwords are shown once, after the import.</small>
                </span>
              </label>
              {preview.summary.ready === 0 ? (
                <div className="uc01-admin-message uc01-admin-message--info">No row is ready to import. Fix the sheet and choose it again.</div>
              ) : (
                <div className="hr-actions">
                  <button type="button" className="uc01-admin-button uc01-admin-button--primary" onClick={() => void run()}>
                    Import {preview.summary.ready} {preview.summary.ready === 1 ? 'employee' : 'employees'}
                  </button>
                  <button type="button" className="uc01-admin-button" onClick={reset}>Choose a different file</button>
                </div>
              )}
              {preview.summary.ready === 0 && <div className="hr-actions"><button type="button" className="uc01-admin-button" onClick={reset}>Choose a different file</button></div>}
            </SectionCard>
          )}

          {phase === 'importing' && (
            <SectionCard title="Importing…">
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
                <strong>{summary.created}</strong> created
                {summary.failed > 0 && <>, <strong>{summary.failed}</strong> not saved</>}
                {summary.skipped > 0 && <>, <strong>{summary.skipped}</strong> skipped</>}.
                {' '}Logins created: <strong>{summary.loginsCreated}</strong>
                {summary.loginsPending > 0 && <>, pending: <strong>{summary.loginsPending}</strong> (create them from each employee page)</>}.
              </p>
              {stoppedEarly && <div className="uc01-admin-message uc01-admin-message--info">The import did not finish. Choose the file again to continue with the rows not yet saved.</div>}
              {withPasswords > 0 && (
                <div className="hr-credential">
                  <div className="uc01-admin-message uc01-admin-message--info">
                    The initial passwords are shown only now and are not stored. Download them and share them securely; delete the download afterwards.
                  </div>
                  <button type="button" className="uc01-admin-button uc01-admin-button--primary" onClick={download}>Download login details (.txt)</button>
                </div>
              )}
              <div className="hr-actions">
                <Link className="uc01-admin-button" to="/hr/employees">View employees</Link>
                <button type="button" className="uc01-admin-button" onClick={reset}>Import another file</button>
              </div>
            </SectionCard>
          )}

          <div className="uc01-admin-table-wrap">
            <table className="uc01-admin-table hr-table">
              <thead>
                <tr><th>Row</th><th>Employee</th><th>Mobile</th><th>Status</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => {
                  const result = results.find((x) => x.row === r.row);
                  const shown = result ? result.status : r.status;
                  const lines = result
                    ? [
                        ...(result.error ? [result.error] : []),
                        ...(result.status === 'CREATED' && result.loginStatus === 'FAILED' ? [loginProblem(result.loginErrorCode ?? null)] : []),
                        ...(result.status === 'CREATED' && result.loginStatus === 'CREATED' ? ['Login created.'] : []),
                        ...(result.status === 'CREATED' && result.loginStatus === 'NOT_CREATED' ? ['Login not requested.'] : []),
                      ]
                    : [...r.errors, ...r.notes];
                  return (
                    <tr key={r.row}>
                      <td data-label="Row"><span>{r.row}</span></td>
                      <td data-label="Employee">
                        <strong>{r.fullName || '—'}</strong>
                        <small>{r.employeeCode || 'No ID'}{r.personalEmail ? ` · ${r.personalEmail}` : ''}</small>
                      </td>
                      <td data-label="Mobile"><span>{r.mobile ?? '—'}</span></td>
                      <td data-label="Status"><span className={`uc01-admin-status uc01-admin-status--${statusClass[shown]}`}>{statusText[shown]}</span></td>
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
