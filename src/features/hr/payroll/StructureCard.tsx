import type { ReactNode } from 'react';

import type { SalaryStructureListItem, StructureStatus } from '../../../services/hr/payroll';
import { formatDate, formatDateTime } from '../hrLabels';
import ComponentsTable from './ComponentsTable';
import { formatRupees } from './money';

export const STRUCTURE_STATUS: Record<StructureStatus, { label: string; tone: string }> = {
  PROPOSED: { label: 'Waiting for Finance', tone: 'pending' },
  APPROVED: { label: 'Approved', tone: 'approved' },
  REJECTED: { label: 'Rejected', tone: 'rejected' },
  SUPERSEDED: { label: 'Replaced', tone: 'draft' },
};

interface Props {
  item: SalaryStructureListItem;
  showPerson?: boolean;
  actions?: ReactNode;
}

export default function StructureCard({ item, showPerson, actions }: Props) {
  const status = STRUCTURE_STATUS[item.status];
  return (
    <article className="hr-pay-card">
      <header className="hr-pay-card__head">
        <div>
          {showPerson && <strong className="hr-pay-card__title">{item.employeeName}</strong>}
          {showPerson && <small>{item.employeeCode}</small>}
          {!showPerson && <strong className="hr-pay-card__title">From {formatDate(item.effectiveFrom)}</strong>}
        </div>
        <span className={`hr-pay-pill hr-pay-pill--${status.tone}`}>{status.label}</span>
      </header>
      <dl className="hr-pay-facts">
        <div><dt>Monthly gross</dt><dd className="hr-pay-money hr-pay-money--strong">{formatRupees(item.grossMonthly)}</dd></div>
        {showPerson && <div><dt>Starts from</dt><dd>{formatDate(item.effectiveFrom)}</dd></div>}
        <div><dt>Proposed</dt><dd>{formatDateTime(item.proposedAt)}</dd></div>
        {item.decidedAt && <div><dt>Decided</dt><dd>{formatDateTime(item.decidedAt)}</dd></div>}
        {item.note && <div className="hr-pay-facts__wide"><dt>Proposal note</dt><dd>{item.note}</dd></div>}
        {item.decisionNote && <div className="hr-pay-facts__wide"><dt>Decision note</dt><dd>{item.decisionNote}</dd></div>}
      </dl>
      <details className="hr-pay-details">
        <summary>Show the components</summary>
        <ComponentsTable components={item.components} gross={item.grossMonthly} />
      </details>
      {actions && <div className="hr-pay-card__actions">{actions}</div>}
    </article>
  );
}
