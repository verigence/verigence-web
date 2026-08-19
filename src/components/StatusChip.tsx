import type { PropsWithChildren } from 'react';

export default function StatusChip({ children }: PropsWithChildren) {
  return <span className="status-chip">{children}</span>;
}
