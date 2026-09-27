import { NavLink, useParams } from 'react-router-dom';

export default function P2JourneyTabs() {
  const { journeyId = '' } = useParams();
  if (!journeyId) return null;

  const items = [
    { to: `/p2/journeys/${journeyId}/overview`, label: 'Journey 360' },
    { to: `/p2/journeys/${journeyId}/documents`, label: 'Documents' },
    { to: `/p2/journeys/${journeyId}/tasks`, label: 'Tasks' },
  ];

  return (
    <nav className="p2-journey-tabs" aria-label="Phase 2 journey sections">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `p2-journey-tabs__item${isActive ? ' is-active' : ''}`}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
