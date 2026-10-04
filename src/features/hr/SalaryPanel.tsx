import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import SectionCard from '../../components/SectionCard';
import type { SalaryStatus } from '../../services/hr/employees';
import { getTemplates, payrollKeys, proposeStructure } from '../../services/hr/payroll';
import { useSessionStore } from '../../store/sessionStore';
import { SalaryStatusBadge } from './EmployeeBadges';
import SalaryEntryFields, { emptySalaryDraft, validateSalaryDraft, type SalaryDraft } from './SalaryEntryFields';
import Modal from './payroll/Modal';
import { payrollErrorMessage } from './payroll/payrollErrors';
import { buildProposal, type ProposalErrors } from './payroll/salaryRules';
import { hrKeys } from './hrQueries';

interface Props {
  employeeId: string;
  fullName: string;
  status: SalaryStatus;
  /** HR salary-propose permission: without it the button is hidden (the service checks again). */
  canPropose: boolean;
  /** Anyone who can read salary structures gets the link to the Salaries page. */
  canViewSalaries: boolean;
  joiningDate: string | null;
}

const hints: Record<SalaryStatus, string> = {
  NONE: 'No salary is on record. Salary is needed before payroll can include this person.',
  WAITING_FINANCE: 'A salary has been proposed and waits for Finance to approve it.',
  APPROVED: 'A salary is approved and counts for payroll.',
  APPROVED_FROM_LATER: 'A salary is approved and starts from a later date.',
};

/** Salary status for one employee, with "Add salary" when none is on record. Finance approves later. */
export default function SalaryPanel({ employeeId, fullName, status, canPropose, canViewSalaries, joiningDate }: Props) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SalaryDraft>(emptySalaryDraft);
  const [errors, setErrors] = useState<ProposalErrors>({});
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');

  const templates = useQuery({
    queryKey: payrollKeys.templates,
    queryFn: () => getTemplates(accessToken!),
    enabled: Boolean(accessToken) && canPropose && open,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const propose = useMutation({
    mutationFn: () => proposeStructure(accessToken!, buildProposal({ ...draft, employeeId })),
    onSuccess: async () => {
      setOpen(false);
      setNotice('Salary proposed. It now waits for Finance to approve it.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: hrKeys.employee(employeeId) }),
        queryClient.invalidateQueries({ queryKey: hrKeys.employees }),
        queryClient.invalidateQueries({ queryKey: payrollKeys.structuresAll }),
      ]);
    },
    onError: (error) => setProblem(payrollErrorMessage(error)),
  });

  const start = () => {
    setDraft({ ...emptySalaryDraft, effectiveFrom: joiningDate ?? '' });
    setErrors({});
    setProblem('');
    setNotice('');
    setOpen(true);
  };

  const submit = () => {
    const found = validateSalaryDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setProblem('Some details need attention. They are marked below.');
      return;
    }
    setProblem('');
    propose.mutate();
  };

  return (
    <SectionCard title="Salary" description="HR proposes the salary and Finance approves it.">
      <div className="hr-salary">
        <SalaryStatusBadge status={status} />
        <span className="hr-muted">{hints[status]}</span>
      </div>
      {notice && <div className="uc01-admin-message uc01-admin-message--success" role="status">{notice}</div>}
      {((canPropose && status === 'NONE') || canViewSalaries) && (
        <div className="hr-actions">
          {canPropose && status === 'NONE' && (
            <button type="button" className="uc01-admin-button uc01-admin-button--primary" onClick={start}>Add salary</button>
          )}
          {canViewSalaries && <Link className="uc01-admin-button" to="/hr/payroll/salaries">View salaries</Link>}
        </div>
      )}

      {open && (
        <Modal eyebrow="Salary" title={`Add salary for ${fullName}`} titleId="employee-add-salary" busy={propose.isPending} wide onClose={() => setOpen(false)}>
          <form noValidate onSubmit={(event) => { event.preventDefault(); submit(); }} className="hr-form">
            <SalaryEntryFields
              idPrefix="emp-salary"
              draft={draft}
              errors={errors}
              disabled={propose.isPending}
              templates={templates.data?.items ?? []}
              templatesLoading={templates.isLoading}
              templatesError={templates.isError ? payrollErrorMessage(templates.error) : ''}
              onChange={(patch) => {
                setDraft((d) => ({ ...d, ...patch }));
                setErrors((e) => {
                  const next = { ...e };
                  for (const key of Object.keys(patch) as Array<keyof SalaryDraft>) delete next[key];
                  return next;
                });
              }}
            />
            {problem && <div className="uc01-admin-message uc01-admin-message--error" role="alert">{problem}</div>}
            <div className="uc01-admin-dialog__actions">
              <button type="button" className="uc01-admin-button hr-pay-button" disabled={propose.isPending} onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="uc01-admin-button uc01-admin-button--primary hr-pay-button" disabled={propose.isPending}>
                {propose.isPending ? 'Proposing…' : 'Propose salary'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </SectionCard>
  );
}
