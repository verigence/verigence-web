import { useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { DataBacking } from '../domain/models';

type Props = {
  eyebrow: string;
  title: string;
  description?: string;
  backing?: DataBacking;
  actions?: ReactNode;
};

export default function PageHeader({ eyebrow, title, description, actions }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const legacyOverviewMatch = location.pathname.match(/^\/journeys\/([^/]+)\/overview\/?$/);
  const bookingDetailsSurface = Boolean(legacyOverviewMatch)
    || /^\/v2\/bookings\/[^/]+\/details\/?$/.test(location.pathname);

  useEffect(() => {
    if (!legacyOverviewMatch) return;
    navigate(`/v2/bookings/${legacyOverviewMatch[1]}/details`, { replace: true });
  }, [legacyOverviewMatch, navigate]);

  const effectiveEyebrow = bookingDetailsSurface ? 'Booking Details' : eyebrow;
  const effectiveTitle = bookingDetailsSurface && title === 'Journey unavailable'
    ? 'Booking Details unavailable'
    : title;
  const effectiveDescription = bookingDetailsSurface && description === 'This Journey was not found in your current authorized Project scope.'
    ? 'Booking details could not be loaded for the current authorized Project scope.'
    : description;

  return (
    <header className="page-header">
      <div className="page-header__copy">
        <span className="eyebrow">{effectiveEyebrow}</span>
        <div className="page-header__title-row">
          <h1>{effectiveTitle}</h1>
        </div>
        {effectiveDescription && <p>{effectiveDescription}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
