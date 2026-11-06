import { describe, expect, it, vi } from 'vitest';

import {
  blockedDownloadTarget,
  installDownloadGuard,
  isBlockedOpen,
  isFileUrl,
  type DownloadGuardHost,
  type GuardElement,
} from '../downloadGuard';

/** A tiny element: tag, attributes and a parent, with `closest` for the selectors the guard uses. */
class FakeElement implements GuardElement {
  constructor(public tagName: string, private attrs: Record<string, string> = {}, public parent: FakeElement | null = null) {}
  getAttribute(name: string) { return name in this.attrs ? this.attrs[name] : null; }
  hasAttribute(name: string) { return name in this.attrs; }
  private matches(selector: string): boolean {
    return selector.split(',').map((s) => s.trim()).some((part) => {
      const m = /^([a-z]*)(?:\[([a-z-]+)\])?$/.exec(part);
      if (!m) return false;
      const [, tag, attr] = m;
      if (tag && this.tagName.toLowerCase() !== tag) return false;
      return !attr || this.hasAttribute(attr);
    });
  }
  closest(selector: string): FakeElement | null {
    let node: FakeElement | null = this;
    while (node) {
      if (node.matches(selector)) return node;
      node = node.parent;
    }
    return null;
  }
}

function fakeHost(pathname = '/p2/bookings') {
  const listeners: Array<(event: MouseEvent) => void> = [];
  const realClick = vi.fn();
  const realOpen = vi.fn(() => ({ closed: false }) as unknown as Window);
  const anchorPrototype = { click: realClick } as unknown as { click: (this: HTMLAnchorElement) => void };
  const host: DownloadGuardHost = {
    document: {
      addEventListener: (_type, listener) => { listeners.push(listener); },
      removeEventListener: (_type, listener) => { listeners.splice(listeners.indexOf(listener), 1); },
    },
    window: { open: realOpen, location: { pathname } },
    anchorPrototype,
  };
  const click = (target: FakeElement) => {
    const event = { target, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
    listeners.forEach((l) => l(event as unknown as MouseEvent));
    return event;
  };
  return { host, listeners, click, realClick, realOpen, anchorPrototype };
}

describe('which links are files', () => {
  it('knows blob, signed and file links from screens of the app', () => {
    expect(isFileUrl('blob:https://app.verigence.in/1234')).toBe(true);
    expect(isFileUrl('https://r2.example.com/x/booking.pdf')).toBe(true);
    expect(isFileUrl('https://bucket.example.com/abc?X-Amz-Signature=1&X-Amz-Expires=60')).toBe(true);
    expect(isFileUrl('/p2/journeys/j1/documents')).toBe(false);
    expect(isFileUrl('/p2/bookings')).toBe(false);
    expect(isFileUrl('#top')).toBe(false);
    expect(isFileUrl('mailto:hr@verigence.in')).toBe(false);
  });

  it('never treats the Android app download as a file to stop', () => {
    expect(isFileUrl('/app-distribution/latest')).toBe(false);
    expect(isFileUrl('/apps')).toBe(false);
    expect(isFileUrl('/download')).toBe(false);
  });

  it('finds the download link a click landed in', () => {
    const link = new FakeElement('A', { href: 'blob:x', download: 'report.csv' });
    const label = new FakeElement('SPAN', {}, link);
    expect(blockedDownloadTarget(label, '/p2/bookings')).toBe(link);
    expect(blockedDownloadTarget(new FakeElement('A', { href: '/p2/bookings' }), '/p2/bookings')).toBeNull();
    expect(blockedDownloadTarget(new FakeElement('BUTTON', { 'data-file-download': '' }), '/hr/payslips')).not.toBeNull();
    expect(blockedDownloadTarget(new FakeElement('BUTTON', {}), '/hr/payslips')).toBeNull();
  });
});

describe('installDownloadGuard', () => {
  it('stops a download click and says Night Mode On while blocked', () => {
    const { host, click } = fakeHost();
    const notify = vi.fn();
    installDownloadGuard(host, { isBlocked: () => true, notify });
    const event = click(new FakeElement('A', { href: 'https://files.example.com/a.xlsx', download: '' }));
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopImmediatePropagation).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('lets everything through when not blocked', () => {
    const { host, click, anchorPrototype, realClick, realOpen } = fakeHost();
    const notify = vi.fn();
    installDownloadGuard(host, { isBlocked: () => false, notify });
    const event = click(new FakeElement('A', { href: 'blob:x', download: 'a.csv' }));
    anchorPrototype.click.call(new FakeElement('A', { href: 'blob:x', download: 'a.csv' }) as unknown as HTMLAnchorElement);
    host.window.open('about:blank', '_blank');
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(realClick).toHaveBeenCalledTimes(1);
    expect(realOpen).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it('stops anchor.click() on a Blob link that was never added to the page', () => {
    const { host, anchorPrototype, realClick } = fakeHost();
    const notify = vi.fn();
    installDownloadGuard(host, { isBlocked: () => true, notify });
    const detached = new FakeElement('A', { href: 'blob:https://app/1', download: 'excess-discount.csv' });
    anchorPrototype.click.call(detached as unknown as HTMLAnchorElement);
    expect(realClick).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
    // A link to a screen still works.
    anchorPrototype.click.call(new FakeElement('A', { href: '/p2/bookings' }) as unknown as HTMLAnchorElement);
    expect(realClick).toHaveBeenCalledTimes(1);
  });

  it('stops window.open of a file or of the blank tab a file is loaded into, with a tab that does nothing', () => {
    const { host, realOpen } = fakeHost();
    const notify = vi.fn();
    installDownloadGuard(host, { isBlocked: () => true, notify });
    const tab = host.window.open('about:blank', '_blank');
    expect(tab?.closed).toBe(true);
    tab!.location.href = 'https://files.example.com/export.xlsx';
    host.window.open('https://files.example.com/gate-pass.jpg', '_blank', 'noopener');
    expect(realOpen).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(2);
    host.window.open('https://verigence.in/help', '_blank');
    expect(realOpen).toHaveBeenCalledTimes(1);
  });

  it('never stops the Android app download', () => {
    const notify = vi.fn();
    // On the /apps page: the APK is a Blob link with download.
    const apps = fakeHost('/apps');
    installDownloadGuard(apps.host, { isBlocked: () => true, notify });
    const onApps = apps.click(new FakeElement('A', { href: 'blob:apk', download: 'Verigence.apk' }));
    apps.anchorPrototype.click.call(new FakeElement('A', { href: 'blob:apk', download: 'Verigence.apk' }) as unknown as HTMLAnchorElement);
    expect(onApps.preventDefault).not.toHaveBeenCalled();
    expect(apps.realClick).toHaveBeenCalledTimes(1);

    // Anywhere else: /app-distribution links and anything marked data-night-allow.
    const other = fakeHost('/p2/bookings');
    installDownloadGuard(other.host, { isBlocked: () => true, notify });
    expect(other.click(new FakeElement('A', { href: '/app-distribution/latest', download: '' })).preventDefault).not.toHaveBeenCalled();
    const marked = new FakeElement('A', { href: 'blob:apk', download: 'Verigence.apk', 'data-night-allow': '' });
    other.anchorPrototype.click.call(marked as unknown as HTMLAnchorElement);
    expect(other.realClick).toHaveBeenCalledTimes(1);
    expect(isBlockedOpen('/app-distribution/latest', '/p2/bookings')).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it('removes itself cleanly', () => {
    const { host, listeners, anchorPrototype, realClick, realOpen } = fakeHost();
    const uninstall = installDownloadGuard(host, { isBlocked: () => true, notify: vi.fn() });
    uninstall();
    expect(listeners).toHaveLength(0);
    expect(anchorPrototype.click).toBe(realClick);
    expect(host.window.open).toBe(realOpen);
  });
});
