// Mobile layout harness: renders the main screens at phone widths with mocked APIs,
// saves full-page screenshots and fails on structural layout defects:
//   - page wider than the viewport (horizontal page scroll)
//   - elements sticking out of the viewport (outside a horizontal scroll container)
//   - words broken across lines ("To / da / y")
// Usage: node scripts/mobile-layout/screens.mjs [--out dir] [--only substring]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fixtures } from './fixtures.mjs';
import { screens } from './screen-list.mjs';

const base = process.env.TEST_WEB_URL || 'http://127.0.0.1:4173';
const args = process.argv.slice(2);
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'mobile-layout-output';
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
const widths = (process.env.WIDTHS || '360,390').split(',').map(Number);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const failures = [];
const unmocked = new Set();

async function newSession(role, width) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await context.grantPermissions(['geolocation'], { origin: base });
  await context.setGeolocation({ latitude: 20.2961, longitude: 85.8245, accuracy: 20 });
  const page = await context.newPage();
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname + url.search;
    if (url.origin === base && !/\/(security|audit-core|hr-api|di|analytics)\//.test(url.pathname)) return route.fallback();
    if (url.origin !== base && !/\/(security|audit-core|hr|p2|v1|v2)\//.test(url.pathname)) return route.fallback();
    for (const [method, re, handler] of fixtures) {
      if (method !== '*' && method !== req.method()) continue;
      const m = p.match(re);
      if (!m) continue;
      let body = handler(m, url, role);
      let status = 200;
      if (body && typeof body === 'object' && body.__status) { status = body.__status; body = body.body; }
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body ?? null) });
    }
    unmocked.add(`${req.method()} ${url.pathname}`);
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"Not mocked"}' });
  });
  page.on('pageerror', (e) => failures.push(`[${role}] page error: ${e.message}`));
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill('mobile.layout@example.com');
  await page.locator('input[type="password"]').fill('mobile-layout');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
  // Remembered-session setup finishes after navigation; a hard navigation before it would sign out.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  return { context, page };
}

// Runs inside the page: returns structural layout defects.
function inspect() {
  const vw = document.documentElement.clientWidth;
  const out = { pageOverflow: 0, outside: [], brokenWords: [] };
  const doc = document.documentElement;
  out.pageOverflow = Math.max(doc.scrollWidth, document.body.scrollWidth) - vw;
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
    if ((s.clip && s.clip !== 'auto') || (s.clipPath && s.clipPath !== 'none')) return false; // screen-reader only
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const inHScroller = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (['auto', 'scroll'].includes(s.overflowX) && n.scrollWidth > n.clientWidth + 1) return true;
      // A box that clips inside the phone (a carousel, a truncating chip) does so on purpose;
      // the app shell clipping at the phone's edge just hides a defect.
      if ((s.overflowX === 'hidden' || s.overflowX === 'clip') && n.getBoundingClientRect().right < vw - 2) return true;
    }
    return false;
  };
  const describe = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const txt = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${txt ? ` "${txt}"` : ''}`;
  };
  const all = document.querySelectorAll('body *');
  for (const el of all) {
    if (out.outside.length > 12) break;
    if (!visible(el) || el.closest('[aria-hidden="true"]')) continue;
    const r = el.getBoundingClientRect();
    const offCanvas = r.right <= 0 || r.left >= vw; // a closed drawer parked off-screen
    if (!offCanvas && (r.right > vw + 2 || r.left < -2) && !inHScroller(el)) {
      const parent = el.parentElement;
      // report only the outermost offender
      if (parent && parent !== document.body) {
        const pr = parent.getBoundingClientRect();
        if (!(pr.right <= 0 || pr.left >= vw) && (pr.right > vw + 2 || pr.left < -2) && !inHScroller(parent)) continue;
      }
      out.outside.push(`${describe(el)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
    }
  }
  // Content cut off by its own container: a box that hides overflow while holding something
  // wider than itself (not an ellipsis, not a scroller).
  out.clipped = [];
  for (const el of document.querySelectorAll('.enterprise-content *, .uc03-project-gate *')) {
    if (out.clipped.length > 8) break;
    const s = getComputedStyle(el);
    if (!['hidden', 'clip'].includes(s.overflowX) || s.textOverflow === 'ellipsis' || !visible(el)) continue;
    if (el.scrollWidth <= el.clientWidth + 2 || el.clientWidth < 24) continue;
    const box = el.getBoundingClientRect();
    const cut = [...el.querySelectorAll('*')].find((k) => {
      if (!visible(k)) return false;
      const r = k.getBoundingClientRect();
      return r.right > box.right + 2 && r.left < box.right && (k.innerText || '').trim();
    });
    if (cut) out.clipped.push(`${describe(cut)} cut off by ${describe(el)}`);
  }
  // Short summary tiles (a number and a label) stacked one per row: five numbers should not
  // take five screen-heights. Flags a grid/flex row of 3+ such tiles each spanning the width.
  out.stacked = [];
  for (const box of document.querySelectorAll('.enterprise-content *')) {
    if (out.stacked.length > 4) break;
    const s = getComputedStyle(box);
    if (!['grid', 'flex'].includes(s.display) || !visible(box) || ['OL', 'UL'].includes(box.tagName)) continue;
    const width = box.clientWidth;
    if (width < 250) continue;
    const kids = [...box.children].filter((k) => visible(k));
    if (kids.length < 3) continue;
    const tiles = kids.filter((k) => {
      const r = k.getBoundingClientRect();
      const text = (k.innerText || '').trim();
      return r.width > width * 0.85 && /\d/.test(text) && text.length <= 50 && !['BUTTON', 'A'].includes(k.tagName) && !k.querySelector('table, ul, ol, form, input, select, button, [role="switch"]');
    });
    if (tiles.length >= 3 && tiles.length === kids.length) out.stacked.push(`${tiles.length} tiles one per row in ${describe(box)}`);
  }
  // Words broken across lines: a single word whose glyphs occupy more than one line box.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const reported = new Set();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const el = node.parentElement;
    if (!el || !visible(el) || reported.has(el) || el.closest('[aria-hidden="true"], script, style, input, textarea')) continue;
    if (el.getBoundingClientRect().width <= 2) continue; // visually-hidden (screen reader) text
    // Text that explicitly opts in to breaking long tokens (codes, VINs, e-mails) may break.
    if (getComputedStyle(el).overflowWrap === 'anywhere' || getComputedStyle(el).wordBreak === 'break-all') continue;
    const text = node.textContent;
    // Whole whitespace-delimited tokens; a token wider than its line may legitimately wrap.
    const re = /[^\s\-/–—]{3,}/g;
    const line = el.closest('p, li, dd, dt, td, th, div, span, button, a, label, h1, h2, h3, h4, h5, h6') || el;
    const lineWidth = line.clientWidth || line.getBoundingClientRect().width;
    let m;
    while ((m = re.exec(text))) {
      if (!/[A-Za-z]{3,}/.test(m[0])) continue;
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0);
      const tops = new Set(rects.map((r) => Math.round(r.top)));
      const tokenWidth = rects.reduce((sum, r) => sum + r.width, 0);
      // Broken although it fitted the line, or broken because its column is too narrow to read.
      if (tops.size > 1 && (tokenWidth <= lineWidth || lineWidth < 160)) {
        reported.add(el);
        out.brokenWords.push(`"${m[0]}" in ${describe(el)}`);
        break;
      }
    }
    if (out.brokenWords.length > 12) break;
  }
  return out;
}

