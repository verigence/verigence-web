import { Link } from 'react-router-dom';

import type { Claim, ClaimWithPerson } from '../../../services/hr/claims';
import { formatDate } from '../hrLabels';
import { formatKm, formatRupees, progressText } from './claimFormat';
import ClaimStatusChip from './ClaimStatusChip';

type Row = Claim | ClaimWithPerson;

function person(claim: Row): { name: string; code: string } | null {
  return 'employeeName' in claim ? { name: claim.employeeName, code: claim.employeeCode } : null;
}

/** One list for "my claims" and "all claims": each row opens the claim. */
export default function ClaimList({ claims, label }: { claims: Row[]; label: string }) {
  return (
    <ul className="hrc-list" aria-label={label}>
      {claims.map((claim) => {
        const who = person(claim);
        return (
          <li key={claim.claimId}>
            <Link className={`hrc-row hrc-row--${claim.status.toLowerCase()}`} to={`/hr/claims/${claim.claimId}`}>
              <span className="hrc-row__main">
                {who && <small className="hrc-row__person">{who.name} <span>{who.code}</span></small>}
                <strong>{claim.categoryLabel}</strong>
                <small>
                  {formatDate(claim.expenseDate)}
                  {claim.distanceKm !== null ? ` · ${formatKm(claim.distanceKm)}` : ''}
                </small>
              </span>
              <span className="hrc-row__amount">{formatRupees(claim.amount)}</span>
              <span className="hrc-row__status">
                <ClaimStatusChip status={claim.status} />
                <small>{progressText(claim)}</small>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
