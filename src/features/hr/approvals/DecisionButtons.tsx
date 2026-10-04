import type { DecisionKind } from '../../../services/hr/approvals';
import { decisionVerb } from './approvalFormat';

interface Props {
  onDecide: (decision: DecisionKind) => void;
  disabled: boolean;
  /** Only reimbursement claims can be sent back for correction. */
  allowCorrection?: boolean;
  /** Names the request for screen readers, e.g. "Asha Rao, sick leave". */
  subject: string;
}

export default function DecisionButtons({ onDecide, disabled, allowCorrection = false, subject }: Props) {
  const kinds: DecisionKind[] = allowCorrection ? ['APPROVE', 'REJECT', 'CORRECTION'] : ['APPROVE', 'REJECT'];
  const style: Record<DecisionKind, string> = {
    APPROVE: 'uc01-admin-button--primary',
    REJECT: 'uc01-admin-button--danger',
    CORRECTION: '',
  };
  return (
    <div className="uc01-admin-row-actions hr-appr-actions">
      {kinds.map((kind) => (
        <button
          key={kind}
          type="button"
          className={`uc01-admin-button ${style[kind]}`.trim()}
          disabled={disabled}
          onClick={() => onDecide(kind)}
          aria-label={`${decisionVerb[kind].button}: ${subject}`}
        >
          {decisionVerb[kind].button}
        </button>
      ))}
    </div>
  );
}
