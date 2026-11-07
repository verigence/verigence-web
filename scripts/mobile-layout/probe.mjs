// Probe: which API calls does a screen make? Logs unmocked requests.
import { chromium } from 'playwright';

const base = process.env.TEST_WEB_URL || 'http://127.0.0.1:4173';
const routes = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await context.grantPermissions(['geolocation'], { origin: base });
await context.setGeolocation({ latitude: 20.2961, longitude: 85.8245, accuracy: 20 });
const page = await context.newPage();
const fakeLogin = {
  accessToken: 't', expiresAtUtc: '2099-01-01T00:00:00Z', actorType: 'USER', isSuperAdmin: false,
  sessionId: '11111111-1111-4111-8111-111111111111', deviceId: '22222222-2222-4222-8222-222222222222',
  remembered: true, rememberToken: null, rememberExpiresAtUtc: '2099-01-01T00:00:00Z',
};
const seen = new Set();
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (!/\/(security|audit-core|hr|di|analytics)\//.test(url.pathname) || url.pathname.match(/\.(js|css|png|svg|woff2?)$/)) return route.fallback();
  const key = `${route.request().method()} ${url.pathname}${url.search}`;
  if (/auth\/(login|refresh|remember|resume)/.test(url.pathname)) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeLogin) });
  }
  if (!seen.has(key)) { seen.add(key); console.log('REQ', key); }
  return route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"probe"}' });
});
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
await page.getByLabel('Email').fill('probe@example.com');
await page.locator('input[type="password"]').fill('probe');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForTimeout(2500);
console.log('AFTER LOGIN', page.url());
for (const r of routes) {
  await page.goto(`${base}${r}`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500);
  console.log('AT', r, '->', page.url());
}
await browser.close();