const results = [];
for (const width of widths) {
  const byRole = {};
  for (const screen of screens) {
    if (only && !screen.name.includes(only) && !screen.route.includes(only)) continue;
    const role = screen.role || 'PC';
    if (!byRole[role]) byRole[role] = await newSession(role, width);
    const { page } = byRole[role];
    try {
      await page.goto(`${base}${screen.route}`, { waitUntil: 'networkidle', timeout: 20000 });
    } catch { /* long-polling screens */ }
    if (screen.wait) await page.locator(screen.wait).first().waitFor({ timeout: 8000 }).catch(() => failures.push(`${screen.name}@${width}: did not render ${screen.wait}`));
    await page.waitForTimeout(600);
    if (screen.act) await screen.act(page).catch((e) => failures.push(`${screen.name}@${width}: action failed ${e.message}`));
    const finalUrl = new URL(page.url()).pathname;
    const res = await page.evaluate(inspect);
    const file = path.join(outDir, `${screen.name}-${width}.png`);
    // The app shell scrolls inside its own container, so grow the viewport to the content height
    // for a full capture, then restore it.
    const contentHeight = await page.evaluate(() => {
      let h = document.documentElement.scrollHeight;
      for (const el of document.querySelectorAll('body *')) {
        const s = getComputedStyle(el);
        if (['auto', 'scroll'].includes(s.overflowY) && el.scrollHeight > el.clientHeight + 4) {
          h = Math.max(h, el.scrollHeight + (window.innerHeight - el.clientHeight));
        }
      }
      return Math.min(h, 9000);
    });
    if (contentHeight > 800) { await page.setViewportSize({ width, height: contentHeight }); await page.waitForTimeout(300); }
    await page.screenshot({ path: file, fullPage: true });
    if (contentHeight > 800) await page.setViewportSize({ width, height: 800 });
    const problems = [];
    if (res.pageOverflow > 1) problems.push(`page scrolls sideways by ${res.pageOverflow}px`);
    for (const o of res.outside) problems.push(`sticks out: ${o}`);
    for (const b of res.brokenWords) problems.push(`broken word: ${b}`);
    for (const c of res.clipped) problems.push(`clipped: ${c}`);
    for (const t of res.stacked) problems.push(`stacked: ${t}`);
    results.push({ screen: screen.name, width, route: screen.route, finalUrl, problems, file });
    for (const p of problems) failures.push(`${screen.name}@${width} (${screen.route}): ${p}`);
  }
  for (const s of Object.values(byRole)) await s.context.close();
}
await browser.close();

fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ results, unmocked: [...unmocked].sort() }, null, 2));
const strayRedirects = results.filter((r) => r.finalUrl !== r.route.split('?')[0]).map((r) => `${r.screen}@${r.width}: ${r.route} -> ${r.finalUrl}`);
if (unmocked.size) console.log('Unmocked API calls:\n  ' + [...unmocked].sort().join('\n  '));
if (strayRedirects.length) console.log('Redirected:\n  ' + strayRedirects.join('\n  '));
console.log(`\n${results.length} captures, ${failures.length} problems`);
for (const f of failures) console.log('  ✗ ' + f);
process.exitCode = failures.length ? 1 : 0;
