import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import SectionCard from '../../../components/SectionCard';
import { createRun, payrollKeys } from '../../../services/hr/payroll';
import { useSessionStore } from '../../../store/sessionStore';
import Field from '../Field';
import { formatPayMonth, todayInIndia } from './money';
import { payrollErrorMessage } from './payrollErrors';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** HR starts the run for a month. The server allows one live run per month and works out every line. */
export default function StartRunForm() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => todayInIndia().slice(0, 7));
  const [error, setError] = useState('');
  const [problem, setProblem] = useState('');

  const start = useMutation({
    mutationFn: () => createRun(accessToken!, month),
    onSuccess: (run) => {
      queryClient.setQueryData(payrollKeys.run(run.runId), run);
      void queryClient.invalidateQueries({ queryKey: payrollKeys.runs });
      navigate(`/hr/payroll/runs/${run.runId}`);
    },
    onError: (e) => setProblem(payrollErrorMessage(e)),
  });

  const submit = () => {
    if (!MONTH.test(month)) {
      setError('Choose the month, for example 2026-10.');
      return;
    }
    setError('');
    setProblem('');
    start.mutate();
  };

  return (
    <SectionCard title="Start a run" description="Works out everyone's pay for the month from attendance, leave, approved salaries and approved reimbursements. You can review and change it before submitting.">
      <form className="hr-form hr-pay-start" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <Field label="Month" htmlFor="run-month" error={error} hint={MONTH.test(month) ? formatPayMonth(month) : 'Year and month, like 2026-10.'}>
          <input id="run-month" type="month" placeholder="YYYY-MM" value={month} disabled={start.isPending} onChange={(e) => { setMonth(e.target.value); setError(''); }} aria-invalid={Boolean(error)} />
        </Field>
        <div className="hr-actions">
          <button type="submit" className="uc01-admin-button uc01-admin-button--primary hr-pay-button" disabled={start.isPending}>{start.isPending ? 'Starting…' : 'Start run'}</button>
        </div>
      </form>
      {problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem}</div>}
    </SectionCard>
  );
}
