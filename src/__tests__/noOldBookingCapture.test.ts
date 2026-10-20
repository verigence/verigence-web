/**
 * The only place in Web that uploads Booking or Delivery documents is the
 * Booking & Delivery screen (P2), which splits a PDF into pages first.
 *
 * Found live 19 Oct 2026: the Phase 1 "Capture new booking" was still one
 * click away (Verigence logo, outlet switch and the mobile bottom bar all
 * opened the old Overview). It created a Journey and uploaded a 5-page PDF as
 * ONE document, so the PAN and Aadhaar inside it were never read. These
 * checks keep that path from coming back.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = sourceFiles(SRC).map((path) => ({ path: relative(SRC, path), text: readFileSync(path, 'utf8') }));

describe('no old booking capture in Web', () => {
  it('nothing calls the old create-booking or whole-file upload endpoints', () => {
    const offenders = files
      .filter(({ text }) => /\/uc03\/bookings[`'"]/.test(text) || /\}\/upload-intents[`'"]/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('no link or navigation opens the old capture or documents screens', () => {
    const pattern = /(to=|navigate\(|href=|to:)\s*\{?\s*[`'"](\/v2\/bookings\/new|\/dashboard\?action=create-booking|\/journeys\/\$\{[^}]+\}\/documents)/;
    // Screens build journey addresses as plain strings too; services are API paths, not screens.
    const screenPath = /(?<!\/p2)[`'"]\/journeys\/\$\{[^}]+\}\/documents/;
    const offenders = files
      .filter(({ path, text }) => pattern.test(text) || (!path.startsWith('services') && screenPath.test(text)))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('every old capture address only redirects to Booking & Delivery', () => {
    const app = files.find(({ path }) => path === 'App.tsx')!.text;
    const routes = [
      '/v2/bookings/new',
      '/v2/bookings/:journeyId',
      '/v2/bookings/:journeyId/review',
      '/v2/deliveries/:journeyId',
      '/v2/deliveries/:journeyId/review',
      '/bookings/:journeyId',
      '/deliveries/:journeyId',
      '/journeys/:journeyId/documents',
    ];
    for (const route of routes) {
      const line = app.split('\n').find((l) => l.includes(`path="${route}"`));
      expect(line, route).toBeDefined();
      expect(line, route).toMatch(/element=\{<(Navigate to=\{P2_NEW_BOOKING_PATH\}|P2DocumentsRedirect) /);
    }
  });

  it('the old capture pages are gone', () => {
    const removed = ['BookingCaptureV2Page.tsx', 'BookingCaptureV2WorkspacePage.tsx', 'JourneyDocumentsPage.tsx', 'PcOverviewPage.tsx'];
    const present = files.filter(({ path }) => removed.some((name) => path.endsWith(name))).map(({ path }) => path);
    expect(present).toEqual([]);
  });
});
