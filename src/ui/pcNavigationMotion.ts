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

function workQueueRoute(target: Element): URL | undefined {
  const anchor = target.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return undefined;
  if (!anchor.closest('.uc03-work-row-v2')) return undefined;
  if (anchor.target && anchor.target !== '_self') return undefined;

  try {
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return undefined;
    if (!/^\/(?:v2\/bookings|v2\/deliveries|audit)\//.test(url.pathname)) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

function navigateWorkQueueRouteInSession(url: URL): void {
  const existing = window.history.state;
  const currentIndex = existing && typeof existing === 'object' && typeof existing.idx === 'number'
    ? existing.idx
    : 0;
  const nextState = {
    usr: null,
    key: Math.random().toString(36).slice(2, 10),
    idx: currentIndex + 1,
  };
  window.history.pushState(nextState, '', `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new PopStateEvent('popstate', { state: nextState }));
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = targetElement(event.target);
    if (!target) return;
    const url = workQueueRoute(target);
    if (!url) return;

    // UC03 Work Queue session state is held in-memory. A browser-level navigation
    // reloads the application and therefore drops the authenticated session. Keep
    // Booking/Delivery/Audit actions inside the mounted SPA even if an anchor's
    // normal navigation is not intercepted by React Router in the deployed shell.
    event.preventDefault();
    event.stopImmediatePropagation();
    armNavigationMotion();
    navigateWorkQueueRouteInSession(url);
  }, { capture: true });

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
