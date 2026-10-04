import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { decideStructure, payrollKeys, type SalaryStructureListItem } from '../../../services/hr/payroll';
import { useSessionStore } from '../../../store/sessionStore';
import { formatDate } from '../hrLabels';
import Modal from './Modal';
import { formatRupees } from './money';
import { payrollErrorMessage } from './payrollErrors';

interface Props {
  item: SalaryStructureListItem;
  decision: 'APPROVE' | 'REJECT';
  onClose: () => void;
  onDone: (message: string) => void;
}

/** Finance approves or rejects one proposal. A rejection needs a reason; the server also blocks your own proposal or salary. */
export default function DecisionDialog({ item, decision, onClose, onDone }: Props) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const reject = decision === 'REJECT';

  const send = useMutation({
    mutationFn: () => decideStructure(accessToken!, item.structureId, decision, note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: payrollKeys.structuresAll });
      onDone(`${reject ? 'Rejected' : 'Approved'}: ${item.employeeName}, from ${formatDate(item.effectiveFrom)}.`);
    },
    onError: (error) => setProblem(payrollErrorMessage(error)),
  });

  const submit = () => {
    if (reject && !note.trim()) {
      setProblem('Say why you are rejecting it.');
      return;
    }
    setProblem('');
    send.mutate();
  };

  return (
    <Modal eyebrow="Salary" title={reject ? 'Reject this salary?' : 'Approve this salary?'} titleId="salary-decision" busy={send.isPending} onClose={onClose}>
      <p>
        {item.employeeName} ({item.employeeCode}): {formatRupees(item.grossMonthly)} a month, from {formatDate(item.effectiveFrom)}.
        {reject ? ' HR will see your reason.' : ' It counts for payroll from that date.'}
      </p>
      <label className="uc01-admin-reason">
        <span>{reject ? 'Reason (required)' : 'Note (optional)'}</span>
        <textarea rows={3} maxLength={300} value={note} disabled={send.isPending} onChange={(e) => { setNote(e.target.value); setProblem(''); }} />
      </label>
      {problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem}</div>}
      <div className="uc01-admin-dialog__actions">
        <button type="button" className="uc01-admin-button hr-pay-button" disabled={send.isPending} onClick={onClose}>Cancel</button>
        <button type="button" className={`uc01-admin-button hr-pay-button ${reject ? 'uc01-admin-button--danger-primary' : 'uc01-admin-button--primary'}`} disabled={send.isPending} onClick={submit}>
          {send.isPending ? 'Saving…' : reject ? 'Reject salary' : 'Approve salary'}
        </button>
      </div>
    </Modal>
  );
}
