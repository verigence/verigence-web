import { displayName } from '../utils/displayNames';

type Props = { value: string; compact?: boolean };

function tone(value: string): string {
  const normalized = value.toUpperCase();
  if (['COMPLETED', 'VERIFIED', 'APPROVED', 'NO_BREACH', 'ACTIVE', 'READY', 'RESOLVED'].includes(normalized)) return 'positive';
  if (['CRITICAL', 'BREACH', 'REJECTED', 'FAILED'].includes(normalized)) return 'danger';
  if (['HIGH', 'REVIEW_REQUIRED', 'SENT_BACK', 'EXCEPTION'].includes(normalized)) return 'warning';
  if (['PENDING', 'OPEN', 'IN_PROGRESS', 'PC_SUBMITTED', 'TL_REVIEW'].includes(normalized)) return 'info';
  return 'neutral';
}

export default function StatusPill({ value, compact = false }: Props) {
  return <span className={`status-pill status-pill--${tone(value)}${compact ? ' status-pill--compact' : ''}`}>{displayName(value)}</span>;
}
