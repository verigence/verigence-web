const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const pcDestination = (value: string | null): boolean => {
  if (!value) return false;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return false;
    return /^\/(dashboard|v2\/bookings(?:\/|$)|v2\/deliveries(?:\/|$)|bookings(?:\/|$)|deliveries(?:\/|$)|audit(?:\/|$))/.test(url.pathname);
  } catch {
    return false;
  }
};

let releaseTimer: number | undefined;

function armNavigationMotion() {
  if (reducedMotion()) return;
  window.clearTimeout(releaseTimer);
  document.documentElement.classList.add('vg-pc-navigating');
  releaseTimer = window.setTimeout(() => {
    document.documentElement.classList.remove('vg-pc-navigating');
  }, 190);
}

function targetElement(eventTarget: EventTarget | null): Element | null {
  return eventTarget instanceof Element ? eventTarget : null;
}

function shouldAnimateIntent(target: Element): boolean {
  const anchor = target.closest('a[href]');
  if (anchor instanceof HTMLAnchorElement && pcDestination(anchor.getAttribute('href'))) return true;

  return Boolean(target.closest([
    '.uc03-work-card--interactive',
    '.uc03-work-row-v2',
    '.uc03-c1-back',
    '.uc03-landing__capture-action--workqueue',
    '.uc03-work-card__primary-action',
    '.uc03-work-card__secondary-action',
    '.uc03-work-card__more-menu',
  ].join(',')));
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (event) => {
    const target = targetElement(event.target);
    if (target && shouldAnimateIntent(target)) armNavigationMotion();
  }, { capture: true, passive: true });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = targetElement(event.target);
    if (target && shouldAnimateIntent(target)) armNavigationMotion();
  }, { capture: true });

  window.addEventListener('popstate', armNavigationMotion, { passive: true });
}
