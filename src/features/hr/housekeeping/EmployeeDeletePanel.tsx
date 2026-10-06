import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { hrErrorMessage } from '../../../services/hr/client';
import {
  deleteEmployeeForGood,
  previewEmployeeDelete,
  type EmployeeDeletePreview,
} from '../../../services/hr/housekeeping';
import { statusLabels } from '../hrLabels';
import { cleanEmployeeCode, describeEmployeeCounts } from './housekeepingLogic';

/** SuperAdmin: delete one employee and all their records for good (for people added only to test). */
export default function EmployeeDeletePanel({ accessToken }: { accessToken: string }) {
  const [code, setCode] = useState('');
  const [seen, setSeen] = useState<EmployeeDeletePreview | null>(null);
  const [typed, setTyped] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const check = useMutation({
    mutationFn: () => previewEmployeeDelete(accessToken, cleanEmployeeCode(code)),
    onSuccess: (result) => { setSeen(result); setTyped(''); setNotice(null); },
    onError: (error) => { setSeen(null); setNotice({ ok: false, text: hrErrorMessage(error) }); },
  });
  const remove = useMutation({
    mutationFn: () => deleteEmployeeForGood(accessToken, seen!.employeeCode),
    onSuccess: (result) => {
      const left = result.filesNotRemoved ?? 0;
      setNotice({
        ok: true,
        text: `Deleted ${result.fullName} (${result.employeeCode}).${left ? ` ${left} stored file${left === 1 ? '' : 's'} could not be removed and stay in storage.` : ''}${result.note ? ` ${result.note}` : ''}`,
      });
      setSeen(null);
      setTyped('');
      setCode('');
    },
    onError: (error) => { setSeen(null); setNotice({ ok: false, text: hrErrorMessage(error) }); },
  });
  const busy = check.isPending || remove.isPending;
  const canDelete = Boolean(seen && !seen.blockedBy && typed === 'DELETE' && !busy);
  const what = seen ? describeEmployeeCounts(seen.counts) : '';

  return (
    <SectionCard title="Delete an employee">
      <p>For people added only to test the system. Enter the employee code to see what would go. The delete needs you to type DELETE. A person who is in a payroll, or who has a paid reimbursement, cannot be deleted: make them Terminated or Quit instead.</p>
      {notice && <div className={`uc01-admin-message uc01-admin-message--${notice.ok ? 'success' : 'error'}`} role={notice.ok ? 'status' : 'alert'}>{notice.text}</div>}
      <div className="hr-form">
        <div className="hr-form-grid">
          <label className="hr-field"><span className="hr-pay-label">Employee code</span>
            <input value={code} disabled={busy} autoComplete="off" autoCapitalize="characters" maxLength={20} onChange={(e) => { setCode(e.target.value); setSeen(null); setTyped(''); }} />
          </label>
        </div>
        <div className="hr-actions">
          <button type="button" className="uc01-admin-button uc01-admin-button--primary" disabled={!cleanEmployeeCode(code) || busy} onClick={() => check.mutate()}>
            {check.isPending ? 'Checking…' : 'Show what would be deleted'}
          </button>
        </div>
      </div>

      {seen && (
        seen.blockedBy ? (
          <div className="uc01-admin-message uc01-admin-message--error" role="alert">{seen.blockedBy}</div>
        ) : (
          <>
            <p>
              This will permanently delete <strong>{seen.fullName} ({seen.employeeCode}, {statusLabels[seen.employmentStatus as keyof typeof statusLabels] ?? seen.employmentStatus})</strong>
              {what ? <> with {what}</> : null}, and their photos and files. It cannot be undone.{seen.note ? ` ${seen.note}` : ''}
            </p>
            <div className="hr-form">
              <label className="hr-field"><span className="hr-pay-label">Type DELETE to confirm</span>
                <input value={typed} disabled={busy} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
              </label>
              <div className="hr-actions">
                <button type="button" className="uc01-admin-button uc01-admin-button--danger-primary" disabled={!canDelete} onClick={() => remove.mutate()}>
                  {remove.isPending ? 'Deleting…' : 'Delete this employee'}
                </button>
              </div>
            </div>
          </>
        )
      )}
    </SectionCard>
  );
}
