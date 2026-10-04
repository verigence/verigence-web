import { useState } from 'react';
import { Link } from 'react-router-dom';

import PageHeader from '../../components/PageHeader';
import { PAYROLL_PERMISSION } from '../../services/hr/payroll';
import { useHrAccess } from '../../features/hr/hrQueries';
import { LoadingState, NoAccess } from '../../features/hr/payroll/PayrollStates';
import StatutoryPanel from '../../features/hr/payroll/StatutoryPanel';
import TemplatesPanel from '../../features/hr/payroll/TemplatesPanel';
import '../../styles/hr-payroll.css';

type Tab = 'templates' | 'statutory';

export default function HrPayrollSettingsPage() {
  const access = useHrAccess();
  const canSeeTemplates = access.can(PAYROLL_PERMISSION.salaryPropose) || access.can(PAYROLL_PERMISSION.salaryApprove) || access.can(PAYROLL_PERMISSION.payrollRead);
  const canEditTemplates = access.can(PAYROLL_PERMISSION.salaryPropose);
  const canSeeStatutory = access.can(PAYROLL_PERMISSION.payrollRead) || access.can(PAYROLL_PERMISSION.settingsManage);
  const canManageStatutory = access.can(PAYROLL_PERMISSION.settingsManage);
  const [chosen, setChosen] = useState<Tab | null>(null);

  if (access.loading) return <LoadingState />;
  if (!canSeeTemplates && !canSeeStatutory) {
    return <NoAccess title="Payroll settings" message="You do not have access to payroll settings." />;
  }

  const tabs: Array<{ key: Tab; label: string }> = [
    ...(canSeeTemplates ? [{ key: 'templates' as const, label: 'Salary templates' }] : []),
    ...(canSeeStatutory ? [{ key: 'statutory' as const, label: 'Statutory (PF, ESI, PT)' }] : []),
  ];
  const tab: Tab = chosen && tabs.some((t) => t.key === chosen) ? chosen : tabs[0].key;

  return (
    <section className="uc01-admin-page hr-page hr-pay-page" aria-label="Payroll settings">
      <PageHeader
        eyebrow="HR · Payroll"
        title="Payroll settings"
        description="How salaries are split, and the statutory deductions that payroll applies."
        actions={(
          <>
            <Link className="uc01-admin-button hr-pay-button" to="/hr/payroll/salaries">Salaries</Link>
            {access.can(PAYROLL_PERMISSION.payrollRead) && <Link className="uc01-admin-button hr-pay-button" to="/hr/payroll">Payroll runs</Link>}
          </>
        )}
      />
      <div className="hr-tabs" role="tablist" aria-label="Payroll settings sections">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`hr-tab hr-pay-tab${tab === t.key ? ' is-active' : ''}`} onClick={() => setChosen(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === 'templates' && <TemplatesPanel canEdit={canEditTemplates} />}
      {tab === 'statutory' && <StatutoryPanel canManage={canManageStatutory} />}
    </section>
  );
}
