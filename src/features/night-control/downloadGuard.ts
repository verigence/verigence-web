/**
 * Night control for file downloads (product owner, 6 Nov 2026): one guard for the whole app instead of
 * a check on every page. While FILE_DOWNLOAD is blocked for the person it stops
 *   1. clicks (capture phase, on the document) on `a[download]`, on links to a file, and on anything
 *      marked `data-file-download`;
 *   2. `anchor.click()` on a download link, which the Blob/CSV/Excel helpers use -- often on an anchor
 *      that was never added to the page, so no document listener would see it;
 *   3. `window.open()` of a file, or of a blank tab that is pointed at a file once its link arrives.
 * and shows "Night Mode On". The Android app download (the /apps page, `/app-distribution`, anything
 * marked `data-night-allow`) is never stopped, so people can always get the app.
 *
 * The services refuse the file itself at night too (HTTP 403 NIGHT_MODE); this guard is what the
 * person sees first.
 */

export const NIGHT_MODE_EVENT = 'verigence:night-mode';

const FILE_EXTENSION = /\.(pdf|xlsx?|xlsm|csv|zip|docx?|pptx?|txt|json|jpe?g|png|gif|webp|heic|tiff?|apk)$/i;
const SIGNED_URL = /[?&](x-amz-signature|x-amz-credential|x-goog-signature|sig|signature)=/i;
const FILE_PATH = /\/(download|downloads|files?|export|exports)(\/|$)/i;
/** The Android app: the download service, and the app's own /apps and /download (its old address) pages. */
const APP_DOWNLOAD = /\/app-distribution(\/|$|\?)/i;
const APP_PAGES = /^\/(apps|download)\/?$/;
const APPS_PAGE = /(^|\/)apps\/?$/;

export const DOWNLOAD_SELECTOR = 'a[download], a[href], [data-file-download]';
const ALLOW_SELECTOR = '[data-night-allow]';

/** A minimal element: what the guard reads (so it can be tested without a browser). */
export interface GuardElement {
  tagName?: string;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  closest?(selector: string): GuardElement | null;
}

/** Whether a URL is the Android app download (always allowed). */
export function isAppDownloadUrl(url: string | null | undefined): boolean {
  const value = url?.trim();
  if (!value) return false;
  if (APP_DOWNLOAD.test(value)) return true;
  try {
    return APP_PAGES.test(new URL(value, 'https://verigence.invalid').pathname);
  } catch {
    return false;
  }
}

/** Whether a URL points at a file rather than a screen of the app. */
export function isFileUrl(url: string | null | undefined): boolean {
  const value = url?.trim();
  if (!value || value.startsWith('#') || /^(javascript|mailto|tel):/i.test(value)) return false;
  if (/^(blob|data):/i.test(value)) return true;
  if (isAppDownloadUrl(value)) return false;
  let path = value;
  let query = '';
  try {
    const parsed = new URL(value, 'https://verigence.invalid');
    path = parsed.pathname;
    query = parsed.search;
  } catch {
    // keep the raw value
  }
  return FILE_EXTENSION.test(path) || SIGNED_URL.test(query) || FILE_PATH.test(path);
}

/** Whether the page the person is on is the app download page. */
export function isAppsPage(pathname: string | null | undefined): boolean {
  return Boolean(pathname && APPS_PAGE.test(pathname));
}

/** Whether this element starts a download the guard has to stop (before the exemptions). */
export function isDownloadElement(element: GuardElement): boolean {
  if (element.hasAttribute('data-file-download')) return true;
  const tag = element.tagName?.toUpperCase();
  if (tag !== 'A' && tag !== 'AREA') return false;
  if (element.hasAttribute('download')) return true;
  return isFileUrl(element.getAttribute('href'));
}

function isExempt(element: GuardElement, pathname: string | undefined): boolean {
  if (isAppsPage(pathname)) return true;
  if (element.hasAttribute('data-night-allow') || element.closest?.(ALLOW_SELECTOR)) return true;
  return isAppDownloadUrl(element.getAttribute('href'));
}

