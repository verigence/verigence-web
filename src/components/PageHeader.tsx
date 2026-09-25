import type { ReactNode } from 'react';
import type { DataBacking } from '../domain/models';

type Props = {
  eyebrow: string;
  title: string;
  description?: string;
  backing?: DataBacking;
  actions?: ReactNode;
};

/* This component must stay purely presentational -- never route, redirect or
 * rewrite the copy its caller passed in. It is rendered by nearly every page,
 * so a path-conditional navigate() here hijacks whichever page happens to
 * mount it. That is exactly what broke Journey 360: an earlier version
 * redirected /journeys/:id/overview -> /v2/bookings/:id/details, a rule added
 * when that path was a retired route. It later became the live Journey 360
 * route (App.tsx), so every entry point into Journey 360 -- the PC dashboard
 * journey click, work queue, Journey Search, Review Queue, and the Documents
 * page's "Journey Details" back buttons -- silently bounced to Booking Details
 * instead. Route-specific behaviour belongs in the route or the page. */
export default function PageHeader({ eyebrow, title, description, actions }: Props) {
  return (
    <header className="page-header">
      <div className="page-header__copy">
        <span className="eyebrow">{eyebrow}</span>
        <div className="page-header__title-row">
          <h1>{title}</h1>
        </div>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
