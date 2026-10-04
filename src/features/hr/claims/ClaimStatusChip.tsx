import { statusLabel, statusTone } from './claimFormat';

/** The claim's status as a coloured chip. The words always carry the meaning; colour only helps. */
export default function ClaimStatusChip({ status }: { status: string }) {
  return <span className={`uc01-admin-status hrc-chip hrc-chip--${statusTone(status)}`}>{statusLabel(status)}</span>;
}
