import type { PropsWithChildren, ReactNode } from 'react';

type Props = PropsWithChildren<{
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}>;

export default function SectionCard({ title, description, action, className = '', children }: Props) {
  return (
    <section className={`section-card ${className}`.trim()}>
      {(title || description || action) && (
        <div className="section-card__heading">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
