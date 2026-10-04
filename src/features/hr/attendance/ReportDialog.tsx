import { useState } from 'react';

import { fetchAttendanceReport } from '../../../services/hr/attendanceReports';
import { hrErrorMessage } from '../../../services/hr/client';
import { useSessionStore } from '../../../store/sessionStore';
import Field from '../Field';
import { downloadPdf } from '../payroll/pdf';
import DialogShell from './DialogShell';
import { todayIst } from './attendanceFormat';
import { REPORT_MAX_DAYS, reportFileName, validateReportRange } from './dailyAttendance';

interface Props {
  /** The day on screen; the report starts as that one day. */
  date: string;
  projects: Array<{ code: string; name: string }>;
  onClose: () => void;
}

/** Choose a range (up to 31 days, none in the future) and an optional project, then download the Excel file. */
export default function ReportDialog({ date, projects, onClose }: Props) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const today = todayIst();
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [project, setProject] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const rangeProblem = validateReportRange(from, to, today);

  const download = async () => {
    if (rangeProblem) return;
    setBusy(true);
    setProblem('');
    try {
      // The helper only saves a fetched blob as a file; it is the same one the payslip PDFs use.
      await downloadPdf(() => fetchAttendanceReport(accessToken!, from, to, project || undefined), reportFileName(from, to, project || undefined));
      onClose();
    } catch (error) {
      setProblem(hrErrorMessage(error));
      setBusy(false);
    }
  };

  return (
    <DialogShell title="Download attendance report" eyebrow="Daily attendance" onClose={onClose} locked={busy}>
      <p>An Excel file with one row for each person, project and day. Up to {REPORT_MAX_DAYS} days.</p>
      <div className="hr-form-grid">
        <Field label="From" htmlFor="att-report-from" required>
          <input id="att-report-from" type="date" max={today} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="att-report-to" required>
          <input id="att-report-to" type="date" max={today} min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Project" htmlFor="att-report-project" wide>
          <select id="att-report-project" value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </Field>
      </div>
      {rangeProblem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{rangeProblem}</div>}
      {problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem}</div>}
      <div className="uc01-admin-dialog__actions">
        <button type="button" className="uc01-admin-button" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={busy || Boolean(rangeProblem)} onClick={() => void download()}>
          {busy ? 'Preparing…' : 'Download Excel'}
        </button>
      </div>
    </DialogShell>
  );
}
