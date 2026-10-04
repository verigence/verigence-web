import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import SectionCard from '../../../components/SectionCard';
import { hrErrorMessage } from '../../../services/hr/client';
import {
  adjustLeaveBalance,
  getEmployeeLeave,
  reverseLeave,
  type LeaveAdjustInput,
  type LeaveRequest,
} from '../../../services/hr/leave';
import { useSessionStore } from '../../../store/sessionStore';
import AdjustBalanceDialog from './AdjustBalanceDialog';
import BalanceCards from './BalanceCards';
import LeaveRequestList from './LeaveRequestList';
import ReverseLeaveDialog from './ReverseLeaveDialog';
import { leaveErrorMessage } from './leaveLogic';
import { leaveKeys, yearChoices } from './leaveQueries';

interface Props {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  year: number;
  currentYear: number;
  onYearChange: (year: number) => void;
  onBack: () => void;
}

/** HR: one person's balances and requests, with Reverse (approved leave) and Adjust (balance). */
export default function EmployeeLeavePanel({ employeeId, employeeName, employeeCode, year, currentYear, onYearChange, onBack }: Props) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [reversing, setReversing] = useState<LeaveRequest | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [notice, setNotice] = useState('');

  const detail = useQuery({
    queryKey: leaveKeys.employee(employeeId, year),
    queryFn: () => getEmployeeLeave(accessToken!, employeeId, year),
    enabled: Boolean(accessToken),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: leaveKeys.employee(employeeId, year) });
    void queryClient.invalidateQueries({ queryKey: ['hr', 'leave', 'overview'] });
  };

  const reverse = useMutation({
    mutationFn: (requestId: string) => reverseLeave(accessToken!, requestId),
    onSuccess: () => {
      setReversing(null);
      setNotice('The leave was reversed and the days are back in the balance.');
      refresh();
    },
    onError: () => refresh(),
  });

  const adjust = useMutation({
    mutationFn: (input: LeaveAdjustInput) => adjustLeaveBalance(accessToken!, employeeId, input),
    onSuccess: (_data, input) => {
      setAdjusting(false);
      setNotice(`The ${input.leave_type === 'SICK' ? 'Sick' : 'Earned'} balance for ${input.year} was adjusted.`);
      void queryClient.invalidateQueries({ queryKey: ['hr', 'leave', 'employee', employeeId] });
      void queryClient.invalidateQueries({ queryKey: ['hr', 'leave', 'overview'] });
    },
  });

  return (
    <div className="hr-sections hr-leave-panel">
      <div className="hr-leave-panel__bar">
        <button type="button" className="uc01-admin-button" onClick={onBack}>All employees</button>
        <div className="hr-leave-panel__who">
          <strong>{employeeName}</strong>
          <small>{employeeCode}</small>
        </div>
        <label className="uc01-admin-filter hr-leave-year">
          <span>Year</span>
          <select value={year} onChange={(e) => { setNotice(''); onYearChange(Number(e.target.value)); }}>
            {yearChoices(currentYear).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <button
          type="button"
          className="uc01-admin-button uc01-admin-button--primary"
          disabled={!detail.data}
          onClick={() => { adjust.reset(); setAdjusting(true); }}
        >
          Adjust balance
        </button>
      </div>

      {notice && <div className="uc01-admin-message uc01-admin-message--success" role="status">{notice}</div>}

      {detail.isLoading && <div className="uc01-admin-state">Loading leave…</div>}
      {detail.isError && (
        <div className="uc01-admin-state uc01-admin-state--error" role="alert">
          <strong>This person&apos;s leave could not be loaded.</strong>
          <span>{leaveErrorMessage(detail.error)}</span>
          <button type="button" className="uc01-admin-button" onClick={() => detail.refetch()}>Try again</button>
        </div>
      )}

      {detail.data && (
        <>
          <SectionCard title={`Balance for ${detail.data.balance.year}`} description="Every change to a balance is a new entry in a ledger: yearly grant, leave taken, reversal or adjustment.">
            <BalanceCards types={detail.data.balance.types} year={detail.data.balance.year} />
          </SectionCard>
          <SectionCard title="Leave requests" description="The latest 100 requests, newest first, across all years.">
            <LeaveRequestList
              requests={detail.data.requests}
              own={false}
              emptyText="This person has not applied for any leave."
              actions={(r) => r.status === 'APPROVED' ? (
                <button type="button" className="uc01-admin-button uc01-admin-button--danger" onClick={() => { reverse.reset(); setReversing(r); }}>
                  Reverse
                </button>
              ) : null}
            />
          </SectionCard>
        </>
      )}

      {reversing && (
        <ReverseLeaveDialog
          request={reversing}
          employeeName={employeeName}
          busy={reverse.isPending}
          error={reverse.isError ? hrErrorMessage(reverse.error) : ''}
          onConfirm={() => { if (!reverse.isPending) reverse.mutate(reversing.requestId); }}
          onClose={() => setReversing(null)}
        />
      )}
      {adjusting && (
        <AdjustBalanceDialog
          employeeName={employeeName}
          defaultYear={year}
          busy={adjust.isPending}
          error={adjust.isError ? hrErrorMessage(adjust.error) : ''}
          onSubmit={(input) => { if (!adjust.isPending) adjust.mutate(input); }}
          onClose={() => setAdjusting(false)}
        />
      )}
    </div>
  );
}
