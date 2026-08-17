import type { ReactNode } from 'react';

export default function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-state__mark">✓</span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}
