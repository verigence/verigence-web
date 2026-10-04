import type { RunLine } from '../../../services/hr/payroll';
import { formatDays, formatRupees } from './money';

interface Props {
  lines: RunLine[];
  onOpen: (line: RunLine) => void;
}

/** One row per person. On a phone each row becomes a card; tapping a person opens the full breakdown. */
export default function RunLinesTable({ lines, onOpen }: Props) {
  return (
    <div className="uc01-admin-table-wrap hr-pay-lines">
      <table className="uc01-admin-table hr-pay-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Days</th>
            <th className="hr-pay-num">Gross earned</th>
            <th className="hr-pay-num">Deductions</th>
            <th className="hr-pay-num">Net pay</th>
            <th className="hr-pay-num">Reimbursements</th>
            <th className="hr-pay-num">Payable</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.employeeId}>
              <td data-label="Employee">
                <button type="button" className="hr-pay-linkbutton" onClick={() => onOpen(line)} aria-label={`Open the breakdown for ${line.employeeName}`}>
                  <strong>{line.employeeName}</strong>
                  <small>{line.employeeCode}{line.designation ? ` · ${line.designation}` : ''}</small>
                </button>
              </td>
              <td data-label="Days">
                <div className="hr-pay-days">
                <strong>{formatDays(line.paidDays)} paid</strong>
                <small>
                  {formatDays(line.lopDays)} loss of pay
                  {line.extraLopDays ? ` (${formatDays(line.extraLopDays)} added by HR)` : ''}
                  {line.adjustments.length > 0 ? ` · ${line.adjustments.length} adjustment${line.adjustments.length === 1 ? '' : 's'}` : ''}
                </small>
                </div>
              </td>
              <td data-label="Gross earned" className="hr-pay-num">{formatRupees(line.grossEarned)}</td>
              <td data-label="Deductions" className="hr-pay-num">{formatRupees(line.totalDeductions)}</td>
              <td data-label="Net pay" className="hr-pay-num">{formatRupees(line.netPay)}</td>
              <td data-label="Reimbursements" className="hr-pay-num">{formatRupees(line.reimbursements)}</td>
              <td data-label="Payable" className="hr-pay-num"><strong>{formatRupees(line.payableTotal)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
