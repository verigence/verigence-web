function journeyIdFromCard(card: Element): string | undefined {
  const links = Array.from(card.querySelectorAll<HTMLAnchorElement>('a[href]'));
  for (const link of links) {
    const match = link.getAttribute('href')?.match(/^\/(?:v2\/bookings|v2\/deliveries|audit)\/([^/?#]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return undefined;
}

function navigateToJourneyOverview(journeyId: string): void {
  const base = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/, '');
  window.location.assign(`${base}/journeys/${encodeURIComponent(journeyId)}/overview`);
}

// Work Queue historically used "View details" to reveal only a small inline
// metadata strip, which looked like a broken action. Route that command to the
// dedicated Journey 360 screen instead. Use capture phase so the legacy inline
// toggle never runs after we have resolved a journey.
document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const menuItem = target.closest<HTMLButtonElement>('.uc03-work-card__more-menu button[role="menuitem"]');
  if (!menuItem || menuItem.textContent?.trim() !== 'View details') return;

  const card = menuItem.closest('.uc03-work-card');
  const journeyId = card ? journeyIdFromCard(card) : undefined;
  if (!journeyId) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  navigateToJourneyOverview(journeyId);
}, true);
