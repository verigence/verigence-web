import type { P2DealInsurance } from '../../../services/audit-core/uc03P2';

/** How the deal's insurance source was decided (product owner rule 2026-10-27). */
export function insuranceDecidedText(insurance: Pick<P2DealInsurance, 'decidedBy'>): string {
  switch (insurance.decidedBy) {
    case 'PC': return ' · confirmed by PC';
    case 'DOCUMENT': return ' · shown by the documents';
    case 'UNCONFIRMED': return ' · not confirmed: PC task raised';
    default: return ' · assumed';
  }
}
