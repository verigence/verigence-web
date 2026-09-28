import { useRef, useState } from 'react';

import {
  applyOnboardingImport,
  downloadOnboardingWorkbook,
  uploadOnboardingWorkbook,
  type OnboardingAction,
  type OnboardingImport,
  type OnboardingResultRow,
} from '../../services/audit-core/projectOnboardingWorkbook';
import { auditCoreErrorMessage } from '../../services/audit-core/errorMessage';

type Tab = 'projects' | 'dealers' | 'outlets';

const ACTION_LABEL: Record<OnboardingAction, string> = {
  CREATE: 'New', UPDATE: 'Update', UNCHANGED: 'No change', ERROR: 'Error',
};
const FIELD_LABEL: Record<string, string> = {
  name: 'Name', endDate: 'End Date', timezone: 'Timezone', code: 'Code', dealerName: 'Dealership',
  dealerCode: 'Dealer Code', outletCode: 'Code', outletName: 'Outlet Name', addressText: 'Location',
  stateRegion: 'State', city: 'City', postalCode: 'Postal Code', outletClassification: 'PC Presence',
  monthlyVehicleVolume: 'Monthly Car Sales Volume', latitude: 'Latitude', longitude: 'Longitude', active: 'Active',
};

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (value === 'ONSITE') return 'Onsite';
  if (value === 'SATELLITE') return 'Satellite';
  return String(value);
}

function Changes({ changes }: { changes: Record<string, [unknown, unknown]> }) {
  const entries = Object.entries(changes);
  if (!entries.length) return null;
  return (
    <ul className="uc02-onboarding__changes">
      {entries.map(([field, [before, after]]) => (
        <li key={field}><span>{FIELD_LABEL[field] ?? field}</span> {show(before)} → <strong>{show(after)}</strong></li>
      ))}
    </ul>
  );
}

function ActionChip({ action }: { action: OnboardingAction }) {
  return <span className={`uc02-onboarding__chip is-${action.toLowerCase()}`}>{ACTION_LABEL[action]}</span>;
}

