import type { PendingItem } from '../../../services/hr/oversight';
import { formatDate, formatDateTimeIst } from '../approvals/approvalFormat';
import { formatAgeHours, itemDetail, itemTypeLabels } from './oversightFormat';

interface Props {
  items: PendingItem[];
  emptyText: string;
}

/** Items waiting for a decision, oldest first as the server sends them. One card each, so it reads on a phone. */
export default function PendingItemList({ items, emptyText }: Props) {
  if (items.length === 0) return <div className="uc01-admin-state">{emptyText}</div>;
  return (
    <ul className="hr-ovs-items">
      {items.map((x) => (
        <li key={`${x.type}-${x.id}`} className={`hr-ovs-item${x.overdue ? ' is-overdue' : ''}`}>
          <div className="hr-ovs-item__head">
            <div>
              <strong>{itemTypeLabels[x.type] ?? x.type}: {itemDetail(x)}</strong>
              <span>{x.employeeName} · {x.employeeCode}</span>
            </div>
            {x.overdue
              ? <span className="uc01-admin-status uc01-admin-status--suspended">Past deadline</span>
              : <span className="uc01-admin-status uc01-admin-status--pending">Waiting</span>}
          </div>
          <dl className="hr-ovs-item__facts">
            <div><dt>For</dt><dd>{formatDate(x.forDate)}</dd></div>
            <div><dt>Raised</dt><dd>{formatDateTimeIst(x.raisedAt)}</dd></div>
            <div><dt>Due by</dt><dd>{formatDateTimeIst(x.deadline)}</dd></div>
            <div><dt>Waiting</dt><dd>{formatAgeHours(x.ageHours)}</dd></div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
