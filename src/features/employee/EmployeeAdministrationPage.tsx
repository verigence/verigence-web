import '../../styles/employee-services.css';

const areas = [
  ['Employees', 'Single onboarding, employee directory, employment and salary details.'],
  ['Bulk Onboarding', 'Download template, upload Excel, validate, preview and confirm.'],
  ['Attendance Management', 'Attendance reporting and authorized corrections.'],
  ['Leave Management', 'HR validation, balances, policies and holidays.'],
  ['Reimbursements', 'HR approval and FinanceAdmin conditional approval.'],
  ['Payroll', 'Monthly calculation, review, finalize and payslip generation.'],
  ['Reports', 'Weekly attendance and monthly payroll/reimbursement exports.'],
  ['Configuration', 'Working week, leave, half-day, geofence, reimbursement and payroll rules.'],
];

export default function EmployeeAdministrationPage() {
  return <section className="employee-services"><header className="employee-services__header"><div><span className="employee-services__eyebrow">Administration</span><h1>Employee Management</h1><p>HR, Finance and SuperAdmin operations. Existing Verigence Administration functions are unchanged.</p></div></header><div className="employee-admin-grid">{areas.map(([title, description]) => <article key={title}><h2>{title}</h2><p>{description}</p></article>)}</div></section>;
}