function count(values: Partial<Record<OnboardingAction, number>>, action: OnboardingAction) {
  return values[action] ?? 0;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Excel onboarding of Projects, Dealers and Outlets (SuperAdmin): download
 * the template or the current data, edit it, upload it, review the
 * preview, apply. Nothing changes until Apply.
 */
export default function OnboardingWorkbookPanel({ accessToken, onApplied }: {
  accessToken?: string;
  onApplied: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'template' | 'export' | 'upload' | 'apply' | null>(null);
  const [error, setError] = useState('');
  const [upload, setUpload] = useState<OnboardingImport | null>(null);
  const [tab, setTab] = useState<Tab>('projects');
  const [onlyChanges, setOnlyChanges] = useState(true);

  async function download(withData: boolean) {
    setError('');
    setBusy(withData ? 'export' : 'template');
    try {
      const blob = await downloadOnboardingWorkbook(withData, accessToken);
      const today = new Date().toISOString().slice(0, 10);
      saveBlob(blob, withData ? `verigence-onboarding-${today}.xlsx` : 'verigence-onboarding-template.xlsx');
    } catch (cause) {
      setError(auditCoreErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    setError('');
    setBusy('upload');
    try {
      const result = await uploadOnboardingWorkbook(file, accessToken);
      setUpload(result);
      const firstWithErrors = (['projects', 'outlets'] as const)
        .find((key) => result.plan[key].some((row) => row.action === 'ERROR'));
      setTab(firstWithErrors ?? (result.plan.projects.length ? 'projects' : 'outlets'));
    } catch (cause) {
      setError(auditCoreErrorMessage(cause));
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function apply() {
    if (!upload) return;
    if (!window.confirm('Apply these changes? New Projects are set up in Security, Audit Core and DI.')) return;
    setError('');
    setBusy('apply');
    try {
      setUpload(await applyOnboardingImport(upload.importId, accessToken));
      onApplied();
    } catch (cause) {
      setError(auditCoreErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  const plan = upload?.plan;
  const summary = plan?.summary;
  const changes = summary
    ? (['projects', 'dealers', 'outlets'] as const).reduce(
      (total, key) => total + count(summary[key], 'CREATE') + count(summary[key], 'UPDATE'), 0)
    : 0;
  const applied = upload?.status === 'APPLIED' || upload?.status === 'APPLIED_WITH_ERRORS';
  const resultFor = (kind: 'projects' | 'outlets', row: number): OnboardingResultRow | undefined =>
    upload?.result?.[kind].find((item) => item.row === row);
  const keep = <T extends { action: OnboardingAction }>(rows: T[]) =>
    (onlyChanges ? rows.filter((row) => row.action !== 'UNCHANGED') : rows);

  return (
    <section className="uc02-card uc02-onboarding" aria-label="Excel onboarding">
      <div className="uc02-list-toolbar">
        <div className="uc02-card__title">
          <h3>Excel onboarding — Projects, Dealers and Outlets</h3>
          <p>Download the template or the current data, edit it in Excel, upload it, check the preview, then apply. Nothing changes until you apply.</p>
        </div>
        <div className="uc02-row-actions">
          <button className="uc02-button" type="button" disabled={busy !== null} onClick={() => void download(false)}>
            {busy === 'template' ? 'Preparing…' : 'Download template'}
          </button>
          <button className="uc02-button" type="button" disabled={busy !== null} onClick={() => void download(true)}>
            {busy === 'export' ? 'Preparing…' : 'Download current data'}
          </button>
          <button className="uc02-button uc02-button--primary" type="button" disabled={busy !== null}
            onClick={() => fileInput.current?.click()}>
            {busy === 'upload' ? 'Checking…' : 'Upload workbook'}
          </button>
          <input ref={fileInput} type="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => void chooseFile(event.target.files?.[0])} />
        </div>
      </div>

      {/* Its own alert: the admin screens' generic error box hides the text,
          and an upload's errors are the user's to fix. */}
      {error ? <div className="uc02-onboarding__alert" role="alert"><strong>Could not complete</strong><span>{error}</span></div> : null}

      {upload && plan && summary ? (
        <div className="uc02-onboarding__body">
          <div className={`uc02-readiness-banner ${summary.errors ? 'blocked' : 'ready'}`} role="status">
            <strong>
              {applied ? (upload.status === 'APPLIED' ? 'Applied' : 'Applied with errors')
                : summary.errors ? `${summary.errors} row${summary.errors === 1 ? '' : 's'} to fix`
                  : changes ? 'Ready to apply' : 'Nothing to change'}
            </strong>
            <span>{upload.filename}</span>
          </div>
          {!applied ? (
            <div className="uc02-actions uc02-onboarding__actions">
              <button className="uc02-button" type="button" onClick={() => setUpload(null)} disabled={busy !== null}>Discard</button>
              <button className="uc02-button uc02-button--primary" type="button" onClick={() => void apply()}
                disabled={busy !== null || summary.errors > 0 || upload.status !== 'PREVIEW_READY' || changes === 0}
                title={summary.errors ? 'Fix the errors in the workbook and upload it again.' : undefined}>
                {busy === 'apply' ? 'Applying…' : `Apply ${changes} change${changes === 1 ? '' : 's'}`}
              </button>
            </div>
          ) : null}
          {plan.fileErrors.length ? <ul className="uc02-onboarding__messages">{plan.fileErrors.map((m) => <li key={m}>{m}</li>)}</ul> : null}

          <div className="uc02-import-summary uc02-onboarding__summary">
            {(['projects', 'dealers', 'outlets'] as const).map((key) => (
              <div key={key}>
                <span>{key}</span>
                <strong>{count(summary[key], 'CREATE')} new · {count(summary[key], 'UPDATE')} update</strong>
                <small>{count(summary[key], 'UNCHANGED')} unchanged{count(summary[key], 'ERROR') ? ` · ${count(summary[key], 'ERROR')} error` : ''}</small>
              </div>
            ))}
          </div>

          <div className="uc02-onboarding__tabs" role="tablist">
            {(['projects', 'dealers', 'outlets'] as const).map((key) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''}
                onClick={() => setTab(key)}>
                {key === 'projects' ? 'Projects' : key === 'dealers' ? 'Dealers' : 'Outlets'} <b>{plan[key].length}</b>
              </button>
            ))}
            <label className="uc02-onboarding__filter">
              <input type="checkbox" checked={onlyChanges} onChange={(event) => setOnlyChanges(event.target.checked)} /> Only changes and errors
            </label>
          </div>

          <div className="uc02-table-wrap uc02-onboarding__table">
            {tab === 'projects' ? (
              <table className="uc02-table">
                <thead><tr><th>Row</th><th>Code</th><th>Project</th><th>OEM</th><th>Active</th><th>Status</th><th>Details</th></tr></thead>
                <tbody>
                  {keep(plan.projects).map((row) => {
                    const result = resultFor('projects', row.row);
                    return (
                      <tr key={row.row} className={row.action === 'ERROR' ? 'is-error' : ''}>
                        <td>{row.row}</td><td><code>{row.code ?? '—'}</code></td><td>{row.name ?? '—'}</td>
                        <td>{row.oemCode ?? '—'}</td><td>{row.active ? 'Yes' : 'No'}</td>
                        <td><ActionChip action={row.action} /></td>
                        <td>
                          <Changes changes={row.changes} />
                          {row.messages.map((m) => <div key={m} className="uc02-onboarding__error">{m}</div>)}
                          {row.warnings?.map((m) => <div key={m} className="uc02-onboarding__warning">{m}</div>)}
                          {!applied && row.activate && row.action !== 'ERROR' ? <div className="uc02-onboarding__note">Will be activated once its readiness checks pass.</div> : null}
                          {result ? <div className={result.status === 'FAILED' ? 'uc02-onboarding__error' : 'uc02-onboarding__note'}>
                            {result.status === 'FAILED' ? result.message : result.active ? 'Saved · Active' : (result.message ?? 'Saved')}
                          </div> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : tab === 'dealers' ? (
              <table className="uc02-table">
                <thead><tr><th>Project</th><th>Dealer Code</th><th>Dealership</th><th>Outlet rows</th><th>Status</th><th>Details</th></tr></thead>
                <tbody>
                  {keep(plan.dealers).map((row) => (
                    <tr key={`${row.projectCode}-${row.dealerCode}`}>
                      <td><code>{row.projectCode ?? '—'}</code></td><td><code>{row.dealerCode}</code></td><td>{row.dealerName}</td>
                      <td>{row.rows.join(', ')}</td><td><ActionChip action={row.action} /></td><td><Changes changes={row.changes} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="uc02-table">
                <thead><tr><th>Row</th><th>Code</th><th>Outlet</th><th>Dealer</th><th>City</th><th>PC Presence</th><th>Monthly sales</th><th>Status</th><th>Details</th></tr></thead>
                <tbody>
                  {keep(plan.outlets).map((row) => {
                    const result = resultFor('outlets', row.row);
                    return (
                      <tr key={row.row} className={row.action === 'ERROR' ? 'is-error' : ''}>
                        <td>{row.row}</td><td><code>{row.outletCode ?? '—'}</code></td><td>{row.outletName ?? '—'}</td>
                        <td>{row.dealerName ?? '—'} <small>{row.dealerCode}</small></td><td>{row.city ?? '—'}</td>
                        <td>{show(row.outletClassification)}</td><td>{show(row.monthlyVehicleVolume)}</td>
                        <td><ActionChip action={row.action} /></td>
                        <td>
                          <Changes changes={row.changes} />
                          {row.messages.map((m) => <div key={m} className="uc02-onboarding__error">{m}</div>)}
                          {result?.status === 'FAILED' ? <div className="uc02-onboarding__error">{result.message}</div> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

        </div>
      ) : null}
    </section>
  );
}
