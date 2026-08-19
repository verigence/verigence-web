import type { ReactNode } from 'react';
import type { DataBacking } from '../domain/models';
import DataBackingBadge from './DataBackingBadge';

type Props = {
  eyebrow: string;
  title: string;
  description?: string;
  backing?: DataBacking;
  actions?: ReactNode;
};

export default function PageHeader({ eyebrow, title, description, backing, actions }: Props) {
  return (
    <header className="page-header">
      <div className="page-header__copy">
        <span className="eyebrow">{eyebrow}</span>
        <div className="page-header__title-row">
          <h1>{title}</h1>
          {backing && <DataBackingBadge backing={backing} />}
        </div>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