/** The download element a click landed on, if the click must be stopped now. */
export function blockedDownloadTarget(target: unknown, pathname: string | undefined): GuardElement | null {
  const start = target as GuardElement | null;
  if (!start || typeof start.getAttribute !== 'function') return null;
  const element = typeof start.closest === 'function' ? start.closest(DOWNLOAD_SELECTOR) : start;
  if (!element || !isDownloadElement(element)) return null;
  return isExempt(element, pathname) ? null : element;
}

/** Whether `window.open(url)` must be stopped: a file, or a blank tab that a file will be loaded into. */
export function isBlockedOpen(url: string | URL | undefined, pathname: string | undefined): boolean {
  if (isAppsPage(pathname)) return false;
  const value = url === undefined ? '' : String(url).trim();
  if (isAppDownloadUrl(value)) return false;
  return value === '' || value === 'about:blank' || isFileUrl(value);
}

/** A tab that is already closed: callers that point "the tab" at the file do nothing with it. */
function closedTab(): Window {
  const location = { href: 'about:blank', assign() {}, replace() {} };
  return { closed: true, opener: null, location, close() {}, focus() {} } as unknown as Window;
}

export interface DownloadGuardHost {
  document: { addEventListener(type: 'click', listener: (event: MouseEvent) => void, capture: boolean): void; removeEventListener(type: 'click', listener: (event: MouseEvent) => void, capture: boolean): void };
  window: { open: (url?: string | URL, target?: string, features?: string) => Window | null; location: { pathname: string } };
  anchorPrototype?: { click: (this: HTMLAnchorElement) => void };
}

export interface DownloadGuardOptions {
  isBlocked: () => boolean;
  notify: () => void;
}

/** Installs the guard; returns the function that removes it. Safe to call once per page load. */
export function installDownloadGuard(host: DownloadGuardHost, { isBlocked, notify }: DownloadGuardOptions): () => void {
  const pathname = () => host.window.location?.pathname;

  const onClick = (event: MouseEvent) => {
    if (!isBlocked()) return;
    if (!blockedDownloadTarget(event.target, pathname())) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    notify();
  };
  host.document.addEventListener('click', onClick, true);

  const proto = host.anchorPrototype;
  const originalClick = proto?.click;
  const ownClick = Boolean(proto && Object.prototype.hasOwnProperty.call(proto, 'click'));
  if (proto && originalClick) {
    proto.click = function guardedClick(this: HTMLAnchorElement) {
      if (isBlocked() && blockedDownloadTarget(this as unknown as GuardElement, pathname())) {
        notify();
        return;
      }
      originalClick.call(this);
    };
  }

  const originalOpen = host.window.open;
  host.window.open = function guardedOpen(url?: string | URL, target?: string, features?: string) {
    if (isBlocked() && isBlockedOpen(url, pathname())) {
      notify();
      return closedTab();
    }
    return originalOpen.call(host.window, url, target, features);
  };

  return () => {
    host.document.removeEventListener('click', onClick, true);
    if (proto && originalClick) {
      if (ownClick) proto.click = originalClick;
      else delete (proto as { click?: unknown }).click;
    }
    host.window.open = originalOpen;
  };
}

// ---- the app's one guard -----------------------------------------------------------------------

let fileDownloadBlocked = false;
let uninstall: (() => void) | null = null;
let lastNotice = 0;

/** Set by NightControlBridge from Security's answer. */
export function setFileDownloadBlocked(blocked: boolean): void {
  fileDownloadBlocked = blocked;
}

export function isFileDownloadBlocked(): boolean {
  return fileDownloadBlocked;
}

function announce(): void {
  const now = Date.now();
  // One click can reach the guard twice (the click and the anchor.click() it runs): say it once.
  if (now - lastNotice < 400) return;
  lastNotice = now;
  window.dispatchEvent(new CustomEvent(NIGHT_MODE_EVENT));
}

/** Installs the app's guard once (browser only). */
export function ensureDownloadGuard(): void {
  if (uninstall || typeof window === 'undefined' || typeof document === 'undefined') return;
  uninstall = installDownloadGuard(
    { document, window, anchorPrototype: typeof HTMLAnchorElement === 'undefined' ? undefined : HTMLAnchorElement.prototype },
    { isBlocked: isFileDownloadBlocked, notify: announce },
  );
}
