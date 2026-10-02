import { useMemo, useState } from 'react';
import '../../styles/employee-services.css';

type Tab = 'attendance' | 'leave' | 'reimbursements' | 'payslips' | 'approvals';

const tabs: Array<{key: Tab; label: string}> = [
  { key: 'attendance', label: 'Attendance' },
  { key: 'leave', label: 'Leave' },
  { key: 'reimbursements', label: 'Reimbursements' },
  { key: 'payslips', label: 'Salary & Payslips' },
  { key: 'approvals', label: 'Pending Approvals' },
];

export default function EmployeeServicesPage() {
  const [tab, setTab] = useState<Tab>('attendance');
  const title = useMemo(() => tabs.find((item) => item.key === tab)?.label ?? 'Attendance', [tab]);

  return (
    <section className="employee-services">
      <header className="employee-services__header">
        <div><span className="employee-services__eyebrow">Employee Services</span><h1>{title}</h1>
          <p>Employee actions are isolated from Verigence project work.</p></div>
      </header>
      <nav className="employee-services__tabs" aria-label="Employee services">
        {tabs.map((item) => <button key={item.key} type="button" className={tab === item.key ? 'is-active' : ''} onClick={() => setTab(item.key)}>{item.label}</button>)}
      </nav>
      <div className="employee-services__panel">
        {tab === 'attendance' && <><h2>Check in / Check out</h2><p>Check-in and check-out require a live photo and current GPS position within 500 metres of your assigned work location.</p><div className="employee-services__actions"><button type="button" disabled>Check In</button><button type="button" disabled>Check Out</button></div><small>Actions remain disabled until the isolated Attendance API is available.</small></>}
        {tab === 'leave' && <><h2>Leave</h2><p>Apply for leave and track TL/PMO approval followed by HR validation.</p><button type="button" disabled>Apply Leave</button></>}
        {tab === 'reimbursements' && <><h2>Reimbursements</h2><p>Submit travel and food claims with receipts. Finance approval is added when the monthly claim threshold is crossed.</p><button type="button" disabled>New Claim</button></>}
        {tab === 'payslips' && <><h2>Salary & Payslips</h2><p>View and download finalized monthly payslips.</p></>}
        {tab === 'approvals' && <><h2>Pending Approvals</h2><p>TL/PMO leave approvals appear here on mobile and web. HR actions remain in Administration.</p></>}
      </div>
    </section>
  );
}
